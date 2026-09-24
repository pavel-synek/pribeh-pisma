# Příběh písma — interaktivní prezentace

Statická webová aplikace bez závislostí (vanilla HTML/CSS/JS), vytvořená z obsahu
`Prezentace_Vyroci_knihtisku_email.pptx`. Texty a obrázky jsou beze změny, pořadí
kapitol odpovídá originální prezentaci.

## Vizuální systém „Rubrika“

Papír, inkoust a jediná rumělková červená — odkaz na rubrikaci rukopisů a raných tisků.
Designová filozofie je v [`design/RUBRIKA-design-philosophy.md`](design/RUBRIKA-design-philosophy.md),
key visual v `design/rubrika-key-visual.png`.

- **Paleta:** titulní slajd inkoust `#17150F`; ostatní slajdy černé pozadí `#000000`, bílé písmo, akcent rumělka `#E4513A`, grafit `#A3A3A3`
- **Písma** (self-hosted, SIL OFL 1.1, `assets/fonts/`): Instrument Serif (titulky),
  Instrument Sans (text), IBM Plex Mono (inventární čísla, pagina)
- **Scéna 1920 × 1080** se celá škáluje do okna/iframu — rozvržení je na každé obrazovce stejné.
- **Automatická sazba obrázků:** `app.js` pro každý slajd vyzkouší šířky textového sloupce,
  velikosti písma a rozložení obrázků do řádků/sloupců a vybere variantu s největšími
  obrázky při čitelném textu. Obrázky se nezvětšují nad 3,4× zdrojové velikosti.
- Kliknutím na obrázek se otevře zvětšený náhled s popiskem.

## Ovládání

- šipky ← → / ↑ ↓, mezerník, PageUp/PageDown — pohyb mezi slajdy
- kolečko myši / trackpad, swipe na dotykových zařízeních
- `Home` / `End` — první/poslední slajd
- `G` nebo tlačítko mřížky — přehled všech slajdů
- `F` nebo tlačítko vpravo dole — celá obrazovka, `Esc` — zavření přehledu/náhledu
- přímý odkaz na slajd: `index.html#14`

## Embedování do jiného webu

```html
<iframe
  src="https://vaše-doména.cz/prezi-vyroci-knihtisku/"
  style="width:100%; aspect-ratio:16/9; border:0;"
  allow="fullscreen"
  allowfullscreen
  title="Příběh písma — 550. výročí českého knihtisku">
</iframe>
```

- `allowfullscreen` (a `allow="fullscreen"`) je nutné pro funkční tlačítko fullscreen uvnitř iframe.
- Scéna drží poměr 16:9; mimo něj se doplní barvou aktuálního slajdu. Nejlépe vypadá
  v iframu 16:9, na výšku orientovaném mobilu se zobrazí zmenšeně.
- Žádné externí závislosti — písma jsou součástí repozitáře.

## Úprava obsahu

Veškerý text a přiřazení obrázků je v `assets/data.js` — jde o pole objektů, jedno
na slajd, s poli `kind`, `eyebrow`, `title`, `paragraphs`, `images`, případně
`table`. Rozložení každého slajdu se počítá automaticky v `app.js` (`buildFigure`,
`arrange`), není třeba jej ručně upravovat. Pole `width` z původní verze se již nepoužívá.
