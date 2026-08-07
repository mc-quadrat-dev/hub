// =====================================================================
// ANIMATIONS GENERATOR – mc Brand Hub
// Oberfläche und Export rund um die PatternWave-Engine (pattern-engine.js).
// Muster in Lime auf Schwarz, Bedienung im Design des Hubs.
// =====================================================================

// Muster-Grundfarben: Fläche schwarz, Elemente lime
const ANIM_BG = '#000000';
const ANIM_FILL = '#cefb0b';
const ANIM_MOBILE_SCALE = 1.495;   // Mobil-Muster rund 50 % größer

let animState = null;
let animWaves = [];
let animMounted = false;
let animOpened = false;

// ---------------------------------------------------------------------
// 1. STEUER-SCHEMA
// ---------------------------------------------------------------------
const ANIM_SCHEMA = [
  { group: 'Bewegung', items: [
    { key: 'loopDuration', label: 'Tempo (Loop-Dauer, s)', min: 4, max: 20, step: 0.5,
      info: 'Dauer eines kompletten Durchlaufs: Einblenden → Halten → Ausblenden → wieder von vorn. Größer = langsamer und ruhiger.' },
    { key: 'waveSpread', label: 'Wellen-Breite', min: 0.05, max: 0.6, step: 0.01,
      info: 'Wie stark die Elemente zeitlich gestaffelt erscheinen. Klein = fast gleichzeitig, groß = deutliche Welle über die Fläche.' },
    { key: 'holdFraction', label: 'Halte-Dauer', min: 0, max: 0.5, step: 0.01,
      info: 'Anteil des Loops, in dem das Muster voll sichtbar stehen bleibt, bevor es wieder ausblendet.' },
    { key: 'fadeSoftness', label: 'Übergangs-Weichheit', min: 0.03, max: 0.3, step: 0.01,
      info: 'Wie weich ein einzelnes Element ein- und ausblendet. Klein = zügiges Auftauchen, groß = sanftes Überblenden.' },
    { key: 'direction', label: 'Richtung', type: 'select',
      options: [['ltr', 'links → rechts'], ['rtl', 'rechts → links'], ['ttb', 'oben → unten'],
                ['btt', 'unten → oben'], ['diag', 'diagonal'], ['diag-rev', 'diagonal umgekehrt']],
      info: 'Laufrichtung der Welle über die Fläche.' }
  ]},
  { group: 'Aussehen', items: [
    { key: 'opacityMax', label: 'Deckkraft Muster', min: 0.2, max: 1, step: 0.02,
      info: 'Deckkraft der Musterelemente im voll sichtbaren Zustand. Niedriger = das Lime wirkt als feine Textur statt als kräftige Grafik.' },
    { key: 'opacityMin', label: 'Grund-Deckkraft', min: 0, max: 0.6, step: 0.01,
      info: 'Deckkraft im „verschwunden“-Zustand. 0 = das Muster verschwindet komplett, der Loop startet und endet leer.' },
    { key: 'scaleMin', label: 'Skalierung', min: 0.6, max: 1, step: 0.01,
      info: 'Startgröße beim Einblenden. 1 = kein Zoom; kleinere Werte lassen die Elemente sanft hineinwachsen.' },
    { key: 'rotateDeg', label: 'Rotation', min: 0, max: 20, step: 1,
      info: 'Wie stark sich ein Teil der Elemente beim Ein- und Ausblenden dreht. Im voll sichtbaren Zustand stehen alle wieder gerade.' },
    { key: 'coverWidthFactor', label: 'Muster-Größe', min: 0.3, max: 1.2, step: 0.01, rebuild: true,
      info: 'Größe und Dichte des Musters relativ zur Breite. Mobil wird automatisch rund 50 % größer skaliert.' },
    { key: 'fadeStart', label: 'Rechts-Ausblendung', min: 0.2, max: 1, step: 0.02, rebuild: true,
      info: 'Ab wo das Muster nach rechts ausblendet. Kleiner = früher ausgeblendet, mehr ruhige Fläche für Text.' }
  ]}
];

const ANIM_PRESETS = {
  'Ruhig':           { loopDuration: 14, waveSpread: 0.28, fadeSoftness: 0.12, holdFraction: 0.18,
                       direction: 'ltr', scaleMin: 0.94, rotateDeg: 3, coverWidthFactor: 0.62,
                       fadeStart: 0.5, opacityMax: 0.55, opacityMin: 0 },
  'Deutliche Welle': { loopDuration: 10, waveSpread: 0.45, fadeSoftness: 0.08, holdFraction: 0.1,
                       direction: 'ltr', scaleMin: 0.85, rotateDeg: 8, coverWidthFactor: 0.62,
                       fadeStart: 0.5, opacityMax: 0.8, opacityMin: 0 },
  'Diagonal':        { loopDuration: 11, waveSpread: 0.4, fadeSoftness: 0.1, holdFraction: 0.12,
                       direction: 'diag', scaleMin: 0.88, rotateDeg: 6, coverWidthFactor: 0.62,
                       fadeStart: 0.55, opacityMax: 0.7, opacityMin: 0 },
  'Kräftig':         { loopDuration: 9, waveSpread: 0.5, fadeSoftness: 0.06, holdFraction: 0.08,
                       direction: 'ltr', scaleMin: 0.8, rotateDeg: 10, coverWidthFactor: 0.68,
                       fadeStart: 0.6, opacityMax: 1, opacityMin: 0 }
};

function animDefaults() {
  return Object.assign({}, PatternWave.DEFAULTS, {
    bg: ANIM_BG,
    fill: ANIM_FILL,
    opacityMax: 0.62,     // Lime auf Schwarz ist kräftig – etwas zurückgenommen
    opacityMin: 0,
    holdFraction: 0.18,
    fadeSoftness: 0.1,
    waveSpread: 0.32,
    loopDuration: 13
  });
}

// ---------------------------------------------------------------------
// 2. KARTEN
// ---------------------------------------------------------------------
function animMountCard(card) {
  const isMobile = card.classList.contains('mobile');
  const scale = isMobile ? ANIM_MOBILE_SCALE : 1;
  const layer = document.createElement('div');
  layer.className = 'anim-pattern-layer';
  // Position inline setzen: die Engine würde sonst „relative“ ergänzen,
  // die Ebene fiele auf Höhe 0 zusammen und würde alles wegschneiden.
  layer.style.cssText = 'position:absolute;inset:0;z-index:1;';
  card.insertBefore(layer, card.firstChild);
  const cfg = Object.assign({}, animState, { coverWidthFactor: animState.coverWidthFactor * scale });
  const w = PatternWave.fromPoints(layer, window.PW_TILE_POINTS, cfg);
  w.__scale = scale;
  w.__variant = isMobile ? 'mobile' : 'desktop';
  return w;
}

function animMountAll() {
  animWaves = [];
  ['anim-card-desktop', 'anim-card-mobile'].forEach(id => {
    const c = document.getElementById(id);
    if (c) animWaves.push(animMountCard(c));
  });
  animMounted = true;
}

function animApply(partial) {
  Object.assign(animState, partial);
  animWaves.forEach(w => {
    let p = partial;
    if ('coverWidthFactor' in partial) {
      p = Object.assign({}, partial, { coverWidthFactor: partial.coverWidthFactor * (w.__scale || 1) });
    }
    w.setConfig(p);
  });
}

// ---------------------------------------------------------------------
// 3. BEDIENFELD
// ---------------------------------------------------------------------
const animInputs = {};

function animFmt(v) { return typeof v === 'number' ? Math.round(v * 100) / 100 : v; }

function animBuildPresets() {
  const root = document.getElementById('anim-presets');
  if (!root) return;
  root.innerHTML = '';
  Object.keys(ANIM_PRESETS).forEach(name => {
    const b = document.createElement('button');
    b.className = 'filter-chip';
    b.textContent = name;
    b.addEventListener('click', () => { animApply(ANIM_PRESETS[name]); animSyncInputs(); });
    root.appendChild(b);
  });
}

function animBuildControls() {
  const root = document.getElementById('anim-controls');
  if (!root) return;
  root.innerHTML = '';
  ANIM_SCHEMA.forEach(g => {
    const group = document.createElement('div');
    group.className = 'anim-group';
    const h = document.createElement('div');
    h.className = 'dash-side-label';
    h.textContent = g.group;
    group.appendChild(h);

    g.items.forEach(it => {
      const c = document.createElement('div');
      c.className = 'anim-ctrl';
      if (it.info) c.title = it.info;
      const cur = animState[it.key];

      if (it.type === 'select') {
        const row = document.createElement('div');
        row.className = 'anim-ctrl-row';
        const lb = document.createElement('label');
        lb.textContent = it.label;
        row.appendChild(lb);
        c.appendChild(row);
        const sel = document.createElement('select');
        sel.className = 'dash-input';
        it.options.forEach(o => {
          const op = document.createElement('option');
          op.value = o[0]; op.textContent = o[1];
          sel.appendChild(op);
        });
        sel.value = cur;
        sel.addEventListener('change', () => { const o = {}; o[it.key] = sel.value; animApply(o); });
        c.appendChild(sel);
        animInputs[it.key] = sel;
      } else {
        const row = document.createElement('div');
        row.className = 'anim-ctrl-row';
        const lb = document.createElement('label');
        lb.textContent = it.label;
        const val = document.createElement('span');
        val.className = 'anim-val';
        val.textContent = animFmt(cur);
        row.appendChild(lb); row.appendChild(val);
        c.appendChild(row);

        const rg = document.createElement('input');
        rg.type = 'range';
        rg.min = it.min; rg.max = it.max; rg.step = it.step; rg.value = cur;
        rg.style.width = '100%';
        // Bei rebuild-Reglern erst beim Loslassen neu aufbauen – sonst ruckelt es
        rg.addEventListener('input', () => { val.textContent = animFmt(parseFloat(rg.value)); });
        rg.addEventListener(it.rebuild ? 'change' : 'input', () => {
          const o = {}; o[it.key] = parseFloat(rg.value); animApply(o);
        });
        c.appendChild(rg);
        animInputs[it.key] = rg;
      }
      group.appendChild(c);
    });
    root.appendChild(group);
  });
}

function animSyncInputs() {
  Object.keys(animInputs).forEach(k => {
    const el = animInputs[k];
    el.value = animState[k];
    const val = el.parentNode && el.parentNode.querySelector('.anim-val');
    if (val && el.type === 'range') val.textContent = animFmt(parseFloat(el.value));
  });
}

// ---------------------------------------------------------------------
// 4. EXPORT
// ---------------------------------------------------------------------
const ANIM_EXPORT = { mp4Fps: 30, gifWidth: 1000, gifFps: 12 };

function animStatus(t) {
  const s = document.getElementById('anim-status');
  if (s) s.textContent = t;
}
function animSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function animEven(n) { n = Math.round(n); return n % 2 ? n + 1 : n; }

function animWaveByVariant(v) {
  return animWaves.find(w => w.__variant === v) || animWaves[0];
}

function animDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* Aktuellen SVG-Zustand als Bild rastern. Das Muster besteht nur aus
   Polygonen mit direkten Füllfarben – es wird nichts nachgeladen. */
function animSvgFrame(wave) {
  const svg = wave.svg;
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', parseFloat(svg.style.width));
  clone.setAttribute('height', parseFloat(svg.style.height));
  const uri = 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Muster konnte nicht gerastert werden'));
    img.src = uri;
  });
}

function animDrawPattern(ctx, wave, W, H) {
  ctx.fillStyle = wave.config.bg || ANIM_BG;
  ctx.fillRect(0, 0, W, H);
  return animSvgFrame(wave).then(img => {
    const cardW = wave.container.clientWidth;
    const coverW = parseFloat(wave.svg.style.width);
    const totalH = parseFloat(wave.svg.style.height);
    const scale = W / cardW;
    ctx.drawImage(img, 0, 0, coverW * scale, totalH * scale);
  });
}

/* Text-Overlay für den Videoexport – spiegelt die Karten-Gestaltung. */
function animDrawOverlay(ctx, variant, W, H) {
  const headline = 'Blindtext Headline';
  if (variant === 'mobile') {
    // Abdunkelung nach unten, damit die Headline über dem Muster steht
    const g = ctx.createLinearGradient(0, H * 0.52, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.52, W, H * 0.48);

    const size = 0.115 * W;
    ctx.font = '700 ' + size + 'px "Rambla Alt Oscura", "Inter", sans-serif';
    ctx.fillStyle = '#ffffff';
    const x = 0.09 * W;
    let y = H * 0.86;
    ['Blindtext', 'Headline'].forEach((line, i) => {
      ctx.fillText(line, x, y + i * size * 1.06 - size * 1.06);
    });
  } else {
    const size = 0.062 * W;
    ctx.font = '700 ' + size + 'px "Rambla Alt Oscura", "Inter", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(headline, W * 0.94, H * 0.54);
    ctx.textAlign = 'left';
  }
}

async function animExportVideo(variant) {
  if (!window.MediaRecorder) { animStatus('MediaRecorder wird von diesem Browser nicht unterstützt.'); return; }
  const wave = animWaveByVariant(variant);
  const cardW = wave.container.clientWidth, cardH = wave.container.clientHeight;
  const W = animEven(variant === 'mobile' ? 720 : 1280);
  const H = animEven(W * cardH / cardW);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const fps = ANIM_EXPORT.mp4Fps, loop = wave.config.loopDuration, N = Math.round(fps * loop);

  const mimes = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = mimes.filter(m => MediaRecorder.isTypeSupported(m))[0] || '';
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12000000 }
                                             : { videoBitsPerSecond: 12000000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });

  const saved = wave.config.respectReducedMotion;
  wave.config.respectReducedMotion = false;
  animWaves.forEach(w => w.pause());
  rec.start();
  for (let i = 0; i < N; i++) {
    wave.renderAt(i / fps);
    await animDrawPattern(ctx, wave, W, H);
    animDrawOverlay(ctx, variant, W, H);
    if (track.requestFrame) track.requestFrame(); else if (stream.requestFrame) stream.requestFrame();
    animStatus(`Video ${variant}: Bild ${i + 1} von ${N} …`);
    await animSleep(1000 / fps);
  }
  rec.stop();
  await stopped;
  wave.config.respectReducedMotion = saved;
  animWaves.forEach(w => w.play());

  const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  animDownload(blob, `mc_Muster_${variant}.${ext}`);
  animStatus(`✓ mc_Muster_${variant}.${ext} (${(blob.size / 1e6).toFixed(1)} MB)` +
    (ext === 'webm' ? ' · dieser Browser kann kein MP4 aufnehmen, daher WebM.' : ''));
}

/* Für das GIF genau EINE Kachel ohne Streuung rendern – dadurch lässt sich
   das Ergebnis vertikal nahtlos wiederholen und bleibt klein. */
function animMakeStrip(W) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + W + 'px;height:400px;';
  document.body.appendChild(host);
  const cfg = Object.assign({}, animState, { singleTile: true, jitter: 0 });
  return { wave: PatternWave.fromPoints(host, window.PW_TILE_POINTS, cfg), host };
}

function animDrawStrip(ctx, wave, W, H) {
  ctx.fillStyle = wave.config.bg || ANIM_BG;
  ctx.fillRect(0, 0, W, H);
  return animSvgFrame(wave).then(img => {
    ctx.drawImage(img, 0, 0, parseFloat(wave.svg.style.width), H);
  });
}

async function animExportGIF() {
  if (!window.gifenc) { animStatus('GIF-Encoder nicht geladen.'); return; }
  const W = animEven(ANIM_EXPORT.gifWidth);
  const strip = animMakeStrip(W);
  const wave = strip.wave;
  const H = animEven(Math.round(parseFloat(wave.svg.style.height)));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const fps = ANIM_EXPORT.gifFps, loop = wave.config.loopDuration, N = Math.round(fps * loop);
  const { GIFEncoder, quantize, applyPalette } = window.gifenc;

  wave.config.respectReducedMotion = false;
  wave.pause();

  // Farbpalette aus einem voll sichtbaren Bild in der Loop-Mitte ableiten
  wave.renderAt(loop * 0.5);
  await animDrawStrip(ctx, wave, W, H);
  const palette = quantize(ctx.getImageData(0, 0, W, H).data, 256);

  const enc = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < N; i++) {
    wave.renderAt(i / fps);
    await animDrawStrip(ctx, wave, W, H);
    const idx = applyPalette(ctx.getImageData(0, 0, W, H).data, palette);
    enc.writeFrame(idx, W, H, i === 0 ? { palette, delay, repeat: 0 } : { palette, delay });
    animStatus(`GIF: Bild ${i + 1} von ${N} …`);
    await animSleep(0);
  }
  enc.finish();
  wave.destroy();
  strip.host.remove();

  const blob = new Blob([enc.bytes()], { type: 'image/gif' });
  animDownload(blob, 'mc_Muster_Reihe.gif');
  animStatus(`✓ mc_Muster_Reihe.gif (${(blob.size / 1e6).toFixed(1)} MB · ${W} × ${H} px · ` +
    'eine Kachelreihe, vertikal nahtlos wiederholbar)');
}

function animRunExport(fn) {
  const btns = document.querySelectorAll('.anim-exp-btn');
  btns.forEach(b => { b.disabled = true; });
  Promise.resolve().then(fn)
    .catch(e => { animStatus('Fehler: ' + e.message); console.error(e); })
    .then(() => { btns.forEach(b => { b.disabled = false; }); });
}

// ---------------------------------------------------------------------
// 5. ÖFFNEN / SCHLIESSEN
// ---------------------------------------------------------------------
function animOpen() {
  if (!animState) animState = animDefaults();
  document.getElementById('main-view').style.display = 'none';
  const mc = document.getElementById('main-controls');
  if (mc) mc.style.display = 'none';
  hideHubView();
  document.getElementById('anim-view').classList.add('visible');
  animOpened = true;

  if (!animMounted) {
    animBuildPresets();
    animBuildControls();
    // Erst mounten, wenn die Karten wirklich Maße haben
    requestAnimationFrame(() => {
      animMountAll();
      animWaves.forEach(w => w.play());
    });
  } else {
    animWaves.forEach(w => w.play());
  }
}

function animClose() {
  animWaves.forEach(w => w.pause());
  document.getElementById('anim-view').classList.remove('visible');
  document.getElementById('main-view').style.display = 'block';
  animOpened = false;
  if (typeof hubVisible !== 'undefined' && hubVisible) restoreHubView();
  else { const mc = document.getElementById('main-controls'); if (mc) mc.style.display = 'flex'; }
}

function animInit() {
  const tile = document.getElementById('tile-animation');
  if (!tile) return;
  tile.addEventListener('click', animOpen);
  document.getElementById('anim-back').addEventListener('click', animClose);

  document.getElementById('anim-exp-desktop').addEventListener('click',
    () => animRunExport(() => animExportVideo('desktop')));
  document.getElementById('anim-exp-mobile').addEventListener('click',
    () => animRunExport(() => animExportVideo('mobile')));
  document.getElementById('anim-exp-gif').addEventListener('click',
    () => animRunExport(animExportGIF));

  const gw = document.getElementById('anim-gif-width');
  const gf = document.getElementById('anim-gif-fps');
  if (gw) gw.addEventListener('change', () => { ANIM_EXPORT.gifWidth = parseInt(gw.value, 10); });
  if (gf) gf.addEventListener('change', () => { ANIM_EXPORT.gifFps = parseInt(gf.value, 10); });

  document.getElementById('anim-reset').addEventListener('click', () => {
    animState = animDefaults();
    animApply(animState);
    animSyncInputs();
    animStatus('Einstellungen zurückgesetzt.');
  });

  let rt;
  window.addEventListener('resize', () => {
    if (!animOpened || !animMounted) return;
    clearTimeout(rt);
    rt = setTimeout(() => animWaves.forEach(w => w.rebuild()), 160);
  });
}

animInit();
