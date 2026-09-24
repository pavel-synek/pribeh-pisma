(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Příběh písma — prezentační vrstva „Rubrika“.
  // Scéna má pevný rozměr 1920 × 1080 (návrhové body) a celá se škáluje do
  // okna/iframu. Díky tomu lze rozvržení spočítat jednou, přesně na pixel,
  // a na libovolné obrazovce vypadá stejně.
  // ---------------------------------------------------------------------------

  var SLIDES = window.SLIDES || [];
  var ASSET_VERSION = "20260921-2";

  var W = 1920, H = 1080;
  var M = 96;              // vnější okraj
  var TOP = 150;           // horní hrana obsahu (pod záhlavím)
  var BOTTOM = 956;        // spodní hrana obsahu (nad paginou)
  var CONTENT_H = BOTTOM - TOP;
  var GUTTER = 96;         // mezera mezi textem a obrazem
  var IMG_GAP = 44;        // mezera mezi obrázky
  var CAP_GAP = 18;        // mezera obrázek → popisek
  var MAX_UPSCALE = 3.4;   // zdrojové skeny jsou malé; nad tuto mez už by byly rozmazané

  var app = document.getElementById("app");
  var viewport = document.getElementById("viewport");
  var stage = document.getElementById("stage");
  var countCurrent = document.getElementById("countCurrent");
  var countTotal = document.getElementById("countTotal");
  var progressFill = document.getElementById("progressFill");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var gridBtn = document.getElementById("gridBtn");
  var fullscreenBtn = document.getElementById("fullscreenBtn");
  var overview = document.getElementById("overview");
  var overviewGrid = document.getElementById("overviewGrid");
  var overviewClose = document.getElementById("overviewClose");
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxCap = document.getElementById("lightboxCap");
  var lightboxClose = document.getElementById("lightboxClose");

  var slideEls = [];
  var current = -1;

  // ---------- small helpers ----------

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function src(path) { return path + "?v=" + ASSET_VERSION; }
  function px(n) { return Math.round(n) + "px"; }
  function place(node, x, y, w, h) {
    node.style.left = px(x); node.style.top = px(y);
    if (w != null) node.style.width = px(w);
    if (h != null) node.style.height = px(h);
  }
  function rv(node, d, cls) {
    node.classList.add(cls || "rv");
    node.style.setProperty("--d", d);
    return node;
  }

  // "Josef Váchal (1884–1969)" → jméno + data zvlášť
  function titleHTML(title) {
    var m = /^(.*?)\s*\((\d{4})\s*[–-]\s*(\d{4})\)\s*$/.exec(title);
    if (!m) return esc(title).replace(/\n/g, "<br>");
    return esc(m[1]) + '<span class="dates">' + m[2] + " — " + m[3] + "</span>";
  }

  // Popisky: první řádek = název díla, řádky „IČ …“ = inventární číslo.
  function captionHTML(text) {
    if (!text) return "";
    var lines = String(text).split("\n");
    var seenTitle = false;
    return lines.map(function (line) {
      var t = line.trim();
      if (!t) { seenTitle = false; return '<span class="cap-gap"></span>'; }
      if (/^IČ[\s:]/.test(t)) return '<span class="cap-id">' + esc(t) + "</span>";
      if (!seenTitle) { seenTitle = true; return '<span class="cap-title">' + esc(t) + "</span>"; }
      return "<span>" + esc(t) + "</span>";
    }).join("");
  }

  // ---------- measurement (in unscaled stage px) ----------

  var measurer = el("div", "slide");
  measurer.style.cssText = "visibility:hidden;opacity:0;pointer-events:none;z-index:-1";
  var capCache = {};

  function measureCaption(html, width, cls) {
    if (!html) return 0;
    var key = (cls || "") + "|" + Math.round(width / 4) + "|" + html;
    if (capCache[key] != null) return capCache[key];
    var c = el("div", "cap " + (cls || ""), html);
    c.style.cssText = "position:absolute;left:0;top:0;width:" + px(width);
    measurer.appendChild(c);
    var h = c.offsetHeight;
    measurer.removeChild(c);
    capCache[key] = h;
    return h;
  }

  // ---------- image arrangement ----------
  // Zkouší rozložení do řádků i sloupců (v pořadí obrázků) a vybere to,
  // které dá obrázkům největší plochu při zachování vyváženosti.

  function compositions(n) {
    // všechny rozdělení posloupnosti 0..n-1 na souvislé skupiny
    var out = [];
    for (var mask = 0; mask < (1 << (n - 1)); mask++) {
      var groups = [[0]];
      for (var i = 1; i < n; i++) {
        if (mask & (1 << (i - 1))) groups.push([i]); else groups[groups.length - 1].push(i);
      }
      out.push(groups);
    }
    return out;
  }

  function fitScale(evalAt) {
    // největší s ∈ (0, 1], pro které rozvržení vejde do výšky
    if (evalAt(1).fits) return evalAt(1);
    var lo = 0.02, hi = 1, best = evalAt(lo);
    for (var k = 0; k < 22; k++) {
      var mid = (lo + hi) / 2, r = evalAt(mid);
      if (r.fits) { best = r; lo = mid; } else { hi = mid; }
    }
    return best;
  }

  function arrange(imgs, RW, RH) {
    var n = imgs.length;
    var ar = imgs.map(function (im) { return im.w / im.h; });
    var caps = imgs.map(function (im) { return captionHTML(im.caption); });
    var capH = function (i, w) { return caps[i] ? CAP_GAP + measureCaption(caps[i], w) : 0; };
    var candidates = [];

    // Jediný obrázek: popisek může stát vedle něj (muzejní štítek), obraz je pak vyšší.
    if (n === 1 && caps[0]) {
      var SIDE_W = 300;
      candidates.push(fitScale(function (s) {
        var h = s * Math.min(RH, (RW - SIDE_W - IMG_GAP) / ar[0]), w = h * ar[0];
        var ch = measureCaption(caps[0], SIDE_W);
        var fits = w <= imgs[0].w * MAX_UPSCALE && ch <= h;
        var x = (RW - (w + IMG_GAP + SIDE_W)) / 2;
        return { items: [{ i: 0, x: x, y: 0, w: w, h: h, side: SIDE_W }], height: h, fits: fits };
      }));
    }

    compositions(n).forEach(function (groups) {
      // --- rows ---
      candidates.push(fitScale(function (s) {
        var items = [], y = 0, fits = true;
        groups.forEach(function (row, ri) {
          var sumAr = row.reduce(function (a, i) { return a + ar[i]; }, 0);
          var h = s * (RW - IMG_GAP * (row.length - 1)) / sumAr;
          row.forEach(function (i) { if (h * ar[i] > imgs[i].w * MAX_UPSCALE) fits = false; });
          var rowW = h * sumAr + IMG_GAP * (row.length - 1);
          var x = (RW - rowW) / 2, rowCap = 0;
          row.forEach(function (i) {
            var w = h * ar[i];
            rowCap = Math.max(rowCap, capH(i, w));
            items.push({ i: i, x: x, y: y, w: w, h: h });
            x += w + IMG_GAP;
          });
          y += h + rowCap + (ri < groups.length - 1 ? IMG_GAP * 1.4 : 0);
        });
        return { items: items, height: y, fits: fits && y <= RH };
      }));

      // --- columns (only meaningful when some column stacks ≥ 2 images) ---
      if (groups.every(function (g) { return g.length === 1; })) return;
      candidates.push(fitScale(function (s) {
        var inv = groups.map(function (col) { return col.reduce(function (a, i) { return a + 1 / ar[i]; }, 0); });
        var avail = RW - IMG_GAP * (groups.length - 1);
        var hc = avail / inv.reduce(function (a, v) { return a + 1 / v; }, 0);
        var items = [], x = 0, maxH = 0, fits = true, cols = [];
        groups.forEach(function (col, ci) {
          var w = s * hc / inv[ci], y = 0, colItems = [];
          col.forEach(function (i, k) {
            if (w > imgs[i].w * MAX_UPSCALE) fits = false;
            var h = w / ar[i];
            colItems.push({ i: i, x: x, y: y, w: w, h: h });
            y += h + capH(i, w) + (k < col.length - 1 ? IMG_GAP : 0);
          });
          cols.push({ items: colItems, h: y });
          maxH = Math.max(maxH, y);
          x += w + IMG_GAP;
        });
        var totalW = x - IMG_GAP, ox = (RW - totalW) / 2;
        cols.forEach(function (c) {
          var oy = (maxH - c.h) / 2;
          c.items.forEach(function (it) { it.x += ox; it.y += oy; items.push(it); });
        });
        return { items: items, height: maxH, fits: fits && maxH <= RH };
      }));
    });

    var best = null;
    candidates.forEach(function (c) {
      if (!c.fits) return;
      var areas = c.items.map(function (it) { return it.w * it.h; });
      var total = areas.reduce(function (a, b) { return a + b; }, 0);
      var balance = Math.min.apply(null, areas) / Math.max.apply(null, areas);
      c.score = total * Math.pow(balance, 0.45);
      if (!best || c.score > best.score) best = c;
    });
    return best;
  }

  function renderMedia(slide, imgs, RX, RY, RW, RH, layout, startDelay) {
    var media = el("div", "media");
    place(media, RX, RY, RW, RH);
    var oy = (RH - layout.height) / 2;
    layout.items.forEach(function (it, k) {
      var im = imgs[it.i];
      var fig = el("figure", "fig");
      place(fig, it.x, it.y + oy, it.w);
      var btn = el("button", "fig-img");
      btn.type = "button";
      btn.style.height = px(it.h);
      btn.setAttribute("aria-label", "Zvětšit obrázek" + (im.caption ? ": " + im.caption.split("\n")[0] : ""));
      var img = el("img");
      img.src = src(im.src);
      img.alt = im.caption ? im.caption.replace(/\n+/g, " — ") : "";
      img.decoding = "async";
      btn.appendChild(img);
      btn.addEventListener("click", function () { openLightbox(im, img.alt); });
      rv(btn, startDelay + k, "rv-img");
      fig.appendChild(btn);
      if (im.caption) {
        var cap = el("figcaption", "cap", captionHTML(im.caption));
        if (it.side) {
          cap.style.cssText = "left:" + px(it.w + IMG_GAP) + ";right:auto;bottom:0;width:" + px(it.side);
          cap.classList.add("cap-side");
        } else {
          cap.style.top = px(it.h + CAP_GAP);
        }
        rv(cap, startDelay + k + 1);
        fig.appendChild(cap);
      }
      media.appendChild(fig);
    });
    slide.appendChild(media);
  }

  // ---------- chrome shared by slides ----------

  function addChrome(slide, data, index, opts) {
    opts = opts || {};
    var head = el("div", "runhead");
    head.innerHTML =
      '<span><span class="dot"></span>Příběh písma</span>' +
      "<span>550 let českého knihtisku</span>";
    if (opts.noHead) head.style.display = "none";
    slide.appendChild(head);
    slide.appendChild(el("div", "folio", "<b>" + pad(index + 1) + "</b> — " + pad(SLIDES.length)));
  }

  function textBlock(data, opts) {
    var col = el("div", "col-text");
    var d = 0;
    if (opts.eyebrow !== false && data.eyebrow && data.eyebrow !== data.title) {
      col.appendChild(rv(el("div", "eyebrow", esc(data.eyebrow)), d++));
    }
    var t = el("h2", "title", titleHTML(data.title));
    if (opts.titleSize) t.style.setProperty("--title-size", px(opts.titleSize));
    col.appendChild(rv(t, d++));
    var paras = data.paragraphs || [];
    if (paras.length) {
      var body = el("div", "body");
      body.style.marginTop = px(opts.bodyGap || 44);
      paras.forEach(function (p, i) {
        var pe = el("p", null, esc(p));
        if (i === 0 && opts.lead && paras.length > 1 && p.length < 140) pe.className = "lead";
        else if (i === 0 && opts.dropcap) pe.className = "dropcap";
        body.appendChild(pe);
      });
      col.appendChild(rv(body, d++));
    }
    col._delay = d;
    return col;
  }

  // Najde největší velikost textu, při které sloupec vejde do výšky.
  function fitText(slide, col, width, sizes, maxH) {
    col.style.width = px(width);
    col.style.height = "auto";
    slide.appendChild(col);
    for (var k = 0; k < sizes.length; k++) {
      col.style.setProperty("--body-size", px(sizes[k]));
      if (col.scrollHeight <= maxH) return { size: sizes[k], height: col.scrollHeight, ok: true };
    }
    return { size: sizes[sizes.length - 1], height: col.scrollHeight, ok: false };
  }

  function titleSizeFor(title, compact) {
    var len = title.replace(/\s*\(.*\)\s*$/, "").length;
    if (compact) return len > 26 ? 64 : 80;
    return len > 34 ? 76 : 92;
  }

  // ---------- slide builders ----------

  function buildCover(slide, data, index) {
    slide.classList.add("theme-night");
    addChrome(slide, data, index, { noHead: true });
    var im = data.images && data.images[0];
    if (im) {
      var art = el("div", "cover-art");
      var img = el("img");
      img.src = src(im.src); img.alt = im.caption ? im.caption.replace(/\n+/g, " — ") : "";
      rv(img, 0, "rv-img");
      art.appendChild(img);
      if (im.caption) art.appendChild(rv(el("div", "cap", captionHTML(im.caption)), 6));
      slide.insertBefore(art, slide.firstChild);
    }
    var text = el("div", "cover-text");
    text.appendChild(rv(el("div", "eyebrow", esc(data.eyebrow)), 0));
    var words = data.title.split(/\s+/);
    var h = el("h1", "cover-title", esc(words[0]) + (words.length > 1 ? "<em>" + esc(words.slice(1).join(" ")) + "</em>" : ""));
    text.appendChild(rv(h, 1));
    if (data.quote) {
      var q = el("blockquote", "cover-quote", data.quote.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join(""));
      if (data.quoteAuthor) q.appendChild(el("cite", null, esc(data.quoteAuthor)));
      text.appendChild(rv(q, 3));
    }
    slide.appendChild(text);
  }

  function buildSection(slide, data, index) {
    slide.classList.add("theme-red");
    addChrome(slide, data, index);
    var numeral = (data.eyebrow || "").split(/\s+/).pop();
    slide.appendChild(rv(el("div", "section-num", esc(numeral)), 0));
    var box = el("div", "section-text");
    box.appendChild(rv(el("div", "eyebrow", esc(data.eyebrow)), 1));
    box.appendChild(rv(el("h2", "section-title", esc(data.title)), 2));
    if (data.subtitle) box.appendChild(rv(el("p", "section-sub", esc(data.subtitle)), 3));
    slide.appendChild(box);
  }

  function buildText(slide, data, index) {
    addChrome(slide, data, index);
    var leftW = 600, bodyX = M + leftW + 120, bodyW = W - M - bodyX;

    var head = textBlock({ eyebrow: data.eyebrow, title: data.title }, { titleSize: titleSizeFor(data.title) });
    head.classList.add("center-v");
    place(head, M, TOP, leftW, CONTENT_H);
    slide.appendChild(head);

    var col = el("div", "col-text center-v");
    var body = el("div", "body");
    var paras = data.paragraphs || [];
    paras.forEach(function (p, i) {
      var pe = el("p", null, esc(p));
      if (i === 0) pe.className = (paras.length > 1 && p.length < 140) ? "lead" : "dropcap";
      body.appendChild(pe);
    });
    col.appendChild(rv(body, 2));
    place(col, bodyX, TOP, bodyW);
    var fit = fitText(slide, col, bodyW, [34, 32, 30, 28, 27, 26, 25, 24, 23, 22], CONTENT_H);
    col.style.setProperty("--body-size", px(fit.size));
    col.style.height = px(CONTENT_H);

    var rule = el("div", "rule-v");
    rule.style.left = px(M + leftW + 60);
    slide.appendChild(rv(rule, 1));
  }

  function buildFigure(slide, data, index) {
    addChrome(slide, data, index);
    var imgs = data.images || [];
    var hasText = (data.paragraphs || []).length > 0;
    var groupHTML = data.groupCaption ? captionHTML(data.groupCaption) : "";
    var compact = true;
    var tSize = titleSizeFor(data.title, compact);

    var textLen = (data.paragraphs || []).join("").length;
    var options = (hasText ? [560, 640, 720, 800, 880] : [400, 480, 560]).map(function (cw) { return { cw: cw, cols: 1 }; });
    // dlouhý text → dva sloupce sazby, aby řádky nebyly příliš dlouhé
    if (textLen > 1000) options.push({ cw: 1000, cols: 2 }, { cw: 1100, cols: 2 });
    var sizes = [28, 27, 26, 25, 24, 23, 22];
    var best = null;

    function makeCol(cols) {
      var c = textBlock(data, { titleSize: tSize, bodyGap: 36 });
      var b = c.querySelector(".body");
      if (b && cols > 1) { b.style.columnCount = cols; b.style.columnGap = "56px"; }
      return c;
    }

    options.forEach(function (opt) {
      var cw = opt.cw;
      var col = makeCol(opt.cols);
      var fit = fitText(slide, col, cw, sizes, CONTENT_H);
      slide.removeChild(col);
      // měřítko délky řádku: ~31 × velikost písma ≈ 65–70 znaků
      var lineW = opt.cols > 1 ? (cw - 56) / 2 : cw;
      var measureOk = lineW / fit.size <= 31;

      var RX = M + cw + GUTTER, RW = W - M - RX, RH = CONTENT_H, groupH = 0, groupCols = 1;
      if (groupHTML) {
        groupCols = RW > 860 && data.groupCaption.length > 260 ? 2 : 1;
        groupH = measureGroup(groupHTML, RW, groupCols) + 36;
        RH -= groupH;
      }
      var lay = arrange(imgs, RW, RH);
      if (!lay) return;
      var area = lay.items.reduce(function (a, it) { return a + it.w * it.h; }, 0);
      var textFactor = hasText ? Math.pow(fit.size / 26, 3) * (fit.ok ? 1 : 0.3) * (measureOk ? 1 : 0.5) : 1;
      var score = area * textFactor;
      if (!best || score > best.score) {
        best = { score: score, cw: cw, cols: opt.cols, size: fit.size, lay: lay, RX: RX, RW: RW, RH: RH, groupH: groupH, groupCols: groupCols };
      }
    });

    var col = makeCol(best.cols);
    col.classList.add("center-v");
    col.style.setProperty("--body-size", px(best.size));
    place(col, M, TOP, best.cw, CONTENT_H);
    slide.appendChild(col);

    // vertically center media + group caption together within the content box
    var blockH = best.lay.height + best.groupH;
    var RY = TOP + (CONTENT_H - blockH) / 2;
    renderMedia(slide, imgs, best.RX, RY, best.RW, best.lay.height, best.lay, col._delay);

    if (groupHTML) {
      var g = el("div", "cap group-cap", groupHTML);
      g.style.columnCount = best.groupCols;
      place(g, best.RX, RY + best.lay.height + 36, best.RW);
      slide.appendChild(rv(g, col._delay + imgs.length + 1));
    }
  }

  function measureGroup(html, width, cols) {
    var c = el("div", "cap group-cap", html);
    c.style.cssText = "position:absolute;left:0;top:0;width:" + px(width) + ";column-count:" + cols;
    measurer.appendChild(c);
    var h = c.offsetHeight;
    measurer.removeChild(c);
    return h;
  }

  function buildTable(slide, data, index) {
    addChrome(slide, data, index);
    var head = textBlock({ eyebrow: data.eyebrow, title: data.title }, { titleSize: 68 });
    place(head, M, TOP, 1240);
    slide.appendChild(head);
    var headH = head.offsetHeight;

    var legend = el("div", "chrono-legend",
      '<span><i></i>Realizováno</span><span><i class="o"></i>Nerealizováno</span>');
    legend.style.top = "auto";
    slide.appendChild(rv(legend, 2));
    legend.style.top = px(TOP + headH - legend.offsetHeight);

    var t = data.table;
    var chrono = el("div", "chrono");
    chrono.style.top = px(TOP + headH + 64);
    chrono.style.bottom = px(H - BOTTOM);
    var hr = el("div", "chrono-head");
    t.headers.forEach(function (h) { hr.appendChild(el("div", null, esc(h))); });
    chrono.appendChild(rv(hr, 2));
    var bodyEl = el("div", "chrono-body");
    t.rows.forEach(function (r, i) {
      var row = el("div", "chrono-row" + (/^Nerealiz/i.test(r[4]) ? " is-unrealised" : ""));
      row.appendChild(el("div", "chrono-year", "<i></i>" + esc(r[0])));
      row.appendChild(el("div", "chrono-author", esc(r[1])));
      row.appendChild(el("div", "chrono-family", esc(r[2])));
      row.appendChild(el("div", "chrono-foundry", esc(r[3])));
      row.appendChild(el("div", "chrono-note", esc(r[4])));
      bodyEl.appendChild(rv(row, 3 + i * 0.5));
    });
    chrono.appendChild(bodyEl);
    slide.appendChild(chrono);
  }

  function buildClosing(slide, data, index) {
    slide.classList.add("theme-night");
    addChrome(slide, data, index, { noLeft: true });
    var box = el("div", "closing-text");
    box.appendChild(rv(el("h2", "closing-thanks", esc(data.eyebrow)), 0));
    var names = el("p", "closing-names", data.title.split("\n").map(function (n) { return "<span>" + esc(n) + "</span>"; }).join(""));
    box.appendChild(rv(names, 1));
    var meta = el("div", "closing-meta", (data.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join(""));
    box.appendChild(rv(meta, 2));
    slide.appendChild(box);

    // Bookend: litera na Toryho konstrukční síti 10 × 10.
    var s = 680, c = s / 10, lines = "";
    for (var i = 1; i < 10; i++) {
      lines += '<line x1="' + i * c + '" y1="0" x2="' + i * c + '" y2="' + s + '"/>';
      lines += '<line x1="0" y1="' + i * c + '" x2="' + s + '" y2="' + i * c + '"/>';
    }
    var svg =
      '<svg class="closing-glyph" viewBox="0 0 ' + s + " " + s + '" aria-hidden="true">' +
      '<g class="grid"><rect x=".5" y=".5" width="' + (s - 1) + '" height="' + (s - 1) + '"/>' + lines +
      '<line x1="0" y1="0" x2="' + s + '" y2="' + s + '"/><line x1="' + s + '" y1="0" x2="0" y2="' + s + '"/>' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + s / 2 + '"/><circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + s * 0.3 + '"/></g>' +
      '<text x="' + s / 2 + '" y="' + c * 9 + '" text-anchor="middle" font-size="' + s * 1.12 + '">a</text>' +
      '<line class="base" x1="-40" y1="' + c * 9 + '" x2="' + (s + 40) + '" y2="' + c * 9 + '"/>' +
      "</svg>";
    var wrap = el("div", null, svg);
    var glyph = wrap.firstChild;
    slide.appendChild(rv(glyph, 1, "rv-img"));

    var logo = data.images && data.images[0];
    if (logo) {
      var img = el("img", "closing-logo");
      img.src = src(logo.src); img.alt = "Památník národního písemnictví — Muzeum literatury";
      slide.appendChild(rv(img, 3));
    }
  }

  function buildSlide(data, index) {
    var slide = el("section", "slide");
    slide.setAttribute("aria-roledescription", "slajd");
    slide.setAttribute("aria-label", (index + 1) + " z " + SLIDES.length + ": " + data.title.replace(/\n/g, ", "));
    slide.dataset.kind = data.kind;
    stage.appendChild(slide);
    var kind = data.kind;
    if (kind === "cover") buildCover(slide, data, index);
    else if (kind === "section") buildSection(slide, data, index);
    else if (kind === "table") buildTable(slide, data, index);
    else if (kind === "closing") buildClosing(slide, data, index);
    else if (data.images && data.images.length) buildFigure(slide, data, index);
    else buildText(slide, data, index);
    return slide;
  }

  // ---------- stage scaling ----------

  function fitStage() {
    var vw = viewport.clientWidth, vh = viewport.clientHeight;
    var s = Math.min(vw / W, vh / H);
    var tx = (vw - W * s) / 2, ty = (vh - H * s) / 2;
    stage.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
  }

  function letterboxFor(slide) {
    // titulní slajd má vlastní tmavý tón, ostatní jsou černé
    return slide.dataset.kind === "cover" ? "var(--night)" : "var(--black)";
  }

  // ---------- navigation ----------

  function goTo(index, opts) {
    opts = opts || {};
    index = Math.max(0, Math.min(index, slideEls.length - 1));
    if (index === current) return;
    var back = index < current;
    if (current >= 0) {
      var prevEl = slideEls[current];
      prevEl.classList.remove("is-active");
      prevEl.setAttribute("aria-hidden", "true");
    }
    var nextEl = slideEls[index];
    nextEl.classList.toggle("is-back", back);
    // force style flush so entering elements start from their offset position
    void nextEl.offsetWidth;
    nextEl.classList.add("is-active");
    nextEl.removeAttribute("aria-hidden");
    current = index;

    app.style.setProperty("--letterbox", letterboxFor(nextEl));
    countCurrent.textContent = pad(index + 1);
    countTotal.textContent = pad(slideEls.length);
    progressFill.style.width = (slideEls.length > 1 ? (index / (slideEls.length - 1)) * 100 : 100) + "%";
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slideEls.length - 1;
    if (!opts.fromHash) {
      try { history.replaceState(null, "", "#" + (index + 1)); } catch (e) { /* sandboxed iframe */ }
    }
  }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function indexFromHash() {
    var n = parseInt(String(location.hash).replace(/^#\/?/, ""), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  // ---------- overview ----------

  var overviewBuilt = false;
  function buildOverview() {
    slideEls.forEach(function (s, i) {
      var b = el("button", "thumb");
      b.type = "button";
      b.setAttribute("aria-label", "Přejít na slajd " + (i + 1) + ": " + SLIDES[i].title.replace(/\n/g, ", "));
      var frame = el("div", "thumb-frame");
      var inner = el("div", "thumb-inner");
      var clone = s.cloneNode(true);
      clone.classList.add("is-active");
      clone.removeAttribute("aria-hidden");
      clone.querySelectorAll("button").forEach(function (x) { x.setAttribute("tabindex", "-1"); });
      inner.appendChild(clone);
      frame.appendChild(inner);
      b.appendChild(frame);
      var label = SLIDES[i].kind === "closing" ? SLIDES[i].eyebrow : SLIDES[i].title.split("\n")[0];
      b.appendChild(el("div", "thumb-label", "<b>" + pad(i + 1) + "</b><span>" + esc(label) + "</span>"));
      b.addEventListener("click", function () { closeOverview(); goTo(i); });
      overviewGrid.appendChild(b);
    });
    overviewBuilt = true;
  }
  function scaleThumbs() {
    var frames = overviewGrid.querySelectorAll(".thumb-frame");
    if (!frames.length) return;
    var s = frames[0].clientWidth / W;
    overviewGrid.querySelectorAll(".thumb-inner").forEach(function (n) { n.style.transform = "scale(" + s + ")"; });
  }
  function openOverview() {
    if (!overviewBuilt) buildOverview();
    overview.hidden = false;
    overviewGrid.querySelectorAll(".thumb").forEach(function (t, i) { t.classList.toggle("is-current", i === current); });
    scaleThumbs();
    var cur = overviewGrid.children[current];
    if (cur) { cur.scrollIntoView({ block: "center" }); cur.focus({ preventScroll: true }); }
  }
  function closeOverview() {
    overview.hidden = true;
    app.focus({ preventScroll: true });
  }

  // ---------- lightbox ----------

  function openLightbox(im, alt) {
    lightboxImg.src = src(im.src);
    lightboxImg.alt = alt || "";
    lightboxCap.innerHTML = captionHTML(im.caption);
    lightbox.hidden = false;
    lightboxClose.focus({ preventScroll: true });
  }
  function closeLightbox() {
    lightbox.hidden = true;
    app.focus({ preventScroll: true });
  }

  // ---------- fullscreen ----------

  var fsEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFullscreen() {
    if (!fsEnabled) return;
    if (!fsElement()) {
      var root = document.documentElement;
      var req = root.requestFullscreen || root.webkitRequestFullscreen;
      var p = req && req.call(root);
      if (p && p.catch) p.catch(function () { /* blocked (iframe bez allowfullscreen) */ });
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
  }
  function onFsChange() { app.classList.toggle("is-fullscreen", !!fsElement()); }

  // ---------- idle UI ----------

  var idleTimer = null;
  function wake() {
    app.classList.remove("is-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (!overview.hidden || !lightbox.hidden) return;
      if (document.querySelector(".ui-actions:hover")) return;
      app.classList.add("is-idle");
    }, 2800);
  }

  // ---------- input ----------

  function initInput() {
    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    gridBtn.addEventListener("click", openOverview);
    overviewClose.addEventListener("click", closeOverview);
    fullscreenBtn.addEventListener("click", toggleFullscreen);
    if (!fsEnabled) fullscreenBtn.hidden = true;
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    lightbox.addEventListener("click", closeLightbox);

    window.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      wake();
      if (!lightbox.hidden) {
        if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); closeLightbox(); }
        return;
      }
      if (!overview.hidden) {
        if (e.key === "Escape" || e.key === "g" || e.key === "G") { e.preventDefault(); closeOverview(); }
        return;
      }
      var k = e.key;
      if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") { e.preventDefault(); next(); }
      else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace") { e.preventDefault(); prev(); }
      else if (k === "Home") { e.preventDefault(); goTo(0); }
      else if (k === "End") { e.preventDefault(); goTo(slideEls.length - 1); }
      else if (k === "f" || k === "F") { toggleFullscreen(); }
      else if (k === "g" || k === "G" || k === "o" || k === "O") { openOverview(); }
    });

    var wheelAcc = 0, wheelLock = false, wheelReset = null;
    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (wheelLock) return;
      wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      clearTimeout(wheelReset);
      wheelReset = setTimeout(function () { wheelAcc = 0; }, 180);
      if (Math.abs(wheelAcc) < 40) return;
      if (wheelAcc > 0) next(); else prev();
      wheelAcc = 0; wheelLock = true;
      setTimeout(function () { wheelLock = false; }, 750);
    }, { passive: false });

    var tx = null, ty = null;
    viewport.addEventListener("touchstart", function (e) {
      var t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; wake();
    }, { passive: true });
    viewport.addEventListener("touchend", function (e) {
      if (tx === null) return;
      var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx < 0) next(); else prev(); }
      tx = null;
    }, { passive: true });

    app.addEventListener("mousemove", wake);
    app.addEventListener("pointerdown", wake);

    window.addEventListener("hashchange", function () { goTo(indexFromHash(), { fromHash: true }); });
    window.addEventListener("resize", function () { fitStage(); if (!overview.hidden) scaleThumbs(); });
  }

  // ---------- boot ----------

  function boot() {
    stage.appendChild(measurer);
    slideEls = SLIDES.map(buildSlide);
    stage.removeChild(measurer);
    slideEls.forEach(function (s) { s.setAttribute("aria-hidden", "true"); });
    fitStage();
    goTo(indexFromHash(), { fromHash: true });
    app.tabIndex = -1;
    app.focus({ preventScroll: true });
    wake();
  }

  initInput();
  fitStage();
  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all([
        document.fonts.load('400 100px "Instrument Serif"'),
        document.fonts.load('italic 400 100px "Instrument Serif"'),
        document.fonts.load('400 20px "Instrument Sans"'),
        document.fonts.load('600 20px "Instrument Sans"'),
        document.fonts.load('400 20px "IBM Plex Mono"')
      ]).catch(function () {})
    : Promise.resolve();
  // Rozvržení měří skutečnou sazbu, proto čekáme na písma (max. 2,5 s).
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(boot);
})();
