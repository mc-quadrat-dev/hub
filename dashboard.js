// =====================================================================
// DASHBOARD GENERATOR – mc Brand Hub
// Erzeugt 16:9-Slides im Bento-Kachel-Stil.
// Architektur: State -> buildSlideSVG() liefert einen SVG-String ->
// svg.innerHTML. Derselbe String wird mit eingebetteten Schriften
// exportiert (SVG direkt bzw. via <img> auf ein Canvas für PNG).
// =====================================================================

// ---------------------------------------------------------------------
// 1. KONSTANTEN
// ---------------------------------------------------------------------
const DASH_W = 1920, DASH_H = 1080;
const DASH_COLS = 12, DASH_ROWS = 6;
const DASH_M = 48;                 // Außenrand
const DASH_G = 24;                 // Abstand zwischen Kacheln
const DASH_CW = (DASH_W - 2 * DASH_M - (DASH_COLS - 1) * DASH_G) / DASH_COLS;  // 130
const DASH_RH = (DASH_H - 2 * DASH_M - (DASH_ROWS - 1) * DASH_G) / DASH_ROWS;  // 144
const DASH_PAD = 32;               // Innenabstand der Kacheln
const DASH_LS_KEY = 'mcDashboard_v1';

const F_REG = "'Rambla Alt', 'Inter', sans-serif";
const F_BOLD = "'Rambla Alt Oscura', 'Inter', sans-serif";

const DASH_VARIANTS = {
  black:      { bg: '#000000', stroke: 'rgba(255,255,255,0.16)', text: '#ffffff', sub: 'rgba(255,255,255,0.60)', accent: '#cefb0b', label: 'Schwarz' },
  anthracite: { bg: '#222222', stroke: 'none',                   text: '#ffffff', sub: 'rgba(255,255,255,0.60)', accent: '#cefb0b', label: 'Anthrazit' },
  light:      { bg: '#f2f2f2', stroke: 'none',                   text: '#000000', sub: 'rgba(0,0,0,0.60)',       accent: '#000000', label: 'Hell' },
  lime:       { bg: '#cefb0b', stroke: 'none',                   text: '#000000', sub: 'rgba(0,0,0,0.65)',       accent: '#000000', label: 'Lime' }
};
const DASH_VARIANT_ORDER = ['black', 'anthracite', 'light', 'lime'];

const DASH_TYPO = {
  label:     { max: 24,  min: 15, weight: 400, lsF: 0.02 },
  value:     { max: 132, min: 34, weight: 700, lsF: 0.00 },
  delta:     { max: 28,  min: 16, weight: 700, lsF: 0.01 },
  statement: { max: 68,  min: 24, weight: 700, lsF: 0.01, lhF: 1.12 },
  caption:   { max: 22,  min: 14, weight: 400, lsF: 0.02 },
  legend:    { max: 18,  min: 13, weight: 400, lsF: 0.02 }
};

// Serienfarben für Diagramme (Markenpalette)
const DASH_SERIES_COLORS = ['#cefb0b', '#00e0e0', '#0096ff', '#ff2f92', '#b5dd03', '#85ccff'];

// ---------------------------------------------------------------------
// 2. TEXT-MESSUNG & AUTO-FIT
// (Prinzip aus dem Agenda-Generator übernommen: Offscreen-Canvas misst,
//  Schriftgröße wird von max abwärts probiert bis der Text passt.)
// ---------------------------------------------------------------------
const dashMCtx = document.createElement('canvas').getContext('2d');

function dashTextW(t, size, weight, ls) {
  dashMCtx.font = `${weight} ${size}px ${weight >= 700 ? F_BOLD : F_REG}`;
  let w = dashMCtx.measureText(t).width;
  if (ls) w += ls * Math.max(0, t.length - 1);
  return w;
}

function dashEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dashTokenize(line) {
  const parts = [];
  for (const word of line.split(/ +/)) {
    if (!word) continue;
    // nach Bindestrich trennbar
    const segs = word.split('-').map((s, i, a) => (i < a.length - 1 ? s + '-' : s)).filter(s => s !== '');
    segs.forEach((s, i) => parts.push({ t: s, glue: i === 0 ? ' ' : '' }));
  }
  return parts;
}

function dashWrapLine(line, size, weight, ls, maxW) {
  const tokens = dashTokenize(line);
  const lines = [];
  let cur = '';
  for (const tk of tokens) {
    const cand = cur ? (tk.glue ? cur + ' ' + tk.t : cur + tk.t) : tk.t;
    if (cur && dashTextW(cand, size, weight, ls) > maxW) { lines.push(cur); cur = tk.t; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/* Größte Schriftgröße finden, bei der der Text in Breite UND Höhe passt.
   Harte Umbrüche (\n) bleiben erhalten. */
function dashFitBlock(text, maxW, maxH, spec) {
  const lhF = spec.lhF || 1.15;
  let best = null;
  for (let s = spec.max; s >= 10; s--) {
    const ls = s * (spec.lsF || 0);
    const lh = Math.round(s * lhF);
    let lines = [];
    for (const hard of String(text || '').split('\n')) {
      lines = lines.concat(dashWrapLine(hard, s, spec.weight, ls, maxW));
    }
    best = { size: s, ls, lh, lines };
    const wOK = lines.every(l => dashTextW(l, s, spec.weight, ls) <= maxW);
    const hOK = lines.length * lh <= maxH;
    if (wOK && hOK) return best;
  }
  return best;
}

/* Einzeilig: verkleinern bis die Zeile in die Breite passt. */
function dashFitLine(text, maxW, spec) {
  const t = String(text == null ? '' : text);
  for (let s = spec.max; s >= 10; s--) {
    const ls = s * (spec.lsF || 0);
    if (dashTextW(t, s, spec.weight, ls) <= maxW || s === 10) return { size: s, ls };
  }
  return { size: spec.min, ls: spec.min * (spec.lsF || 0) };
}

// ---------------------------------------------------------------------
// 3. RASTER-MATHEMATIK
// ---------------------------------------------------------------------
function dashCellX(col) { return DASH_M + col * (DASH_CW + DASH_G); }
function dashCellY(row) { return DASH_M + row * (DASH_RH + DASH_G); }
function dashSpanW(n) { return n * DASH_CW + (n - 1) * DASH_G; }
function dashSpanH(n) { return n * DASH_RH + (n - 1) * DASH_G; }

function dashRect(card) {
  return {
    x: dashCellX(card.col), y: dashCellY(card.row),
    w: dashSpanW(card.colSpan), h: dashSpanH(card.rowSpan)
  };
}

function dashOverlaps(a, b) {
  return a.col < b.col + b.colSpan && b.col < a.col + a.colSpan &&
         a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;
}

/* Erste freie Position für eine Kachel der Größe cs × rs finden. */
function dashFindSlot(cards, cs, rs) {
  for (let r = 0; r <= DASH_ROWS - rs; r++) {
    for (let c = 0; c <= DASH_COLS - cs; c++) {
      const probe = { col: c, row: r, colSpan: cs, rowSpan: rs };
      if (!cards.some(o => dashOverlaps(probe, o))) return { col: c, row: r };
    }
  }
  return null;
}

/* Mindestgrößen je Kacheltyp – darunter wird der Inhalt unleserlich.
   Das ist die Grenze, bis zu der sich das Auto-Raster fluide anpasst. */
const DASH_MIN = {
  kpi:       [2, 1],
  statement: [3, 2],
  image:     [2, 1],
  chart:     [3, 2]
};
function dashMin(card) { return DASH_MIN[card.type] || [2, 1]; }

function dashOverlapArea(a, b) {
  const w = Math.min(a.col + a.colSpan, b.col + b.colSpan) - Math.max(a.col, b.col);
  const h = Math.min(a.row + a.rowSpan, b.row + b.rowSpan) - Math.max(a.row, b.row);
  return w > 0 && h > 0 ? w * h : 0;
}

function dashInBounds(cards) {
  return cards.every(c => c.col >= 0 && c.row >= 0 &&
    c.col + c.colSpan <= DASH_COLS && c.row + c.rowSpan <= DASH_ROWS);
}

function dashAnyOverlap(cards) {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (dashOverlaps(cards[i], cards[j])) return true;
    }
  }
  return false;
}

function dashValid(cards) { return dashInBounds(cards) && !dashAnyOverlap(cards); }

function dashSnapshot(cards) { return cards.map(c => ({ c, col: c.col, row: c.row, cs: c.colSpan, rs: c.rowSpan })); }
function dashRestore(snap) { snap.forEach(b => { b.c.col = b.col; b.c.row = b.row; b.c.colSpan = b.cs; b.c.rowSpan = b.rs; }); }

// ---------------------------------------------------------------------
// AUTO-RASTER: Fläche immer gefüllt halten
// ---------------------------------------------------------------------
function dashAutoGrid() { return dash ? dash.autoGrid !== false : true; }

/* Belegungsraster: jede Zelle zeigt auf ihre Kachel (oder null). */
function dashOccupancy(cards) {
  const g = Array.from({ length: DASH_ROWS }, () => new Array(DASH_COLS).fill(null));
  cards.forEach(c => {
    for (let r = c.row; r < c.row + c.rowSpan; r++) {
      for (let x = c.col; x < c.col + c.colSpan; x++) {
        if (g[r] && x >= 0 && x < DASH_COLS) g[r][x] = c;
      }
    }
  });
  return g;
}

/* Erste freie Fläche von oben links, als möglichst großes Rechteck. */
function dashFindGap(cards) {
  const g = dashOccupancy(cards);
  for (let r = 0; r < DASH_ROWS; r++) {
    for (let c = 0; c < DASH_COLS; c++) {
      if (g[r][c]) continue;
      let w = 0;
      while (c + w < DASH_COLS && !g[r][c + w]) w++;
      let h = 1;
      grow: while (r + h < DASH_ROWS) {
        for (let x = c; x < c + w; x++) if (g[r + h][x]) break grow;
        h++;
      }
      return { col: c, row: r, w, h };
    }
  }
  return null;
}

/* Eine Lücke durch Wachsen eines angrenzenden Nachbarn schließen.
   Deckt der Nachbar nur einen Teil der Lücke ab, bleibt der Rest übrig und
   wird im nächsten Durchlauf behandelt. */
function dashFillGap(cards, gap) {
  const attempts = [
    // Nachbar links -> nach rechts wachsen
    c => (c.col + c.colSpan === gap.col && c.row >= gap.row && c.row + c.rowSpan <= gap.row + gap.h)
      ? (() => { c.colSpan += gap.w; return () => { c.colSpan -= gap.w; }; })() : null,
    // Nachbar oben -> nach unten wachsen
    c => (c.row + c.rowSpan === gap.row && c.col >= gap.col && c.col + c.colSpan <= gap.col + gap.w)
      ? (() => { c.rowSpan += gap.h; return () => { c.rowSpan -= gap.h; }; })() : null,
    // Nachbar rechts -> nach links wachsen
    c => (c.col === gap.col + gap.w && c.row >= gap.row && c.row + c.rowSpan <= gap.row + gap.h)
      ? (() => { c.col -= gap.w; c.colSpan += gap.w; return () => { c.col += gap.w; c.colSpan -= gap.w; }; })() : null,
    // Nachbar unten -> nach oben wachsen
    c => (c.row === gap.row + gap.h && c.col >= gap.col && c.col + c.colSpan <= gap.col + gap.w)
      ? (() => { c.row -= gap.h; c.rowSpan += gap.h; return () => { c.row += gap.h; c.rowSpan -= gap.h; }; })() : null
  ];
  for (const attempt of attempts) {
    for (const c of cards) {
      const undo = attempt(c);
      if (!undo) continue;
      if (dashValid(cards)) return true;
      undo();
    }
  }
  return false;
}

/* Alle Lücken schließen, so weit es geht. */
function dashAutoFill(cards) {
  for (let i = 0; i < 60; i++) {
    const gap = dashFindGap(cards);
    if (!gap) return true;
    if (!dashFillGap(cards, gap)) return false;
  }
  return false;
}

/* Nachbarn aus der Fläche einer gewachsenen Kachel herausschrumpfen.
   Bricht ab, sobald ein Nachbar seine Mindestgröße erreicht hat. */
function dashShrinkOut(cards, grown) {
  for (const n of cards) {
    if (n === grown || !dashOverlaps(grown, n)) continue;
    const [minC, minR] = dashMin(n);
    let ok = false;

    if (n.col < grown.col) {                                     // links -> rechts kürzen
      const w = grown.col - n.col;
      if (w >= minC) { n.colSpan = w; ok = true; }
    } else if (n.col + n.colSpan > grown.col + grown.colSpan) {   // rechts -> links kürzen
      const newCol = grown.col + grown.colSpan;
      const w = (n.col + n.colSpan) - newCol;
      if (w >= minC) { n.col = newCol; n.colSpan = w; ok = true; }
    }

    if (!ok) {
      if (n.row < grown.row) {                                    // oben -> unten kürzen
        const h = grown.row - n.row;
        if (h >= minR) { n.rowSpan = h; ok = true; }
      } else if (n.row + n.rowSpan > grown.row + grown.rowSpan) {  // unten -> oben kürzen
        const newRow = grown.row + grown.rowSpan;
        const h = (n.row + n.rowSpan) - newRow;
        if (h >= minR) { n.row = newRow; n.rowSpan = h; ok = true; }
      }
    }
    if (!ok) return false;
  }
  return true;
}

/* Kachel auf (col,row) ablegen.
   1. freie Fläche         -> einfach dort ablegen
   2. belegte Fläche       -> Positionstausch mit der am stärksten überdeckten Kachel
   3. Größen passen nicht  -> zusätzlich die Größe mittauschen, wenn beide danach noch
                              ihre typspezifische Mindestgröße erfüllen
   4. Tausch unmöglich     -> Tauschpartner auf den ersten freien Platz setzen
   Klappt keines davon, bleibt alles unverändert und es kommt false zurück.
   Bewusst ohne Verdrängungskaskade: bei einem dicht gefüllten 16:9-Raster
   würde die fast immer scheitern und wäre für Nutzende nicht vorhersehbar. */
function dashPlace(cards, card, col, row) {
  const backup = cards.map(c => ({ c, col: c.col, row: c.row, cs: c.colSpan, rs: c.rowSpan }));
  const undo = () => backup.forEach(b => { b.c.col = b.col; b.c.row = b.row; b.c.colSpan = b.cs; b.c.rowSpan = b.rs; });
  const from = { col: card.col, row: card.row, cs: card.colSpan, rs: card.rowSpan };

  card.col = col; card.row = row;
  if (dashInBounds(cards) && !dashAnyOverlap(cards)) return true;

  const target = { col, row, colSpan: card.colSpan, rowSpan: card.rowSpan };
  const hits = cards.filter(o => o !== card && dashOverlaps(target, o));
  if (!hits.length) { undo(); return false; }
  const partner = hits.reduce((best, o) =>
    dashOverlapArea(target, o) > dashOverlapArea(target, best) ? o : best, hits[0]);
  const partnerFrom = { col: partner.col, row: partner.row, cs: partner.colSpan, rs: partner.rowSpan };

  // Reiner Positionstausch – Größen bleiben unverändert
  partner.col = from.col; partner.row = from.row;
  if (dashInBounds(cards) && !dashAnyOverlap(cards)) return true;

  // Positions- UND Größentausch, wenn beide Kacheln danach noch groß genug für ihren Typ sind
  const [cMinC, cMinR] = dashMin(card);
  const [pMinC, pMinR] = dashMin(partner);
  if (partnerFrom.cs >= cMinC && partnerFrom.rs >= cMinR && from.cs >= pMinC && from.rs >= pMinR) {
    card.colSpan = partnerFrom.cs; card.rowSpan = partnerFrom.rs;
    partner.colSpan = from.cs; partner.rowSpan = from.rs;
    if (dashInBounds(cards) && !dashAnyOverlap(cards)) return true;
    card.colSpan = from.cs; card.rowSpan = from.rs;
    partner.colSpan = partnerFrom.cs; partner.rowSpan = partnerFrom.rs;
  }

  const rest = cards.filter(c => c !== partner);
  const slot = dashFindSlot(rest, partner.colSpan, partner.rowSpan);
  if (slot) {
    partner.col = slot.col; partner.row = slot.row;
    if (dashInBounds(cards) && !dashAnyOverlap(cards)) return true;
  }

  undo();
  return false;
}

// ---------------------------------------------------------------------
// 4. STATE
// ---------------------------------------------------------------------
let dashUid = 1;
function dashId(p) { return p + (dashUid++) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

function dashDefaultState() {
  return {
    v: 1,
    activeSlide: 0,
    autoGrid: true,
    images: {},
    slides: [{
      id: dashId('s'),
      cards: [
        { id: dashId('c'), type: 'statement', col: 0, row: 0, colSpan: 5, rowSpan: 3, variant: 'lime',
          text: 'Kampagne\nQ3 in Zahlen' },
        { id: dashId('c'), type: 'kpi', col: 5, row: 0, colSpan: 4, rowSpan: 2, variant: 'black',
          label: 'Reichweite gesamt', value: '2,4 Mio.', delta: '+18 %' },
        { id: dashId('c'), type: 'kpi', col: 9, row: 0, colSpan: 3, rowSpan: 2, variant: 'anthracite',
          label: 'Interaktionsrate', value: '6,8 %', delta: '+1,4 pp' },
        { id: dashId('c'), type: 'chart', col: 5, row: 2, colSpan: 4, rowSpan: 4, variant: 'black',
          chart: { kind: 'donut', caption: 'Budgetverteilung', series: [
            { label: 'Social', value: 46, color: '#cefb0b' },
            { label: 'Display', value: 31, color: '#00e0e0' },
            { label: 'Print', value: 23, color: '#0096ff' } ] } },
        { id: dashId('c'), type: 'chart', col: 0, row: 3, colSpan: 5, rowSpan: 3, variant: 'anthracite',
          chart: { kind: 'area', caption: 'Sichtbarkeit im Verlauf', series: [
            { label: 'Impressionen', value: 0, color: '#cefb0b',
              points: [38, 44, 41, 57, 63, 60, 74, 82] } ] } },
        { id: dashId('c'), type: 'kpi', col: 9, row: 2, colSpan: 3, rowSpan: 2, variant: 'light',
          label: 'Neue Follower', value: '12,7 K', delta: '+9 %' },
        { id: dashId('c'), type: 'image', col: 9, row: 4, colSpan: 3, rowSpan: 2, variant: 'anthracite',
          imageId: null, bleed: false }
      ]
    }]
  };
}

let dash = null;               // aktiver Projektzustand
let dashSelId = null;          // ausgewählte Kachel
let dashTypeMenuFor = null;    // Kachel-ID, deren Typ-Auswahl offen ist
let dashInlineActive = false;
let dashOpened = false;

function dashSlide() { return dash.slides[dash.activeSlide]; }
function dashCards() { return dashSlide().cards; }
function dashSelected() { return dashCards().find(c => c.id === dashSelId) || null; }

// ---------------------------------------------------------------------
// 5. SVG-RENDERER
// ---------------------------------------------------------------------
function dashHit(card, field) {
  return ` data-card="${card.id}"${field ? ` data-field="${field}"` : ''}`;
}

function dashText(str, x, y, size, weight, fill, ls, anchor, extra) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${weight >= 700 ? F_BOLD : F_REG}"` +
    ` font-size="${size}" font-weight="${weight}" fill="${fill}"` +
    (ls ? ` letter-spacing="${ls.toFixed(2)}"` : '') +
    (anchor ? ` text-anchor="${anchor}"` : '') +
    (extra || '') + `>${dashEsc(str)}</text>`;
}

// --- KPI ---
function dashRenderKpi(card, r, v) {
  const iw = r.w - 2 * DASH_PAD;
  let s = '';
  const labelFit = dashFitLine(card.label || '', iw, DASH_TYPO.label);
  s += dashText(card.label || '', r.x + DASH_PAD, r.y + DASH_PAD + labelFit.size,
    labelFit.size, DASH_TYPO.label.weight, v.sub, labelFit.ls, null, dashHit(card, 'label'));

  const deltaTxt = card.delta || '';
  const deltaFit = deltaTxt ? dashFitLine(deltaTxt, iw * 0.5, DASH_TYPO.delta) : null;
  const deltaH = deltaFit ? deltaFit.size * 1.5 : 0;

  // Zahl füllt die verbleibende Höhe, begrenzt durch Breite
  const availH = r.h - 2 * DASH_PAD - labelFit.size * 1.6 - deltaH;
  const valSpec = { ...DASH_TYPO.value, max: Math.min(DASH_TYPO.value.max, Math.round(availH)) };
  const valFit = dashFitLine(card.value || '', iw, valSpec);
  const valBase = r.y + r.h - DASH_PAD - deltaH;
  s += dashText(card.value || '', r.x + DASH_PAD, valBase,
    valFit.size, DASH_TYPO.value.weight, v.text, valFit.ls, null, dashHit(card, 'value'));

  if (deltaFit) {
    s += dashText(deltaTxt, r.x + DASH_PAD, r.y + r.h - DASH_PAD,
      deltaFit.size, DASH_TYPO.delta.weight, v.accent, deltaFit.ls, null, dashHit(card, 'delta'));
  }
  return s;
}

// --- Statement ---
function dashRenderStatement(card, r, v) {
  const iw = r.w - 2 * DASH_PAD;
  const ih = r.h - 2 * DASH_PAD;
  const fit = dashFitBlock(card.text || '', iw, ih, DASH_TYPO.statement);
  let s = '';
  fit.lines.forEach((line, i) => {
    s += dashText(line, r.x + DASH_PAD, r.y + DASH_PAD + fit.size * 0.86 + i * fit.lh,
      fit.size, DASH_TYPO.statement.weight, v.text, fit.ls, null,
      i === 0 ? dashHit(card, 'text') : dashHit(card));
  });
  return s;
}

// --- Bild ---
function dashRenderImage(card, r, v, defs, opts) {
  const img = card.imageId && dash.images[card.imageId];
  if (!img) {
    const fit = dashFitLine('Bild wählen', r.w - 2 * DASH_PAD, DASH_TYPO.caption);
    return dashText('Bild wählen', r.x + r.w / 2, r.y + r.h / 2 + fit.size / 3,
      fit.size, 400, v.sub, fit.ls, 'middle', dashHit(card, 'image'));
  }
  const clipId = 'clip_' + card.id;
  const bleed = card.bleed ? 0.12 : 0;
  const bx = r.x - r.w * bleed, by = r.y - r.h * bleed;
  const bw = r.w * (1 + 2 * bleed), bh = r.h * (1 + 2 * bleed);
  // Bei "angeschnitten" erst am Artboard-Rand beschneiden, sonst an der Kachel
  const cx = card.bleed ? Math.max(0, bx) : r.x;
  const cy = card.bleed ? Math.max(0, by) : r.y;
  const cw = card.bleed ? Math.min(DASH_W - cx, bw) : r.w;
  const ch = card.bleed ? Math.min(DASH_H - cy, bh) : r.h;
  defs.push(`<clipPath id="${clipId}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath>`);
  // Im Export wird die Data-URI direkt eingebettet (ein exportiertes SVG kann
  // nichts nachladen). Auf der Bühne bleibt sie draußen und wird nach dem
  // Rendern nachgetragen – sonst läge sie bei jedem Neuzeichnen im innerHTML.
  const href = (opts && opts.inlineImages)
    ? ` href="${img.src}" xlink:href="${img.src}"`
    : ` href="" data-img="${card.imageId}"`;
  return `<image${href} x="${bx.toFixed(1)}" y="${by.toFixed(1)}"` +
    ` width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" preserveAspectRatio="xMidYMid slice"` +
    ` clip-path="url(#${clipId})"${dashHit(card, 'image')}/>`;
}

// --- Diagramme ---
function dashRenderChart(card, r, v) {
  const ch = card.chart || { kind: 'donut', series: [] };
  const series = (ch.series || []).filter(s => s && s.label !== undefined);
  const iw = r.w - 2 * DASH_PAD;
  let s = '';
  let top = r.y + DASH_PAD;

  if (ch.caption) {
    const capFit = dashFitLine(ch.caption, iw, DASH_TYPO.caption);
    s += dashText(ch.caption, r.x + DASH_PAD, top + capFit.size,
      capFit.size, DASH_TYPO.caption.weight, v.sub, capFit.ls, null, dashHit(card, 'caption'));
    top += capFit.size * 1.9;
  }

  // Legende unten (Donut/Balken: je Serie; Fläche: eine Zeile)
  const legendSize = Math.max(DASH_TYPO.legend.min, Math.min(DASH_TYPO.legend.max, Math.round(r.h * 0.045)));
  const legendRows = ch.kind === 'area' ? 1 : series.length;
  const legendH = legendRows * legendSize * 1.7;
  const plotBottom = r.y + r.h - DASH_PAD - legendH;
  const plotH = Math.max(20, plotBottom - top);

  if (ch.kind === 'donut') {
    const total = series.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;
    const rad = Math.min(iw, plotH) / 2 * 0.86;
    const cx = r.x + r.w / 2, cy = top + plotH / 2;
    const thick = Math.max(10, rad / 3);
    const U = 2 * Math.PI * rad;
    let acc = 0;
    s += `<g transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})">`;
    // Grundring
    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="none"` +
      ` stroke="${v.text}" stroke-opacity="0.12" stroke-width="${thick.toFixed(1)}"/>`;
    series.forEach(seg => {
      const p = (Number(seg.value) || 0) / total;
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="none"` +
        ` stroke="${seg.color || DASH_SERIES_COLORS[0]}" stroke-width="${thick.toFixed(1)}"` +
        ` stroke-dasharray="${(p * U).toFixed(2)} ${U.toFixed(2)}"` +
        ` stroke-dashoffset="${(-acc * U).toFixed(2)}"/>`;
      acc += p;
    });
    s += `</g>`;
  } else if (ch.kind === 'area') {
    const pts = (series[0] && series[0].points) || [];
    const col = (series[0] && series[0].color) || DASH_SERIES_COLORS[0];
    if (pts.length >= 2) {
      const maxV = Math.max(...pts.map(Number), 1);
      const x0 = r.x + DASH_PAD, plotW = iw;
      const yBase = top + plotH;
      const px = i => x0 + i * (plotW / (pts.length - 1));
      const py = val => yBase - (Number(val) / maxV) * (plotH * 0.92);
      let line = `M ${px(0).toFixed(1)} ${py(pts[0]).toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) line += ` L ${px(i).toFixed(1)} ${py(pts[i]).toFixed(1)}`;
      // Vollflächig, keine Transparenz – passt zur flachen Markensprache
      s += `<path d="${line} L ${px(pts.length - 1).toFixed(1)} ${yBase.toFixed(1)} L ${px(0).toFixed(1)} ${yBase.toFixed(1)} Z"` +
        ` fill="${col}"/>`;
    }
  } else { // bar
    const n = series.length || 1;
    const gap = 12;
    const bw = Math.max(6, (iw - (n - 1) * gap) / n);
    const maxV = Math.max(...series.map(x => Number(x.value) || 0), 1);
    const yBase = top + plotH;
    series.forEach((seg, i) => {
      const hh = (Number(seg.value) || 0) / maxV * (plotH * 0.92);
      const x = r.x + DASH_PAD + i * (bw + gap);
      s += `<rect x="${x.toFixed(1)}" y="${(yBase - hh).toFixed(1)}" width="${bw.toFixed(1)}"` +
        ` height="${hh.toFixed(1)}" fill="${seg.color || DASH_SERIES_COLORS[i % DASH_SERIES_COLORS.length]}"/>`;
    });
  }

  // Legende
  const legY = r.y + r.h - DASH_PAD - legendH + legendSize;
  if (ch.kind === 'area') {
    const seg = series[0];
    if (seg) {
      s += `<rect x="${(r.x + DASH_PAD).toFixed(1)}" y="${(legY - legendSize * 0.78).toFixed(1)}" width="${legendSize * 0.72}" height="${legendSize * 0.72}" fill="${seg.color || DASH_SERIES_COLORS[0]}"/>`;
      s += dashText(seg.label || '', r.x + DASH_PAD + legendSize * 1.35, legY,
        legendSize, DASH_TYPO.legend.weight, v.sub, legendSize * DASH_TYPO.legend.lsF);
    }
  } else {
    const total = series.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;
    series.forEach((seg, i) => {
      const y = legY + i * legendSize * 1.7;
      s += `<rect x="${(r.x + DASH_PAD).toFixed(1)}" y="${(y - legendSize * 0.78).toFixed(1)}" width="${legendSize * 0.72}" height="${legendSize * 0.72}" fill="${seg.color || DASH_SERIES_COLORS[i % DASH_SERIES_COLORS.length]}"/>`;
      s += dashText(seg.label || '', r.x + DASH_PAD + legendSize * 1.35, y,
        legendSize, DASH_TYPO.legend.weight, v.sub, legendSize * DASH_TYPO.legend.lsF);
      const pct = ch.kind === 'donut' ? Math.round((Number(seg.value) || 0) / total * 100) + ' %' : String(seg.value);
      s += dashText(pct, r.x + r.w - DASH_PAD, y,
        legendSize, 700, v.text, 0, 'end');
    });
  }
  return s;
}

// --- Slide ---
function dashBuildSlideSVG(slide, opts) {
  opts = opts || {};
  const defs = [];
  let body = '';

  for (const card of slide.cards) {
    const r = dashRect(card);
    const v = DASH_VARIANTS[card.variant] || DASH_VARIANTS.black;
    const isImage = card.type === 'image' && card.imageId && dash.images[card.imageId];

    body += `<g class="dash-card"${dashHit(card)}>`;
    if (!(isImage && card.bleed)) {
      body += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${v.bg}"` +
        (v.stroke !== 'none' ? ` stroke="${v.stroke}" stroke-width="1"` : '') + `/>`;
    }

    if (card.type === 'kpi') body += dashRenderKpi(card, r, v);
    else if (card.type === 'statement') body += dashRenderStatement(card, r, v);
    else if (card.type === 'image') body += dashRenderImage(card, r, v, defs, opts);
    else if (card.type === 'chart') body += dashRenderChart(card, r, v);

    body += `</g>`;
  }

  return `<rect x="0" y="0" width="${DASH_W}" height="${DASH_H}" fill="#000000"/>` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') + body;
}

let dashGhost = null;   // Vorschau-Rechteck beim Verschieben/Skalieren

function dashRender() {
  const svg = document.getElementById('dash-svg');
  if (!svg || !dash) return;
  svg.innerHTML = dashBuildSlideSVG(dashSlide());
  dashHydrateImages(svg);
  dashSyncOverlay();
  dashPersist();
}

/* Auswahlrahmen, Anfasser und Zieh-Vorschau als HTML über dem SVG.
   Dadurch bleibt der Textknoten beim Anklicken erhalten (sonst käme der
   Doppelklick zum Bearbeiten nie an) und das Ziehen wird flüssiger. */
function dashSyncOverlay() {
  const ov = document.getElementById('dash-overlay');
  if (!ov) return;
  const pctX = v => (v / DASH_W * 100) + '%';
  const pctY = v => (v / DASH_H * 100) + '%';
  ov.innerHTML = '';

  const card = dashSelected();
  if (card && !dashGhost) {
    const r = dashRect(card);
    const box = document.createElement('div');
    box.className = 'dash-sel-box';
    box.style.left = pctX(r.x); box.style.top = pctY(r.y);
    box.style.width = pctX(r.w); box.style.height = pctY(r.h);
    ov.appendChild(box);

    const h = document.createElement('div');
    h.className = 'dash-handle';
    h.style.left = pctX(r.x + r.w); h.style.top = pctY(r.y + r.h);
    h.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      dashDrag = { mode: 'resize', card, x: e.clientX, y: e.clientY };
      dashDidDrag = false;
    });
    ov.appendChild(h);
  }

  if (dashGhost) {
    const g = document.createElement('div');
    g.className = 'dash-ghost';
    g.style.left = pctX(dashGhost.x); g.style.top = pctY(dashGhost.y);
    g.style.width = pctX(dashGhost.w); g.style.height = pctY(dashGhost.h);
    ov.appendChild(g);
  }
}

/* Bilddaten erst nach dem Rendern in die Knoten schreiben – so landen die
   Base64-Strings nicht bei jedem Neuzeichnen im innerHTML. */
function dashHydrateImages(svg) {
  svg.querySelectorAll('image[data-img]').forEach(n => {
    const rec = dash.images[n.dataset.img];
    if (!rec || !rec.src) return;
    n.setAttribute('href', rec.src);
    n.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', rec.src);
  });
}

// ---------------------------------------------------------------------
// 6. SIDEBAR
// ---------------------------------------------------------------------
function dashEl(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function dashField(labelTxt, inputEl) {
  const f = dashEl('div', 'dash-field');
  f.appendChild(dashEl('label', null, labelTxt));
  f.appendChild(inputEl);
  return f;
}

function dashInput(value, oninput, type) {
  const i = document.createElement('input');
  i.type = type || 'text';
  i.className = 'dash-input';
  i.value = value == null ? '' : value;
  i.addEventListener('input', () => oninput(i.value));
  return i;
}

const DASH_KIND_LABEL = { kpi: 'Kennzahl', statement: 'Statement', image: 'Bild', chart: 'Diagramm' };

function dashSyncSidebar() {
  const sb = document.getElementById('dash-sidebar');
  if (!sb || !dash) return;
  sb.innerHTML = '';

  // --- Kachelliste ---
  const g1 = dashEl('div', 'dash-side-group');
  g1.appendChild(dashEl('div', 'dash-side-label', 'Kacheln dieser Seite'));
  const list = dashEl('div', 'dash-card-list');
  let openMenu = null;
  dashCards().forEach(card => {
    const active = card.id === dashSelId;
    const item = dashEl('div', 'dash-card-item' + (active ? ' active' : ''));
    const name = card.type === 'kpi' ? (card.label || 'Kennzahl')
      : card.type === 'statement' ? String(card.text || 'Statement').split('\n')[0]
      : card.type === 'chart' ? ((card.chart && card.chart.caption) || 'Diagramm')
      : 'Bild';
    item.appendChild(dashEl('span', null, name));
    item.appendChild(dashEl('span', 'dash-card-kind', DASH_KIND_LABEL[card.type] || card.type));

    const chev = document.createElement('span');
    chev.className = 'dash-card-chevron';
    chev.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    chev.title = 'Kacheltyp ändern';
    item.appendChild(chev);

    // Erster Klick wählt aus, erneuter Klick öffnet die Typ-Auswahl
    item.addEventListener('click', e => {
      e.stopPropagation();
      if (active) {
        dashTypeMenuFor = dashTypeMenuFor === card.id ? null : card.id;
        dashSyncSidebar();
      } else {
        dashSelId = card.id;
        dashTypeMenuFor = null;
        dashRender();
        dashSyncSidebar();
      }
    });

    if (active && dashTypeMenuFor === card.id) {
      const menu = dashEl('div', 'dash-type-menu');
      Object.keys(DASH_KIND_LABEL).forEach(key => {
        const opt = dashEl('button', 'dash-type-opt' + (card.type === key ? ' active' : ''), DASH_KIND_LABEL[key]);
        opt.addEventListener('click', e => {
          e.stopPropagation();
          dashTypeMenuFor = null;
          dashChangeType(card, key);
        });
        menu.appendChild(opt);
      });
      item.appendChild(menu);
      openMenu = menu;
    }
    list.appendChild(item);
  });
  if (!dashCards().length) g1.appendChild(dashEl('div', 'dash-side-hint', 'Noch keine Kacheln – oben über „+ Kachel“ hinzufügen.'));
  g1.appendChild(list);
  sb.appendChild(g1);

  // Menü nach oben klappen, wenn es unten aus der Leiste liefe
  if (openMenu) {
    const m = openMenu.getBoundingClientRect();
    const s = sb.getBoundingClientRect();
    if (m.bottom > s.bottom - 8) openMenu.classList.add('up');
  }

  const card = dashSelected();
  if (!card) {
    const hint = dashEl('div', 'dash-side-group');
    hint.appendChild(dashEl('div', 'dash-side-hint',
      'Kachel anklicken zum Bearbeiten. Auf der Fläche verschieben, an der Ecke unten rechts die Größe ändern, Doppelklick auf einen Text bearbeitet ihn direkt.'));
    sb.appendChild(hint);
    return;
  }

  // --- Farbvariante ---
  const g2 = dashEl('div', 'dash-side-group');
  g2.appendChild(dashEl('div', 'dash-side-label', 'Farbe'));
  const sw = dashEl('div', 'dash-swatches');
  DASH_VARIANT_ORDER.forEach(key => {
    const b = document.createElement('button');
    b.className = 'dash-swatch' + (card.variant === key ? ' active' : '');
    b.style.background = DASH_VARIANTS[key].bg;
    b.title = DASH_VARIANTS[key].label;
    b.addEventListener('click', () => { card.variant = key; dashRefresh(); });
    sw.appendChild(b);
  });
  g2.appendChild(sw);
  sb.appendChild(g2);

  // --- Größe ---
  const [minC, minR] = dashMin(card);
  const g3 = dashEl('div', 'dash-side-group');
  g3.appendChild(dashEl('div', 'dash-side-label', 'Größe im Raster'));
  const row = dashEl('div', 'dash-row');
  const cs = dashInput(card.colSpan, v => dashResizeCard(card, +v, card.rowSpan), 'number');
  cs.min = minC; cs.max = DASH_COLS;
  const rs = dashInput(card.rowSpan, v => dashResizeCard(card, card.colSpan, +v), 'number');
  rs.min = minR; rs.max = DASH_ROWS;
  row.appendChild(dashField('Breite (Spalten)', cs));
  row.appendChild(dashField('Höhe (Zeilen)', rs));
  g3.appendChild(row);
  sb.appendChild(g3);

  // --- Typspezifische Felder ---
  const g4 = dashEl('div', 'dash-side-group');
  g4.appendChild(dashEl('div', 'dash-side-label', 'Inhalt · ' + (DASH_KIND_LABEL[card.type] || '')));

  if (card.type === 'kpi') {
    g4.appendChild(dashField('Label', dashInput(card.label, v => { card.label = v; dashDebounced(); })));
    g4.appendChild(dashField('Wert', dashInput(card.value, v => { card.value = v; dashDebounced(); })));
    g4.appendChild(dashField('Veränderung', dashInput(card.delta, v => { card.delta = v; dashDebounced(); })));
  } else if (card.type === 'statement') {
    const ta = document.createElement('textarea');
    ta.className = 'dash-input';
    ta.value = card.text || '';
    ta.addEventListener('input', () => { card.text = ta.value; dashDebounced(); });
    g4.appendChild(dashField('Text (Zeilenumbruch mit Enter)', ta));
  } else if (card.type === 'image') {
    const btnRow = dashEl('div', 'dash-row');
    const up = dashEl('button', 'ctrl-btn', 'Hochladen');
    up.style.flex = '1';
    up.addEventListener('click', () => dashPickUpload(card));
    const kv = dashEl('button', 'ctrl-btn', 'Keyvisual');
    kv.style.flex = '1';
    kv.addEventListener('click', () => dashUseKeyvisual(card));
    btnRow.appendChild(up); btnRow.appendChild(kv);
    g4.appendChild(btnRow);

    const sel = document.createElement('select');
    sel.className = 'dash-input';
    sel.style.marginTop = '10px';
    [['', 'Aus dem Brand Hub …'],
     ['assets/teams/v1.png', 'Teams Hintergrund V1'],
     ['assets/teams/v2.png', 'Teams Hintergrund V2'],
     ['assets/logo/de/white.svg', 'Logo weiß (DE)'],
     ['assets/logo/de/color.svg', 'Logo Farbe (DE)'],
     ['assets/logo/en/white.svg', 'Logo weiß (EN)']
    ].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o);
    });
    sel.addEventListener('change', () => { if (sel.value) dashUseAsset(card, sel.value); sel.value = ''; });
    g4.appendChild(sel);

    const cbWrap = dashEl('label', 'logo-cb-label');
    cbWrap.style.marginTop = '12px';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!card.bleed;
    cb.addEventListener('change', () => { card.bleed = cb.checked; dashRefresh(); });
    cbWrap.appendChild(cb);
    cbWrap.appendChild(dashEl('span', null, 'Über den Kachelrand hinaus'));
    g4.appendChild(cbWrap);
  } else if (card.type === 'chart') {
    card.chart = card.chart || { kind: 'donut', caption: '', series: [] };
    const kindSel = document.createElement('select');
    kindSel.className = 'dash-input';
    [['donut', 'Donut'], ['area', 'Fläche'], ['bar', 'Balken']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if (card.chart.kind === v) o.selected = true;
      kindSel.appendChild(o);
    });
    kindSel.addEventListener('change', () => {
      card.chart.kind = kindSel.value;
      if (kindSel.value === 'area' && !(card.chart.series[0] || {}).points) {
        card.chart.series = [{ label: (card.chart.series[0] || {}).label || 'Verlauf',
          value: 0, color: DASH_SERIES_COLORS[0], points: [30, 45, 40, 58, 66, 72] }];
      }
      dashRefresh();
    });
    g4.appendChild(dashField('Art', kindSel));
    g4.appendChild(dashField('Überschrift', dashInput(card.chart.caption, v => { card.chart.caption = v; dashDebounced(); })));

    if (card.chart.kind === 'area') {
      const s0 = card.chart.series[0] || (card.chart.series[0] =
        { label: 'Verlauf', value: 0, color: DASH_SERIES_COLORS[0], points: [30, 45, 40, 58, 66, 72] });
      g4.appendChild(dashField('Bezeichnung', dashInput(s0.label, v => { s0.label = v; dashDebounced(); })));
      g4.appendChild(dashField('Werte (mit Komma getrennt)',
        dashInput((s0.points || []).join(', '), v => {
          s0.points = v.split(',').map(x => parseFloat(x.trim())).filter(x => !isNaN(x));
          dashDebounced();
        })));
      const cIn = document.createElement('input');
      cIn.type = 'color'; cIn.className = 'dash-input'; cIn.style.height = '34px';
      cIn.value = s0.color || DASH_SERIES_COLORS[0];
      cIn.addEventListener('input', () => { s0.color = cIn.value; dashDebounced(); });
      g4.appendChild(dashField('Farbe', cIn));
    } else {
      g4.appendChild(dashEl('div', 'dash-side-label', 'Werte'));
      card.chart.series.forEach((seg, i) => {
        const r = dashEl('div', 'dash-series-row');
        const li = dashInput(seg.label, v => { seg.label = v; dashDebounced(); });
        li.className = 'dash-input dash-s-label';
        const vi = dashInput(seg.value, v => { seg.value = parseFloat(v) || 0; dashDebounced(); }, 'number');
        vi.className = 'dash-input dash-s-value';
        const ci = document.createElement('input');
        ci.type = 'color'; ci.className = 'dash-series-color';
        ci.value = seg.color || DASH_SERIES_COLORS[i % DASH_SERIES_COLORS.length];
        ci.addEventListener('input', () => { seg.color = ci.value; dashDebounced(); });
        const del = dashEl('button', 'icon-btn', '✕');
        del.style.flex = '0 0 24px'; del.style.height = '24px'; del.style.padding = '0';
        del.addEventListener('click', () => { card.chart.series.splice(i, 1); dashRefresh(); });
        r.appendChild(li); r.appendChild(vi); r.appendChild(ci); r.appendChild(del);
        g4.appendChild(r);
      });
      const add = dashEl('button', 'ctrl-btn', '+ Wert');
      add.style.marginTop = '6px';
      add.addEventListener('click', () => {
        const i = card.chart.series.length;
        card.chart.series.push({ label: 'Wert ' + (i + 1), value: 20,
          color: DASH_SERIES_COLORS[i % DASH_SERIES_COLORS.length] });
        dashRefresh();
      });
      g4.appendChild(add);
    }
  }
  sb.appendChild(g4);

  // --- Aktionen ---
  const g5 = dashEl('div', 'dash-side-group');
  const actions = dashEl('div', 'dash-row');
  const dup = dashEl('button', 'ctrl-btn', 'Duplizieren');
  dup.style.flex = '1';
  dup.addEventListener('click', () => dashDuplicateCard(card));
  const del = dashEl('button', 'ctrl-btn', 'Löschen');
  del.style.flex = '1';
  del.addEventListener('click', () => dashDeleteCard(card));
  actions.appendChild(dup); actions.appendChild(del);
  g5.appendChild(actions);
  sb.appendChild(g5);
}

// ---------------------------------------------------------------------
// 7. KACHEL-AKTIONEN
// ---------------------------------------------------------------------
let dashDebounceTimer = null;
function dashDebounced() {
  clearTimeout(dashDebounceTimer);
  dashDebounceTimer = setTimeout(dashRender, 200);
}

function dashRefresh() {
  dashRender();
  dashSyncSidebar();
  dashSyncPager();
}

function dashResizeCard(card, cs, rs) {
  const cards = dashCards();
  const [minC, minR] = dashMin(card);
  cs = Math.max(minC, Math.min(DASH_COLS - card.col, cs || card.colSpan));
  rs = Math.max(minR, Math.min(DASH_ROWS - card.row, rs || card.rowSpan));

  const snap = dashSnapshot(cards);
  card.colSpan = cs; card.rowSpan = rs;

  if (dashAutoGrid()) {
    // Nachbarn weichen zurück, danach werden entstandene Lücken geschlossen
    if (!dashShrinkOut(cards, card) || !dashValid(cards)) {
      dashRestore(snap);
      showToast('Die Nachbarkacheln sind schon auf Mindestgröße');
    } else {
      dashAutoFill(cards);
    }
  } else if (!dashValid(cards)) {
    dashRestore(snap);
    card.colSpan = cs; card.rowSpan = rs;
    if (!dashPlace(cards, card, card.col, card.row)) {
      dashRestore(snap);
      showToast('Kein Platz für diese Größe');
    }
  }
  dashRegenKeyvisuals();
  dashRefresh();
}

/* Platz für eine neue Kachel schaffen, indem eine vorhandene verkleinert wird.
   Größte zuerst – das fällt am wenigsten auf – und immer nur so weit, wie es
   die Mindestgröße des jeweiligen Typs zulässt. */
function dashMakeRoom(cards, needC, needR) {
  // Reihum je eine Stufe verkleinern, größte Kacheln zuerst. So gibt jede
  // etwas ab, statt eine einzelne bis zur Mindestgröße auszuquetschen.
  const order = cards.slice().sort((a, b) => (b.colSpan * b.rowSpan) - (a.colSpan * a.rowSpan));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of order) {
      const [minC, minR] = dashMin(c);
      if (c.colSpan > minC) c.colSpan--;
      else if (c.rowSpan > minR) c.rowSpan--;
      else continue;
      changed = true;
      if (dashFindSlot(cards, needC, needR)) return true;
    }
  }
  return false;
}

/* Freien Platz suchen: erst in Wunschgröße, dann in Mindestgröße, zuletzt
   durch Verkleinern einer vorhandenen Kachel. */
function dashClaimSlot(cards, want, min) {
  let slot = dashFindSlot(cards, want[0], want[1]);
  if (slot) return { slot, cs: want[0], rs: want[1] };

  slot = dashFindSlot(cards, min[0], min[1]);
  if (slot) return { slot, cs: min[0], rs: min[1] };

  const snap = dashSnapshot(cards);
  if (dashMakeRoom(cards, min[0], min[1])) {
    slot = dashFindSlot(cards, min[0], min[1]);
    if (slot) return { slot, cs: min[0], rs: min[1] };
  }
  dashRestore(snap);
  return null;
}

function dashNewCard(type) {
  const cards = dashCards();
  const want = type === 'statement' ? [5, 3] : type === 'chart' ? [4, 3] : [3, 2];
  const claim = dashClaimSlot(cards, want, DASH_MIN[type] || [2, 1]);
  if (!claim) {
    showToast(`Kein zusammenhängender Platz mehr für „${DASH_KIND_LABEL[type]}“ – Kachel löschen oder neue Seite anlegen`);
    return;
  }
  const { slot, cs, rs } = claim;
  const card = { id: dashId('c'), type, col: slot.col, row: slot.row,
    colSpan: cs, rowSpan: rs, variant: 'black' };
  if (type === 'kpi') { card.label = 'Kennzahl'; card.value = '0'; card.delta = ''; }
  if (type === 'statement') card.text = 'Neues Statement';
  if (type === 'image') { card.imageId = null; card.bleed = false; }
  if (type === 'chart') card.chart = { kind: 'donut', caption: 'Diagramm', series: [
    { label: 'Anteil A', value: 60, color: DASH_SERIES_COLORS[0] },
    { label: 'Anteil B', value: 40, color: DASH_SERIES_COLORS[1] } ] };
  cards.push(card);
  dashSelId = card.id;
  if (dashAutoGrid()) dashAutoFill(cards);
  dashRefresh();
}

function dashDuplicateCard(card) {
  const cards = dashCards();
  const claim = dashClaimSlot(cards, [card.colSpan, card.rowSpan], dashMin(card));
  if (!claim) {
    showToast('Kein zusammenhängender Platz mehr für eine Kopie – Kachel löschen oder neue Seite anlegen');
    return;
  }
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = dashId('c');
  copy.col = claim.slot.col; copy.row = claim.slot.row;
  copy.colSpan = claim.cs; copy.rowSpan = claim.rs;
  cards.push(copy);
  dashSelId = copy.id;
  if (dashAutoGrid()) dashAutoFill(cards);
  dashRefresh();
}

function dashDeleteCard(card) {
  const arr = dashCards();
  const i = arr.indexOf(card);
  if (i >= 0) arr.splice(i, 1);
  if (dashSelId === card.id) dashSelId = null;
  if (dashAutoGrid()) { dashAutoFill(arr); dashRegenKeyvisuals(); }
  dashRefresh();
}

/* Kacheltyp wechseln – fehlende Felder werden ergänzt, die Mindestgröße
   des neuen Typs wird sichergestellt. */
function dashChangeType(card, type) {
  if (card.type === type) return;
  card.type = type;
  if (type === 'kpi') {
    if (card.label == null) card.label = 'Kennzahl';
    if (card.value == null) card.value = '0';
    if (card.delta == null) card.delta = '';
  } else if (type === 'statement') {
    if (card.text == null) card.text = 'Neues Statement';
  } else if (type === 'image') {
    if (card.imageId === undefined) card.imageId = null;
    card.bleed = !!card.bleed;
  } else if (type === 'chart') {
    if (!card.chart) card.chart = { kind: 'donut', caption: 'Diagramm', series: [
      { label: 'Anteil A', value: 60, color: DASH_SERIES_COLORS[0] },
      { label: 'Anteil B', value: 40, color: DASH_SERIES_COLORS[1] } ] };
  }
  const [minC, minR] = dashMin(card);
  if (card.colSpan < minC || card.rowSpan < minR) {
    dashResizeCard(card, Math.max(card.colSpan, minC), Math.max(card.rowSpan, minR));
  } else {
    dashRefresh();
  }
}

/* Keyvisuals werden im Seitenverhältnis ihrer Kachel erzeugt. Ändert sich
   das Verhältnis, wird neu gerendert – sonst würde das Fokus-Element beim
   formatfüllenden Beschnitt aus der Kachel laufen. */
function dashRegenKeyvisuals() {
  dashCards().forEach(c => {
    if (c.type !== 'image' || !c.imageId) return;
    const rec = dash.images[c.imageId];
    if (!rec || !rec.kv || !rec.w || !rec.h) return;
    const r = dashRect(c);
    if (Math.abs((r.w / r.h) - (rec.w / rec.h)) > 0.06) dashUseKeyvisual(c, true);
  });
}

// ---------------------------------------------------------------------
// 8. INTERAKTION AUF DER BÜHNE
// ---------------------------------------------------------------------
let dashDrag = null;
let dashDidDrag = false;

function dashToArtboard(clientX, clientY) {
  const wrap = document.getElementById('dash-wrapper').getBoundingClientRect();
  return { x: (clientX - wrap.left) / wrap.width * DASH_W,
           y: (clientY - wrap.top) / wrap.height * DASH_H };
}

function dashInitStage() {
  const svg = document.getElementById('dash-svg');

  svg.addEventListener('dragstart', e => e.preventDefault());

  svg.addEventListener('pointerdown', e => {
    if (dashInlineActive) return;
    const g = e.target.closest('.dash-card');
    if (!g) { if (dashSelId) { dashSelId = null; dashSyncOverlay(); dashSyncSidebar(); } return; }
    const card = dashCards().find(c => c.id === g.dataset.card);
    if (!card) return;
    const p = dashToArtboard(e.clientX, e.clientY);
    const r = dashRect(card);
    dashDrag = { mode: 'move', card, x: e.clientX, y: e.clientY, offX: p.x - r.x, offY: p.y - r.y };
    dashDidDrag = false;
  });

  window.addEventListener('pointermove', e => {
    if (!dashDrag) return;
    if (!dashDidDrag && Math.hypot(e.clientX - dashDrag.x, e.clientY - dashDrag.y) < 6) return;
    if (!dashDidDrag) { dashDidDrag = true; document.body.classList.add('dash-dragging'); }
    const p = dashToArtboard(e.clientX, e.clientY);
    const card = dashDrag.card;

    if (dashDrag.mode === 'move') {
      let col = Math.round((p.x - dashDrag.offX - DASH_M) / (DASH_CW + DASH_G));
      let row = Math.round((p.y - dashDrag.offY - DASH_M) / (DASH_RH + DASH_G));
      col = Math.max(0, Math.min(DASH_COLS - card.colSpan, col));
      row = Math.max(0, Math.min(DASH_ROWS - card.rowSpan, row));
      dashDrag.col = col; dashDrag.row = row;
      dashGhost = { x: dashCellX(col), y: dashCellY(row),
                    w: dashSpanW(card.colSpan), h: dashSpanH(card.rowSpan) };
    } else {
      let cs = Math.round((p.x - dashCellX(card.col) + DASH_G) / (DASH_CW + DASH_G));
      let rs = Math.round((p.y - dashCellY(card.row) + DASH_G) / (DASH_RH + DASH_G));
      cs = Math.max(2, Math.min(DASH_COLS - card.col, cs));
      rs = Math.max(1, Math.min(DASH_ROWS - card.row, rs));
      dashDrag.cs = cs; dashDrag.rs = rs;
      dashGhost = { x: dashCellX(card.col), y: dashCellY(card.row), w: dashSpanW(cs), h: dashSpanH(rs) };
    }
    dashSyncOverlay();   // nur die Vorschau bewegen, das SVG bleibt stehen
  });

  window.addEventListener('pointerup', () => {
    if (!dashDrag) return;
    const d = dashDrag;
    dashDrag = null;
    dashGhost = null;
    document.body.classList.remove('dash-dragging');

    // Reiner Klick: nur auswählen, nicht neu rendern – sonst verschwindet der
    // Textknoten und der Doppelklick zum Bearbeiten käme nie an.
    if (!dashDidDrag) { dashSelId = d.card.id; dashSyncOverlay(); dashSyncSidebar(); return; }
    if (d.mode === 'resize' && d.cs != null) { dashSelId = d.card.id; dashResizeCard(d.card, d.cs, d.rs); return; }
    if (d.mode === 'move' && d.col != null) {
      if (!dashPlace(dashCards(), d.card, d.col, d.row)) showToast('Dort passt die Kachel nicht');
      else if (dashAutoGrid()) { dashAutoFill(dashCards()); dashRegenKeyvisuals(); }
    }
    dashSelId = d.card.id;
    dashRefresh();
  });

  svg.addEventListener('dblclick', e => {
    const t = e.target.closest('[data-field]');
    if (!t) return;
    if (t.dataset.field === 'image') {
      const c = dashCards().find(x => x.id === t.dataset.card);
      if (c) dashPickUpload(c);
      return;
    }
    dashStartInline(t);
  });

  // Klick außerhalb schließt die Typ-Auswahl (die Einträge stoppen die Blase)
  document.addEventListener('click', () => {
    if (dashTypeMenuFor) { dashTypeMenuFor = null; dashSyncSidebar(); }
  });

  document.addEventListener('keydown', e => {
    if (!dashOpened || dashInlineActive) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && dashSelected()) {
      e.preventDefault();
      dashDeleteCard(dashSelected());
    } else if (e.key === 'Escape' && dashSelId) {
      dashSelId = null; dashRefresh();
    }
  });
}

function dashStartInline(node) {
  const card = dashCards().find(c => c.id === node.dataset.card);
  if (!card) return;
  const field = node.dataset.field;
  const isCaption = field === 'caption';
  const multi = field === 'text';
  dashInlineActive = true;

  const wrap = document.getElementById('dash-wrapper');
  const wrapRect = wrap.getBoundingClientRect();
  const k = wrapRect.width / DASH_W;
  const nodeRect = node.getBoundingClientRect();
  const v = DASH_VARIANTS[card.variant] || DASH_VARIANTS.black;
  const r = dashRect(card);

  const fs = (parseFloat(node.getAttribute('font-size')) || 24) * k;
  const ls = (parseFloat(node.getAttribute('letter-spacing')) || 0) * k;
  const weight = node.getAttribute('font-weight') || '400';

  const ov = document.createElement(multi ? 'textarea' : 'input');
  ov.className = 'dash-inline-edit';
  ov.value = isCaption ? (card.chart.caption || '') : (card[field] || '');
  ov.style.background = v.bg;
  ov.style.color = v.text;
  ov.style.caretColor = v.text;
  ov.style.fontSize = fs.toFixed(1) + 'px';
  ov.style.fontWeight = weight;
  ov.style.letterSpacing = ls.toFixed(2) + 'px';
  ov.style.fontFamily = (+weight >= 700 ? "'Rambla Alt Oscura'" : "'Rambla Alt'") + ", 'Inter', sans-serif";

  const left = (r.x + DASH_PAD) * k - 3;   // 2px Innenabstand + 1px Rahmen ausgleichen
  const width = (r.w - 2 * DASH_PAD) * k + 6;
  const height = multi ? (r.h - 2 * DASH_PAD) * k : fs * 1.3;
  // Einzeilig: Eingabefeld mittig auf die Glyphenbox des SVG-Textes legen
  const top = multi
    ? (r.y + DASH_PAD) * k + fs * 0.11
    : (nodeRect.top - wrapRect.top) - (height - nodeRect.height) / 2;
  ov.style.left = left.toFixed(1) + 'px';
  ov.style.top = Math.max(0, top).toFixed(1) + 'px';
  ov.style.width = width.toFixed(1) + 'px';
  ov.style.height = height.toFixed(1) + 'px';

  wrap.appendChild(ov);
  ov.focus();
  ov.select();

  const commit = ok => {
    if (!dashInlineActive) return;
    dashInlineActive = false;
    if (ok) {
      if (isCaption) card.chart.caption = ov.value;
      else card[field] = ov.value;
    }
    ov.remove();
    dashRefresh();
  };
  ov.addEventListener('blur', () => commit(true));
  ov.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    else if (e.key === 'Enter' && (!multi || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(true); }
  });
}

// ---------------------------------------------------------------------
// 9. BILDER
// ---------------------------------------------------------------------
function dashDownscale(src, maxEdge) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || maxEdge, h = img.naturalHeight || maxEdge;
      const k = Math.min(1, maxEdge / Math.max(w, h));
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d').drawImage(img, 0, 0, w, h);
      let out;
      try { out = cvs.toDataURL('image/jpeg', 0.82); } catch (e) { out = src; }
      resolve({ src: out, w, h });
    };
    img.onerror = () => resolve({ src, w: 0, h: 0 });
    img.src = src;
  });
}

async function dashStoreImage(src) {
  // SVG unverändert übernehmen (klein und verlustfrei), Raster verkleinern
  const rec = /^data:image\/svg\+xml/i.test(src) ? { src, w: 0, h: 0 } : await dashDownscale(src, 1600);
  const id = dashId('img');
  dash.images[id] = rec;
  return id;
}

function dashPickUpload(card) {
  const input = document.getElementById('dash-img-input');
  input.value = '';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      card.imageId = await dashStoreImage(fr.result);
      dashSelId = card.id;
      dashRefresh();
    };
    fr.readAsDataURL(f);
  };
  input.click();
}

async function dashUseAsset(card, path) {
  if (location.protocol === 'file:') { showToast('Bitte über den lokalen Server öffnen'); return; }
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const dataUri = await new Promise((ok, err) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = err;
      fr.readAsDataURL(blob);
    });
    card.imageId = await dashStoreImage(dataUri);
    dashSelId = card.id;
    dashRefresh();
  } catch (e) {
    showToast('Asset konnte nicht geladen werden');
  }
}

/* Keyvisual über die Zeichenlogik des Generators erzeugen. Nutzt dessen
   Palette (KV) und Helfer aus app.js – Farben bleiben an einer Stelle. */
async function dashUseKeyvisual(card, quiet) {
  if (typeof computeExportArrows !== 'function' || typeof KV === 'undefined') {
    showToast('Keyvisual-Generator nicht verfügbar');
    return;
  }
  // Im Seitenverhältnis der Kachel rendern: dann gibt es beim formatfüllenden
  // Einsetzen keinen Beschnitt und das Fokus-Element bleibt immer sichtbar.
  const rect = dashRect(card);
  const long = 1400;
  const f = long / Math.max(rect.w, rect.h);
  const w = Math.max(320, Math.round(rect.w * f));
  const h = Math.max(320, Math.round(rect.h * f));
  const short = Math.min(w, h);
  const p = { w, h,
              starX: w * 0.38, starY: h * 0.58,
              arrowScale: Math.max(0.8, Math.min(2.4, short / 420)),
              starScale: Math.max(0.9, (short * 0.24) / 96),
              scaleLocked: true, offsetX: 0, offsetY: 0, logoMode: false };
  const { list, arrowSize, starSize, sX, sY } = computeExportArrows(p);
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = KV.bgStops[0][0]; ctx.fillRect(0, 0, w, h);
  const farthest = Math.sqrt(Math.max(sX * sX, (w - sX) * (w - sX)) + Math.max(sY * sY, (h - sY) * (h - sY)));
  const bgGrad = ctx.createRadialGradient(sX, sY, 0, sX, sY, farthest);
  KV.bgStops.forEach(([c, pos]) => bgGrad.addColorStop(pos, c));
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h);
  const botGrad = ctx.createLinearGradient(0, h, 0, h * 0.5);
  botGrad.addColorStop(0, `rgba(${KV.vignette},1)`);
  botGrad.addColorStop(1, `rgba(${KV.vignette},0)`);
  ctx.fillStyle = botGrad; ctx.fillRect(0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const gA = KV.grainAlpha / 255;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const factor = t < 0.1 ? 1.0 : Math.max(0, 1 - ((t - 0.1) / 0.25));
    const density = 0.65 * Math.pow(factor, 1.8) + 0.001;
    for (let x = 0; x < w; x++) {
      if (Math.random() < density) {
        const i = (y * w + x) * 4;
        d[i]     = Math.round(d[i]     + (KV.grain[0] - d[i])     * gA);
        d[i + 1] = Math.round(d[i + 1] + (KV.grain[1] - d[i + 1]) * gA);
        d[i + 2] = Math.round(d[i + 2] + (KV.grain[2] - d[i + 2]) * gA);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const arrowPath = new Path2D(ARROW_PATH_D);
  const k = arrowSize / 16.78;
  list.forEach(a => {
    ctx.save();
    ctx.translate(a.cx, a.cy);
    ctx.rotate(a.rot * Math.PI / 180);
    ctx.globalAlpha = a.op;
    ctx.translate(-a.arrowSize / 2, -a.arrowSize / 2);
    ctx.scale(k, k);
    ctx.fillStyle = a.color;
    ctx.fill(arrowPath);
    ctx.restore();
  });

  const glow = ctx.createRadialGradient(sX, sY, 0, sX, sY, starSize);
  glow.addColorStop(0, `rgba(${KV.glow},${KV.glowAlpha})`);
  glow.addColorStop(1, `rgba(${KV.glow},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(sX - starSize, sY - starSize, starSize * 2, starSize * 2);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.translate(sX, sY);
  const starK = starSize / 59.8;
  ctx.scale(starK, starK);
  ctx.translate(-59.8 / 2, -59.8 / 2);
  ctx.fillStyle = KV.star;
  STAR_PATHS.forEach(pd => ctx.fill(new Path2D(pd)));
  ctx.restore();

  const id = dashId('img');
  dash.images[id] = { src: cvs.toDataURL('image/jpeg', 0.88), w, h, kv: true };
  if (card.imageId && dash.images[card.imageId] && dash.images[card.imageId].kv) {
    delete dash.images[card.imageId];       // altes Keyvisual verwerfen
  }
  card.imageId = id;
  if (!quiet) { dashSelId = card.id; dashRefresh(); }
}

// ---------------------------------------------------------------------
// 10. SPEICHERN
// ---------------------------------------------------------------------
let dashPersistTimer = null;
function dashPersist() {
  clearTimeout(dashPersistTimer);
  dashPersistTimer = setTimeout(() => {
    try {
      localStorage.setItem(DASH_LS_KEY, JSON.stringify(dash));
    } catch (e) {
      try {
        localStorage.setItem(DASH_LS_KEY, JSON.stringify({ ...dash, images: {}, imagesStripped: true }));
        showToast('Autospeicherung ohne Bilder – bitte als Projektdatei sichern');
      } catch (e2) {
        showToast('Speichern fehlgeschlagen – bitte als Projektdatei sichern');
      }
    }
  }, 800);
}

function dashLoadStored() {
  try {
    const raw = localStorage.getItem(DASH_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.slides) || !p.slides.length) return null;
    p.images = p.images || {};
    p.activeSlide = Math.min(p.activeSlide || 0, p.slides.length - 1);
    return p;
  } catch (e) { return null; }
}

function dashDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dashSaveJson() {
  dashDownload(new Blob([JSON.stringify(dash, null, 2)], { type: 'application/json' }), 'mc_Dashboard.json');
  showToast('Projektdatei gesichert');
}

function dashLoadJson() {
  const input = document.getElementById('dash-json-input');
  input.value = '';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const p = JSON.parse(fr.result);
        if (!p || !Array.isArray(p.slides) || !p.slides.length) throw new Error('ungültig');
        if (p.v && p.v > 1) { showToast('Datei stammt aus einer neueren Version'); return; }
        p.images = p.images || {};
        p.activeSlide = Math.min(p.activeSlide || 0, p.slides.length - 1);
        dash = p;
        dashSelId = null;
        dashRefresh();
        showToast('Projekt geladen');
      } catch (e) {
        showToast('Datei konnte nicht gelesen werden');
      }
    };
    fr.readAsText(f);
  };
  input.click();
}

// ---------------------------------------------------------------------
// 11. SCHRIFT-EINBETTUNG & EXPORT
// ---------------------------------------------------------------------
const DASH_FONT_URLS = {
  regular: 'https://cdn.prod.website-files.com/63d1db62419ce00ced86330f/63d1db62419ce0d9f0863430_rambla_alt_regular.otf',
  oscura:  'https://cdn.prod.website-files.com/63d1db62419ce00ced86330f/63d1db62419ce071d1863415_rambla_alt_oscura.otf'
};
let dashFontCss = null, dashFontWarned = false;

async function dashFetchB64(url) {
  const buf = await (await fetch(url, { mode: 'cors' })).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

/* Ein exportiertes SVG kann keine externen Schriften nachladen – die Bytes
   müssen mit hinein, sonst rendert der PNG-Export in einer Ersatzschrift. */
async function dashGetFontCSS() {
  if (dashFontCss) return dashFontCss;
  try {
    const [r, o] = await Promise.all([
      dashFetchB64(DASH_FONT_URLS.regular),
      dashFetchB64(DASH_FONT_URLS.oscura)
    ]);
    dashFontCss =
      `@font-face{font-family:'Rambla Alt';font-weight:400;font-style:normal;src:url(data:font/otf;base64,${r}) format('opentype');}` +
      `@font-face{font-family:'Rambla Alt Oscura';font-weight:700;font-style:normal;src:url(data:font/otf;base64,${o}) format('opentype');}`;
    return dashFontCss;
  } catch (e) {
    if (!dashFontWarned) {
      dashFontWarned = true;
      showToast('Schriften nicht eingebettet – Export nutzt Ersatzschrift');
    }
    return '';   // Fehler bewusst nicht cachen: nächster Versuch lädt neu
  }
}

async function dashBuildExportSVG(slide) {
  const css = await dashGetFontCSS();
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${DASH_W}" height="${DASH_H}" viewBox="0 0 ${DASH_W} ${DASH_H}">` +
    (css ? `<defs><style>${css}</style></defs>` : '') +
    dashBuildSlideSVG(slide, { forExport: true, inlineImages: true }) +
    `</svg>`;
}

function dashSvgToCanvas(svgStr, scale) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = Math.round(DASH_W * scale);
      cvs.height = Math.round(DASH_H * scale);
      cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
      URL.revokeObjectURL(url);
      resolve(cvs);
    };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function dashExportSVG() {
  try {
    const s = await dashBuildExportSVG(dashSlide());
    dashDownload(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }),
      `mc_Dashboard_Seite${dash.activeSlide + 1}.svg`);
  } catch (e) {
    showToast('SVG-Export fehlgeschlagen');
    console.error(e);
  }
}

async function dashExportPNG(all) {
  const btn = document.getElementById('dash-export-png');
  btn.disabled = true;
  try {
    const slides = all ? dash.slides : [dashSlide()];
    for (let i = 0; i < slides.length; i++) {
      const svgStr = await dashBuildExportSVG(slides[i]);
      const cvs = await dashSvgToCanvas(svgStr, 2);   // 3840 × 2160
      await new Promise(res => cvs.toBlob(b => {
        const idx = all ? (i + 1) : (dash.activeSlide + 1);
        dashDownload(b, `mc_Dashboard_Seite${idx}_${cvs.width}x${cvs.height}.png`);
        res();
      }, 'image/png'));
      if (all && i < slides.length - 1) await new Promise(r => setTimeout(r, 350));
    }
  } catch (e) {
    showToast('PNG-Export fehlgeschlagen');
    console.error(e);
  }
  btn.disabled = false;
}

// ---------------------------------------------------------------------
// 12. SEITEN
// ---------------------------------------------------------------------
function dashSyncPager() {
  const t = document.getElementById('dash-pagination');
  if (t) t.textContent = `Seite ${dash.activeSlide + 1} von ${dash.slides.length}`;
  const del = document.getElementById('dash-del-page');
  if (del) del.style.display = dash.slides.length > 1 ? 'flex' : 'none';
  const ag = document.getElementById('dash-autogrid');
  if (ag) ag.checked = dashAutoGrid();
}

function dashGoto(i) {
  if (i < 0 || i >= dash.slides.length) return;
  dash.activeSlide = i;
  dashSelId = null;
  dashRefresh();
}

// ---------------------------------------------------------------------
// 13. INIT
// ---------------------------------------------------------------------
function dashOpen() {
  if (!dash) dash = dashLoadStored() || dashDefaultState();
  document.getElementById('main-view').style.display = 'none';
  const mc = document.getElementById('main-controls');
  if (mc) mc.style.display = 'none';
  hideHubView();
  document.getElementById('dash-view').classList.add('visible');
  dashOpened = true;
  dashGetFontCSS();   // vorwärmen, ohne zu warten
  if (location.protocol === 'file:') showToast('Bitte über den lokalen Server öffnen – sonst fehlen Hub-Bilder');

  dashRefresh();
  // Erst wenn die Messschriften wirklich geladen sind, stimmt der Auto-Fit
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('400 60px "Rambla Alt"'),
      document.fonts.load('700 60px "Rambla Alt Oscura"')
    ]).then(dashRefresh).catch(() => {});
  }
}

function dashClose() {
  document.getElementById('dash-view').classList.remove('visible');
  document.getElementById('main-view').style.display = 'block';
  dashOpened = false;
  if (typeof hubVisible !== 'undefined' && hubVisible) restoreHubView();
  else { const mc = document.getElementById('main-controls'); if (mc) mc.style.display = 'flex'; }
}

function dashInit() {
  const tile = document.getElementById('tile-dashboard');
  if (!tile) return;
  tile.addEventListener('click', dashOpen);
  document.getElementById('dash-back').addEventListener('click', dashClose);

  const typeOverlay = document.getElementById('dash-type-overlay');
  document.getElementById('dash-add-card').addEventListener('click', () => { typeOverlay.style.display = 'flex'; });
  document.getElementById('dash-type-cancel').addEventListener('click', () => { typeOverlay.style.display = 'none'; });
  typeOverlay.querySelectorAll('.dash-type-chip').forEach(b => {
    b.addEventListener('click', () => { typeOverlay.style.display = 'none'; dashNewCard(b.dataset.type); });
  });

  const ag = document.getElementById('dash-autogrid');
  ag.addEventListener('change', () => {
    dash.autoGrid = ag.checked;
    if (ag.checked) { dashAutoFill(dashCards()); dashRegenKeyvisuals(); }
    dashRefresh();
  });

  document.getElementById('dash-reset').addEventListener('click', () => {
    if (!confirm('Projekt zurücksetzen?\nAlle Seiten und Bilder dieses Dashboards gehen verloren.')) return;
    dash = dashDefaultState();
    dashSelId = null;
    dashTypeMenuFor = null;
    dashRefresh();
    showToast('Projekt zurückgesetzt');
  });

  document.getElementById('dash-save-json').addEventListener('click', dashSaveJson);
  document.getElementById('dash-load-json').addEventListener('click', dashLoadJson);
  document.getElementById('dash-export-svg').addEventListener('click', dashExportSVG);
  document.getElementById('dash-export-png').addEventListener('click', () => {
    if (dash.slides.length > 1) dashExportPNG(confirm('Alle Seiten exportieren?\nAbbrechen = nur die aktuelle Seite.'));
    else dashExportPNG(false);
  });

  document.getElementById('dash-prev-page').addEventListener('click', () => dashGoto(dash.activeSlide - 1));
  document.getElementById('dash-next-page').addEventListener('click', () => dashGoto(dash.activeSlide + 1));
  document.getElementById('dash-add-page').addEventListener('click', () => {
    dash.slides.push({ id: dashId('s'), cards: [] });
    dashGoto(dash.slides.length - 1);
  });
  document.getElementById('dash-dup-page').addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(dashSlide()));
    copy.id = dashId('s');
    copy.cards.forEach(c => { c.id = dashId('c'); });
    dash.slides.splice(dash.activeSlide + 1, 0, copy);
    dashGoto(dash.activeSlide + 1);
  });
  document.getElementById('dash-del-page').addEventListener('click', () => {
    if (dash.slides.length <= 1) return;
    dash.slides.splice(dash.activeSlide, 1);
    dashGoto(Math.min(dash.activeSlide, dash.slides.length - 1));
  });

  dashInitStage();
}

dashInit();
