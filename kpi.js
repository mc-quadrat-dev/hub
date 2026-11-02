// =====================================================================
// KPI-ZAHLEN-VIDEO-GENERATOR
// Hochzählende Kennzahlen als Video für Social Media. Mehrere "Tafeln"
// hintereinander, dazwischen ein Übergang, optional als nahtloser Loop.
//
// Architekturprinzip aus pattern-engine.js übernommen: kpiRenderAt(ctx, t, W, H)
// zeichnet einen Frame allein aus der Zeit t. Die Vorschau treibt das per
// requestAnimationFrame, der Export per for-Schleife über i/fps. Dadurch können
// Vorschau und Export nicht auseinanderlaufen und der Export ist reproduzierbar.
//
// Wiederverwendet aus dashboard.js: DASH_VARIANTS (Farbwelten), F_REG/F_BOLD
// sowie die Text-Autofit-Helfer dashTextW/dashFitLine/dashFitBlock.
// Wiederverwendet aus welcome.js: WSG_MC_LOGO_SVG (mc-Kurzlogo als Data-URI,
// damit die Canvas nicht "tainted" wird – sonst scheitert captureStream()).
// =====================================================================

// ---------------------------------------------------------------------
// 1. KONSTANTEN
// ---------------------------------------------------------------------
const KPI_LS_KEY = 'mcKpiVideo_v1';
const KPI_FPS = 30;
const KPI_BITRATE = 12000000;
const KPI_GIF_SCALE = 0.5;   // GIF mit halben Pixelmaßen des MP4

const KPI_FORMATS = [
  { key: '1x1',  w: 1080, h: 1080, label: '1:1 · 1080 × 1080' },
  { key: '9x16', w: 1080, h: 1920, label: '9:16 · 1080 × 1920' },
  { key: '4x5',  w: 1080, h: 1350, label: '4:5 · 1080 × 1350' },
  { key: '16x9', w: 1920, h: 1080, label: '16:9 · 1920 × 1080' }
];

const KPI_TRANSITIONS = [
  { key: 'up',    label: 'Hochschieben' },
  { key: 'right', label: 'Von rechts' },
  { key: 'fade',  label: 'Weiche Blende' }
];

const KPI_GIF_FPS = [12, 15, 20, 25, 30];
const KPI_GIF_COLORS = [6, 8, 12, 16, 24, 32, 48, 64];

// Dynamische Zähldauer: Wertebereich und die beiden Ankerpunkte der Skala
const KPI_DYN_MIN = 0.5, KPI_DYN_MAX = 3.5;
const KPI_DYN_LO = 10, KPI_DYN_HI = 500000;

// Das eingebettete Logo ist weiß; auf hellen Tafeln (Hell/Lime) braucht es die
// schwarze Fassung – dieselbe Datei, nur die eine Füllfarbe getauscht.
const KPI_LOGO_SVG_WHITE = typeof WSG_MC_LOGO_SVG !== 'undefined' ? WSG_MC_LOGO_SVG : '';
const KPI_LOGO_SVG_BLACK = KPI_LOGO_SVG_WHITE.replace('fill="#fff"', 'fill="#000"');
const KPI_LOGO_ASPECT = 42.05 / 16.67;

// ---------------------------------------------------------------------
// 2. STATE
// ---------------------------------------------------------------------
let kpi = null;              // Projektzustand
let kpiSelId = null;         // ausgewählte KPI in der Seitenleiste
let kpiOpened = false;
let kpiMounted = false;
let kpiCanvas = null, kpiCtx = null;
let kpiRaf = null, kpiT0 = null, kpiPausedAt = null;
let kpiLogoWhite = null, kpiLogoBlack = null;
let kpiTitleEls = {};         // Überschrift je KPI in der Liste, wird beim Tippen live nachgeführt
let kpiFieldEls = {};         // Eingabefelder der ausgewählten KPI

let kpiUid = 1;
function kpiId() { return 'k' + (kpiUid++) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

const KPI_MAX_ITEMS = 50;

function kpiBaseSettings() {
  return {
    v: 1,
    name: '',
    format: '1x1',
    count: 2.0,
    dynCount: true,
    hold: 5.0,
    trans: 0.7,
    transKind: 'up',
    loop: true,
    logo: false,
    gifFps: 15,
    gifColors: 32
  };
}

/* Der Leerzustand ist bewusst ein fertiges Beispiel (wie im Dashboard-
   Generator) – so sieht man sofort, wofür das Tool gedacht ist. */
function kpiDefaultState() {
  return Object.assign(kpiBaseSettings(), {
    items: [
      kpiMakeItem({ prefix: 'bis zu', fromText: '0', toText: '700.000', unit: '',
        text: 'monatlich erreichte Personen bei Google', variant: 'black' }),
      kpiMakeItem({ prefix: 'bis zu', fromText: '0', toText: '50', unit: '%',
        text: 'Follower-Wachstum auf Social Media', variant: 'lime' }),
      kpiMakeItem({ prefix: 'bis zu', fromText: '0', toText: '5', unit: 'Plätze',
        text: 'Verbesserung der durchschnittlichen Google-Position', variant: 'anthracite' })
    ]
  });
}

/* Eine Datei oder ein gespeicherter Stand ist fremde Eingabe: nichts wird
   ungeprüft übernommen. Unbekannte Felder fallen weg, Zahlen werden auf
   sinnvolle Bereiche gezogen, Texte gekürzt, und die Zahl der KPIs ist
   begrenzt – sonst könnte eine fehlerhafte Datei Vorschau und Seitenleiste
   lahmlegen. Alle Texte laufen später nur über fillText/textContent/.value,
   nie über innerHTML. */
function kpiStr(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function kpiNum(v, lo, hi, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function kpiNormalize(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const s = kpiBaseSettings();
  s.name = kpiStr(p.name, 60);
  s.format = KPI_FORMATS.some(f => f.key === p.format) ? p.format : s.format;
  s.count = kpiNum(p.count, 0.4, 5, s.count);
  s.hold = kpiNum(p.hold, 0.5, 8, s.hold);
  s.trans = kpiNum(p.trans, 0.2, 2, s.trans);
  s.transKind = KPI_TRANSITIONS.some(t => t.key === p.transKind) ? p.transKind : s.transKind;
  s.dynCount = typeof p.dynCount === 'boolean' ? p.dynCount : s.dynCount;
  s.loop = typeof p.loop === 'boolean' ? p.loop : s.loop;
  s.logo = typeof p.logo === 'boolean' ? p.logo : s.logo;
  // Ein gespeicherter Wert kann außerhalb der heutigen Auswahl liegen (die
  // Bereiche wurden nachträglich enger gefasst) – auf den nächstliegenden
  // erlaubten Wert ziehen, statt eine leere Auswahl anzuzeigen.
  s.gifFps = kpiNearest(p.gifFps == null ? s.gifFps : p.gifFps, KPI_GIF_FPS, s.gifFps);
  s.gifColors = kpiNearest(p.gifColors == null ? s.gifColors : p.gifColors, KPI_GIF_COLORS, s.gifColors);
  s.items = (Array.isArray(p.items) ? p.items : []).slice(0, KPI_MAX_ITEMS)
    .filter(it => it && typeof it === 'object').map(kpiMakeItem);
  return s;
}

// ---------------------------------------------------------------------
// 3. HILFSFUNKTIONEN
// ---------------------------------------------------------------------
function kpiClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function kpiEaseOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function kpiEaseInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function kpiEven(n) { return Math.round(n / 2) * 2; }   // H.264 braucht gerade Maße

function kpiNearest(value, list, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return list.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best, list[0]);
}

function kpiFormat() {
  return KPI_FORMATS.find(f => f.key === kpi.format) || KPI_FORMATS[0];
}

function kpiFormatNumber(value, decimals) {
  const d = Math.max(0, Math.min(3, Number(decimals) || 0));
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

/* Einheit wird mit Leerzeichen angehängt ("5 Plätze"), nur beim Prozentzeichen
   direkt ("50 %" wäre die Duden-Schreibweise, in den Vorlagen steht aber 50%). */
function kpiValueText(item, value) {
  const num = kpiFormatNumber(value, item.decimals);
  const unit = (item.unit || '').trim();
  if (!unit) return num;
  return unit === '%' ? num + unit : num + ' ' + unit;
}

/* Liest eine eingetippte Zahl und leitet daraus die Nachkommastellen ab: wer
   "2,4" schreibt, bekommt eine Stelle, wer "2,45" schreibt, zwei – ein eigenes
   Feld dafür braucht es nicht. Deutsch formatierte Eingaben ("700.000", "2,4")
   gehen direkt, damit sich Zahlen aus einer Auswertung hineinkopieren lassen.

   Ein einzelner Punkt wäre sonst mehrdeutig: "700.000" ist ein Tausenderpunkt,
   "2.4" aber eindeutig eine englisch geschriebene Dezimalzahl. Ohne diese
   Unterscheidung würde "2.4" stillschweigend zu 24. Regel: kein Komma, genau
   ein Punkt und nicht genau drei Ziffern dahinter (oder eine führende Null)
   gilt als Dezimalpunkt. */
function kpiParseNumber(str) {
  let s = String(str == null ? '' : str).trim();
  const neg = /^[-−–]/.test(s);
  s = s.replace(/[^0-9.,]/g, '');

  let intPart = s, frac = '';
  const comma = s.lastIndexOf(',');
  if (comma >= 0) {
    intPart = s.slice(0, comma).replace(/\./g, '');
    frac = s.slice(comma + 1).replace(/[.,]/g, '');
  } else {
    const dots = (s.match(/\./g) || []).length;
    if (dots === 1) {
      const [a, b] = s.split('.');
      const thousands = b.length === 3 && a !== '0' && a !== '';
      if (!thousands) { intPart = a; frac = b; }
      else intPart = a + b;
    } else {
      intPart = s.replace(/\./g, '');
    }
  }

  const value = Number((intPart || '0') + (frac ? '.' + frac : '')) * (neg ? -1 : 1);
  return {
    value: Number.isFinite(value) ? Math.max(-1e12, Math.min(1e12, value)) : 0,
    decimals: Math.min(3, frac.length)
  };
}

/* Von und Bis werden mit gleich vielen Stellen angezeigt, damit die Zahl beim
   Hochzählen nicht zwischen "0" und "2,4" die Schreibweise wechselt. Die
   Stellenzahl ist deshalb das Maximum beider Angaben. */
function kpiApplyNumbers(item) {
  const a = kpiParseNumber(item.fromText), b = kpiParseNumber(item.toText);
  item.from = a.value;
  item.to = b.value;
  item.decimals = Math.max(a.decimals, b.decimals);
}

/* Baut ein vollständiges, geprüftes Item. Die ID wird immer neu vergeben, auch
   beim Laden einer Datei – fremde IDs könnten sonst mit vorhandenen kollidieren.
   Ältere Stände kennen nur Zahlen und eine feste Stellenzahl; daraus wird der
   Eingabetext rekonstruiert. */
function kpiMakeItem(src) {
  src = src || {};
  const legacy = n => kpiFormatNumber(kpiNum(n, -1e12, 1e12, 0), kpiNum(src.decimals, 0, 3, 0));
  const item = {
    id: kpiId(),
    prefix: kpiStr(src.prefix, 80),
    fromText: typeof src.fromText === 'string' ? src.fromText.slice(0, 24) : legacy(src.from),
    toText: typeof src.toText === 'string' ? src.toText.slice(0, 24) : legacy(src.to),
    unit: kpiStr(src.unit, 30),
    text: kpiStr(src.text, 300),
    source: kpiStr(src.source, 120),
    variant: DASH_VARIANT_ORDER.includes(src.variant) ? src.variant : 'black'
  };
  kpiApplyNumbers(item);
  return item;
}

/* Die Schriftgröße der Zahl wird einmal am breitesten Zustand ausgerichtet und
   für die ganze Animation gehalten – sonst springt sie bei jeder neuen
   Ziffernstelle. Der breiteste Wert liegt immer an einem der beiden Enden. */
function kpiWidestValue(item) {
  const a = kpiValueText(item, Number(item.from) || 0);
  const b = kpiValueText(item, Number(item.to) || 0);
  return dashTextW(a, 100, 700, 0) >= dashTextW(b, 100, 700, 0) ? a : b;
}

function kpiSetLetterSpacing(ctx, ls) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = (ls || 0) + 'px';
}

function kpiTodayStamp() {
  const d = new Date();
  return String(d.getFullYear()).slice(-2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

/* Dateiname nach Haus-Schema: Datum, dann die frei vergebene Bezeichnung,
   dann Tool und Pixelmaße. Ohne Bezeichnung entfällt der Abschnitt einfach.
   wsgFilenamePart (welcome.js) säubert den Text bereits genau dafür. */
function kpiFileName(W, H, ext) {
  const part = wsgFilenamePart(kpi.name || '');
  return kpiTodayStamp() + (part ? '_' + part : '') + '_mc_KPI_Video_' + W + 'x' + H + '.' + ext;
}

// ---------------------------------------------------------------------
// 4. ZEITACHSE
// ---------------------------------------------------------------------
/* Zähldauer nach Höhe der Zahl: logarithmisch, weil die Werte über mehrere
   Zehnerpotenzen reichen (5 bis 700.000) – linear läge alles unterhalb von
   100.000 praktisch beim Minimum. Verankert bei 10 → 0,5 s und 500.000 → 3,5 s,
   außerhalb gekappt. Feste Ankerpunkte statt einer Skala aus dem jeweiligen
   Projekt: so zählt dieselbe Zahl immer gleich lang, unabhängig davon, welche
   anderen KPIs daneben stehen. */
function kpiCountFor(item) {
  if (!kpi.dynCount) return kpi.count;
  const v = Math.max(1, Math.abs(Number(item.to) || 0));
  const t = kpiClamp01(
    (Math.log10(v) - Math.log10(KPI_DYN_LO)) / (Math.log10(KPI_DYN_HI) - Math.log10(KPI_DYN_LO))
  );
  return KPI_DYN_MIN + (KPI_DYN_MAX - KPI_DYN_MIN) * t;
}

/* Jede Tafel kann eine eigene Zähldauer haben, deshalb wird die Zeitachse
   aufsummiert statt mit einer festen Schrittweite gerechnet.
   Mit Loop bekommt auch die letzte Tafel einen Übergang (zurück zur ersten),
   dadurch ist der Frame bei t = Gesamtdauer identisch mit dem bei t = 0 und das
   Video läuft nahtlos. Ohne Loop bleibt die letzte Tafel einfach stehen. */
function kpiTimeline() {
  let at = 0;
  const slots = kpi.items.map(item => {
    const count = kpiCountFor(item);
    const entry = { start: at, count, slot: count + kpi.hold };
    at += entry.slot + kpi.trans;
    return entry;
  });
  return { slots, total: slots.length ? (kpi.loop ? at : at - kpi.trans) : 1 };
}

function kpiTotal() { return kpiTimeline().total; }

function kpiValueAt(item, localT, count) {
  const from = Number(item.from) || 0, to = Number(item.to) || 0;
  const p = kpiEaseOutCubic(kpiClamp01(localT / Math.max(0.01, count)));
  return from + (to - from) * p;
}

// ---------------------------------------------------------------------
// 5. ZEICHNEN
// ---------------------------------------------------------------------
function kpiDrawLogo(ctx, W, H, variant) {
  const img = variant.text === '#000000' ? kpiLogoBlack : kpiLogoWhite;
  if (!img || !img.complete) return;
  const h = H * 0.030;
  const w = h * KPI_LOGO_ASPECT;
  ctx.drawImage(img, (W - w) / 2, H - h - H * 0.055, w, h);
}

/* Das Tafel-Layout als Datenstruktur statt direkt beim Zeichnen: dieselbe
   Rechnung liefert die Zeichenpositionen, die Trefferflächen für den
   Doppelklick und die Lage des Eingabefelds in der Vorschau – so können die
   drei nie auseinanderlaufen.

   Größen richten sich nach der kürzeren Seite S statt nach der Breite: im
   niedrigen 16:9-Format würde sonst alles an der Breite wachsen und oben und
   unten aus der Tafel laufen. Bei 1:1, 4:5 und 9:16 ist S gleich der Breite,
   dort ändert sich nichts. */
function kpiLayout(W, H, item) {
  const v = DASH_VARIANTS[item.variant] || DASH_VARIANTS.black;
  const S = Math.min(W, H);
  const maxW = Math.min(W * 0.82, S * 1.1);
  const small = { max: Math.round(S * 0.052), min: 12, weight: 400, lsF: 0.04 };
  const prefix = (item.prefix || '').trim();
  const text = (item.text || '').trim();
  const source = (item.source || '').trim();

  const blocks = [];
  if (prefix) blocks.push({ key: 'prefix', kind: 'line', text: prefix, fit: dashFitLine(prefix, maxW, small), gap: 0 });
  blocks.push({ key: 'num', kind: 'num', gap: prefix ? S * 0.03 : 0,
    fit: dashFitLine(kpiWidestValue(item), maxW, { max: Math.round(S * 0.27), min: 24, weight: 700, lsF: 0 }) });
  if (text) blocks.push({ key: 'text', kind: 'block', text, gap: S * 0.05,
    fit: dashFitBlock(text, maxW, H * 0.30, { max: Math.round(S * 0.072), min: 14, weight: 700, lsF: 0.01, lhF: 1.14 }) });
  if (source) blocks.push({ key: 'source', kind: 'line', text: source, gap: text ? S * 0.035 : S * 0.05,
    fit: dashFitLine(source, maxW, small) });

  blocks.forEach(b => {
    b.h = b.kind === 'num' ? b.fit.size * 0.82
        : b.kind === 'block' ? b.fit.lines.length * b.fit.lh
        : b.fit.size * 1.2;
  });
  const totalH = blocks.reduce((a, b) => a + b.h + b.gap, 0);
  let y = (H - totalH) / 2;
  const cx = W / 2;
  blocks.forEach((b, i) => {
    y += b.gap;
    b.y = y;
    y += b.h;
    // Trefferfläche reicht bis zur Mitte der angrenzenden Lücken, damit
    // zwischen den Blöcken keine Totzonen entstehen.
    const next = blocks[i + 1];
    b.rect = { x: cx - maxW / 2, w: maxW, y: b.y - b.gap / 2, h: b.h + b.gap / 2 + (next ? next.gap / 2 : 0) };
  });
  return { v, S, cx, maxW, blocks };
}

function kpiDrawContent(ctx, W, H, item, value) {
  const L = kpiLayout(W, H, item);
  const v = L.v;
  ctx.fillStyle = v.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  L.blocks.forEach(b => {
    if (b.kind === 'line') {
      ctx.font = '400 ' + b.fit.size + 'px ' + F_REG;
      ctx.fillStyle = v.sub;
      kpiSetLetterSpacing(ctx, b.fit.ls);
      ctx.fillText(b.text, L.cx, b.y + b.fit.size * 0.85);
    } else if (b.kind === 'num') {
      ctx.font = '700 ' + b.fit.size + 'px ' + F_BOLD;
      ctx.fillStyle = v.accent;
      kpiSetLetterSpacing(ctx, 0);
      ctx.fillText(kpiValueText(item, value), L.cx, b.y + b.fit.size * 0.75);
    } else {
      ctx.font = '700 ' + b.fit.size + 'px ' + F_BOLD;
      ctx.fillStyle = v.text;
      kpiSetLetterSpacing(ctx, b.fit.ls);
      b.fit.lines.forEach((line, i) => ctx.fillText(line, L.cx, b.y + b.fit.size * 0.85 + i * b.fit.lh));
    }
  });

  kpiSetLetterSpacing(ctx, 0);
  if (kpi.logo) kpiDrawLogo(ctx, W, H, v);
}

function kpiScaleAround(ctx, W, H, s) {
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
}

/* Die neue Tafel schiebt sich vor die alte. Bei den Schiebe-Varianten driftet
   die abgehende Tafel leicht mit (Parallaxe) – das ist der Unterschied zwischen
   "rutscht drüber" und "wirkt gebaut". */
function kpiDrawTransition(ctx, W, H, outItem, inItem, p) {
  const kind = kpi.transKind;

  ctx.save();
  if (kind === 'up') ctx.translate(0, -H * 0.12 * p);
  else if (kind === 'right') ctx.translate(-W * 0.12 * p, 0);
  else { ctx.globalAlpha = 1 - p; kpiScaleAround(ctx, W, H, 1 - 0.03 * p); }
  kpiDrawContent(ctx, W, H, outItem, Number(outItem.to) || 0);
  ctx.restore();

  ctx.save();
  if (kind === 'up') ctx.translate(0, H * (1 - p));
  else if (kind === 'right') ctx.translate(W * (1 - p), 0);
  else { ctx.globalAlpha = p; kpiScaleAround(ctx, W, H, 1.05 - 0.05 * p); }
  kpiDrawContent(ctx, W, H, inItem, Number(inItem.from) || 0);
  ctx.restore();
}

function kpiDrawEmpty(ctx, W, H) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 ' + Math.round(W * 0.035) + 'px ' + F_REG;
  ctx.fillText('Noch keine KPI – rechts oben „+ KPI" klicken', W / 2, H / 2);
}

/* Ordnet einen Zeitpunkt einer Tafel zu. Von hier lesen sowohl das Zeichnen
   als auch der Doppelklick in der Vorschau (welche Tafel ist gerade zu sehen?). */
function kpiLocate(t) {
  const n = kpi.items.length;
  const { slots } = kpiTimeline();
  // Gegen einen unbrauchbaren Zeitwert absichern: ein NaN würde sonst zu einer
  // undefinierten Tafel führen und mitten in einer laufenden Aufnahme eine
  // Exception werfen, die den ganzen Export abbricht.
  const safeT = Number.isFinite(t) ? Math.max(0, t) : 0;
  let idx = 0;
  while (idx < n - 1 && safeT >= slots[idx + 1].start) idx++;
  const cur = slots[idx];
  const local = safeT - cur.start;
  const inTransition = local > cur.slot;
  const p = inTransition ? kpiEaseInOutCubic(kpiClamp01((local - cur.slot) / Math.max(0.01, kpi.trans))) : 0;
  return { idx, cur, local, inTransition, p };
}

function kpiRenderAt(ctx, t, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const n = kpi.items.length;
  if (!n) { kpiDrawEmpty(ctx, W, H); return; }

  const { idx, cur, local, inTransition, p } = kpiLocate(t);
  if (!inTransition) {
    kpiDrawContent(ctx, W, H, kpi.items[idx], kpiValueAt(kpi.items[idx], local, cur.count));
  } else {
    kpiDrawTransition(ctx, W, H, kpi.items[idx], kpi.items[(idx + 1) % n], p);
  }
}

// ---------------------------------------------------------------------
// 6. VORSCHAU
// ---------------------------------------------------------------------
function kpiTick(now) {
  if (!kpiOpened) { kpiRaf = null; return; }
  if (kpiT0 == null) kpiT0 = now;
  const t = ((now - kpiT0) / 1000) % kpiTotal();
  kpiRenderAt(kpiCtx, t, kpiCanvas.width, kpiCanvas.height);
  kpiRaf = requestAnimationFrame(kpiTick);
}

function kpiPlay() {
  if (kpiRaf) return;
  if (kpiPausedAt != null) kpiT0 = performance.now() - kpiPausedAt;
  kpiPausedAt = null;
  kpiRaf = requestAnimationFrame(kpiTick);
  kpiSyncPlayBtn();
}

function kpiPause() {
  if (!kpiRaf) return;
  cancelAnimationFrame(kpiRaf);
  kpiRaf = null;
  kpiPausedAt = performance.now() - (kpiT0 || performance.now());
  kpiSyncPlayBtn();
}

function kpiRestart() {
  kpiT0 = performance.now();
  kpiPausedAt = null;
  if (!kpiRaf) kpiRaf = requestAnimationFrame(kpiTick);
  kpiSyncPlayBtn();
}

function kpiSyncPlayBtn() {
  const btn = document.getElementById('kpi-play');
  if (btn) btn.textContent = kpiRaf ? 'Pause' : 'Abspielen';
}

/* Aktueller Zeitpunkt der Vorschau in Sekunden, laufend wie pausiert. */
function kpiNowT() {
  const total = kpiTotal();
  const ms = kpiRaf ? performance.now() - (kpiT0 || performance.now()) : (kpiPausedAt || 0);
  return (ms / 1000) % total;
}

/* Zeichnet die Vorschau neu, wenn sie steht. Läuft die Animation, holt sie
   jede Änderung im nächsten Bild von selbst ab – dann ist hier nichts zu tun.
   Im Bearbeitungsmodus zeigt sie die bearbeitete Tafel im Endzustand: wer
   Text tippt, will ihn lesen können und nicht eine halb hochgezählte Zahl. */
function kpiRedraw() {
  if (!kpiOpened || !kpiCtx || kpiRaf) return;
  const W = kpiCanvas.width, H = kpiCanvas.height;
  const it = kpiEdit && kpi.items.find(i => i.id === kpiEdit.id);
  if (it) {
    kpiCtx.setTransform(1, 0, 0, 1, 0, 0);
    kpiCtx.globalAlpha = 1;
    kpiDrawContent(kpiCtx, W, H, it, kpiEdit.showFrom ? it.from : it.to);
  } else {
    kpiRenderAt(kpiCtx, kpiNowT(), W, H);
  }
  kpiPositionInline();
}

function kpiApplyFormat() {
  const f = kpiFormat();
  kpiCanvas.width = f.w;
  kpiCanvas.height = f.h;
  if (kpiRaf) kpiRenderAt(kpiCtx, 0, f.w, f.h); else kpiRedraw();
}

// ---------------------------------------------------------------------
// 6b. BEARBEITUNGSMODUS
// Solange man an einer KPI arbeitet, bleibt die Vorschau auf dieser Tafel
// stehen. "Arbeiten" heißt: die Maus ist über der Seitenleiste, ein Feld darin
// hat den Fokus, oder das Eingabefeld in der Vorschau ist offen. Diese Gründe
// sind unabhängig voneinander – der Modus gilt, solange mindestens einer
// zutrifft. So bleibt die Vorschau auch dann stehen, wenn man das Feld per
// Enter verlässt, die Maus aber noch in der Spalte ist.
//
// Fortgesetzt wird erst, wenn kein Grund mehr übrig ist, und nur, wenn sie
// vorher lief: wer die Vorschau von Hand angehalten hat, soll sie nicht
// plötzlich wieder starten.
// ---------------------------------------------------------------------
let kpiEdit = null;              // { id, showFrom, wasPlaying, hover, focus, inline }
let kpiPlayPressedWhileEditing = false;

/* Schaltet einen Grund ein. opts.id bestimmt die gezeigte KPI (Standard: die
   ausgewählte), opts.showFrom zeigt statt des Endwerts den Startwert. */
function kpiEditOn(reason, opts) {
  opts = opts || {};
  if (!kpiEdit) {
    kpiEdit = { id: kpiSelId, showFrom: false, wasPlaying: !!kpiRaf, hover: false, focus: false, inline: false };
    kpiPause();
  }
  kpiEdit[reason] = true;
  if (opts.id !== undefined) kpiEdit.id = opts.id;
  if (opts.showFrom !== undefined) kpiEdit.showFrom = !!opts.showFrom;
  kpiRedraw();
}

/* Schaltet einen Grund aus. Der Modus endet erst, wenn alle drei aus sind. */
function kpiEditOff(reason) {
  if (!kpiEdit) return;
  kpiEdit[reason] = false;
  if (reason === 'inline') kpiCloseInline();
  if (reason === 'focus') kpiEdit.showFrom = false;   // ohne Fokus gibt es keinen Grund mehr für den Startwert
  if (kpiEdit.hover || kpiEdit.focus || kpiEdit.inline) { kpiRedraw(); return; }
  kpiEndEdit();
}

/* Beendet den Modus unabhängig von den Gründen (Export, Laden, Schließen). */
function kpiEndEdit() {
  if (!kpiEdit) return;
  const resume = kpiEdit.wasPlaying;
  kpiEdit = null;
  kpiCloseInline();
  if (resume) kpiPlay(); else kpiRedraw();
}

// ---------------------------------------------------------------------
// 6c. TEXT DIREKT IN DER VORSCHAU BEARBEITEN (Doppelklick)
// Über dem angeklickten Textblock liegt ein unsichtbares Eingabefeld, das nur
// Cursor und Auswahl liefert. Den Text zeichnet weiter das Canvas, live und mit
// dem echten Umbruch – so sieht man beim Tippen exakt das spätere Ergebnis.
// Die Zahl ist bewusst ausgenommen: sie besteht aus Von, Bis und Einheit, ein
// einzelnes Feld darüber wäre irreführend. Dort springt der Doppelklick ins
// Feld "Bis" der Seitenleiste.
// ---------------------------------------------------------------------
let kpiInlineEl = null;
let kpiExporting = false;

function kpiVisibleItem() {
  if (kpiEdit) return kpi.items.find(i => i.id === kpiEdit.id) || null;
  if (!kpi.items.length) return null;
  const loc = kpiLocate(kpiNowT());
  const idx = loc.inTransition && loc.p >= 0.5 ? (loc.idx + 1) % kpi.items.length : loc.idx;
  return kpi.items[idx];
}

function kpiHitTest(e) {
  const item = kpiVisibleItem();
  if (!item) return null;
  const r = kpiCanvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * kpiCanvas.width / r.width;
  const y = (e.clientY - r.top) * kpiCanvas.height / r.height;
  const L = kpiLayout(kpiCanvas.width, kpiCanvas.height, item);
  const hit = L.blocks.find(b => x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h);
  return hit ? { item, key: hit.key } : null;
}

function kpiPositionInline() {
  const el = kpiInlineEl;
  if (!el || !kpiEdit) return;
  const item = kpi.items.find(i => i.id === kpiEdit.id);
  if (!item) return;
  const L = kpiLayout(kpiCanvas.width, kpiCanvas.height, item);
  const b = L.blocks.find(x => x.key === el.dataset.kpiField);
  if (!b) return;   // Text komplett gelöscht: Block existiert nicht mehr, Feld bleibt stehen

  const stage = kpiCanvas.parentElement;
  const cr = kpiCanvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const k = cr.width / kpiCanvas.width;
  const isBlock = b.kind === 'block';
  el.style.left = (cr.left - sr.left + (L.cx - L.maxW / 2) * k) + 'px';
  el.style.top = (cr.top - sr.top + b.y * k) + 'px';
  el.style.width = (L.maxW * k) + 'px';
  el.style.height = (b.h * k) + 'px';
  el.style.fontFamily = isBlock ? F_BOLD : F_REG;
  el.style.fontWeight = isBlock ? '700' : '400';
  el.style.fontSize = (b.fit.size * k) + 'px';
  el.style.lineHeight = ((isBlock ? b.fit.lh : b.h) * k) + 'px';
  el.style.letterSpacing = ((b.fit.ls || 0) * k) + 'px';
  el.style.caretColor = isBlock ? L.v.text : L.v.sub;
}

function kpiStartInline(item, key) {
  kpiCloseInline();
  kpiEditOn('inline', { id: item.id, showFrom: false });

  const multi = key === 'text';
  const el = document.createElement(multi ? 'textarea' : 'input');
  if (!multi) el.type = 'text';
  el.className = 'kpi-inline';
  el.value = item[key] || '';
  el.dataset.kpiField = key;
  const original = el.value;
  kpiCanvas.parentElement.appendChild(el);
  kpiInlineEl = el;

  el.addEventListener('input', () => {
    item[key] = el.value;
    if (kpiFieldEls[key]) kpiFieldEls[key].value = el.value;
    kpiItemChanged(item);
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      el.value = original;
      item[key] = original;
      if (kpiFieldEls[key]) kpiFieldEls[key].value = original;
      kpiItemChanged(item);
      el.blur();
    } else if (e.key === 'Enter' && !(multi && e.shiftKey)) {
      e.preventDefault();
      el.blur();
    }
  });
  el.addEventListener('blur', () => { if (kpiInlineEl === el) kpiEditOff('inline'); });

  kpiPositionInline();
  el.focus();
  el.select();
}

function kpiCloseInline() {
  const el = kpiInlineEl;
  if (!el) return;
  kpiInlineEl = null;
  el.remove();
}

function kpiOnCanvasDblClick(e) {
  if (kpiExporting) return;
  const hit = kpiHitTest(e);
  if (!hit) return;
  e.preventDefault();
  if (kpiSelId !== hit.item.id) { kpiSelId = hit.item.id; kpiSyncSidebar(); }
  if (hit.key === 'num') {
    const f = kpiFieldEls.toText;
    if (f) { f.focus(); f.select(); }
  } else {
    kpiStartInline(hit.item, hit.key);
  }
}

// ---------------------------------------------------------------------
// 7. SEITENLEISTE
// ---------------------------------------------------------------------
function kpiChips(options, activeKey, onPick) {
  const group = dashEl('div', 'filter-group');
  options.forEach(opt => {
    const b = dashEl('button', 'filter-chip' + (opt.key === activeKey ? ' active' : ''), opt.label);
    b.addEventListener('click', () => onPick(opt.key));
    group.appendChild(b);
  });
  return group;
}

/* Die Einstellungen sind ausgeklappte Akkordeons – im Alltag arbeitet man an
   den KPIs selbst, nicht an Ablauf und Format. Welche Abschnitte offen sind,
   wird bewusst außerhalb des Projektzustands gehalten: das ist Bedien-, keine
   Dokumentinformation, und soll nicht mitgespeichert werden. */
const kpiOpenSections = new Set();

function kpiAccordion(title, build) {
  const open = kpiOpenSections.has(title);
  const wrap = dashEl('div', 'kpi-acc' + (open ? ' open' : ''));
  const head = dashEl('button', 'kpi-acc-head');
  head.appendChild(dashEl('span', null, title));
  head.appendChild(dashEl('span', 'kpi-acc-sign', open ? '−' : '+'));
  head.addEventListener('click', () => {
    if (open) kpiOpenSections.delete(title); else kpiOpenSections.add(title);
    kpiSyncSidebar();
  });
  wrap.appendChild(head);
  if (open) {
    const body = dashEl('div', 'kpi-acc-body');
    build(body);
    wrap.appendChild(body);
  }
  return wrap;
}

function kpiSlider(label, value, min, max, stepv, onInput) {
  const row = dashEl('div', 'kpi-ctrl');
  const head = dashEl('div', 'kpi-ctrl-row');
  head.appendChild(dashEl('label', null, label));
  const val = dashEl('span', 'kpi-val', value.toFixed(1) + ' s');
  head.appendChild(val);
  row.appendChild(head);

  const rg = document.createElement('input');
  rg.type = 'range';
  rg.min = min; rg.max = max; rg.step = stepv; rg.value = value;
  rg.addEventListener('input', () => {
    const v = parseFloat(rg.value);
    val.textContent = v.toFixed(1) + ' s';
    onInput(v);
  });
  row.appendChild(rg);
  return row;
}

function kpiCheckbox(label, checked, onChange) {
  const lab = dashEl('label', 'logo-cb-label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!checked;
  cb.addEventListener('change', () => onChange(cb.checked));
  lab.appendChild(cb);
  lab.appendChild(dashEl('span', null, label));
  return lab;
}

function kpiIconBtn(text, title, cls, onClick) {
  const b = dashEl('button', cls || 'icon-btn', text);
  b.title = title;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

function kpiSyncSidebar() {
  const sb = document.getElementById('kpi-sidebar');
  if (!sb) return;
  sb.innerHTML = '';
  kpiTitleEls = {};
  kpiFieldEls = {};

  const meta = dashEl('div', 'dash-side-group');
  meta.appendChild(dashEl('div', 'dash-side-label', 'Bezeichnung'));
  const preview = dashEl('div', 'kpi-file-hint');
  const f = kpiFormat();
  const syncPreview = () => { preview.textContent = kpiFileName(f.w, f.h, 'mp4'); };
  // Das Eingabefeld dient während eines Exports zugleich als Fortschrittsbalken.
  const host = dashEl('div', 'kpi-progress-host');
  host.appendChild(dashInput(kpi.name, v => { kpi.name = v; syncPreview(); kpiPersist(); }));
  const bar = dashEl('div', 'kpi-progress');
  bar.id = 'kpi-progress';
  host.appendChild(bar);
  meta.appendChild(host);
  syncPreview();
  meta.appendChild(preview);
  sb.appendChild(meta);

  const list = dashEl('div', 'dash-side-group');
  list.appendChild(dashEl('div', 'dash-side-label', 'KPIs (' + kpi.items.length + ')'));
  kpi.items.forEach((it, i) => {
    const row = dashEl('div', 'kpi-item' + (it.id === kpiSelId ? ' active' : ''));
    row.addEventListener('click', () => { kpiSelId = it.id; kpiSyncSidebar(); });

    const title = dashEl('div', 'kpi-item-title', kpiItemTitle(it));
    kpiTitleEls[it.id] = title;
    row.appendChild(title);

    const acts = dashEl('div', 'kpi-item-acts');
    acts.appendChild(kpiIconBtn('↑', 'Nach oben', 'icon-btn', () => kpiMove(i, -1)));
    acts.appendChild(kpiIconBtn('↓', 'Nach unten', 'icon-btn', () => kpiMove(i, 1)));
    acts.appendChild(kpiIconBtn('⧉', 'Duplizieren', 'icon-btn', () => kpiDuplicate(i)));
    acts.appendChild(kpiIconBtn('✕', 'Löschen', 'icon-btn danger', () => kpiDelete(i)));
    row.appendChild(acts);

    list.appendChild(row);
  });

  const add = dashEl('button', 'ctrl-btn kpi-add-btn', '+ KPI');
  add.addEventListener('click', kpiAdd);
  list.appendChild(add);
  sb.appendChild(list);

  const sel = kpi.items.find(it => it.id === kpiSelId);
  if (sel) sb.appendChild(kpiItemFields(sel));

  sb.appendChild(kpiAccordion('Format', body => {
    body.appendChild(kpiChips(KPI_FORMATS, kpi.format, k => {
      kpi.format = k;
      kpiApplyFormat();
      kpiRefresh();
    }));
  }));

  sb.appendChild(kpiAccordion('Ablauf & Übergang', body => {
    body.appendChild(kpiCheckbox('Dynamische Zähldauer', kpi.dynCount, v => {
      kpi.dynCount = v;
      kpiSyncSidebar();   // Regler wird je nach Haken gesperrt bzw. freigegeben
      kpiRestart();
      kpiPersist();
    }));
    const slider = kpiSlider('Zähldauer', kpi.count, 0.4, 5, 0.1, v => { kpi.count = v; kpiPersist(); });
    if (kpi.dynCount) {
      slider.classList.add('disabled');
      slider.querySelector('.kpi-val').textContent = KPI_DYN_MIN.toFixed(1).replace('.', ',') +
        '–' + KPI_DYN_MAX.toFixed(1).replace('.', ',') + ' s';
    }
    body.appendChild(slider);
    if (kpi.dynCount) {
      body.appendChild(dashEl('div', 'kpi-note', 'Richtet sich nach der Höhe der Zahl – kleine Werte zählen kurz, große lange.'));
    }
    body.appendChild(kpiSlider('Standzeit', kpi.hold, 0.5, 8, 0.1, v => { kpi.hold = v; kpiPersist(); }));
    body.appendChild(kpiSlider('Übergang', kpi.trans, 0.2, 2, 0.05, v => { kpi.trans = v; kpiPersist(); }));
    body.appendChild(kpiChips(KPI_TRANSITIONS, kpi.transKind, k => { kpi.transKind = k; kpiRefresh(); }));
  }));

  sb.appendChild(kpiAccordion('Optionen', body => {
    body.appendChild(kpiCheckbox('Als Loop (nahtlos wiederholbar)', kpi.loop, v => { kpi.loop = v; kpiRestart(); kpiPersist(); }));
    body.appendChild(kpiCheckbox('mc-Logo einblenden', kpi.logo, v => { kpi.logo = v; kpiPersist(); }));
  }));

  // Wird die Seitenleiste neu aufgebaut, während ein Feld Fokus hatte, verschwindet
  // es ohne Abschlussereignis. Dann den Bearbeitungsmodus selbst beenden, sonst
  // bliebe die Vorschau für immer pausiert.
  if (kpiEdit && kpiEdit.focus) {
    const a = document.activeElement;
    if (!(a && a.dataset && a.dataset.kpiEdit)) kpiEditOff('focus');
  }
  // Wechselt die Auswahl, während die Maus noch in der Spalte ist, soll die
  // Vorschau die neu gewählte KPI zeigen und nicht die vorherige.
  if (kpiEdit && !kpiEdit.inline && kpiEdit.id !== kpiSelId) {
    kpiEdit.id = kpiSelId;
    kpiEdit.showFrom = false;
    kpiRedraw();
  }
}

function kpiFillSelect(el, values, active) {
  el.innerHTML = '';
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    if (v === active) o.selected = true;
    el.appendChild(o);
  });
}

function kpiOpenGifModal() {
  if (!kpi.items.length) { showToast('Bitte zuerst eine KPI anlegen'); return; }
  const f = kpiFormat();
  document.getElementById('kpi-gif-name').value = kpi.name || '';
  kpiFillSelect(document.getElementById('kpi-gif-fps'), KPI_GIF_FPS, kpi.gifFps);
  kpiFillSelect(document.getElementById('kpi-gif-colors'), KPI_GIF_COLORS, kpi.gifColors);
  document.getElementById('kpi-gif-hint').textContent =
    kpiEven(f.w * KPI_GIF_SCALE) + ' × ' + kpiEven(f.h * KPI_GIF_SCALE) + ' Pixel (halbe MP4-Maße). ' +
    'Weniger Bilder pro Sekunde verkleinert die Datei am stärksten; weniger Farben spart zusätzlich, ' +
    'lässt aber Verläufe und Kanten gröber wirken.';
  document.getElementById('kpi-gif-overlay').classList.add('visible');
}

function kpiCloseGifModal() {
  document.getElementById('kpi-gif-overlay').classList.remove('visible');
}

/* Felder der ausgewählten KPI. Jedes trägt data-kpi-edit: ein Fokus darauf
   startet den Bearbeitungsmodus (siehe kpiInit). Die Elemente werden in
   kpiFieldEls vorgehalten, damit das Eingabefeld in der Vorschau ihren Inhalt
   mitführen kann, ohne die Seitenleiste neu aufzubauen. */
function kpiEditable(el, key, extra) {
  el.dataset.kpiEdit = '1';
  if (extra) Object.assign(el.dataset, extra);
  kpiFieldEls[key] = el;
  return el;
}

function kpiItemTitle(item) {
  return (kpi.items.indexOf(item) + 1) + '. ' + kpiValueText(item, item.to);
}

/* Jede Änderung an einer KPI läuft hier durch: Überschrift in der Liste und
   Vorschau nachführen, danach speichern. */
function kpiItemChanged(item) {
  const t = kpiTitleEls[item.id];
  if (t) t.textContent = kpiItemTitle(item);
  kpiPersist();
}

function kpiTextField(item, key) {
  return kpiEditable(dashInput(item[key], v => { item[key] = v; kpiItemChanged(item); }), key);
}

function kpiNumberField(item, key) {
  const textKey = key + 'Text';
  return kpiEditable(dashInput(item[textKey], v => {
    item[textKey] = v;
    kpiApplyNumbers(item);
    kpiItemChanged(item);
  }), textKey, key === 'from' ? { kpiFrom: '1' } : null);
}

function kpiItemFields(item) {
  const g = dashEl('div', 'dash-side-group');
  g.appendChild(dashEl('div', 'dash-side-label', 'Ausgewählte KPI'));

  g.appendChild(dashField('Vorspann', kpiTextField(item, 'prefix')));

  const row = dashEl('div', 'dash-row');
  row.appendChild(dashField('Von', kpiNumberField(item, 'from')));
  row.appendChild(dashField('Bis', kpiNumberField(item, 'to')));
  g.appendChild(row);
  g.appendChild(dashEl('div', 'kpi-note',
    'Nachkommastellen ergeben sich aus der Eingabe: 2,4 zeigt eine Stelle, 2,45 zwei.'));

  g.appendChild(dashField('Einheit', kpiTextField(item, 'unit')));

  const ta = document.createElement('textarea');
  ta.className = 'dash-input';
  ta.rows = 3;
  ta.value = item.text || '';
  ta.addEventListener('input', () => { item.text = ta.value; kpiItemChanged(item); });
  g.appendChild(dashField('Beschreibung', kpiEditable(ta, 'text')));

  g.appendChild(dashField('Quelle / Jahr', kpiTextField(item, 'source')));

  const sw = dashEl('div', 'dash-side-label', 'Farbe');
  sw.style.marginTop = '14px';
  g.appendChild(sw);
  const swWrap = dashEl('div', 'dash-swatches');
  DASH_VARIANT_ORDER.forEach(key => {
    const v = DASH_VARIANTS[key];
    const b = dashEl('button', 'dash-swatch' + (item.variant === key ? ' active' : ''));
    b.style.background = v.bg;
    b.title = v.label;
    b.addEventListener('click', () => { item.variant = key; kpiRefresh(); });
    swWrap.appendChild(b);
  });
  g.appendChild(swWrap);

  return g;
}

// ---------------------------------------------------------------------
// 8. BEARBEITEN
// ---------------------------------------------------------------------
function kpiAdd() {
  if (kpi.items.length >= KPI_MAX_ITEMS) { showToast('Maximal ' + KPI_MAX_ITEMS + ' KPIs möglich'); return; }
  const item = kpiMakeItem({ prefix: 'bis zu', fromText: '0', toText: '100', unit: '%',
    text: 'Beschreibung der Kennzahl', variant: 'black' });
  kpi.items.push(item);
  kpiSelId = item.id;
  kpiRefresh();
}

function kpiDuplicate(i) {
  if (kpi.items.length >= KPI_MAX_ITEMS) { showToast('Maximal ' + KPI_MAX_ITEMS + ' KPIs möglich'); return; }
  const copy = kpiMakeItem(kpi.items[i]);   // vergibt eine neue ID
  kpi.items.splice(i + 1, 0, copy);
  kpiSelId = copy.id;
  kpiRefresh();
}

function kpiDelete(i) {
  if (kpi.items[i].id === kpiSelId) kpiSelId = null;
  kpi.items.splice(i, 1);
  kpiRefresh();
}

function kpiMove(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= kpi.items.length) return;
  const tmp = kpi.items[i];
  kpi.items[i] = kpi.items[j];
  kpi.items[j] = tmp;
  kpiRefresh();
}

function kpiRefresh() {
  kpiSyncSidebar();
  kpiPersist();
}

let kpiPersistTimer = null;
function kpiPersist() {
  kpiRedraw();   // steht die Vorschau, sofort sichtbar machen; läuft sie, holt sie es selbst ab
  clearTimeout(kpiPersistTimer);
  kpiPersistTimer = setTimeout(() => {
    try { localStorage.setItem(KPI_LS_KEY, JSON.stringify(kpi)); } catch (e) { /* Quota – nicht kritisch */ }
  }, 600);
}

function kpiLoadStored() {
  try {
    const raw = localStorage.getItem(KPI_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== 1 || !Array.isArray(p.items)) return null;
    return kpiNormalize(p);
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// 8b. PROJEKTDATEI (JSON)
// Speichert alle KPIs samt Einstellungen, damit sich ein Projekt später wieder
// laden und anpassen lässt. Bedienung und Dateiendung wie im Dashboard-Tool.
// ---------------------------------------------------------------------
const KPI_JSON_MAX_BYTES = 1024 * 1024;

function kpiProjectFileName() {
  const part = wsgFilenamePart(kpi.name || '');
  return kpiTodayStamp() + (part ? '_' + part : '') + '_mc_KPI_Projekt.json';
}

function kpiSaveJson() {
  const blob = new Blob([JSON.stringify(kpi, null, 2)], { type: 'application/json' });
  kpiDownload(blob, kpiProjectFileName());
  showToast('Projektdatei gesichert');
}

/* Nimmt eine Projektdatei als Text entgegen und ersetzt das aktuelle Projekt.
   Getrennt vom Dateidialog, damit sich die Prüfung ohne Dateiauswahl testen lässt. */
function kpiApplyProjectText(text) {
  let p;
  try { p = JSON.parse(text); } catch (e) { showToast('Datei konnte nicht gelesen werden'); return false; }
  if (!p || typeof p !== 'object' || !Array.isArray(p.items)) { showToast('Das ist keine KPI-Projektdatei'); return false; }
  if (p.v && p.v > 1) { showToast('Datei stammt aus einer neueren Version'); return false; }

  kpiEndEdit();
  kpi = kpiNormalize(p);
  kpiSelId = kpi.items.length ? kpi.items[0].id : null;
  kpiApplyFormat();
  kpiRefresh();
  kpiRestart();
  const skipped = p.items.length - kpi.items.length;
  showToast(skipped > 0 ? 'Projekt geladen – ' + skipped + ' Einträge nicht übernommen (ungültig oder über dem Limit)' : 'Projekt geladen');
  return true;
}

function kpiLoadJson() {
  const input = document.getElementById('kpi-json-input');
  input.value = '';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    // Eine Projektdatei ist klein. Alles darüber ist keine – nicht erst einlesen.
    if (f.size > KPI_JSON_MAX_BYTES) { showToast('Datei ist zu groß für eine KPI-Projektdatei'); return; }
    const fr = new FileReader();
    fr.onload = () => kpiApplyProjectText(String(fr.result));
    fr.onerror = () => showToast('Datei konnte nicht gelesen werden');
    fr.readAsText(f);
  };
  input.click();
}

// ---------------------------------------------------------------------
// 9. EXPORT
// ---------------------------------------------------------------------
function kpiStatus(msg) {
  const el = document.getElementById('kpi-status');
  if (el) el.textContent = msg || '';
}

/* Fortschritt läuft als Lime-Balken über das Bezeichnungsfeld – gut sichtbar,
   ohne zusätzliche Fläche zu belegen. p von 0 bis 1. */
function kpiProgress(p) {
  const el = document.getElementById('kpi-progress');
  if (!el) return;
  el.classList.add('active');
  el.style.width = Math.max(0, Math.min(1, p)) * 100 + '%';
}

function kpiProgressReset() {
  const el = document.getElementById('kpi-progress');
  if (!el) return;
  el.classList.remove('active');
  // Breite erst nach dem Ausblenden zurücksetzen, sonst sieht man den Balken
  // sichtbar zurücklaufen. Ein inzwischen neu gestarteter Export hat 'active'
  // bereits wieder gesetzt – dann nicht dazwischenfunken.
  setTimeout(() => { if (!el.classList.contains('active')) el.style.width = '0%'; }, 400);
}

function kpiSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* Ohne geladene Schrift würde der Export in einer Ersatzschrift rendern – bei
   einem Zahlen-Tool wäre genau das der schlimmste Fehler. */
async function kpiLoadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('700 200px "Rambla Alt Oscura"'),
      document.fonts.load('400 60px "Rambla Alt"')
    ]);
  } catch (e) { /* Ersatzschrift ist besser als gar kein Export */ }
}

function kpiDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function kpiExportVideo() {
  if (!window.MediaRecorder) { showToast('Dieser Browser kann keine Videos aufnehmen'); return; }
  if (!kpi.items.length) { showToast('Bitte zuerst eine KPI anlegen'); return; }

  const f = kpiFormat();
  const W = kpiEven(f.w), H = kpiEven(f.h);

  await kpiLoadFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const mimes = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = mimes.filter(m => MediaRecorder.isTypeSupported(m))[0] || '';
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, mime
    ? { mimeType: mime, videoBitsPerSecond: KPI_BITRATE }
    : { videoBitsPerSecond: KPI_BITRATE });

  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });

  const total = kpiTotal();
  const N = Math.max(1, Math.round(KPI_FPS * total));

  rec.start();
  // MediaRecorder stempelt nach Wanduhr, nicht nach Bildindex. Deshalb wird
  // nicht pauschal 1/fps pro Bild gewartet (dann käme die Renderzeit jedes
  // Bildes oben drauf und das Video geriete zu lang), sondern auf einen festen
  // Zeitplan getaktet – so entspricht die Videolänge der Soll-Dauer und der
  // Loop schließt sauber.
  const startedAt = performance.now();
  for (let i = 0; i < N; i++) {
    kpiRenderAt(ctx, i / KPI_FPS, W, H);
    if (track.requestFrame) track.requestFrame();
    else if (stream.requestFrame) stream.requestFrame();
    kpiStatus('Video: Bild ' + (i + 1) + ' von ' + N + ' …');
    kpiProgress((i + 1) / N);
    const wait = startedAt + (i + 1) * (1000 / KPI_FPS) - performance.now();
    if (wait > 0) await kpiSleep(wait);
  }
  rec.stop();
  await stopped;

  const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  kpiDownload(blob, kpiFileName(W, H, ext));
  kpiStatus('✓ ' + W + '×' + H + ' · ' + total.toFixed(1) + ' s · ' + (blob.size / 1e6).toFixed(1) + ' MB' +
    (ext === 'webm' ? ' · dieser Browser kann kein MP4 aufnehmen, daher WebM.' : ''));
}

/* Farbpalette aus Stichproben über die GANZE Zeitachse ableiten, nicht aus
   einem einzelnen Bild: die Tafeln können unterschiedliche Farbwelten haben
   (z. B. Lime nach Schwarz), und eine Palette nur vom ersten Bild würde die
   späteren Tafeln verfälschen. Jedes n-te Pixel genügt für die Farbverteilung. */
function kpiPaletteSamples(ctx, W, H, total, frames, stride) {
  const perFrame = Math.ceil((W * H) / stride);
  const out = new Uint8ClampedArray(perFrame * frames * 4);
  let o = 0;
  for (let s = 0; s < frames; s++) {
    kpiRenderAt(ctx, (s + 0.5) / frames * total, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let p = 0; p < W * H; p += stride) {
      out[o++] = d[p * 4]; out[o++] = d[p * 4 + 1]; out[o++] = d[p * 4 + 2]; out[o++] = 255;
    }
  }
  return out.subarray(0, o);
}

function kpiFramesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function kpiExportGif() {
  if (!window.gifenc) { showToast('GIF-Encoder nicht verfügbar'); return; }
  if (!kpi.items.length) { showToast('Bitte zuerst eine KPI anlegen'); return; }
  const { GIFEncoder, quantize, applyPalette } = window.gifenc;

  const f = kpiFormat();
  const W = kpiEven(f.w * KPI_GIF_SCALE), H = kpiEven(f.h * KPI_GIF_SCALE);
  const total = kpiTotal();
  // GIF speichert Anzeigedauern nur in Hundertstelsekunden. Die Bildrate wird
  // deshalb auf dieses Raster gelegt (12 B/s -> 80 ms -> effektiv 12,5 B/s),
  // sonst summiert sich der Rundungsfehler über alle Bilder auf und das GIF
  // läuft messbar kürzer als das MP4 – beim Loop fiele das auf.
  const delay = Math.round(100 / (kpi.gifFps || 12)) * 10;
  const fps = 1000 / delay;
  const N = Math.max(1, Math.round(fps * total));

  await kpiLoadFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  kpiStatus('GIF: Farbpalette wird bestimmt …');
  kpiProgress(0.02);
  await kpiSleep(0);
  // Eine Palettenstelle wird für "unverändert" freigehalten, deshalb eine Farbe
  // weniger quantisieren und den frei gebliebenen Index als transparent nutzen.
  const paletteBase = quantize(kpiPaletteSamples(ctx, W, H, total, Math.min(N, 12), 4),
    Math.max(4, (kpi.gifColors || 64) - 1));
  const transIdx = paletteBase.length;
  const palette = paletteBase.concat([[0, 0, 0]]);
  // Bittiefe an die Palettengröße anpassen: bei 64 Farben genügen 6 Bit pro
  // Pixel statt der voreingestellten 8 – das schrumpft die Datei zusätzlich.
  const colorDepth = Math.max(2, Math.ceil(Math.log2(Math.max(2, palette.length))));

  const enc = GIFEncoder();
  let shown = null;        // zuletzt geschriebenes Vollbild
  let pending = null, pendingDelay = 0, written = 0;

  const flush = () => {
    if (!pending) return;
    if (written === 0) {
      enc.writeFrame(pending, W, H, { palette, delay: pendingDelay, repeat: 0, colorDepth });
    } else {
      // Nur die geänderten Pixel schreiben, der Rest bleibt transparent und
      // damit stehen (dispose: 1). Bei einer hochzählenden Zahl ändert sich nur
      // ein kleiner Bildausschnitt – die langen gleichbleibenden Flächen
      // komprimiert GIF dadurch fast auf null.
      const diff = new Uint8Array(pending.length);
      for (let p = 0; p < pending.length; p++) diff[p] = pending[p] === shown[p] ? transIdx : pending[p];
      enc.writeFrame(diff, W, H,
        { delay: pendingDelay, transparent: true, transparentIndex: transIdx, dispose: 1, colorDepth });
    }
    shown = pending;
    written++;
  };

  for (let i = 0; i < N; i++) {
    kpiRenderAt(ctx, i / fps, W, H);
    const idx = applyPalette(ctx.getImageData(0, 0, W, H).data, paletteBase);
    // Während der Standzeit sind aufeinanderfolgende Bilder identisch. Statt
    // sie alle zu schreiben, wird nur die Anzeigedauer verlängert – das spart
    // bei 3 s Standzeit pro Tafel den Löwenanteil der Bilder.
    if (pending && kpiFramesEqual(pending, idx)) {
      pendingDelay += delay;
    } else {
      flush();
      pending = idx;
      pendingDelay = delay;
    }
    if (i % 5 === 0) {
      kpiStatus('GIF: Bild ' + (i + 1) + ' von ' + N + ' …');
      kpiProgress((i + 1) / N);
      await kpiSleep(0);
    }
  }
  // Der Fortschritt wird nur jedes fünfte Bild gemeldet – zum Schluss noch
  // einmal explizit auf voll setzen, damit der Balken sichtbar rechts ankommt.
  kpiProgress(1);
  flush();
  enc.finish();

  const blob = new Blob([enc.bytes()], { type: 'image/gif' });
  kpiDownload(blob, kpiFileName(W, H, 'gif'));
  kpiStatus('✓ GIF ' + W + '×' + H + ' · ' + written + ' statt ' + N + ' Bildern · ' +
    (blob.size / 1e6).toFixed(2) + ' MB');
}

function kpiRunExport(fn) {
  const btns = document.querySelectorAll('.kpi-exp-btn');
  btns.forEach(b => { b.disabled = true; });
  // Während der Aufnahme sind Seitenleiste und Vorschau gesperrt: jede Änderung
  // an den KPIs würde sonst mitten im Video sichtbar.
  kpiEndEdit();
  kpiExporting = true;
  document.getElementById('kpi-view').classList.add('exporting');
  kpiPause();
  Promise.resolve()
    .then(fn)
    .catch(e => { kpiStatus('Fehler: ' + e.message); console.error(e); })
    .then(() => {
      kpiExporting = false;
      document.getElementById('kpi-view').classList.remove('exporting');
      btns.forEach(b => { b.disabled = false; });
      kpiProgressReset();
      kpiPlay();
    });
}

// ---------------------------------------------------------------------
// 10. ÖFFNEN / SCHLIESSEN
// ---------------------------------------------------------------------
function kpiOpen() {
  if (!kpi) kpi = kpiLoadStored() || kpiDefaultState();
  document.getElementById('main-view').style.display = 'none';
  const mc = document.getElementById('main-controls');
  if (mc) mc.style.display = 'none';
  hideHubView();
  document.getElementById('kpi-view').classList.add('visible');
  kpiOpened = true;

  if (!kpiMounted) {
    kpiMounted = true;
    kpiCanvas = document.getElementById('kpi-canvas');
    kpiCtx = kpiCanvas.getContext('2d');

    kpiLogoWhite = new Image();
    kpiLogoWhite.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(KPI_LOGO_SVG_WHITE);
    kpiLogoBlack = new Image();
    kpiLogoBlack.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(KPI_LOGO_SVG_BLACK);

    if (!kpiSelId && kpi.items.length) kpiSelId = kpi.items[0].id;
  }

  kpiApplyFormat();
  kpiSyncSidebar();
  kpiRestart();

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 200px "Rambla Alt Oscura"').catch(() => {});
  }
}

function kpiClose() {
  kpiEdit = null;   // ohne Fortsetzen: die Ansicht wird gleich geschlossen
  kpiCloseInline();
  kpiPause();
  kpiOpened = false;
  document.getElementById('kpi-view').classList.remove('visible');
  document.getElementById('main-view').style.display = 'block';
  if (typeof hubVisible !== 'undefined' && hubVisible) restoreHubView();
  else { const mc = document.getElementById('main-controls'); if (mc) mc.style.display = 'flex'; }
}

function kpiInit() {
  const tile = document.getElementById('tile-kpi');
  if (!tile) return;
  tile.addEventListener('click', kpiOpen);
  document.getElementById('kpi-back').addEventListener('click', kpiClose);
  document.getElementById('kpi-export').addEventListener('click', () => kpiRunExport(kpiExportVideo));
  document.getElementById('kpi-export-gif').addEventListener('click', kpiOpenGifModal);
  document.getElementById('kpi-gif-cancel').addEventListener('click', kpiCloseGifModal);
  document.getElementById('kpi-gif-overlay').addEventListener('click', e => {
    if (e.target.id === 'kpi-gif-overlay') kpiCloseGifModal();
  });
  document.getElementById('kpi-gif-start').addEventListener('click', () => {
    kpi.name = document.getElementById('kpi-gif-name').value;
    kpi.gifFps = parseInt(document.getElementById('kpi-gif-fps').value, 10);
    kpi.gifColors = parseInt(document.getElementById('kpi-gif-colors').value, 10);
    kpiCloseGifModal();
    kpiSyncSidebar();   // Bezeichnung kann hier geändert worden sein
    kpiPersist();
    kpiRunExport(kpiExportGif);
  });
  // Der Abspielen-Button setzt auch den Bearbeitungsmodus fort. Sein Klick kommt
  // aber erst NACH dem Fokusverlust des Feldes, der die Vorschau schon wieder
  // gestartet hat – ohne diese Unterscheidung würde derselbe Klick sie
  // sofort wieder anhalten. pointerdown läuft vor dem Fokuswechsel.
  const playBtn = document.getElementById('kpi-play');
  playBtn.addEventListener('pointerdown', () => { kpiPlayPressedWhileEditing = !!kpiEdit; });
  playBtn.addEventListener('click', () => {
    if (kpiPlayPressedWhileEditing) {
      kpiPlayPressedWhileEditing = false;
      kpiEndEdit();
      if (!kpiRaf) kpiPlay();
      return;
    }
    kpiRaf ? kpiPause() : kpiPlay();
  });

  const sb = document.getElementById('kpi-sidebar');
  sb.addEventListener('focusin', e => {
    if (e.target.dataset && e.target.dataset.kpiEdit && kpiSelId) {
      kpiEditOn('focus', { id: kpiSelId, showFrom: e.target.dataset.kpiFrom === '1' });
    }
  });
  sb.addEventListener('focusout', e => {
    const next = e.relatedTarget;
    if (next && next.dataset && next.dataset.kpiEdit) return;   // Tab ins nächste Feld: weiter im Modus
    kpiEditOff('focus');
  });

  // Maus über der rechten Spalte: Vorschau steht, auch ohne Fokus in einem Feld.
  // Nur für die Maus – auf Touchgeräten gäbe es kein verlässliches "Verlassen",
  // die Vorschau bliebe nach dem Antippen dauerhaft stehen.
  const column = sb.parentElement;
  column.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse' && !kpiExporting) kpiEditOn('hover');
  });
  column.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') kpiEditOff('hover');
  });
  sb.addEventListener('keydown', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.kpiEdit || e.key !== 'Enter') return;
    // In der Beschreibung bleibt Umschalt+Enter für einen Zeilenumbruch.
    if (el.tagName === 'TEXTAREA' && e.shiftKey) return;
    e.preventDefault();
    el.blur();
  });

  kpiCanvas = document.getElementById('kpi-canvas');
  kpiCanvas.addEventListener('dblclick', kpiOnCanvasDblClick);
  window.addEventListener('resize', kpiPositionInline);
  document.getElementById('kpi-save-json').addEventListener('click', kpiSaveJson);
  document.getElementById('kpi-load-json').addEventListener('click', kpiLoadJson);
  document.getElementById('kpi-replay').addEventListener('click', kpiRestart);
  document.getElementById('kpi-reset').addEventListener('click', () => {
    if (!confirm('KPI-Video zurücksetzen?\nAlle eingegebenen Kennzahlen gehen verloren.')) return;
    kpi = kpiDefaultState();
    kpiSelId = kpi.items[0].id;
    kpiApplyFormat();
    kpiRefresh();
    kpiRestart();
    showToast('Zurückgesetzt');
  });
}

kpiInit();
