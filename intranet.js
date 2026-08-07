// =====================================================================
// INTRANET KACHEL GENERATOR – mc Brand Hub
// Bild hochladen, mit Verlaufshintergrund und/oder zentriertem Icon
// versehen, live in allen Intranet-Ausspielformaten prüfen, als JPG
// exportieren.
// Architektur wie in der Vorlage (widget-generator.html): ein Master-
// Canvas (1180×623) wird bearbeitet, alle Formate sind Center-Crops
// daraus und aktualisieren sich bei jedem redraw() mit.
// =====================================================================

const ITK_W = 1180, ITK_H = 623;
const ITK_LIME = '#cefb0b';

// ---------------------------------------------------------------------
// 1. FORMATE (Unily-Intranet-Ausspielformate, unverändert aus der Vorlage)
// ---------------------------------------------------------------------
const ITK_FORMATS = [
  { name: 'Main Image',             w: 1180, h: 623, scale: 0.40 },
  { name: 'Story Page',             w: 1108, h: 623, scale: 0.35 },
  { name: 'Large Panorama',         w: 1140, h: 380, scale: 0.35 },
  { name: 'Widget Main',            w: 755,  h: 424, scale: 0.35 },
  { name: 'Widget Small',           w: 755,  h: 424, scale: 0.28 },
  { name: 'Rollup Hero Image',      w: 565,  h: 320, scale: 0.35 },
  { name: 'Panorama',               w: 600,  h: 400, scale: 0.35 },
  { name: 'Smart Feed',             w: 377,  h: 368, scale: 0.38 },
  { name: 'HD Landscape',           w: 640,  h: 360, scale: 0.32 },
  { name: 'SD Landscape',           w: 640,  h: 480, scale: 0.28 },
  { name: 'News Grid Large',        w: 570,  h: 570, scale: 0.28 },
  { name: 'Large Square',           w: 720,  h: 720, scale: 0.22 },
  { name: 'Large Rectangle',        w: 720,  h: 576, scale: 0.25 },
  { name: 'Rectangle',              w: 720,  h: 360, scale: 0.28 },
  { name: 'Story Page Mobile',      w: 450,  h: 255, scale: 0.38 },
  { name: 'Microsite',              w: 308,  h: 220, scale: 0.48 },
  { name: 'Medium Square',          w: 360,  h: 360, scale: 0.35 },
  { name: 'Card Image',             w: 360,  h: 180, scale: 0.40 },
  { name: 'Small Rectangle',        w: 360,  h: 288, scale: 0.35 },
  { name: 'HD Portrait',            w: 360,  h: 640, scale: 0.28 },
  { name: 'Stories Archive',        w: 274,  h: 274, scale: 0.42 },
  { name: 'Stories Archive Video',  w: 271,  h: 154, scale: 0.48 },
  { name: 'News Grid Small',        w: 285,  h: 285, scale: 0.40 },
  { name: 'Smart Feed Small',       w: 187,  h: 119, scale: 0.65 },
  { name: 'Small Square',           w: 55,   h: 55,  scale: 1.45 }
];

// ---------------------------------------------------------------------
// 2. DESIGN-POSITIONEN für den Verlaufshintergrund (8 Optionen + „kein“)
// ---------------------------------------------------------------------
const ITK_LAYOUTS = [
  { id: 0, label: 'Kein Design',   area: null },
  { id: 1, label: 'Unten schmal',  area: { x: 0,    y: 0.82, w: 1,    h: 0.18 } },
  { id: 2, label: 'Unten mittel',  area: { x: 0,    y: 0.65, w: 1,    h: 0.35 } },
  { id: 3, label: 'Unten groß',    area: { x: 0,    y: 0.50, w: 1,    h: 0.50 } },
  { id: 4, label: 'Oben schmal',   area: { x: 0,    y: 0,    w: 1,    h: 0.18 } },
  { id: 5, label: 'Links schmal',  area: { x: 0,    y: 0,    w: 0.20, h: 1 } },
  { id: 6, label: 'Links breit',   area: { x: 0,    y: 0,    w: 0.35, h: 1 } },
  { id: 7, label: 'Rechts schmal', area: { x: 0.80, y: 0,    w: 0.20, h: 1 } },
  { id: 8, label: 'Rechts breit',  area: { x: 0.65, y: 0,    w: 0.35, h: 1 } }
];

// ---------------------------------------------------------------------
// 3. VERLAUFSHINTERGRÜNDE (4 Verläufe, ersetzen die Muster der Vorlage)
// ---------------------------------------------------------------------
const ITK_GRADIENTS = [
  { key: 'g1', label: 'Verlauf 1', src: 'assets/intranet/verlauf-1.png' },
  { key: 'g2', label: 'Verlauf 2', src: 'assets/intranet/verlauf-2.png' },
  { key: 'g3', label: 'Verlauf 3', src: 'assets/intranet/verlauf-3.png' },
  { key: 'g4', label: 'Verlauf 4', src: 'assets/intranet/verlauf-4.png' }
];
const itkGradImgs = {}; // key -> Image

// ---------------------------------------------------------------------
// 4. ICONS – 5 mitgelieferte + eigener Upload. Immer schwarz auf Lime,
//    unabhängig davon, welche Farbe die Quelle mitbringt.
// ---------------------------------------------------------------------
const ITK_ICONS = [
  { key: 'party', label: 'Party', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="m16.057 25.106c-1.097.404-2.49.916-4.252 1.569-3.009-.42-6.171-1.399-7.538-3.646.498-1.341.932-2.516 1.316-3.553 2.576 2.976 7.077 4.866 10.474 5.63z"/><path d="m16.931 15.069c-2.928-2.927-6.698-5.089-8.235-3.549-.328.328-.229.132-2.508 6.317 2.43 3.507 8.57 5.956 12.847 6.171 1.279-.481 1.249-.505 1.446-.703 1.885-1.885-1.666-6.353-3.55-8.236zm2.488 7.174c-.143.145-.808.152-1.989-.431-1.284-.635-2.749-1.742-4.125-3.118-3.188-3.188-3.933-5.73-3.549-6.114.06-.06.172-.092.331-.092.861 0 3.092.951 5.784 3.642 1.376 1.376 2.484 2.841 3.119 4.125.583 1.179.573 1.845.429 1.988z"/><path d="m9.059 27.694c-1.732.644-3.729 1.39-6.048 2.259-.603.222-1.187-.364-.964-.964.584-1.564 1.111-2.978 1.591-4.268 1.318 1.514 3.3 2.432 5.421 2.973z"/><path d="m19.669 3.895c-.467.082-.918.156-1.224.31.46.706 1.421 1.605.834 2.779-.525 1.05-1.616.988-2.563 1.021.581.794 1.253 1.599.735 2.636-.537 1.075-1.945 1.298-2.776 1.433-.269.044-.519-.136-.569-.403l-.182-.982c-.051-.273.133-.536.406-.584.473-.083.916-.155 1.224-.31-.462-.701-1.419-1.609-.835-2.778.524-1.047 1.614-.988 2.563-1.021-.582-.794-1.253-1.599-.735-2.636.537-1.074 1.946-1.298 2.775-1.433.269-.044.519.136.568.403l.182.982c.053.273-.129.535-.403.583z"/><path d="m28.689 11.925.982.182c.268.05.447.3.403.568-.135.829-.359 2.238-1.433 2.775-1.037.518-1.842-.153-2.636-.735-.033.949.026 2.04-1.021 2.563-1.169.584-2.077-.373-2.778-.835-.155.308-.227.751-.31 1.224-.048.274-.311.457-.584.406l-.982-.182c-.268-.05-.447-.3-.403-.569.135-.83.359-2.238 1.433-2.776 1.036-.518 1.842.154 2.636.735.033-.947-.029-2.039 1.021-2.563 1.174-.587 2.073.374 2.779.834.154-.306.228-.757.31-1.224.047-.271.309-.453.583-.403z"/><path d="m25.7 21h-1.9c-.166 0-.3-.134-.3-.3v-.9c0-.166.134-.3.3-.3h1.9c.166 0 .3.134.3.3v.9c0 .166-.134.3-.3.3z"/><path d="m27.788 3.273-1.344 1.344c-.117.117-.307.117-.424 0l-.636-.637c-.117-.117-.117-.307 0-.424l1.344-1.344c.117-.117.307-.117.424 0l.636.636c.117.117.117.307 0 .425z"/><path d="m12.2 6.5h-.9c-.166 0-.3-.134-.3-.3v-1.9c0-.166.134-.3.3-.3h.9c.166 0 .3.134.3.3v1.9c0 .166-.134.3-.3.3z"/><path d="m19.383 13.255-.75-.5c-.141-.094-.182-.284-.085-.423 2.041-2.904 5.976-5.931 10.139-6.077.171-.005.313.137.313.307v.901c0 .16-.126.285-.286.292-3.483.138-7.051 2.761-8.928 5.424-.093.133-.269.166-.403.076z"/></svg>' },
  { key: 'aufruf', label: 'Aufruf', svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="m15.87882 15.08708h-8.87659c-1.65125 0-3.00223 1.35104-3.00223 3.00223v14.74094c0 1.65125 1.35098 3.00223 3.00223 3.00223h8.87659z"/><path d="m49.95414 6.91102c-1.11248-.54566-2.41062-.32765-3.32247.48035-6.08708 4.97236-13.89881 7.71874-21.74616 7.69568 0 .00002-7.0052.00002-7.0052.00002v20.7454h7.00521c7.88972-.03305 15.61756 2.73346 21.79623 7.73577 1.8495 1.66611 5.06814.24231 4.98363-2.27181.00005.00012.00005-31.67339.00005-31.67339 0-1.17091-.65051-2.21167-1.71129-2.71204z"/><path d="m53.66692 17.59895v15.71169c8.44644-1.914 8.44177-13.80043 0-15.71169z"/><path d="m22.22357 37.83397h-11.68868l7.74575 17.14275c.66046 1.46111 2.12157 2.41183 3.73275 2.41183 2.60236.06921 4.68895-2.62641 3.9629-5.13387.00007.00005-3.75272-14.42071-3.75272-14.42071z"/></svg>' },
  { key: 'event', label: 'Event', svg: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect height="6" rx="2" width="4" x="11" y="3"/><rect height="6" rx="2" width="4" x="33" y="3"/><path d="m4 18v23c0 2.209 1.791 4 4 4h32c2.209 0 4-1.791 4-4v-23zm12 20c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2zm0-11c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2zm11 11c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2zm0-11c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2zm11 11c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2zm0-11c0 1.105-.895 2-2 2h-2c-1.105 0-2-.895-2-2v-2c0-1.105.895-2 2-2h2c1.105 0 2 .895 2 2z"/><path d="m44 16v-6c0-2.209-1.791-4-4-4h-1v1c0 2.206-1.794 4-4 4s-4-1.794-4-4v-1h-14v1c0 2.206-1.794 4-4 4s-4-1.794-4-4v-1h-1c-2.209 0-4 1.791-4 4v6z"/></svg>' },
  { key: 'team', label: 'Team', svg: '<svg viewBox="0 0 511.999 511.999" xmlns="http://www.w3.org/2000/svg"><path d="M438.09,273.32h-39.596c4.036,11.05,6.241,22.975,6.241,35.404v149.65c0,5.182-0.902,10.156-2.543,14.782h65.461c24.453,0,44.346-19.894,44.346-44.346v-81.581C512,306.476,478.844,273.32,438.09,273.32z"/><path d="M107.265,308.725c0-12.43,2.205-24.354,6.241-35.404H73.91c-40.754,0-73.91,33.156-73.91,73.91v81.581c0,24.452,19.893,44.346,44.346,44.346h65.462c-1.641-4.628-2.543-9.601-2.543-14.783V308.725z"/><path d="M301.261,234.815h-90.522c-40.754,0-73.91,33.156-73.91,73.91v149.65c0,8.163,6.618,14.782,14.782,14.782h208.778c8.164,0,14.782-6.618,14.782-14.782v-149.65C375.171,267.971,342.015,234.815,301.261,234.815z"/><path d="M256,38.84c-49.012,0-88.886,39.874-88.886,88.887c0,33.245,18.349,62.28,45.447,77.524c12.853,7.23,27.671,11.362,43.439,11.362c15.768,0,30.586-4.132,43.439-11.362c27.099-15.244,45.447-44.28,45.447-77.524C344.886,78.715,305.012,38.84,256,38.84z"/><path d="M99.918,121.689c-36.655,0-66.475,29.82-66.475,66.475c0,36.655,29.82,66.475,66.475,66.475c9.298,0,18.152-1.926,26.195-5.388c13.906-5.987,25.372-16.585,32.467-29.86c4.98-9.317,7.813-19.946,7.813-31.227C166.393,151.51,136.573,121.689,99.918,121.689z"/><path d="M412.082,121.689c-36.655,0-66.475,29.82-66.475,66.475c0,11.282,2.833,21.911,7.813,31.227c7.095,13.276,18.561,23.874,32.467,29.86c8.043,3.462,16.897,5.388,26.195,5.388c36.655,0,66.475-29.82,66.475-66.475C478.557,151.509,448.737,121.689,412.082,121.689z"/></svg>' },
  { key: 'emotionen', label: 'Emotionen', svg: '<svg viewBox="0 0 512.001 512.001" xmlns="http://www.w3.org/2000/svg"><path d="m256.001 477.407c-2.59 0-5.179-.669-7.499-2.009-2.52-1.454-62.391-36.216-123.121-88.594-35.994-31.043-64.726-61.833-85.396-91.513-26.748-38.406-40.199-75.348-39.982-109.801.254-40.09 14.613-77.792 40.435-106.162 26.258-28.848 61.3-44.734 98.673-44.734 47.897 0 91.688 26.83 116.891 69.332 25.203-42.501 68.994-69.332 116.891-69.332 35.308 0 68.995 14.334 94.859 40.362 28.384 28.563 44.511 68.921 44.247 110.724-.218 34.393-13.921 71.279-40.728 109.632-20.734 29.665-49.426 60.441-85.279 91.475-60.508 52.373-119.949 87.134-122.45 88.588-2.331 1.354-4.937 2.032-7.541 2.032z"/></svg>' }
];
const itkIconCache = {}; // key ('party' … oder 'custom') -> { img, vbW, vbH }
const ITK_ICON_MAX_BYTES = 300 * 1024;

// ---------------------------------------------------------------------
// 5. STATE
// ---------------------------------------------------------------------
let itkImg = null;
let itkImgX = 0, itkImgY = 0, itkImgScale = 1;
let itkGrad = 'none';           // 'none' | 'g1'…'g4'
let itkLayout = 0;               // Index in ITK_LAYOUTS
let itkGradScale = 1;
let itkGradOffX = 0, itkGradOffY = 0;
let itkDragMode = 'photo';       // 'photo' | 'grad'
let itkIconKey = 'none';         // 'none' | 'party' | … | 'custom'
let itkCustomIconLabel = 'Eigenes SVG';
let itkIsDragging = false, itkDragSX = 0, itkDragSY = 0, itkDragIX = 0, itkDragIY = 0;
let itkPinchDist = 0, itkPinchScale = 1;
let itkMounted = false;

// ---------------------------------------------------------------------
// 6. DOM
// ---------------------------------------------------------------------
let itkCanvas, itkCtx, itkCanvasWrap, itkDropHint;
let itkPreviewCanvases = [];

// ---------------------------------------------------------------------
// 7. ICON-SANITIZER
// Erzwingt Schwarz auf allen Formen, entfernt Skripte/Handler – gilt
// gleich für die 5 mitgelieferten Icons wie für eigene Uploads, damit
// „richtig eingefärbt“ nie vom Original abhängt.
// ---------------------------------------------------------------------
function itkSanitizeIconSVG(svgText) {
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
      el.setAttribute('stroke', '#000000');
    } else {
      el.setAttribute('fill', '#000000');
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

function itkLoadIcon(key, svgText) {
  return new Promise(resolve => {
    const clean = itkSanitizeIconSVG(svgText);
    if (!clean) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const rec = { img, vbW: clean.vbW, vbH: clean.vbH, svgText: clean.svg };
      itkIconCache[key] = rec;
      resolve(rec);
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean.svg);
  });
}

// ---------------------------------------------------------------------
// 8. RENDERING
// ---------------------------------------------------------------------
function itkLayoutRect(area) {
  return { x: area.x * ITK_W, y: area.y * ITK_H, w: area.w * ITK_W, h: area.h * ITK_H };
}

const ITK_ICON_FIXED_SCALE = 2; // Icon-Größe ist bewusst festgesetzt (200%), nicht editierbar

/* Fläche, die vom Verlaufshintergrund NICHT bedeckt wird. Alle 8 Design-
   Positionen sitzen an genau einer Kante (oben/unten/links/rechts) – die
   sichtbare Restfläche ist daher immer die gegenüberliegende Seite. Das
   Icon zentriert sich auf dieser Restfläche, nicht auf dem ganzen Bild,
   damit es nie vom Verlauf verdeckt wird. */
function itkVisibleRect() {
  const full = { x: 0, y: 0, w: ITK_W, h: ITK_H };
  if (itkGrad === 'none') return full;
  const layout = ITK_LAYOUTS[itkLayout];
  if (!layout.area) return full;
  const a = layout.area;
  if (a.w === 1) { // volle Breite -> Design liegt oben oder unten
    return a.y === 0
      ? { x: 0, y: a.h * ITK_H, w: ITK_W, h: (1 - a.h) * ITK_H }   // oben belegt -> Rest unten
      : { x: 0, y: 0, w: ITK_W, h: a.y * ITK_H };                   // unten belegt -> Rest oben
  }
  if (a.h === 1) { // volle Höhe -> Design liegt links oder rechts
    return a.x === 0
      ? { x: a.w * ITK_W, y: 0, w: (1 - a.w) * ITK_W, h: ITK_H }   // links belegt -> Rest rechts
      : { x: 0, y: 0, w: a.x * ITK_W, h: ITK_H };                   // rechts belegt -> Rest links
  }
  return full;
}

function itkCoverRect(x, y, w, h, iw, ih, scale, offX, offY) {
  const base = Math.max(w / iw, h / ih) * scale;
  const dw = iw * base, dh = ih * base;
  return { x: x + (w - dw) / 2 + offX, y: y + (h - dh) / 2 + offY, w: dw, h: dh };
}

function itkRedraw() {
  if (!itkCtx) return;
  itkCtx.clearRect(0, 0, ITK_W, ITK_H);
  itkCtx.fillStyle = '#ffffff';
  itkCtx.fillRect(0, 0, ITK_W, ITK_H);

  if (itkImg) {
    itkCtx.save();
    itkCtx.translate(ITK_W / 2 + itkImgX, ITK_H / 2 + itkImgY);
    itkCtx.scale(itkImgScale, itkImgScale);
    itkCtx.drawImage(itkImg, -itkImg.width / 2, -itkImg.height / 2);
    itkCtx.restore();
  }

  // Verlaufshintergrund: deckt die gewählte Layout-Fläche vollständig ab
  // (cover-Zuschnitt statt Kachelung – ein Verlauf hat keine nahtlose
  // Wiederholung, Kachelung würde harte Nähte erzeugen).
  const layout = ITK_LAYOUTS[itkLayout];
  if (itkGrad !== 'none' && layout.area && itkGradImgs[itkGrad] && itkGradImgs[itkGrad].complete) {
    const r = itkLayoutRect(layout.area);
    const gimg = itkGradImgs[itkGrad];
    itkCtx.save();
    itkCtx.beginPath();
    itkCtx.rect(r.x, r.y, r.w, r.h);
    itkCtx.clip();
    const fit = itkCoverRect(r.x, r.y, r.w, r.h, gimg.naturalWidth, gimg.naturalHeight, itkGradScale, itkGradOffX, itkGradOffY);
    itkCtx.drawImage(gimg, fit.x, fit.y, fit.w, fit.h);
    itkCtx.restore();
  }

  // Icon auf Lime-Kreis: zentriert sich auf der sichtbaren Bildfläche (also
  // unter Berücksichtigung eines aktiven Verlaufs, nicht auf dem ganzen
  // Canvas) – zuletzt gezeichnet, damit es nie überdeckt wird.
  if (itkIconKey !== 'none') {
    const rec = itkIconCache[itkIconKey];
    if (rec) {
      const vis = itkVisibleRect();
      const cx = vis.x + vis.w / 2, cy = vis.y + vis.h / 2;
      const radius = 62 * ITK_ICON_FIXED_SCALE;
      itkCtx.beginPath();
      itkCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      itkCtx.fillStyle = ITK_LIME;
      itkCtx.fill();
      const inner = radius * 1.12; // Icon füllt ~56% des Durchmessers
      const s = Math.min(inner / rec.vbW, inner / rec.vbH);
      const iw = rec.vbW * s, ih = rec.vbH * s;
      itkCtx.drawImage(rec.img, cx - iw / 2, cy - ih / 2, iw, ih);
    }
  }

  itkPreviewCanvases.forEach(({ canvas, fmt }) => itkCenterCrop(itkCanvas, fmt.w, fmt.h, canvas));
}

function itkCenterCrop(src, tW, tH, dest) {
  const sW = src.width, sH = src.height;
  const tAR = tW / tH, sAR = sW / sH;
  let cropW, cropH;
  if (tAR > sAR) { cropW = sW; cropH = sW / tAR; } else { cropH = sH; cropW = sH * tAR; }
  if (cropW > sW) { cropW = sW; cropH = sW / tAR; }
  if (cropH > sH) { cropH = sH; cropW = sH * tAR; }
  const cropX = (sW - cropW) / 2, cropY = (sH - cropH) / 2;
  const dc = dest.getContext('2d');
  dc.clearRect(0, 0, dest.width, dest.height);
  dc.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, dest.width, dest.height);
}

// ---------------------------------------------------------------------
// 9. BILD LADEN
// ---------------------------------------------------------------------
function itkLoadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      itkImg = img;
      const s = Math.max(ITK_W / img.width, ITK_H / img.height);
      itkImgX = 0; itkImgY = 0;
      itkSetZoom(s);
      itkDropHint.classList.add('hidden');
      itkCanvasWrap.style.cursor = 'grab';
      itkRedraw();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function itkSetZoom(s) {
  itkImgScale = Math.max(0.05, Math.min(5, s));
  const slider = document.getElementById('itk-zoom-slider');
  const label = document.getElementById('itk-zoom-val');
  if (slider) slider.value = Math.round(itkImgScale * 100);
  if (label) label.textContent = Math.round(itkImgScale * 100) + '%';
}

// ---------------------------------------------------------------------
// 10. UI AUFBAUEN
// ---------------------------------------------------------------------
function itkBuildGradientGrid() {
  const grid = document.getElementById('itk-grad-grid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  const none = document.createElement('div');
  none.className = 'itk-swatch itk-none active';
  none.dataset.grad = 'none';
  none.innerHTML = '<span>Kein<br>Hintergrund</span>';
  none.addEventListener('click', () => itkSelectGradient('none'));
  grid.appendChild(none);

  ITK_GRADIENTS.forEach(g => {
    const el = document.createElement('div');
    el.className = 'itk-swatch';
    el.dataset.grad = g.key;
    const img = document.createElement('img');
    img.src = g.src;
    img.alt = g.label;
    const label = document.createElement('div');
    label.className = 'itk-swatch-label';
    label.textContent = g.label;
    el.appendChild(img);
    el.appendChild(label);
    el.addEventListener('click', () => itkSelectGradient(g.key));
    grid.appendChild(el);

    const preload = new Image();
    preload.src = g.src;
    itkGradImgs[g.key] = preload;
  });
}

function itkSelectGradient(key) {
  itkGrad = key;
  itkGradOffX = 0; itkGradOffY = 0;
  document.querySelectorAll('#itk-grad-grid .itk-swatch').forEach(b => b.classList.toggle('active', b.dataset.grad === key));
  // Ohne Design-Position ergibt ein Hintergrund keinen Sinn – „Unten mittel“ als sinnvollen Start setzen
  if (key !== 'none' && itkLayout === 0) itkSelectLayout(2);
  itkRedraw();
}

function itkBuildLayoutGrid() {
  const grid = document.getElementById('itk-layout-grid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  ITK_LAYOUTS.forEach(l => {
    const btn = document.createElement('div');
    btn.className = 'itk-layout-btn' + (l.id === 0 ? ' active' : '');
    btn.dataset.id = l.id;
    if (l.area) {
      const ov = document.createElement('div');
      ov.className = 'ov';
      ov.style.left = (l.area.x * 100) + '%';
      ov.style.top = (l.area.y * 100) + '%';
      ov.style.width = (l.area.w * 100) + '%';
      ov.style.height = (l.area.h * 100) + '%';
      btn.appendChild(ov);
    } else {
      const nd = document.createElement('div');
      nd.className = 'no-design';
      nd.textContent = '—';
      btn.appendChild(nd);
    }
    btn.title = l.label;
    btn.addEventListener('click', () => itkSelectLayout(l.id));
    grid.appendChild(btn);
  });
}

function itkSelectLayout(id) {
  itkLayout = id;
  itkGradOffX = 0; itkGradOffY = 0;
  document.querySelectorAll('#itk-layout-grid .itk-layout-btn').forEach(b => b.classList.toggle('active', +b.dataset.id === id));
  itkRedraw();
}

/* Icons als Dropdown statt Kachel-Raster – spart Platz in der Leiste.
   Die 5 mitgelieferten Icons werden im Hintergrund vorgeladen, sobald das
   Tool öffnet, damit die Auswahl sofort reagiert. */
function itkPreloadIcons() {
  ITK_ICONS.forEach(ic => itkLoadIcon(ic.key, ic.svg));
}

function itkSelectIcon(key) {
  itkIconKey = key;
  const sel = document.getElementById('itk-icon-select');
  if (sel && sel.value !== key) sel.value = key;
  itkRedraw();
}

function itkInitIconSelect() {
  const sel = document.getElementById('itk-icon-select');
  sel.addEventListener('change', () => {
    if (sel.value === '__upload__') {
      document.getElementById('itk-icon-file-input').click();
      sel.value = itkIconKey; // Auswahl vorerst zurücksetzen, bis der Upload glückt
      return;
    }
    itkSelectIcon(sel.value);
  });
}

async function itkHandleIconUpload(file) {
  const sel = document.getElementById('itk-icon-select');
  if (!file) return;
  if (file.size > ITK_ICON_MAX_BYTES) { showToast('SVG zu groß (max. 300 KB)'); return; }
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') { showToast('Bitte eine SVG-Datei wählen'); return; }
  const text = await file.text();
  const rec = await itkLoadIcon('custom', text);
  if (!rec) { showToast('SVG konnte nicht gelesen werden'); return; }
  itkCustomIconLabel = file.name.replace(/\.svg$/i, '');

  let opt = sel.querySelector('option[value="custom"]');
  if (!opt) {
    opt = document.createElement('option');
    opt.value = 'custom';
    sel.insertBefore(opt, sel.querySelector('option[value="__upload__"]'));
  }
  opt.textContent = 'Eigenes: ' + itkCustomIconLabel;
  itkSelectIcon('custom');
  showToast('Icon „' + itkCustomIconLabel + '“ hinzugefügt');
}

function itkBuildPreviewGrid() {
  const grid = document.getElementById('itk-preview-grid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  ITK_FORMATS.forEach(fmt => {
    const item = document.createElement('div');
    item.className = 'itk-preview-item';
    const c = document.createElement('canvas');
    c.width = fmt.w; c.height = fmt.h;
    c.style.width = Math.round(fmt.w * fmt.scale) + 'px';
    c.style.height = Math.round(fmt.h * fmt.scale) + 'px';
    const nm = document.createElement('div');
    nm.className = 'itk-preview-name';
    nm.textContent = fmt.name;
    const sz = document.createElement('div');
    sz.className = 'itk-preview-size';
    sz.textContent = fmt.w + ' × ' + fmt.h + ' px';
    item.appendChild(c); item.appendChild(nm); item.appendChild(sz);
    grid.appendChild(item);
    itkPreviewCanvases.push({ canvas: c, fmt });
  });
}

// ---------------------------------------------------------------------
// 11. INTERAKTION AUF DEM CANVAS (Maus + Touch, wie in der Vorlage)
// ---------------------------------------------------------------------
function itkInitCanvasInteraction() {
  itkCanvasWrap.addEventListener('dragover', e => { e.preventDefault(); itkCanvasWrap.classList.add('dragover'); });
  itkCanvasWrap.addEventListener('dragleave', () => itkCanvasWrap.classList.remove('dragover'));
  itkCanvasWrap.addEventListener('drop', e => {
    e.preventDefault(); itkCanvasWrap.classList.remove('dragover');
    itkLoadFile(e.dataTransfer.files[0]);
  });

  itkCanvasWrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (itkDragMode === 'photo' && !itkImg) return;
    itkIsDragging = true;
    itkDragSX = e.clientX; itkDragSY = e.clientY;
    itkDragIX = itkDragMode === 'photo' ? itkImgX : itkGradOffX;
    itkDragIY = itkDragMode === 'photo' ? itkImgY : itkGradOffY;
    itkCanvasWrap.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!itkIsDragging) return;
    const rect = itkCanvasWrap.getBoundingClientRect();
    const f = ITK_W / rect.width;
    const dx = (e.clientX - itkDragSX) * f, dy = (e.clientY - itkDragSY) * f;
    if (itkDragMode === 'photo') { itkImgX = itkDragIX + dx; itkImgY = itkDragIY + dy; }
    else { itkGradOffX = itkDragIX + dx; itkGradOffY = itkDragIY + dy; }
    itkRedraw();
  });
  window.addEventListener('mouseup', () => {
    itkIsDragging = false;
    itkCanvasWrap.style.cursor = (itkDragMode === 'photo' && itkImg) || itkDragMode === 'grad' ? 'grab' : 'crosshair';
  });

  itkCanvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    if (itkDragMode !== 'photo' || !itkImg) return;
    const f = e.deltaY > 0 ? 0.92 : 1.09;
    itkSetZoom(itkImgScale * f);
    itkRedraw();
  }, { passive: false });

  itkCanvasWrap.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && (itkImg || itkDragMode === 'grad')) {
      itkIsDragging = true;
      itkDragSX = e.touches[0].clientX; itkDragSY = e.touches[0].clientY;
      itkDragIX = itkDragMode === 'photo' ? itkImgX : itkGradOffX;
      itkDragIY = itkDragMode === 'photo' ? itkImgY : itkGradOffY;
    } else if (e.touches.length === 2) {
      itkIsDragging = false;
      itkPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      itkPinchScale = itkImgScale;
    }
    e.preventDefault();
  }, { passive: false });
  itkCanvasWrap.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && itkIsDragging) {
      const rect = itkCanvasWrap.getBoundingClientRect();
      const f = ITK_W / rect.width;
      const dx = (e.touches[0].clientX - itkDragSX) * f, dy = (e.touches[0].clientY - itkDragSY) * f;
      if (itkDragMode === 'photo') { itkImgX = itkDragIX + dx; itkImgY = itkDragIY + dy; }
      else { itkGradOffX = itkDragIX + dx; itkGradOffY = itkDragIY + dy; }
      itkRedraw();
    } else if (e.touches.length === 2 && itkDragMode === 'photo') {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      itkSetZoom(itkPinchScale * d / itkPinchDist);
      itkRedraw();
    }
    e.preventDefault();
  }, { passive: false });
  itkCanvasWrap.addEventListener('touchend', () => { itkIsDragging = false; });
}

// ---------------------------------------------------------------------
// 12. CONTROLS VERDRAHTEN
// ---------------------------------------------------------------------
function itkInitControls() {
  document.getElementById('itk-upload-btn').addEventListener('click', () => document.getElementById('itk-file-input').click());
  document.getElementById('itk-file-input').addEventListener('change', e => { itkLoadFile(e.target.files[0]); e.target.value = ''; });
  document.getElementById('itk-remove-btn').addEventListener('click', () => {
    itkImg = null; itkImgX = 0; itkImgY = 0; itkImgScale = 1;
    document.getElementById('itk-zoom-slider').value = 100;
    document.getElementById('itk-zoom-val').textContent = '100%';
    itkCanvasWrap.style.cursor = 'crosshair';
    itkDropHint.classList.remove('hidden');
    itkRedraw();
  });

  const zoomSlider = document.getElementById('itk-zoom-slider');
  zoomSlider.addEventListener('input', () => {
    itkImgScale = zoomSlider.value / 100;
    document.getElementById('itk-zoom-val').textContent = zoomSlider.value + '%';
    itkRedraw();
  });
  document.getElementById('itk-fit-btn').addEventListener('click', () => {
    if (!itkImg) return;
    itkSetZoom(Math.min(ITK_W / itkImg.width, ITK_H / itkImg.height));
    itkImgX = 0; itkImgY = 0; itkRedraw();
  });
  document.getElementById('itk-fill-btn').addEventListener('click', () => {
    if (!itkImg) return;
    itkSetZoom(Math.max(ITK_W / itkImg.width, ITK_H / itkImg.height));
    itkImgX = 0; itkImgY = 0; itkRedraw();
  });
  document.getElementById('itk-center-btn').addEventListener('click', () => { itkImgX = 0; itkImgY = 0; itkRedraw(); });

  const gradScaleSlider = document.getElementById('itk-grad-scale-slider');
  gradScaleSlider.addEventListener('input', () => {
    itkGradScale = gradScaleSlider.value / 100;
    document.getElementById('itk-grad-scale-val').textContent = gradScaleSlider.value + '%';
    itkRedraw();
  });

  document.getElementById('itk-mode-photo').addEventListener('click', () => {
    itkDragMode = 'photo';
    document.getElementById('itk-mode-photo').classList.add('active');
    document.getElementById('itk-mode-grad').classList.remove('active');
    itkCanvasWrap.style.cursor = itkImg ? 'grab' : 'crosshair';
  });
  document.getElementById('itk-mode-grad').addEventListener('click', () => {
    itkDragMode = 'grad';
    document.getElementById('itk-mode-grad').classList.add('active');
    document.getElementById('itk-mode-photo').classList.remove('active');
    itkCanvasWrap.style.cursor = 'grab';
  });
  document.getElementById('itk-reset-grad-btn').addEventListener('click', () => {
    itkGradOffX = 0; itkGradOffY = 0; itkGradScale = 1;
    gradScaleSlider.value = 100;
    document.getElementById('itk-grad-scale-val').textContent = '100%';
    itkRedraw();
  });

  document.getElementById('itk-icon-file-input').addEventListener('change', e => {
    itkHandleIconUpload(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('itk-download').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'mc_Intranet_Kachel.jpg';
    link.href = itkCanvas.toDataURL('image/jpeg', 0.95);
    link.click();
  });
}

// ---------------------------------------------------------------------
// 13. ÖFFNEN / SCHLIESSEN
// ---------------------------------------------------------------------
function itkOpen() {
  document.getElementById('main-view').style.display = 'none';
  const mc = document.getElementById('main-controls');
  if (mc) mc.style.display = 'none';
  hideHubView();
  document.getElementById('itk-view').classList.add('visible');

  if (!itkMounted) {
    itkMounted = true;
    itkCanvas = document.getElementById('itk-canvas');
    itkCtx = itkCanvas.getContext('2d');
    itkCanvasWrap = document.getElementById('itk-canvas-wrap');
    itkDropHint = document.getElementById('itk-drop-hint');
    itkBuildGradientGrid();
    itkBuildLayoutGrid();
    itkPreloadIcons();
    itkInitIconSelect();
    itkBuildPreviewGrid();
    itkInitCanvasInteraction();
    itkInitControls();
    // Zustand aktiv über dieselben Auswahlfunktionen setzen, die auch bei
    // Klicks laufen – so kann der Anfangszustand nie von der DOM-Markierung
    // abweichen, unabhängig davon, was vorher im selben Tab passiert ist.
    itkSelectGradient('none');
    itkSelectLayout(0);
    itkSelectIcon('none');
  }
}

function itkClose() {
  document.getElementById('itk-view').classList.remove('visible');
  document.getElementById('main-view').style.display = 'block';
  if (typeof hubVisible !== 'undefined' && hubVisible) restoreHubView();
  else { const mc = document.getElementById('main-controls'); if (mc) mc.style.display = 'flex'; }
}

function itkInit() {
  const tile = document.getElementById('tile-intranet');
  if (!tile) return;
  tile.addEventListener('click', itkOpen);
  document.getElementById('itk-back').addEventListener('click', itkClose);
}

itkInit();
