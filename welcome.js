// =====================================================================
// WILLKOMMENSBILDSCHIRM GENERATOR (Samsung Frame TV im Büro)
// Reiner Canvas-Generator: schwarzer Hintergrund, mc-Marke oben links,
// drei feste Lime-Kästen ("Willkommen"/"Bienvenue"/"Welcome") und darunter
// das jeweilige Kundenlogo (weiß eingefärbt) oder ersatzweise der
// Kundenname als Text. Design aus 240523_mc_Kunden_Welcome_Frame.pdf
// abgeleitet (16 Folien, per PDFKit gesichtet).
// =====================================================================

// ---------------------------------------------------------------------
// 1. KONSTANTEN
// ---------------------------------------------------------------------
const WSG_W = 1920, WSG_H = 1080; // logische Editier-Auflösung; Export skaliert dieselbe Zeichenfunktion hoch
const WSG_LIME = '#cefb0b';
const WSG_LOGO_MAX_BYTES = 300 * 1024;

// Drei feste Kästen, als Fraktionen von W/H (aus der Vorlage vermessen)
const WSG_BOXES = [
  { text: 'Willkommen', x: 0.189,  y: 0.264,  w: 0.386, h: 0.145 },
  { text: 'Bienvenue',  x: 0.592,  y: 0.3125, w: 0.217, h: 0.1016 },
  { text: 'Welcome',    x: 0.3779, y: 0.4448, w: 0.245, h: 0.1296 }
];

// Kundenlogo-/Text-Zone: horizontal zentriert, vertikal um ~76 % der Höhe,
// contain-fit in eine Box mit Breiten- UND Höhen-Obergrenze (deckt sowohl
// breite Wortmarken als auch hohe Badges/zweizeilige Lockups ab).
const WSG_ZONE = { cx: 0.5, cy: 0.76, maxW: 0.58, maxH: 0.23 };

// mc-Kurzlogo oben links – Quelltext von assets/logo-mc/logo-short-white.svg
// direkt eingebettet (wie schon bei den Intranet-Kachel-Icons in intranet.js).
// Kein Netzwerk-/Dateizugriff nötig: bei Aufruf per Doppelklick (file://)
// scheitert dort sogar fetch() an CORS, ein per <img src="…"> aus dem Netz
// geladenes Bild würde außerdem die Canvas „taintet" und toDataURL() beim
// Export lautlos mit einer SecurityError-Exception scheitern lassen.
const WSG_MC_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42.05 16.67"><path fill="#fff" d="M24.21,6.51v9.45h-3.06V7.15c0-2.94-.87-4.2-2.92-4.2-2.62,0-4.6,2.11-4.6,4.9v8.1h-3.06V7.15c0-2.94-.82-4.2-2.75-4.2-2.76,0-4.77,2.06-4.77,4.9v8.1H0V.4h2.99v2.42c.55-.68.89-1.01,1.46-1.42,1-.73,2.24-1.09,3.68-1.09,2.29,0,3.86.98,4.9,3.08.66-.84,1.01-1.19,1.61-1.67,1.22-.93,2.58-1.4,4.06-1.4,3.45,0,5.51,2.32,5.51,6.21ZM38.42,13.59c-.81.28-1.67.43-2.55.43-3.2,0-5.27-2.15-5.27-5.48,0-3.52,2.26-5.88,5.61-5.88,1.53,0,3.04.49,4.89,1.58l.32.19.38-2.84-.15-.08c-1.93-1.03-3.71-1.51-5.61-1.51-5.01,0-8.5,3.5-8.5,8.5s3.21,8.17,8.17,8.17c1.56,0,3.25-.35,4.64-.96.31-.12.71-.3,1.17-.55l.12-.06.42-3.56-.46.33c-1.4,1.01-2.02,1.35-3.17,1.72Z"/></svg>';
const WSG_MC_LOGO_ASPECT = 42.05 / 16.67;
// margin bezieht sich bewusst auf H für beide Richtungen (nicht getrennt auf
// W/H), sonst wären die Abstände links/oben bei einem 16:9-Format nie gleich.
const WSG_MC_LOGO = { margin: 0.072, h: 0.032 };

// ---------------------------------------------------------------------
// 2. STATE
// ---------------------------------------------------------------------
let wsgMode = 'logo';            // 'logo' | 'text'
let wsgLogo = null;              // { img, vbW, vbH } – sanitiertes, weißes Logo
let wsgName = '';
let wsgExportW = 1920, wsgExportH = 1080;
let wsgExportName = '';          // Kundenname für den Dateinamen (unabhängig von wsgName im Text-Modus)
let wsgMcLogoImg = null;
let wsgFontsReady = false;
let wsgMounted = false;

// DOM
let wsgCanvas, wsgCtx, wsgWrapper, wsgDropHint;

// ---------------------------------------------------------------------
// 3. LOGO-SANITIZER (Kopie von itkSanitizeIconSVG, aber erzwingt WEISS
//    statt schwarz – intranet.js bleibt dafür unangetastet, da Icons dort
//    weiterhin schwarz bleiben müssen)
// ---------------------------------------------------------------------
function wsgSanitizeLogoSVG(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) return null;

  root.querySelectorAll('script, foreignObject').forEach(n => n.remove());
  root.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
  });

  const SHAPE = 'path, rect, circle, ellipse, polygon, polyline, line';
  root.querySelectorAll(SHAPE).forEach(el => {
    const hasStroke = el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none';
    const fillNone = el.getAttribute('fill') === 'none' || /fill:\s*none/i.test(el.getAttribute('style') || '');
    el.removeAttribute('style');
    if (fillNone && hasStroke) {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', '#ffffff');
    } else {
      el.setAttribute('fill', '#ffffff');
      el.removeAttribute('stroke');
    }
  });

  let vb = (root.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some(isNaN)) {
    const w = parseFloat(root.getAttribute('width')) || 100;
    const h = parseFloat(root.getAttribute('height')) || 100;
    vb = [0, 0, w, h];
  }
  root.setAttribute('viewBox', vb.join(' '));
  root.removeAttribute('width');
  root.removeAttribute('height');

  return { svg: new XMLSerializer().serializeToString(root), vbW: vb[2], vbH: vb[3] };
}

function wsgLoadLogo(svgText) {
  return new Promise(resolve => {
    const clean = wsgSanitizeLogoSVG(svgText);
    if (!clean) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ img, vbW: clean.vbW, vbH: clean.vbH });
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean.svg);
  });
}

async function wsgHandleLogoUpload(file) {
  if (!file) return;
  if (file.size > WSG_LOGO_MAX_BYTES) { showToast('SVG zu groß (max. 300 KB)'); return; }
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') { showToast('Bitte eine SVG-Datei wählen'); return; }
  const text = await file.text();
  const rec = await wsgLoadLogo(text);
  if (!rec) { showToast('SVG konnte nicht gelesen werden'); return; }
  wsgLogo = rec;
  wsgSyncDropHint();
  wsgRedraw();
  showToast('Logo eingesetzt');
}

// ---------------------------------------------------------------------
// 4. ZEICHNEN
// ---------------------------------------------------------------------
function wsgFitText(ctx, text, maxW, startSize, weight) {
  let size = startSize;
  ctx.font = weight + ' ' + size + 'px "Rambla Alt Oscura"';
  while (size > 10 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = weight + ' ' + size + 'px "Rambla Alt Oscura"';
  }
  return size;
}

function wsgDraw(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // mc-Kurzlogo oben links – Abstand nach links/oben bewusst beide aus H
  // berechnet, damit sie bei 16:9 immer exakt gleich groß sind.
  if (wsgMcLogoImg && wsgMcLogoImg.complete) {
    const h = WSG_MC_LOGO.h * H;
    const w = h * WSG_MC_LOGO_ASPECT;
    const margin = WSG_MC_LOGO.margin * H;
    ctx.drawImage(wsgMcLogoImg, margin, margin, w, h);
  }

  // Drei feste Willkommens-Kästen – Text füllt den Kasten mit etwas
  // Randabstand, statt fest auf einen Bruchteil der Kastenhöhe gesetzt zu
  // sein (das ließ ihn bei den schmaleren Kästen zu klein wirken).
  WSG_BOXES.forEach(b => {
    const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
    ctx.fillStyle = WSG_LIME;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const pad = w * 0.055;
    const size = wsgFitText(ctx, b.text, w - pad * 2, Math.round(h * 0.78), '700');
    ctx.font = '700 ' + size + 'px "Rambla Alt Oscura"';
    ctx.fillText(b.text, x + pad, y + h * 0.53);
  });

  // Kundenlogo ODER Kundenname
  const zoneCX = WSG_ZONE.cx * W, zoneCY = WSG_ZONE.cy * H;
  const zoneMaxW = WSG_ZONE.maxW * W, zoneMaxH = WSG_ZONE.maxH * H;

  if (wsgMode === 'logo' && wsgLogo) {
    const scale = Math.min(zoneMaxW / wsgLogo.vbW, zoneMaxH / wsgLogo.vbH);
    const dw = wsgLogo.vbW * scale, dh = wsgLogo.vbH * scale;
    ctx.drawImage(wsgLogo.img, zoneCX - dw / 2, zoneCY - dh / 2, dw, dh);
  } else if (wsgMode === 'text' && wsgName.trim()) {
    const size = wsgFitText(ctx, wsgName, zoneMaxW, Math.round(zoneMaxH * 0.6), '700');
    ctx.font = '700 ' + size + 'px "Rambla Alt Oscura"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wsgName, zoneCX, zoneCY);
  }
}

function wsgRedraw() {
  if (!wsgCtx) return;
  wsgDraw(wsgCtx, WSG_W, WSG_H);
}

function wsgSyncDropHint() {
  const hasContent = (wsgMode === 'logo' && wsgLogo) || (wsgMode === 'text' && wsgName.trim());
  wsgDropHint.classList.toggle('hidden', !!hasContent);
}

// ---------------------------------------------------------------------
// 5. STEUERUNG
// ---------------------------------------------------------------------
function wsgSelectMode(mode) {
  wsgMode = mode;
  document.querySelectorAll('#wsg-mode-group .filter-chip').forEach(c => c.classList.toggle('active', c.dataset.mode === mode));
  document.getElementById('wsg-logo-group').style.display = mode === 'logo' ? '' : 'none';
  document.getElementById('wsg-text-group').style.display = mode === 'text' ? '' : 'none';
  wsgSyncDropHint();
  wsgRedraw();
}

function wsgInitControls() {
  document.querySelectorAll('#wsg-mode-group .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => wsgSelectMode(chip.dataset.mode));
  });

  document.getElementById('wsg-upload-btn').addEventListener('click', () => document.getElementById('wsg-file-input').click());
  document.getElementById('wsg-file-input').addEventListener('change', e => {
    wsgHandleLogoUpload(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('wsg-remove-btn').addEventListener('click', () => {
    wsgLogo = null;
    wsgSyncDropHint();
    wsgRedraw();
  });

  document.getElementById('wsg-name-input').addEventListener('input', e => {
    wsgName = e.target.value;
    wsgSyncDropHint();
    wsgRedraw();
  });

  wsgWrapper.addEventListener('dragover', e => { e.preventDefault(); wsgWrapper.classList.add('dragover'); });
  wsgWrapper.addEventListener('dragleave', () => wsgWrapper.classList.remove('dragover'));
  wsgWrapper.addEventListener('drop', e => {
    e.preventDefault();
    wsgWrapper.classList.remove('dragover');
    if (wsgMode !== 'logo') wsgSelectMode('logo');
    wsgHandleLogoUpload(e.dataTransfer.files[0]);
  });

  document.querySelectorAll('#wsg-res-group .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#wsg-res-group .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      wsgExportW = parseInt(chip.dataset.w, 10);
      wsgExportH = parseInt(chip.dataset.h, 10);
    });
  });

  document.getElementById('wsg-reset').addEventListener('click', () => {
    wsgLogo = null;
    wsgName = '';
    wsgExportName = '';
    document.getElementById('wsg-name-input').value = '';
    wsgExportW = WSG_W; wsgExportH = WSG_H;
    document.querySelectorAll('#wsg-res-group .filter-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    wsgSelectMode('logo');
    showToast('Zurückgesetzt');
  });

  document.getElementById('wsg-download').addEventListener('click', wsgOpenNamePrompt);

  const nameOverlay = document.getElementById('wsg-name-overlay');
  const nameInput = document.getElementById('wsg-export-name-input');
  document.getElementById('wsg-name-cancel').addEventListener('click', wsgCloseNamePrompt);
  document.getElementById('wsg-name-confirm').addEventListener('click', wsgConfirmNamePrompt);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') wsgConfirmNamePrompt();
    else if (e.key === 'Escape') wsgCloseNamePrompt();
  });
  nameOverlay.addEventListener('click', e => { if (e.target === nameOverlay) wsgCloseNamePrompt(); });
}

// Kundenname wird nur für den Dateinamen abgefragt (unabhängig vom Motiv
// selbst) – deshalb ein eigener kleiner Dialog statt einer Pflichtangabe
// im Editor, die im Logo-Modus sonst ungenutzt bliebe.
function wsgOpenNamePrompt() {
  const input = document.getElementById('wsg-export-name-input');
  input.value = wsgExportName || wsgName || '';
  document.getElementById('wsg-name-overlay').classList.add('visible');
  input.focus();
  input.select();
}

function wsgCloseNamePrompt() {
  document.getElementById('wsg-name-overlay').classList.remove('visible');
}

function wsgConfirmNamePrompt() {
  const input = document.getElementById('wsg-export-name-input');
  const name = input.value.trim();
  if (!name) { showToast('Bitte einen Kundennamen eingeben'); return; }
  wsgExportName = name;
  wsgCloseNamePrompt();
  wsgExport();
}

function wsgFilenamePart(str) {
  return str.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}

function wsgTodayStamp() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yy + mm + dd;
}

function wsgExport() {
  try {
    const kunde = wsgFilenamePart(wsgExportName || 'Kunde');
    const finish = canvas => {
      const link = document.createElement('a');
      link.download = `${wsgTodayStamp()}_mc_Frame_Screensaver_${kunde}_${canvas.width}x${canvas.height}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
    if (wsgExportW === WSG_W && wsgExportH === WSG_H) {
      finish(wsgCanvas);
      return;
    }
    const off = document.createElement('canvas');
    off.width = wsgExportW; off.height = wsgExportH;
    wsgDraw(off.getContext('2d'), wsgExportW, wsgExportH);
    finish(off);
  } catch (e) {
    // Passiert z. B. bei einer "getainteten" Canvas (Bild ohne saubere
    // CORS-Freigabe geladen) – dann liefert toDataURL() sonst nur eine
    // stille SecurityError-Exception statt eines sichtbaren Downloads.
    console.error('wsgExport fehlgeschlagen', e);
    showToast('Export fehlgeschlagen – bitte Seite neu laden und erneut versuchen');
  }
}

// ---------------------------------------------------------------------
// 6. ÖFFNEN / SCHLIESSEN
// ---------------------------------------------------------------------
function wsgOpen() {
  document.getElementById('main-view').style.display = 'none';
  const mc = document.getElementById('main-controls');
  if (mc) mc.style.display = 'none';
  hideHubView();
  document.getElementById('wsg-view').classList.add('visible');

  if (!wsgMounted) {
    wsgMounted = true;
    wsgCanvas = document.getElementById('wsg-canvas');
    wsgCtx = wsgCanvas.getContext('2d');
    wsgWrapper = document.getElementById('wsg-wrapper');
    wsgDropHint = document.getElementById('wsg-drop-hint');

    // Direkt aus dem eingebetteten Quelltext laden (Data-URI) – kein
    // fetch()/Netzwerkpfad, der bei file://-Aufruf scheitern bzw. die
    // Canvas „taintet" und toDataURL() beim Export lautlos mit einer
    // SecurityError-Exception fehlschlagen lassen würde.
    wsgMcLogoImg = new Image();
    wsgMcLogoImg.onload = wsgRedraw;
    wsgMcLogoImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(WSG_MC_LOGO_SVG);

    wsgInitControls();
    wsgRedraw();

    // Sofort einmal zeichnen (Ersatzschrift), danach mit der echten
    // Rambla-Alt-Oscura nachzeichnen, sobald sie geladen ist – sonst könnte
    // ein sehr früher Export noch in der Systemschrift erfolgen.
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 60px "Rambla Alt Oscura"').then(wsgRedraw).catch(() => {});
    }
  }
}

function wsgClose() {
  document.getElementById('wsg-view').classList.remove('visible');
  document.getElementById('main-view').style.display = 'block';
  if (typeof hubVisible !== 'undefined' && hubVisible) restoreHubView();
  else { const mc = document.getElementById('main-controls'); if (mc) mc.style.display = 'flex'; }
}

function wsgInit() {
  const tile = document.getElementById('tile-welcome');
  if (!tile) return;
  tile.addEventListener('click', wsgOpen);
  document.getElementById('wsg-back').addEventListener('click', wsgClose);
}

wsgInit();
