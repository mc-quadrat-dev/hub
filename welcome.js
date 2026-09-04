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
const WSG_PNG_MAX_BYTES = 3 * 1024 * 1024;

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
  // Viele echte Logo-Exporte (u. a. unsere eigenen mc-Logo-Assets) färben über
  // eine <style>-Regel mit CSS-Klasse statt über ein fill-Attribut ein. Eine
  // CSS-Klassenregel hat in der Kaskade Vorrang vor einem Präsentations-
  // attribut – ohne diesen Schritt würde unser erzwungenes fill="#ffffff"
  // unten von einer verbliebenen Regel wie ".cls-1{fill:#003057}" überstimmt.
  root.querySelectorAll('style').forEach(n => n.remove());

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
  // Inline-<svg> aus einer HTML-Seite haben oft kein xmlns – im HTML-Kontext
  // wird der Namensraum automatisch erkannt. Als eigenständiges Dokument für
  // die Data-URI (Image-Laden) ist xmlns dagegen zwingend, sonst schlägt das
  // Laden lautlos fehl (img.onerror, kein sichtbarer Fehler).
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return { svg: new XMLSerializer().serializeToString(root), vbW: vb[2], vbH: vb[3] };
}

function wsgLoadLogo(svgText) {
  return new Promise(resolve => {
    const clean = wsgSanitizeLogoSVG(svgText);
    if (!clean) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ img, vbW: clean.vbW, vbH: clean.vbH, isRaster: false });
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean.svg);
  });
}

/* PNG statt SVG: kann nicht wie ein Vektor "auf Weiß gestellt" werden – aber
   jedes nicht-transparente Pixel lässt sich per Canvas-Compositing (source-in)
   zu Weiß machen, während die Alpha-Maske (also die Logo-Silhouette) erhalten
   bleibt. Funktioniert nur sinnvoll mit echter Transparenz – ein JPG (kein
   Alphakanal) würde dabei zu einem blanken weißen Rechteck, deshalb bewusst
   nur PNG zugelassen. */
function wsgLoadPngLogo(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { resolve(null); return; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, w, h);
      const out = new Image();
      out.onload = () => resolve({ img: out, vbW: w, vbH: h, isRaster: true });
      out.onerror = () => resolve(null);
      out.src = c.toDataURL('image/png');
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* Warnt, wenn ein Raster-Logo in der aktuell gewählten Exportauflösung über
   seine native Auflösung hinaus hochskaliert werden müsste (wird sichtbar
   unscharf) – bei Vektor-SVGs gibt es dieses Problem grundsätzlich nicht. */
function wsgCheckLogoResolution() {
  if (!wsgLogo || !wsgLogo.isRaster) return;
  const zoneMaxW = WSG_ZONE.maxW * wsgExportW, zoneMaxH = WSG_ZONE.maxH * wsgExportH;
  const scale = Math.min(zoneMaxW / wsgLogo.vbW, zoneMaxH / wsgLogo.vbH);
  if (scale > 1.05) {
    showToast(`Achtung: Logo-Auflösung reicht für ${wsgExportW}×${wsgExportH} evtl. nicht aus – wirkt beim Export leicht unscharf`);
  }
}

// Gemeinsamer Schlusspunkt für jeden Weg, ein Logo zu bekommen (Upload,
// Drag&Drop, URL-Fetch, eingefügter Quelltext, SVG oder PNG) – hält den
// State-Übergang an einer Stelle.
function wsgSetLogo(rec, successMsg) {
  wsgLogo = rec;
  wsgSyncDropHint();
  wsgRedraw();
  showToast(successMsg || 'Logo eingesetzt');
  wsgCheckLogoResolution();
}

async function wsgApplyLogoSvgText(svgText, successMsg) {
  const rec = await wsgLoadLogo(svgText);
  if (!rec) { showToast('SVG konnte nicht gelesen werden'); return false; }
  wsgSetLogo(rec, successMsg);
  return true;
}

async function wsgApplyLogoPngSrc(src, successMsg) {
  const rec = await wsgLoadPngLogo(src);
  if (!rec) { showToast('PNG konnte nicht gelesen werden'); return false; }
  wsgSetLogo(rec, successMsg);
  return true;
}

async function wsgHandleLogoUpload(file) {
  if (!file) return;
  const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
  const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
  if (!isSvg && !isPng) { showToast('Bitte eine SVG- oder PNG-Datei wählen'); return; }
  if (isSvg) {
    if (file.size > WSG_LOGO_MAX_BYTES) { showToast('SVG zu groß (max. 300 KB)'); return; }
    const text = await file.text();
    await wsgApplyLogoSvgText(text);
  } else {
    if (file.size > WSG_PNG_MAX_BYTES) { showToast('PNG zu groß (max. 3 MB)'); return; }
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) { showToast('PNG konnte nicht gelesen werden'); return; }
    await wsgApplyLogoPngSrc(dataUrl);
  }
}

// ---------------------------------------------------------------------
// 3b. LOGO-FETCHER – Logo aus einer Kundenseite ziehen
// Zwei Wege, dieselbe Erkennung: per URL (funktioniert zuverlässig nur für
// direkte Dateilinks – volle HTML-Seiten scheitern so gut wie immer an CORS,
// live gegen mehrere echte Seiten und 8 öffentliche CORS-Proxies geprüft) und
// per eingefügtem Seitenquelltext (funktioniert immer, da kein Netzwerkzugriff
// nötig ist). SVG hat immer Vorrang (Vektor, jede Größe scharf) – PNG ist der
// Fallback für Seiten ohne SVG-Logo (z. B. mc-quadrat.com selbst).
// ---------------------------------------------------------------------
const WSG_LOGO_HINT_RE = /logo|brand/i;
const WSG_SCOPE_RE = /header|nav|logo|brand/i;

function wsgLooksLikeSvgText(text) {
  return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text);
}

function wsgScopesOf(doc) {
  const scopes = [];
  doc.querySelectorAll('header, nav').forEach(el => scopes.push(el));
  doc.querySelectorAll('[id], [class]').forEach(el => {
    if (WSG_SCOPE_RE.test(el.id) || WSG_SCOPE_RE.test(el.className || '')) scopes.push(el);
  });
  scopes.push(doc.body || doc.documentElement);
  return scopes;
}

/* Sucht im geparsten Dokument nach dem wahrscheinlichsten Logo. Erster
   Durchlauf nur SVG (immer vorzuziehen):
   1. Inline-<svg> in einem Link/Container mit Logo/Brand-Bezug
   2. sonst das erste <svg> im wahrscheinlichen Bereich (header/nav/…)
   3. sonst ein <img>/<use> mit .svg-Ziel
   <use href="#id"> auf ein Element im selben Dokument wird direkt aufgelöst
   (Sprite-Muster), ohne zweiten Request. Erst wenn NIRGENDS ein SVG-Hinweis
   existiert, ein zweiter Durchlauf nur für <img src="….png">. */
function wsgFindLogoInHtml(doc, baseUrl) {
  const scopes = wsgScopesOf(doc);
  const resolve = ref => { try { return new URL(ref, baseUrl).href; } catch (e) { return null; } };

  for (const scope of scopes) {
    if (!scope) continue;

    const candidates = scope.querySelectorAll('a, div, span');
    for (const el of candidates) {
      const label = (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('aria-label') || '');
      if (!WSG_LOGO_HINT_RE.test(label)) continue;
      const svg = el.querySelector('svg');
      if (svg) return wsgResolveInlineSvg(svg, doc, baseUrl);
    }

    const anySvg = scope.querySelector('svg');
    if (anySvg) return wsgResolveInlineSvg(anySvg, doc, baseUrl);

    const img = scope.querySelector('img[src$=".svg" i], img[src*=".svg?" i]');
    if (img) { const u = resolve(img.getAttribute('src')); if (u) return { type: 'external', format: 'svg', url: u }; }
    const use = scope.querySelector('use');
    if (use) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      if (/\.svg/i.test(href)) { const u = resolve(href.split('#')[0]); if (u) return { type: 'external', format: 'svg', url: u }; }
    }
  }

  // Fallback: PNG-Logo (z. B. <img class="…logo…" src="….png">)
  for (const scope of scopes) {
    if (!scope) continue;
    const labeled = scope.querySelectorAll('a, div, span, img');
    for (const el of labeled) {
      const label = (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('aria-label') || '');
      if (!WSG_LOGO_HINT_RE.test(label)) continue;
      const img = el.tagName === 'IMG' ? el : el.querySelector('img[src$=".png" i], img[src*=".png?" i]');
      if (img) { const u = resolve(img.getAttribute('src')); if (u) return { type: 'external', format: 'png', url: u }; }
    }
    const anyImg = scope.querySelector('img[src$=".png" i], img[src*=".png?" i]');
    if (anyImg) { const u = resolve(anyImg.getAttribute('src')); if (u) return { type: 'external', format: 'png', url: u }; }
  }
  return null;
}

/* Ein gefundenes <svg> kann per <use href="#id"> auf ein <symbol>/<svg id="…">
   im selben Dokument verweisen (Sprite-Technik) – dann das referenzierte
   Element auflösen statt der leeren <use>-Hülle. */
function wsgResolveInlineSvg(svgEl, doc, baseUrl) {
  const use = svgEl.querySelector('use');
  if (use) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    if (href.startsWith('#')) {
      const target = doc.getElementById(href.slice(1));
      if (target) return { type: 'inline', format: 'svg', svg: target.outerHTML.replace(/^<symbol/, '<svg').replace(/<\/symbol>$/, '</svg>') };
    } else if (href) {
      const u = (() => { try { return new URL(href.split('#')[0], baseUrl).href; } catch (e) { return null; } })();
      if (u) return { type: 'external', format: 'svg', url: u };
    }
  }
  return { type: 'inline', format: 'svg', svg: svgEl.outerHTML };
}

/* Liefert { format, data } – data ist SVG-Text oder eine PNG-Data-URI. Externe
   Dateien werden immer zuerst als Data-URI geladen (nie direkt als img.src),
   damit die anschließende Canvas-Weiterverarbeitung (Sanitizer bzw.
   source-in-Weißfärbung) niemals an einer "getainteten" Canvas scheitert. */
async function wsgResolveCandidate(candidate) {
  if (!candidate) return null;
  if (candidate.type === 'inline') return { format: 'svg', data: candidate.svg };
  try {
    const r = await fetch(candidate.url);
    if (!r.ok) return null;
    if (candidate.format === 'png') {
      const blob = await r.blob();
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      return dataUrl ? { format: 'png', data: dataUrl } : null;
    }
    const text = await r.text();
    return wsgLooksLikeSvgText(text) ? { format: 'svg', data: text } : null;
  } catch (e) {
    return null;
  }
}

async function wsgApplyResolved(resolved, successMsg) {
  if (!resolved) return false;
  return resolved.format === 'png'
    ? wsgApplyLogoPngSrc(resolved.data, successMsg)
    : wsgApplyLogoSvgText(resolved.data, successMsg);
}

async function wsgFetchAndApplyUrl(url) {
  url = (url || '').trim();
  if (!/^https?:\/\//i.test(url)) { showToast('Bitte eine vollständige URL eingeben (http:// oder https://)'); return; }

  const btn = document.getElementById('wsg-fetch-url-btn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Suche …';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const contentType = res.headers.get('content-type') || '';

    let resolved = null;
    if (contentType.includes('svg') || /\.svg(\?|$)/i.test(url)) {
      const text = await res.text();
      if (wsgLooksLikeSvgText(text)) resolved = { format: 'svg', data: text };
    } else if (contentType.includes('image/png') || /\.png(\?|$)/i.test(url)) {
      const blob = await res.blob();
      const dataUrl = await new Promise(r => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result);
        reader.onerror = () => r(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) resolved = { format: 'png', data: dataUrl };
    } else {
      // Keine erkennbare Bilddatei – als HTML-Seite parsen und darin suchen.
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const candidate = wsgFindLogoInHtml(doc, url);
      resolved = await wsgResolveCandidate(candidate);
    }

    if (!resolved) {
      showToast('Kein Logo gefunden – bitte Seitenquelltext einfügen (siehe unten)');
      return;
    }
    const ok = await wsgApplyResolved(resolved, 'Logo automatisch gefunden und eingesetzt');
    if (ok) wsgCloseFetchModal();
  } catch (e) {
    // Meist CORS – volle HTML-Seiten lassen sich von hier aus fast nie direkt
    // abrufen, siehe Kommentar oben an der Funktionsgruppe.
    showToast('Automatischer Abruf nicht möglich (CORS) – bitte Seitenquelltext einfügen');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function wsgApplyPastedHtml(htmlText) {
  htmlText = (htmlText || '').trim();
  if (!htmlText) { showToast('Bitte zuerst den Seitenquelltext einfügen'); return; }

  let resolved = null;
  if (wsgLooksLikeSvgText(htmlText)) {
    resolved = { format: 'svg', data: htmlText };
  } else {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const candidate = wsgFindLogoInHtml(doc, 'https://example.com/');
    if (candidate && candidate.type === 'inline') {
      resolved = { format: candidate.format, data: candidate.svg };
    } else if (candidate && candidate.type === 'external') {
      resolved = await wsgResolveCandidate(candidate);
      if (!resolved) { showToast('Logo-Datei gefunden, aber nicht ladbar: ' + candidate.url); return; }
    }
  }

  if (!resolved) { showToast('Kein Logo im eingefügten Quelltext gefunden'); return; }
  const ok = await wsgApplyResolved(resolved, 'Logo automatisch gefunden und eingesetzt');
  if (ok) wsgCloseFetchModal();
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

function wsgOpenFetchModal() {
  document.getElementById('wsg-fetch-url-input').value = '';
  document.getElementById('wsg-fetch-paste-input').value = '';
  document.getElementById('wsg-fetch-overlay').classList.add('visible');
  document.getElementById('wsg-fetch-url-input').focus();
}

function wsgCloseFetchModal() {
  document.getElementById('wsg-fetch-overlay').classList.remove('visible');
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

  document.getElementById('wsg-fetch-btn').addEventListener('click', wsgOpenFetchModal);
  document.getElementById('wsg-fetch-cancel').addEventListener('click', wsgCloseFetchModal);
  document.getElementById('wsg-fetch-overlay').addEventListener('click', e => {
    if (e.target.id === 'wsg-fetch-overlay') wsgCloseFetchModal();
  });
  const fetchUrlInput = document.getElementById('wsg-fetch-url-input');
  document.getElementById('wsg-fetch-url-btn').addEventListener('click', () => wsgFetchAndApplyUrl(fetchUrlInput.value));
  fetchUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') wsgFetchAndApplyUrl(fetchUrlInput.value); });
  document.getElementById('wsg-fetch-paste-btn').addEventListener('click', () => {
    wsgApplyPastedHtml(document.getElementById('wsg-fetch-paste-input').value);
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
      wsgCheckLogoResolution();
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
