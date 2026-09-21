(function () {
  "use strict";

  var SLIDES = window.SLIDES || [];
  // Bump this whenever an image file is replaced in place (same filename,
  // new bytes) so browsers that already cached the old bytes fetch fresh
  // ones instead of showing a stale (e.g. wrongly rotated) version.
  var ASSET_VERSION = "20260921-2";
  var world = document.getElementById("world");
  var viewportEl = document.getElementById("viewport");
  var stage = document.getElementById("stage");
  var counterCurrent = document.getElementById("counterCurrent");
  var counterTotal = document.getElementById("counterTotal");
  var progressFill = document.getElementById("progressFill");
  var sectionLabel = document.getElementById("sectionLabel");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var fullscreenBtn = document.getElementById("fullscreenBtn");
  var hint = document.getElementById("hint");

  var current = 0;
  var frames = [];
  var positions = [];
  var overviewMode = false;
  var HINT_NAV = "Šipky / kolečko myši / swipe pro pohyb — klikněte mimo slide pro přehled všech kapitol";
  var HINT_OVERVIEW = "Klikněte na slajd pro přiblížení, nebo mimo něj pro návrat";

  // ---------- Rendering ----------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function textBlock(paragraphs) {
    var wrap = el("div", "body-text");
    (paragraphs || []).forEach(function (p) {
      wrap.appendChild(el("p", null, p));
    });
    return wrap;
  }

  function withVersion(src) {
    return src + (src.indexOf("?") === -1 ? "?" : "&") + "v=" + ASSET_VERSION;
  }

  function figureEl(img) {
    var fig = el("figure", "figure");
    var image = document.createElement("img");
    image.src = withVersion(img.src);
    image.loading = "eager";
    image.decoding = "async";
    image.alt = (img.caption || "").split("\n")[0] || "Exponát";
    image.style.aspectRatio = img.w + " / " + img.h;
    fig.appendChild(image);
    if (img.caption) {
      fig.appendChild(el("figcaption", null, img.caption));
    }
    return fig;
  }

  function renderFrame(slide) {
    var frame = el("div", "frame frame-" + slide.kind);
    frame.dataset.id = slide.id;
    if (slide.width) frame.style.width = slide.width + "px";

    if (slide.kind === "cover") {
      var textCol = el("div", "cover-text");
      textCol.appendChild(el("div", "eyebrow", slide.eyebrow));
      textCol.appendChild(el("h1", "cover-title", slide.title));
      var q = el("blockquote", "quote");
      q.textContent = slide.quote.join("\n");
      var author = el("cite", "quote-author", slide.quoteAuthor);
      q.appendChild(author);
      textCol.appendChild(q);
      frame.appendChild(textCol);

      if (slide.images && slide.images.length) {
        var figCol = el("div", "cover-fig");
        figCol.appendChild(figureEl(slide.images[0]));
        frame.appendChild(figCol);
      }
    } else if (slide.kind === "section") {
      frame.appendChild(el("div", "eyebrow", slide.eyebrow));
      frame.appendChild(el("h1", "title", slide.title));
      if (slide.subtitle) frame.appendChild(el("div", "subtitle", slide.subtitle));
    } else if (slide.kind === "closing") {
      frame.appendChild(el("div", "eyebrow", slide.eyebrow));
      frame.appendChild(el("h1", "title", slide.title));
      frame.appendChild(textBlock(slide.paragraphs));
      if (slide.images && slide.images.length) {
        var logoWrap = el("div", "closing-logo");
        var img = document.createElement("img");
        img.src = withVersion(slide.images[0].src);
        img.alt = "Logo";
        img.style.maxWidth = "220px";
        img.style.height = "auto";
        logoWrap.appendChild(img);
        frame.appendChild(logoWrap);
      }
    } else if (slide.kind === "table") {
      frame.appendChild(el("div", "eyebrow", slide.eyebrow));
      frame.appendChild(el("h1", "title", slide.title));
      var tableWrap = el("div", "table-wrap");
      var table = document.createElement("table");
      table.className = "chrono";
      var thead = document.createElement("thead");
      var trh = document.createElement("tr");
      slide.table.headers.forEach(function (h) {
        trh.appendChild(el("th", null, h));
      });
      thead.appendChild(trh);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      slide.table.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        row.forEach(function (cell) {
          tr.appendChild(el("td", null, cell));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      frame.appendChild(tableWrap);
    } else if (slide.kind === "gallery") {
      frame.appendChild(el("div", "eyebrow", slide.eyebrow));
      frame.appendChild(el("h1", "title", slide.title));
      frame.appendChild(el("div", "rule"));
      var row = el("div", "media-row wrap");
      (slide.images || []).forEach(function (img) {
        row.appendChild(figureEl(img));
      });
      frame.appendChild(row);
    } else {
      // "text" and "figure"
      var imgCount = slide.images ? slide.images.length : 0;
      frame.appendChild(el("div", "eyebrow", slide.eyebrow));
      frame.appendChild(el("h1", "title", slide.title));

      if (imgCount > 0 && imgCount <= 2) {
        // Few images: put text and image(s) side by side so the
        // illustration reads large instead of stranded in empty space.
        var split = el("div", "figure-split");
        var textSide = el("div", "text-side");
        if (slide.paragraphs && slide.paragraphs.length) {
          textSide.appendChild(textBlock(slide.paragraphs));
        }
        var mediaSide = el("div", "media-side" + (imgCount === 1 ? " single" : " double"));
        slide.images.forEach(function (img) {
          mediaSide.appendChild(figureEl(img));
        });
        split.appendChild(textSide);
        split.appendChild(mediaSide);
        frame.appendChild(split);
        if (slide.groupCaption) {
          frame.appendChild(el("div", "group-caption", slide.groupCaption));
        }
      } else {
        if (slide.paragraphs && slide.paragraphs.length) {
          frame.appendChild(textBlock(slide.paragraphs));
        }
        if (imgCount > 0) {
          var mrow = el("div", "media-row wrap");
          slide.images.forEach(function (img) {
            mrow.appendChild(figureEl(img));
          });
          frame.appendChild(mrow);
          if (slide.groupCaption) {
            frame.appendChild(el("div", "group-caption", slide.groupCaption));
          }
        }
      }
    }

    return frame;
  }

  function buildFrames() {
    SLIDES.forEach(function (slide) {
      var frame = renderFrame(slide);
      world.appendChild(frame);
      frames.push(frame);
    });
  }

  // ---------- Layout (snake path across a large canvas) ----------

  function computeLayout() {
    var gapX = 340;
    var gapY = 420;
    var rowSize = 4;
    var dir = 1;
    var prevX = 0, prevY = 0, prevW = 0, prevH = 0;
    positions = [];

    frames.forEach(function (frame, i) {
      var w = frame.offsetWidth;
      var h = frame.offsetHeight;
      var x, y;

      if (i === 0) {
        x = w / 2;
        y = h / 2;
      } else if (i % rowSize === 0) {
        dir *= -1;
        x = prevX;
        y = prevY + prevH / 2 + gapY + h / 2;
      } else {
        x = prevX + dir * (prevW / 2 + gapX + w / 2);
        y = prevY + Math.sin(i * 0.85) * 70;
      }

      positions.push({ x: x, y: y, w: w, h: h });
      frame.style.left = (x - w / 2) + "px";
      frame.style.top = (y - h / 2) + "px";

      prevX = x; prevY = y; prevW = w; prevH = h;
    });

    // size the world container to fit all frames with margin
    var maxX = 0, maxY = 0, minX = Infinity, minY = Infinity;
    positions.forEach(function (p) {
      maxX = Math.max(maxX, p.x + p.w / 2);
      maxY = Math.max(maxY, p.y + p.h / 2);
      minX = Math.min(minX, p.x - p.w / 2);
      minY = Math.min(minY, p.y - p.h / 2);
    });
    world.style.width = (maxX + 800) + "px";
    world.style.height = (maxY + 800) + "px";
  }

  // ---------- Camera ----------

  function focusIndex(index, animate) {
    var pos = positions[index];
    if (!pos) return;
    var vw = viewportEl.clientWidth;
    var vh = viewportEl.clientHeight;
    var margin = 0.86;
    var scale = Math.min((vw * margin) / pos.w, (vh * margin) / pos.h);
    scale = Math.max(0.08, Math.min(scale, 2.2));

    var tx = vw / 2 - pos.x * scale;
    var ty = vh / 2 - pos.y * scale;

    world.style.transition = animate === false
      ? "none"
      : "transform 1150ms cubic-bezier(.65,0,.35,1)";
    world.style.transform = "translate3d(" + tx + "px," + ty + "px,0) scale(" + scale + ")";

    frames.forEach(function (f, i) {
      f.classList.toggle("active", i === index);
    });
  }

  function overviewTransform() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(function (p) {
      minX = Math.min(minX, p.x - p.w / 2);
      minY = Math.min(minY, p.y - p.h / 2);
      maxX = Math.max(maxX, p.x + p.w / 2);
      maxY = Math.max(maxY, p.y + p.h / 2);
    });
    var totalW = maxX - minX;
    var totalH = maxY - minY;
    var vw = viewportEl.clientWidth;
    var vh = viewportEl.clientHeight;
    var margin = 0.9;
    var scale = Math.min((vw * margin) / totalW, (vh * margin) / totalH);
    scale = Math.max(0.01, Math.min(scale, 2));
    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    return {
      tx: vw / 2 - centerX * scale,
      ty: vh / 2 - centerY * scale,
      scale: scale
    };
  }

  function enterOverview() {
    overviewMode = true;
    stage.classList.add("overview");
    var t = overviewTransform();
    world.style.transition = "transform 1150ms cubic-bezier(.65,0,.35,1)";
    world.style.transform = "translate3d(" + t.tx + "px," + t.ty + "px,0) scale(" + t.scale + ")";
    frames.forEach(function (f, i) {
      f.classList.toggle("active", i === current);
    });
    sectionLabel.textContent = "Přehled všech slajdů";
    hint.textContent = HINT_OVERVIEW;
    hint.classList.remove("hidden");
  }

  function exitOverview(index) {
    overviewMode = false;
    stage.classList.remove("overview");
    hint.textContent = HINT_NAV;
    goTo(index, true);
  }

  function updateHUD() {
    counterCurrent.textContent = String(current + 1);
    counterTotal.textContent = String(frames.length);
    var pct = frames.length > 1 ? (current / (frames.length - 1)) * 100 : 0;
    progressFill.style.width = pct + "%";
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === frames.length - 1;

    var slide = SLIDES[current];
    sectionLabel.textContent = slide.eyebrow || slide.title || "";
  }

  function goTo(index, animate) {
    if (overviewMode) {
      overviewMode = false;
      stage.classList.remove("overview");
      hint.textContent = HINT_NAV;
    }
    index = Math.max(0, Math.min(index, frames.length - 1));
    current = index;
    focusIndex(current, animate);
    updateHUD();
    hint.classList.add("hidden");
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  // ---------- Input handling ----------

  function initInput() {
    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);

    window.addEventListener("keydown", function (e) {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].indexOf(e.key) !== -1) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].indexOf(e.key) !== -1) {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(frames.length - 1);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "Escape") {
        if (overviewMode) {
          exitOverview(current);
        } else if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    });

    // click on empty canvas: zoom out to overview of all slides.
    // click on a frame while in overview: zoom into that slide.
    viewportEl.addEventListener("click", function (e) {
      var frameEl = e.target.closest ? e.target.closest(".frame") : null;
      if (overviewMode) {
        var idx = frameEl ? frames.indexOf(frameEl) : current;
        exitOverview(idx < 0 ? current : idx);
      } else if (!frameEl) {
        enterOverview();
      }
    });

    // wheel navigation (throttled)
    var wheelLock = false;
    viewportEl.addEventListener("wheel", function (e) {
      if (wheelLock) return;
      if (Math.abs(e.deltaY) < 12 && Math.abs(e.deltaX) < 12) return;
      wheelLock = true;
      if (e.deltaY > 0 || e.deltaX > 0) next(); else prev();
      setTimeout(function () { wheelLock = false; }, 900);
    }, { passive: true });

    // touch swipe
    var touchStartX = null, touchStartY = null;
    viewportEl.addEventListener("touchstart", function (e) {
      var t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }, { passive: true });

    viewportEl.addEventListener("touchend", function (e) {
      if (touchStartX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStartX;
      var dy = t.clientY - touchStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next(); else prev();
      }
      touchStartX = null;
    }, { passive: true });

    fullscreenBtn.addEventListener("click", toggleFullscreen);

    window.addEventListener("resize", function () {
      computeLayout();
      if (overviewMode) {
        var t = overviewTransform();
        world.style.transition = "none";
        world.style.transform = "translate3d(" + t.tx + "px," + t.ty + "px,0) scale(" + t.scale + ")";
      } else {
        focusIndex(current, false);
      }
    });
  }

  function toggleFullscreen() {
    var container = document.documentElement;
    if (!document.fullscreenElement) {
      var req = container.requestFullscreen || container.webkitRequestFullscreen;
      if (req) {
        req.call(container).catch(function () { /* ignore: often blocked inside an iframe without allowfullscreen */ });
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  // ---------- Boot ----------

  function init() {
    buildFrames();
    // wait a frame so fonts/layout settle before measuring
    requestAnimationFrame(function () {
      computeLayout();
      focusIndex(0, false);
      updateHUD();
      setTimeout(function () { hint.classList.remove("hidden"); }, 300);
      setTimeout(function () { hint.classList.add("hidden"); }, 5000);
    });
  }

  initInput();
  init();
})();
