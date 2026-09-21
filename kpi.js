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

let kpiUid = 1;
function kpiId() { return 'k' + (kpiUid++) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

/* Der Leerzustand ist bewusst ein fertiges Beispiel (wie im Dashboard-
   Generator) – so sieht man sofort, wofür das Tool gedacht ist. */
function kpiDefaultState() {
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
    gifColors: 32,
    items: [
      { id: kpiId(), prefix: 'bis zu', from: 0, to: 700000, decimals: 0, unit: '',
        text: 'monatlich erreichte Personen bei Google', variant: 'black' },
      { id: kpiId(), prefix: 'bis zu', from: 0, to: 50, decimals: 0, unit: '%',
        text: 'Follower-Wachstum auf Social Media', variant: 'lime' },
      { id: kpiId(), prefix: 'bis zu', from: 0, to: 5, decimals: 0, unit: 'Plätze',
        text: 'Verbesserung der durchschnittlichen Google-Position', variant: 'anthracite' }
    ]
  };
}

// ---------------------------------------------------------------------
// 3. HILFSFUNKTIONEN
// ---------------------------------------------------------------------
function kpiClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function kpiEaseOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function kpiEaseInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function kpiEven(n) { return Math.round(n / 2) * 2; }   // H.264 braucht gerade Maße

function kpiNearest(value, list) {
  const v = Number(value);
  if (!Number.isFinite(v)) return list[0];
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

/* Akzeptiert auch deutsch formatierte Eingaben ("700.000", "2,4"), damit man
   Zahlen direkt aus einer Auswertung hineinkopieren kann. */
function kpiParseNum(str) {
  const cleaned = String(str == null ? '' : str)
    .replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
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

function kpiDrawContent(ctx, W, H, item, value) {
  const v = DASH_VARIANTS[item.variant] || DASH_VARIANTS.black;
  ctx.fillStyle = v.bg;
  ctx.fillRect(0, 0, W, H);

  const maxW = W - 2 * (W * 0.09);
  const prefix = (item.prefix || '').trim();
  const text = (item.text || '').trim();

  const preFit = prefix
    ? dashFitLine(prefix, maxW, { max: Math.round(W * 0.052), min: 12, weight: 400, lsF: 0.04 })
    : null;
  const numFit = dashFitLine(kpiWidestValue(item), maxW,
    { max: Math.round(W * 0.27), min: 24, weight: 700, lsF: 0 });
  const txtFit = text
    ? dashFitBlock(text, maxW, H * 0.30, { max: Math.round(W * 0.072), min: 14, weight: 700, lsF: 0.01, lhF: 1.14 })
    : null;

  const gapPre = W * 0.03, gapTxt = W * 0.05;
  const preH = preFit ? preFit.size * 1.2 : 0;
  const numH = numFit.size * 0.82;
  const txtH = txtFit ? txtFit.lines.length * txtFit.lh : 0;
  const totalH = preH + (preFit ? gapPre : 0) + numH + (txtFit ? gapTxt + txtH : 0);

  let y = (H - totalH) / 2;
  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (preFit) {
    ctx.font = '400 ' + preFit.size + 'px ' + F_REG;
    ctx.fillStyle = v.sub;
    kpiSetLetterSpacing(ctx, preFit.ls);
    ctx.fillText(prefix, cx, y + preFit.size * 0.85);
    y += preH + gapPre;
  }

  ctx.font = '700 ' + numFit.size + 'px ' + F_BOLD;
  ctx.fillStyle = v.accent;
  kpiSetLetterSpacing(ctx, 0);
  ctx.fillText(kpiValueText(item, value), cx, y + numFit.size * 0.75);
  y += numH;

  if (txtFit) {
    y += gapTxt;
    ctx.font = '700 ' + txtFit.size + 'px ' + F_BOLD;
    ctx.fillStyle = v.text;
    kpiSetLetterSpacing(ctx, txtFit.ls);
    txtFit.lines.forEach((line, i) => ctx.fillText(line, cx, y + txtFit.size * 0.85 + i * txtFit.lh));
  }

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

function kpiRenderAt(ctx, t, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const n = kpi.items.length;
  if (!n) { kpiDrawEmpty(ctx, W, H); return; }

  const { slots } = kpiTimeline();
  // Gegen einen unbrauchbaren Zeitwert absichern: ein NaN würde sonst zu einer
  // undefinierten Tafel führen und mitten in einer laufenden Aufnahme eine
  // Exception werfen, die den ganzen Export abbricht.
  const safeT = Number.isFinite(t) ? Math.max(0, t) : 0;
  let idx = 0;
  while (idx < n - 1 && safeT >= slots[idx + 1].start) idx++;
  const cur = slots[idx];
  const local = safeT - cur.start;

  if (local <= cur.slot) {
    kpiDrawContent(ctx, W, H, kpi.items[idx], kpiValueAt(kpi.items[idx], local, cur.count));
  } else {
    const p = kpiEaseInOutCubic(kpiClamp01((local - cur.slot) / Math.max(0.01, kpi.trans)));
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

function kpiApplyFormat() {
  const f = kpiFormat();
  kpiCanvas.width = f.w;
  kpiCanvas.height = f.h;
  kpiRenderAt(kpiCtx, 0, f.w, f.h);
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

    row.appendChild(dashEl('div', 'kpi-item-title', (i + 1) + '. ' + kpiValueText(it, Number(it.to) || 0)));

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
      body.appendChild(dashEl('div', 'kpi-file-hint', 'Richtet sich nach der Höhe der Zahl – kleine Werte zählen kurz, große lange.'));
    }
    body.appendChild(kpiSlider('Standzeit', kpi.hold, 0.5, 8, 0.1, v => { kpi.hold = v; kpiPersist(); }));
    body.appendChild(kpiSlider('Übergang', kpi.trans, 0.2, 2, 0.05, v => { kpi.trans = v; kpiPersist(); }));
    body.appendChild(kpiChips(KPI_TRANSITIONS, kpi.transKind, k => { kpi.transKind = k; kpiRefresh(); }));
  }));

  sb.appendChild(kpiAccordion('Optionen', body => {
    body.appendChild(kpiCheckbox('Als Loop (nahtlos wiederholbar)', kpi.loop, v => { kpi.loop = v; kpiRestart(); kpiPersist(); }));
    body.appendChild(kpiCheckbox('mc-Logo einblenden', kpi.logo, v => { kpi.logo = v; kpiPersist(); }));
  }));

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

function kpiItemFields(item) {
  const g = dashEl('div', 'dash-side-group');
  g.appendChild(dashEl('div', 'dash-side-label', 'Ausgewählte KPI'));

  g.appendChild(dashField('Vorspann', dashInput(item.prefix, v => { item.prefix = v; kpiPersist(); })));

  const row = dashEl('div', 'dash-row');
  row.appendChild(dashField('Von', dashInput(kpiFormatNumber(item.from, item.decimals), v => {
    item.from = kpiParseNum(v); kpiPersist();
  })));
  row.appendChild(dashField('Bis', dashInput(kpiFormatNumber(item.to, item.decimals), v => {
    item.to = kpiParseNum(v); kpiPersist();
  })));
  g.appendChild(row);

  const row2 = dashEl('div', 'dash-row');
  row2.appendChild(dashField('Einheit', dashInput(item.unit, v => { item.unit = v; kpiPersist(); })));
  row2.appendChild(dashField('Nachkommastellen', dashInput(String(item.decimals || 0), v => {
    item.decimals = Math.max(0, Math.min(3, parseInt(v, 10) || 0));
    kpiPersist();
  }, 'number')));
  g.appendChild(row2);

  const ta = document.createElement('textarea');
  ta.className = 'dash-input';
  ta.rows = 3;
  ta.value = item.text || '';
  ta.addEventListener('input', () => { item.text = ta.value; kpiPersist(); });
  g.appendChild(dashField('Beschreibung', ta));

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
  const item = { id: kpiId(), prefix: 'bis zu', from: 0, to: 100, decimals: 0, unit: '%',
    text: 'Beschreibung der Kennzahl', variant: 'black' };
  kpi.items.push(item);
  kpiSelId = item.id;
  kpiRefresh();
}

function kpiDuplicate(i) {
  const copy = Object.assign({}, kpi.items[i], { id: kpiId() });
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
    // Über die Standardwerte legen, damit ein älterer Stand ohne die später
    // ergänzten Felder (z. B. GIF-Einstellungen) nicht zu undefined führt.
    const merged = Object.assign(kpiDefaultState(), p);
    // Ein gespeicherter Wert kann außerhalb der heutigen Auswahl liegen (die
    // Bereiche wurden nachträglich enger gefasst) – auf den nächstliegenden
    // erlaubten Wert ziehen, statt eine leere Auswahl anzuzeigen.
    merged.gifFps = kpiNearest(merged.gifFps, KPI_GIF_FPS);
    merged.gifColors = kpiNearest(merged.gifColors, KPI_GIF_COLORS);
    return merged;
  } catch (e) { return null; }
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
  kpiPause();
  Promise.resolve()
    .then(fn)
    .catch(e => { kpiStatus('Fehler: ' + e.message); console.error(e); })
    .then(() => { btns.forEach(b => { b.disabled = false; }); kpiProgressReset(); kpiPlay(); });
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
  document.getElementById('kpi-play').addEventListener('click', () => { kpiRaf ? kpiPause() : kpiPlay(); });
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
