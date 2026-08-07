// =====================================================================
// KEYVISUAL FARBEN (mc-quadrat)
// Hintergrund: Grau-Abstufungen nach Schwarz -> erzeugt Tiefe um den Fokus.
// Pfeile: Grauverlauf mit zunehmender Distanz. Grain: lime.
// Lime als Akzent ausschließlich am Fokus-Element (+ dezenter Glow).
// =====================================================================
const KV = {
  // Radialer Verlauf ab Fokus: [Farbe, Position 0..1]
  bgStops: [
    ['#222222', 0],      // Grey 5  – Lichtkegel am Fokus
    ['#1a1a1a', 0.35],   // Zwischenton
    ['#0d0d0d', 0.7],    // Zwischenton
    ['#000000', 1]       // black   – Tiefe an den Rändern
  ],
  vignette:   '0,0,0',              // unterer Verlauf -> black
  grain:      [206, 251, 11],       // lime      #cefb0b
  grainAlpha: 128,                  // 0-255: 50 % Deckkraft
  glow:       '206,251,11',         // lime glow um den Fokus
  glowAlpha:  0.18,                 // zurückgenommen, damit der lime Stern scharf bleibt
  star:       '#cefb0b'             // lime – Fokus-Element
};

function hexToRgbArr(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Farbe an Position t (0..1) im selben mehrstufigen Verlauf wie der Hintergrund (KV.bgStops)
function kvColorAtStops(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [c0, p0] = stops[i], [c1, p1] = stops[i + 1];
    if (t <= p1 || i === stops.length - 2) {
      const local = p1 > p0 ? (t - p0) / (p1 - p0) : 0;
      const lt = Math.max(0, Math.min(1, local));
      const a = hexToRgbArr(c0), b = hexToRgbArr(c1);
      return [
        Math.round(a[0] + (b[0] - a[0]) * lt),
        Math.round(a[1] + (b[1] - a[1]) * lt),
        Math.round(a[2] + (b[2] - a[2]) * lt)
      ];
    }
  }
  return hexToRgbArr(stops[stops.length - 1][0]);
}

// Pfeilfarbe: derselbe Verlauf wie der Hintergrund (KV.bgStops), nur andersherum (1 - t) –
// dadurch verschmelzen Pfeile stellenweise mit dem Hintergrundton statt pauschal zu hell zu wirken.
function kvArrowRGB(t) {
  return kvColorAtStops(KV.bgStops, 1 - t);
}

// --- Inline SVG data ---
const rawArrowSvg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16.78 16.78"><path fill="black" d="M16.43,15.47l-2.04,1.05c-.19.1-.41,0-.5-.2L8.49,3.78c-.06-.12-.11-.24-.22-.24s-.17.12-.22.25l-5.19,12.66c-.09.21-.31.3-.5.21l-2.05-1c-.19-.1-.28-.35-.2-.56L6.1.45c.14-.31.27-.37.5-.37l3.28-.03c.22,0,.36.06.5.36l6.24,14.51c.09.21,0,.45-.18.55"/></svg>`;

const rawStarSvg = `<?xml version="1.0" encoding="UTF-8"?><svg id="Ebene_2" data-name="Ebene 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 59.8 59.8"><defs><style>.cls-1 {fill: ${KV.star};}</style></defs><g id="_Radiale_Wiederholung_" data-name="&amp;lt;Radiale Wiederholung&amp;gt;"><path class="cls-1" d="M40.75,57.42l-2.69,1.26c-.25.12-.54,0-.66-.24l-7.09-15.06c-.07-.15-.15-.29-.3-.29s-.22.15-.29.3l-6.87,15.2c-.11.25-.41.36-.66.25l-2.7-1.21c-.26-.11-.37-.42-.26-.67l7.93-17.58c.18-.37.36-.44.66-.44l4.32-.03c.29,0,.48.07.66.43l8.19,17.44c.12.25,0,.54-.24.66Z"/></g><g id="_Radiale_Wiederholung_-2" data-name="&amp;lt;Radiale Wiederholung&amp;gt;"><path class="cls-1" d="M7.08,48.72l-2.03-2.17c-.19-.2-.18-.52.02-.7l12.13-11.4c.12-.12.23-.23.19-.37s-.21-.16-.37-.19L.45,32.05c-.27-.03-.47-.28-.44-.55l.31-2.94c.03-.28.28-.48.56-.45l19.17,2.11c.41.06.53.21.63.49l1.37,4.1c.09.28.08.47-.21.76l-14.05,13.17c-.2.19-.51.18-.7-.02Z"/></g><g id="_Radiale_Wiederholung_-3" data-name="&amp;lt;Radiale Wiederholung&amp;gt;"><path class="cls-1" d="M4.95,14.02l1.44-2.6c.13-.24.44-.33.68-.2l14.59,8.02c.15.07.29.15.41.06s.09-.25.06-.41l-3.38-16.34c-.06-.27.12-.53.39-.59l2.89-.61c.27-.06.54.12.6.39l3.92,18.89c.07.4-.03.57-.27.75l-3.48,2.57c-.24.17-.43.22-.79.04L5.14,14.69c-.24-.13-.33-.43-.19-.67Z"/></g><g id="_Radiale_Wiederholung_-4" data-name="&amp;lt;Radiale Wiederholung&amp;gt;"><path class="cls-1" d="M37.3,1.26l2.92.57c.27.05.45.31.39.58l-3.12,16.35c-.03.16-.05.32.07.41s.26,0,.41-.07l14.5-8.26c.24-.14.54-.05.68.19l1.47,2.56c.14.24.06.55-.19.69l-16.75,9.57c-.36.19-.55.14-.79-.03l-3.52-2.51c-.24-.17-.34-.34-.28-.74l3.62-18.92c.05-.27.31-.44.58-.39Z"/></g><g id="_Radiale_Wiederholung_-5" data-name="&amp;lt;Radiale Wiederholung&amp;gt;"><path class="cls-1" d="M59.42,28.08l.36,2.95c.03.27-.16.52-.43.56l-16.51,2.09c-.16.03-.32.05-.37.19s.07.25.19.37l12.34,11.23c.2.19.22.5.03.71l-1.98,2.19c-.19.21-.51.22-.72.04l-14.27-12.98c-.29-.29-.31-.48-.22-.76l1.3-4.12c.09-.28.21-.43.62-.5l19.11-2.4c.27-.03.52.16.55.43Z"/></g></svg>`;

const ARROW_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawArrowSvg);
const STAR_URI  = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawStarSvg);

document.documentElement.style.setProperty('--arrow-url', `url("${ARROW_URI}")`);

const starImgNode = new Image(); starImgNode.src = STAR_URI;

const logoImgNode = new Image();
let logoDataUri = 'assets/logo/de/white.svg';
fetch('assets/logo/de/white.svg')
  .then(r => r.text())
  .then(text => {
    logoDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    logoImgNode.src = logoDataUri;
  })
  .catch(() => { logoImgNode.src = logoDataUri; });

document.getElementById('main-star').innerHTML = `<img src="${STAR_URI}" draggable="false">`;
document.getElementById('ed-star').innerHTML = `<img src="${STAR_URI}" draggable="false">`;

// --- BASE CONFIG ---
const BASE_ARROW_SIZE = 24;
const BASE_GAP = BASE_ARROW_SIZE;
const BASE_CELL = BASE_ARROW_SIZE + BASE_GAP;
const BASE_STAR_SIZE = BASE_ARROW_SIZE * 4;
const MAX_INF_CELLS = 16;
const DEF_ROT = 90;
const FIXED_FORCE = 10;
const DEFAULT_SCALE = 2;

const ARROW_PATH_D = 'M16.43,15.47l-2.04,1.05c-.19.1-.41,0-.5-.2L8.49,3.78c-.06-.12-.11-.24-.22-.24s-.17.12-.22.25l-5.19,12.66c-.09.21-.31.3-.5.21l-2.05-1c-.19-.1-.28-.35-.2-.56L6.1.45c.14-.31.27-.37.5-.37l3.28-.03c.22,0,.36.06.5.36l6.24,14.51c.09.21,0,.45-.18.55';
const LOGO_ASPECT = 238.04 / 75; // white DE logo viewBox ratio
const STAR_PATHS = [
  'M40.75,57.42l-2.69,1.26c-.25.12-.54,0-.66-.24l-7.09-15.06c-.07-.15-.15-.29-.3-.29s-.22.15-.29.3l-6.87,15.2c-.11.25-.41.36-.66.25l-2.7-1.21c-.26-.11-.37-.42-.26-.67l7.93-17.58c.18-.37.36-.44.66-.44l4.32-.03c.29,0,.48.07.66.43l8.19,17.44c.12.25,0,.54-.24.66Z',
  'M7.08,48.72l-2.03-2.17c-.19-.2-.18-.52.02-.7l12.13-11.4c.12-.12.23-.23.19-.37s-.21-.16-.37-.19L.45,32.05c-.27-.03-.47-.28-.44-.55l.31-2.94c.03-.28.28-.48.56-.45l19.17,2.11c.41.06.53.21.63.49l1.37,4.1c.09.28.08.47-.21.76l-14.05,13.17c-.2.19-.51.18-.7-.02Z',
  'M4.95,14.02l1.44-2.6c.13-.24.44-.33.68-.2l14.59,8.02c.15.07.29.15.41.06s.09-.25.06-.41l-3.38-16.34c-.06-.27.12-.53.39-.59l2.89-.61c.27-.06.54.12.6.39l3.92,18.89c.07.4-.03.57-.27.75l-3.48,2.57c-.24.17-.43.22-.79.04L5.14,14.69c-.24-.13-.33-.43-.19-.67Z',
  'M37.3,1.26l2.92.57c.27.05.45.31.39.58l-3.12,16.35c-.03.16-.05.32.07.41s.26,0,.41-.07l14.5-8.26c.24-.14.54-.05.68.19l1.47,2.56c.14.24.06.55-.19.69l-16.75,9.57c-.36.19-.55.14-.79-.03l-3.52-2.51c-.24-.17-.34-.34-.28-.74l3.62-18.92c.05-.27.31-.44.58-.39Z',
  'M59.42,28.08l.36,2.95c.03.27-.16.52-.43.56l-16.51,2.09c-.16.03-.32.05-.37.19s.07.25.19.37l12.34,11.23c.2.19.22.5.03.71l-1.98,2.19c-.19.21-.51.22-.72.04l-14.27-12.98c-.29-.29-.31-.48-.22-.76l1.3-4.12c.09-.28.21-.43.62-.5l19.11-2.4c.27-.03.52.16.55.43Z'
];

// --- STATE ---
let pages = [];
let activePageIdx = 0;
let mainArrowScale = (DEFAULT_SCALE + 1) * 0.5;
let mainStarScale = (DEFAULT_SCALE + 1) * 0.5;
let mainScaleLocked = true;
let hubVisible = false;

// --- Helpers ---
function calcExcDims(starSize, useLogoMode) {
  if (useLogoMode) return { hw: (starSize * LOGO_ASPECT) / 2, hh: starSize / 2 };
  const h = starSize / 2;
  return { hw: h, hh: h };
}

function isInExclusion(cx, cy, starX, starY, hw, hh) {
  return Math.abs(cx - starX) <= hw && Math.abs(cy - starY) <= hh;
}

function snapToGrid(pos, arrowSize, cell, offset = 0) {
  const off = offset % cell;
  const anchor = arrowSize / 2 + off;
  return Math.round((pos - anchor) / cell) * cell + anchor;
}

// --- Procedural Grain ---
function generateGrainImage(w, h) {
  // Guard: bei noch nicht gelayoutetem Viewport (0x0) wirft getImageData sonst
  // einen IndexSizeError und bricht die restliche Skript-Ausführung ab.
  w = Math.max(1, w | 0);
  h = Math.max(1, h | 0);
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    let factor = 0;
    if (t < 0.1) factor = 1.0;
    else factor = Math.max(0, 1 - ((t - 0.1) / 0.25));
    const density = 0.65 * Math.pow(factor, 1.8) + 0.001;
    for (let x = 0; x < w; x++) {
      if (Math.random() < density) {
        const i = (y * w + x) * 4;
        d[i] = KV.grain[0]; d[i+1] = KV.grain[1]; d[i+2] = KV.grain[2]; d[i+3] = KV.grainAlpha;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.fillStyle = `rgba(${KV.grain[0]},${KV.grain[1]},${KV.grain[2]},${(KV.grainAlpha / 255).toFixed(3)})`;
  for (let i = 0; i < w * h * 0.001; i++) {
    const x = Math.random() * w | 0;
    const y = (h * (0.3 + Math.random() * 0.7)) | 0;
    ctx.fillRect(x, y, 1, 1);
  }
  return cvs.toDataURL('image/png');
}

// --- Engine ---
class ArrowEngine {
  constructor(container, innerGlow, star, isEditor) {
    this.container = container;
    this.innerGlow = innerGlow;
    this.star = star;
    this.isEditor = isEditor;
    this.arrows = [];
    this.width = 0; this.height = 0;
    this.starX = 0; this.starY = 0;
    this.offsetX = 0; this.offsetY = 0;
    this.arrowScale = 1; this.starScale = 1;
    this.arrowSize = BASE_ARROW_SIZE;
    this.cell = BASE_CELL;
    this.starSize = BASE_STAR_SIZE;
    this.maxInf = MAX_INF_CELLS * BASE_CELL;
    this.dragging = false;
    this.introMode = false;

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);

    this.container.addEventListener('mousedown', this.onDown);
    this.container.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    this.container.addEventListener('touchstart', this.onDown, { passive: false });
    this.container.addEventListener('touchmove', this.onMove, { passive: false });
    window.addEventListener('touchend', this.onUp);
  }

  animateIntro() {
    if (!this.introMode) return;
    this.update();
    if (performance.now() - this.introStart < 2000) {
      requestAnimationFrame(() => this.animateIntro());
    } else {
      this.introMode = false;
      this.update();
      if (!this.isEditor) {
        setTimeout(showHubView, 350);
      }
    }
  }

  init(width, height, starX, starY, arrowScale, starScale, offsetX, offsetY) {
    this.width = width; this.height = height;
    this.arrowScale = arrowScale; this.starScale = starScale;
    this.offsetX = offsetX || 0; this.offsetY = offsetY || 0;

    this.arrowSize = BASE_ARROW_SIZE * arrowScale;
    const gap = BASE_GAP * arrowScale;
    this.cell = this.arrowSize + gap;
    this.starSize = BASE_STAR_SIZE * starScale;
    this.maxInf = MAX_INF_CELLS * this.cell;

    this.starX = snapToGrid(starX, this.arrowSize, this.cell, this.offsetX);
    this.starY = snapToGrid(starY, this.arrowSize, this.cell, this.offsetY);

    if (this.isEditor) {
      this.container.style.width = width + 'px';
      this.container.style.height = height + 'px';
      this.resizePanel();
    } else {
      this.container.style.width = '100vw';
      this.container.style.height = '100vh';
    }

    this.star.style.height = this.starSize + 'px';
    if (this.innerGlow) {
      this.innerGlow.style.width = (this.starSize * 2) + 'px';
      this.innerGlow.style.height = (this.starSize * 2) + 'px';
    }
    // Focal element: logo or star
    if (this.isEditor && pages.length > 0 && pages[activePageIdx] && pages[activePageIdx].logoMode) {
      const logoW = Math.round(this.starSize * LOGO_ASPECT);
      this.star.style.width = logoW + 'px';
      this.star.innerHTML = `<img src="${logoDataUri}" draggable="false" style="width:100%;height:100%;object-fit:contain;">`;
    } else {
      this.star.style.width = this.starSize + 'px';
      if (this.isEditor) this.star.innerHTML = `<img src="${STAR_URI}" draggable="false">`;
    }

    this.arrows.forEach(a => a.el.remove());
    this.arrows = [];
    const frag = document.createDocumentFragment();
    const start = -this.cell;
    const safeWidth = Math.max(width, document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const safeHeight = Math.max(height, document.documentElement.clientHeight || 0, window.innerHeight || 0);

    const offX = this.offsetX % this.cell;
    const offY = this.offsetY % this.cell;

    for (let y = start; y < safeHeight + this.cell; y += this.cell) {
      for (let x = start; x < safeWidth + this.cell; x += this.cell) {
        const px = x + offX;
        const py = y + offY;
        const d = document.createElement('div');
        d.className = 'arrow';
        d.style.width = this.arrowSize + 'px';
        d.style.height = this.arrowSize + 'px';
        d.style.left = px + 'px';
        d.style.top = py + 'px';
        frag.appendChild(d);
        this.arrows.push({ el: d, cx: px + this.arrowSize/2, cy: py + this.arrowSize/2 });
      }
    }
    this.container.appendChild(frag);
    this.update();
  }

  update() {
    this.star.style.left = this.starX + 'px';
    this.star.style.top = this.starY + 'px';
    if (this.innerGlow) {
      this.innerGlow.style.left = this.starX + 'px';
      this.innerGlow.style.top = this.starY + 'px';
    }

    this.container.style.background = `
      linear-gradient(to top, rgba(${KV.vignette},1) 0%, rgba(${KV.vignette},0) 50%),
      radial-gradient(circle farthest-corner at ${this.starX}px ${this.starY}px, ${KV.bgStops.map(([c, p]) => `${c} ${(p * 100).toFixed(0)}%`).join(', ')})
    `;

    const isLogoMode = this.isEditor && pages.length > 0 && pages[activePageIdx] && pages[activePageIdx].logoMode;
    const { hw: excHW, hh: excHH } = calcExcDims(this.starSize, isLogoMode);
    const maxDist = Math.max(
      Math.sqrt(this.starX*this.starX + this.starY*this.starY),
      Math.sqrt((this.width-this.starX)**2 + this.starY**2),
      Math.sqrt(this.starX**2 + (this.height-this.starY)**2),
      Math.sqrt((this.width-this.starX)**2 + (this.height-this.starY)**2)
    );

    let t1 = 1, t2 = 1;
    if (this.introMode) {
      const tIntro = Math.min(1, (performance.now() - this.introStart) / 2000);
      t1 = Math.min(1, tIntro * 2);
      t2 = Math.max(0, tIntro * 2 - 1);
      this.star.style.opacity = t2;
      this.star.style.transform = `translate(-50%, -50%) scale(${0.5 + 0.5 * t2})`;
      if (this.innerGlow) this.innerGlow.style.opacity = t2;
    } else {
      this.star.style.opacity = 1;
      this.star.style.transform = 'translate(-50%, -50%)';
      if (this.innerGlow) this.innerGlow.style.opacity = 1;
    }

    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i];
      const inExc = isInExclusion(a.cx, a.cy, this.starX, this.starY, excHW, excHH);

      const dx = this.starX - a.cx, dy = this.starY - a.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToStar = Math.atan2(dx, -dy) * (180 / Math.PI);
      let influence = 1;
      if (FIXED_FORCE < 10) {
        const effRadius = this.maxInf * (FIXED_FORCE / 5);
        const t = Math.max(0, 1 - dist / effRadius);
        influence = t * t;
      }
      let delta = angleToStar - DEF_ROT;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      const tC = Math.min(1, dist / (maxDist || 1));

      const targetRot = DEF_ROT + delta * influence;
      const targetOp = 0.35 + 0.65 * influence;
      const [cr, cg, cb] = kvArrowRGB(tC);

      let curRot = targetRot;
      let curOp = targetOp;
      let curCr = cr, curCg = cg, curCb = cb;

      if (this.introMode) {
        const curtainX = t1 * (this.width + this.cell * 2);
        const curtainOp = Math.max(0, Math.min(1, (curtainX - a.cx + this.cell) / this.cell));

        curRot = DEF_ROT + (targetRot - DEF_ROT) * t2;

        const baseOp = 0.5;
        curOp = curtainOp * (baseOp + (targetOp - baseOp) * t2);

        // Intro startet neutral in der Nahfarbe und blendet in den Distanzverlauf
        const [nr, ng, nb] = kvArrowRGB(0);
        curCr = Math.round(nr + (cr - nr) * t2);
        curCg = Math.round(ng + (cg - ng) * t2);
        curCb = Math.round(nb + (cb - nb) * t2);

        if (inExc) {
          curRot = DEF_ROT;
          curOp = curtainOp * baseOp * (1 - t2);
          if (curOp <= 0) { a.el.style.display = 'none'; continue; }
          a.el.style.display = '';
        } else {
          if (curOp <= 0) { a.el.style.display = 'none'; continue; }
          a.el.style.display = '';
        }
      } else {
        if (inExc) { a.el.style.display = 'none'; continue; }
        a.el.style.display = '';
      }

      a.el.style.transform = `rotate(${curRot}deg)`;
      a.el.style.opacity = curOp;
      a.el.style.color = `rgb(${curCr},${curCg},${curCb})`;
    }

    if (this.isEditor) {
      pages[activePageIdx].starX = this.starX;
      pages[activePageIdx].starY = this.starY;
    }
  }

  getPos(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  onDown(e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') e.preventDefault();
    const { x, y } = this.getPos(e);
    const rect = this.container.getBoundingClientRect();
    const scaleX = rect.width / this.width;
    const scaleY = rect.height / this.height;
    const lx = (x - rect.left) / scaleX;
    const ly = (y - rect.top) / scaleY;
    const dx = lx - this.starX, dy = ly - this.starY;
    const r = this.starSize * 0.7;
    if (dx * dx + dy * dy < r * r) {
      this.dragging = true;
      this.star.classList.add('dragging');
    }
  }

  onMove(e) {
    const { x, y } = this.getPos(e);
    const rect = this.container.getBoundingClientRect();
    const scaleX = rect.width / this.width;
    const scaleY = rect.height / this.height;
    const lx = (x - rect.left) / scaleX;
    const ly = (y - rect.top) / scaleY;
    if (this.dragging) {
      e.preventDefault();
      this.starX = lx; this.starY = ly;
      requestAnimationFrame(() => this.update());
    } else {
      const dx = lx - this.starX, dy = ly - this.starY;
      this.container.style.cursor = dx*dx + dy*dy < (this.starSize*0.7)**2 ? 'grab' : 'default';
    }
  }

  onUp() {
    if (this.dragging) {
      this.dragging = false;
      this.star.classList.remove('dragging');
      this.starX = snapToGrid(this.starX, this.arrowSize, this.cell, this.offsetX);
      this.starY = snapToGrid(this.starY, this.arrowSize, this.cell, this.offsetY);
      this.update();
    }
  }

  resizePanel() {
    if (!this.isEditor) return;
    const pw = window.innerWidth - 80;
    const ph = window.innerHeight - 160;
    const scale = Math.min(pw / this.width, ph / this.height, 1);
    const wrapper = document.getElementById('editor-wrapper');
    if (scale < 1) {
      this.container.style.transform = `scale(${scale})`;
      this.container.style.transformOrigin = 'top left';
      wrapper.style.width = (this.width * scale) + 'px';
      wrapper.style.height = (this.height * scale) + 'px';
    } else {
      this.container.style.transform = 'none';
      wrapper.style.width = this.width + 'px';
      wrapper.style.height = this.height + 'px';
    }
  }
}

// --- Init engines ---
const mainEngine = new ArrowEngine(
  document.getElementById('main-view'),
  document.getElementById('main-inner-glow'),
  document.getElementById('main-star'),
  false
);

let mainInitialized = false;

function rebuildMain() {
  const w = window.innerWidth, h = window.innerHeight;
  // Initial position: bottom-left corner
  const sx = mainInitialized ? mainEngine.starX : w * 0.13;
  const sy = mainInitialized ? mainEngine.starY : h * 0.82;
  const isFirstLoad = !mainInitialized;
  mainInitialized = true;
  if (isFirstLoad) {
    mainEngine.introMode = true;
    mainEngine.introStart = performance.now();
  }
  mainEngine.init(w, h, sx, sy, mainArrowScale, mainStarScale);
  if (isFirstLoad) {
    mainEngine.animateIntro();
  }
}

const editorEngine = new ArrowEngine(
  document.getElementById('editor-panel'),
  document.getElementById('ed-inner-glow'),
  document.getElementById('ed-star'),
  true
);

// --- HUB VIEW ---
function showHubView() {
  hubVisible = true;
  const hub = document.getElementById('hub-view');
  document.getElementById('main-controls').style.display = 'none';
  hub.style.display = 'flex';
  // Double rAF ensures CSS transition fires
  requestAnimationFrame(() => requestAnimationFrame(() => hub.classList.add('faded-in')));
}

function hideHubView() {
  const hub = document.getElementById('hub-view');
  hub.classList.remove('faded-in');
  hub.style.display = 'none';
}

function restoreHubView() {
  const hub = document.getElementById('hub-view');
  hub.style.display = 'flex';
  hub.classList.add('faded-in');
}

// --- SECTION PANELS ---
function openSection(id) {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById(id).classList.add('visible');
}
function closeSection(id) {
  document.getElementById(id).classList.remove('visible');
  if (!document.querySelector('.section-panel.visible')) {
    document.getElementById('main-view').style.display = 'block';
  }
}

document.getElementById('back-from-logo').addEventListener('click', () => closeSection('section-logo'));
document.getElementById('back-from-farben').addEventListener('click', () => closeSection('section-farben'));
document.getElementById('back-from-teams').addEventListener('click', () => closeSection('section-teams'));

// --- HUB TILES ---
document.getElementById('tile-logo').addEventListener('click', () => openSection('section-logo'));
document.getElementById('tile-farben').addEventListener('click', () => {
  buildColorsGrid();
  openSection('section-farben');
});
document.getElementById('tile-teams').addEventListener('click', () => {
  buildTeamsGrid();
  openSection('section-teams');
});
document.getElementById('tile-keyvisual').addEventListener('click', () => {
  addMode = false;
  document.getElementById('modal-overlay').classList.add('visible');
});

// --- MAIN SCALE CONTROLS ---
const mainScaleSlider = document.getElementById('main-scale-slider');
const mainScaleValue = document.getElementById('main-scale-value');
const mainArrowScaleSlider = document.getElementById('main-arrow-scale-slider');
const mainArrowScaleValue = document.getElementById('main-arrow-scale-value');
const mainStarScaleSlider = document.getElementById('main-star-scale-slider');
const mainStarScaleValue = document.getElementById('main-star-scale-value');
const mainScaleSingle = document.getElementById('main-scale-single');
const mainScaleDual = document.getElementById('main-scale-dual');
const mainLockBtn = document.getElementById('main-lock-btn');

mainScaleSlider.addEventListener('input', () => {
  const v = parseInt(mainScaleSlider.value);
  mainScaleValue.textContent = v;
  mainArrowScale = mainStarScale = (v + 1) * 0.5;
  mainArrowScaleSlider.value = mainStarScaleSlider.value = v;
  mainArrowScaleValue.textContent = mainStarScaleValue.textContent = v;
  rebuildMain();
});
mainArrowScaleSlider.addEventListener('input', () => {
  const v = parseInt(mainArrowScaleSlider.value);
  mainArrowScaleValue.textContent = v;
  mainArrowScale = (v + 1) * 0.5;
  rebuildMain();
});
mainStarScaleSlider.addEventListener('input', () => {
  const v = parseInt(mainStarScaleSlider.value);
  mainStarScaleValue.textContent = v;
  mainStarScale = (v + 1) * 0.5;
  rebuildMain();
});

const ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
const ICON_UNLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';

mainLockBtn.addEventListener('click', () => {
  mainScaleLocked = !mainScaleLocked;
  mainLockBtn.innerHTML = mainScaleLocked ? ICON_LOCK : ICON_UNLOCK;
  mainLockBtn.classList.toggle('locked', mainScaleLocked);
  if (mainScaleLocked) {
    mainStarScale = mainArrowScale;
    const v = Math.round(mainArrowScale * 2 - 1);
    mainScaleSlider.value = v; mainScaleValue.textContent = v;
    mainScaleSingle.style.display = ''; mainScaleDual.style.display = 'none';
    rebuildMain();
  } else {
    mainScaleSingle.style.display = 'none'; mainScaleDual.style.display = '';
  }
});

// --- EDITOR SCALE CONTROLS ---
const edScaleSlider = document.getElementById('ed-scale-slider');
const edScaleValue = document.getElementById('ed-scale-value');
const edArrowScaleSlider = document.getElementById('ed-arrow-scale-slider');
const edArrowScaleValue = document.getElementById('ed-arrow-scale-value');
const edStarScaleSlider = document.getElementById('ed-star-scale-slider');
const edStarScaleValue = document.getElementById('ed-star-scale-value');
const edScaleSingle = document.getElementById('ed-scale-single');
const edScaleDual = document.getElementById('ed-scale-dual');
const edLockBtn = document.getElementById('ed-lock-btn');

function applyEditorScale() {
  const p = pages[activePageIdx];
  if (!p) return;
  editorEngine.init(p.w, p.h, p.starX, p.starY, p.arrowScale, p.starScale, p.offsetX, p.offsetY);
}

edScaleSlider.addEventListener('input', () => {
  const v = parseInt(edScaleSlider.value);
  edScaleValue.textContent = v;
  const p = pages[activePageIdx];
  p.arrowScale = p.starScale = (v + 1) * 0.5;
  edArrowScaleSlider.value = edStarScaleSlider.value = v;
  edArrowScaleValue.textContent = edStarScaleValue.textContent = v;
  applyEditorScale();
});
edArrowScaleSlider.addEventListener('input', () => {
  const v = parseInt(edArrowScaleSlider.value);
  edArrowScaleValue.textContent = v;
  pages[activePageIdx].arrowScale = (v + 1) * 0.5;
  applyEditorScale();
});
edStarScaleSlider.addEventListener('input', () => {
  const v = parseInt(edStarScaleSlider.value);
  edStarScaleValue.textContent = v;
  pages[activePageIdx].starScale = (v + 1) * 0.5;
  applyEditorScale();
});
edLockBtn.addEventListener('click', () => {
  const p = pages[activePageIdx];
  p.scaleLocked = !p.scaleLocked;
  edLockBtn.innerHTML = p.scaleLocked ? ICON_LOCK : ICON_UNLOCK;
  edLockBtn.classList.toggle('locked', p.scaleLocked);
  if (p.scaleLocked) {
    p.starScale = p.arrowScale;
    const v = Math.round(p.arrowScale * 2 - 1);
    edScaleSlider.value = v; edScaleValue.textContent = v;
    edScaleSingle.style.display = ''; edScaleDual.style.display = 'none';
    applyEditorScale();
  } else {
    edScaleSingle.style.display = 'none'; edScaleDual.style.display = '';
  }
});

function syncEditorScaleUI() {
  const p = pages[activePageIdx];
  if (!p) return;
  const aV = Math.round(p.arrowScale * 2 - 1);
  const sV = Math.round(p.starScale * 2 - 1);
  edArrowScaleSlider.value = aV; edArrowScaleValue.textContent = aV;
  edStarScaleSlider.value = sV; edStarScaleValue.textContent = sV;
  edLockBtn.innerHTML = p.scaleLocked ? ICON_LOCK : ICON_UNLOCK;
  edLockBtn.classList.toggle('locked', p.scaleLocked);
  if (p.scaleLocked) {
    edScaleSlider.value = aV; edScaleValue.textContent = aV;
    edScaleSingle.style.display = ''; edScaleDual.style.display = 'none';
  } else {
    edScaleSingle.style.display = 'none'; edScaleDual.style.display = '';
  }
}

// --- RESIZE ---
let mainResizeTimer;
window.addEventListener('resize', () => {
  if (!document.getElementById('editor-view').classList.contains('visible')) {
    rebuildMain();
    clearTimeout(mainResizeTimer);
    mainResizeTimer = setTimeout(() => {
      document.getElementById('main-grain').style.backgroundImage = `url(${generateGrainImage(window.innerWidth, window.innerHeight)})`;
    }, 150);
  } else {
    editorEngine.resizePanel();
  }
});

window.addEventListener('load', () => {
  rebuildMain();
  document.getElementById('main-grain').style.backgroundImage = `url(${generateGrainImage(window.innerWidth, window.innerHeight)})`;
});

rebuildMain();
document.getElementById('main-grain').style.backgroundImage = `url(${generateGrainImage(window.innerWidth, window.innerHeight)})`;

// --- FORMAT MODAL ---
let addMode = false;
const mOverlay = document.getElementById('modal-overlay');
const fW = document.getElementById('fmt-width');
const fH = document.getElementById('fmt-height');
const defScale = (DEFAULT_SCALE + 1) * 0.5;

document.getElementById('btn-open-layout-modal').addEventListener('click', () => {
  addMode = false; mOverlay.classList.add('visible');
});
document.getElementById('btn-add-page').addEventListener('click', () => {
  addMode = true; mOverlay.classList.add('visible');
});
document.getElementById('btn-modal-cancel').addEventListener('click', () => mOverlay.classList.remove('visible'));
document.getElementById('btn-modal-confirm').addEventListener('click', () => {
  const w = parseInt(fW.value), h = parseInt(fH.value);
  if (!w || !h || w < 100 || h < 100) return alert('Bitte gültige Werte eingeben (min 100)');
  const newPage = { w, h, starX: w * 0.5, starY: h * 0.5, arrowScale: defScale, starScale: defScale, scaleLocked: true, offsetX: 0, offsetY: 0, logoMode: false };
  mOverlay.classList.remove('visible');
  if (addMode) {
    pages.push(newPage); activePageIdx = pages.length - 1; renderEditorPage();
  } else {
    pages = [newPage]; activePageIdx = 0; openEditor();
  }
});

document.querySelectorAll('.format-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fW.value = btn.getAttribute('data-w');
    fH.value = btn.getAttribute('data-h');
  });
});

// --- EDITOR NAV ---
const edMain = document.getElementById('main-view');
const edControls = document.getElementById('main-controls');
const edView = document.getElementById('editor-view');

function openEditor() {
  edMain.style.display = 'none';
  edControls.style.display = 'none';
  hideHubView();
  edView.classList.add('visible');
  renderEditorPage();
}

document.getElementById('btn-leave-editor').addEventListener('click', () => {
  edView.classList.remove('visible');
  edMain.style.display = 'block';
  if (hubVisible) {
    restoreHubView();
  } else {
    edControls.style.display = 'flex';
  }
});

document.getElementById('btn-prev-page').addEventListener('click', () => {
  if (activePageIdx > 0) { activePageIdx--; renderEditorPage(); }
});
document.getElementById('btn-next-page').addEventListener('click', () => {
  if (activePageIdx < pages.length - 1) { activePageIdx++; renderEditorPage(); }
});

// --- DELETE PAGE ---
document.getElementById('btn-delete-page').addEventListener('click', () => {
  if (pages.length <= 1) return;
  pages.splice(activePageIdx, 1);
  if (activePageIdx >= pages.length) activePageIdx = pages.length - 1;
  renderEditorPage();
});

// --- MOVE CANVAS ---
const btnMove = document.getElementById('btn-move-canvas');
let movingCanvas = false;
let moveStartX, moveStartY, initOffX, initOffY, initStarX, initStarY;

btnMove.addEventListener('mousedown', (e) => {
  e.preventDefault();
  movingCanvas = true;
  moveStartX = e.clientX; moveStartY = e.clientY;
  const p = pages[activePageIdx];
  initOffX = p.offsetX || 0; initOffY = p.offsetY || 0;
  initStarX = p.starX; initStarY = p.starY;
  document.body.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (!movingCanvas) return;
  const scale = editorEngine.container.getBoundingClientRect().width / editorEngine.width;
  const dx = (e.clientX - moveStartX) / scale;
  const dy = (e.clientY - moveStartY) / scale;
  const p = pages[activePageIdx];
  p.offsetX = initOffX + dx;
  p.offsetY = initOffY + dy;
  p.starX = initStarX + dx;
  p.starY = initStarY + dy;
  editorEngine.starX = p.starX;
  editorEngine.starY = p.starY;
  editorEngine.offsetX = p.offsetX;
  editorEngine.offsetY = p.offsetY;
  editorEngine.init(p.w, p.h, p.starX, p.starY, p.arrowScale, p.starScale, p.offsetX, p.offsetY);
});

window.addEventListener('mouseup', () => {
  if (movingCanvas) {
    movingCanvas = false;
    document.body.style.cursor = '';
  }
});

// --- RENDER PAGE ---
const pagText = document.getElementById('pagination-text');
const edTitle = document.getElementById('editor-title-text');

function renderEditorPage() {
  const p = pages[activePageIdx];
  edTitle.textContent = `Layout (${p.w} × ${p.h} px)`;
  pagText.textContent = `Seite ${activePageIdx + 1} von ${pages.length}`;
  syncEditorScaleUI();
  document.getElementById('ed-grain').style.backgroundImage = `url(${generateGrainImage(p.w, p.h)})`;
  editorEngine.init(p.w, p.h, p.starX, p.starY, p.arrowScale, p.starScale, p.offsetX, p.offsetY);
  document.getElementById('btn-delete-page').style.display = pages.length > 1 ? 'flex' : 'none';
  const cb = document.getElementById('logo-mode-cb');
  cb.checked = !!p.logoMode;
  document.getElementById('logo-mode-wrap').style.visibility = 'visible';
}

document.getElementById('logo-mode-cb').addEventListener('change', (e) => {
  const p = pages[activePageIdx];
  if (!p) return;
  p.logoMode = e.target.checked;
  editorEngine.init(p.w, p.h, p.starX, p.starY, p.arrowScale, p.starScale, p.offsetX, p.offsetY);
});

// --- EXPORT helpers ---
function computeExportArrows(p) {
  const arrowSize = BASE_ARROW_SIZE * p.arrowScale;
  const gap = BASE_GAP * p.arrowScale;
  const cell = arrowSize + gap;
  const starSize = BASE_STAR_SIZE * p.starScale;
  const maxInf = MAX_INF_CELLS * cell;
  const offX = p.offsetX || 0;
  const offY = p.offsetY || 0;
  const sX = snapToGrid(p.starX, arrowSize, cell, offX);
  const sY = snapToGrid(p.starY, arrowSize, cell, offY);
  const { hw: excHW, hh: excHH } = calcExcDims(starSize, !!p.logoMode);

  const farthestCorner = Math.max(
    Math.sqrt(sX*sX + sY*sY),
    Math.sqrt((p.w-sX)**2 + sY**2),
    Math.sqrt(sX**2 + (p.h-sY)**2),
    Math.sqrt((p.w-sX)**2 + (p.h-sY)**2)
  );

  const list = [];
  const start = -cell;
  for (let y = start; y < p.h + cell; y += cell) {
    for (let x = start; x < p.w + cell; x += cell) {
      const cx = x + offX + arrowSize / 2, cy = y + offY + arrowSize / 2;
      if (isInExclusion(cx, cy, sX, sY, excHW, excHH)) continue;
      const dx = sX - cx, dy = sY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToStar = Math.atan2(dx, -dy) * (180 / Math.PI);
      let influence = 1;
      if (FIXED_FORCE < 10) {
        const effRadius = maxInf * (FIXED_FORCE / 5);
        const t = Math.max(0, 1 - dist / effRadius);
        influence = t * t;
      }
      let delta = angleToStar - DEF_ROT;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      const tC = Math.min(1, dist / (farthestCorner || 1));
      const color = `rgb(${kvArrowRGB(tC).join(',')})`;
      list.push({ cx, cy, rot: DEF_ROT + delta * influence, op: 0.35 + 0.65 * influence, arrowSize, color });
    }
  }
  return { list, arrowSize, starSize, maxInf, sX, sY };
}

// --- PNG EXPORT ---
document.getElementById('btn-download').addEventListener('click', () => {
  const p = pages[activePageIdx];
  const { list, arrowSize, starSize, sX, sY } = computeExportArrows(p);
  const cvs = document.createElement('canvas');
  cvs.width = p.w; cvs.height = p.h;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = KV.bgStops[0][0]; ctx.fillRect(0, 0, p.w, p.h);
  const farthestCorner = Math.sqrt(Math.max(sX*sX, (p.w-sX)*(p.w-sX)) + Math.max(sY*sY, (p.h-sY)*(p.h-sY)));
  const bgGrad = ctx.createRadialGradient(sX, sY, 0, sX, sY, farthestCorner);
  KV.bgStops.forEach(([c, pos]) => bgGrad.addColorStop(pos, c));
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, p.w, p.h);

  const botGrad = ctx.createLinearGradient(0, p.h, 0, p.h * 0.5);
  botGrad.addColorStop(0, `rgba(${KV.vignette},1)`); botGrad.addColorStop(1, `rgba(${KV.vignette},0)`);
  ctx.fillStyle = botGrad; ctx.fillRect(0, 0, p.w, p.h);

  const imgData = ctx.getImageData(0, 0, p.w, p.h);
  const d = imgData.data;
  // Grain wird hier direkt in die opake Fläche gemischt (Alpha bleibt 255)
  const gA = KV.grainAlpha / 255;
  for (let y = 0; y < p.h; y++) {
    const t = y / p.h;
    let factor = t < 0.1 ? 1.0 : Math.max(0, 1 - ((t - 0.1) / 0.25));
    const density = 0.65 * Math.pow(factor, 1.8) + 0.001;
    for (let x = 0; x < p.w; x++) {
      if (Math.random() < density) {
        const i = (y * p.w + x) * 4;
        d[i]   = Math.round(d[i]   + (KV.grain[0] - d[i])   * gA);
        d[i+1] = Math.round(d[i+1] + (KV.grain[1] - d[i+1]) * gA);
        d[i+2] = Math.round(d[i+2] + (KV.grain[2] - d[i+2]) * gA);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.fillStyle = `rgba(${KV.grain[0]},${KV.grain[1]},${KV.grain[2]},${(KV.grainAlpha / 255).toFixed(3)})`;
  for (let i = 0; i < p.w * p.h * 0.001; i++) {
    const x = Math.random() * p.w | 0;
    const y = (p.h * (0.3 + Math.random() * 0.7)) | 0;
    ctx.fillRect(x, y, 1, 1);
  }

  const arrowPath = new Path2D(ARROW_PATH_D);
  const arrowScaleFactor = arrowSize / 16.78;
  list.forEach(a => {
    ctx.save();
    ctx.translate(a.cx, a.cy);
    ctx.rotate(a.rot * Math.PI / 180);
    ctx.globalAlpha = a.op;
    ctx.translate(-a.arrowSize/2, -a.arrowSize/2);
    ctx.scale(arrowScaleFactor, arrowScaleFactor);
    ctx.fillStyle = a.color;
    ctx.fill(arrowPath);
    ctx.restore();
  });

  const innerGrad = ctx.createRadialGradient(sX, sY, 0, sX, sY, starSize);
  innerGrad.addColorStop(0, `rgba(${KV.glow},${KV.glowAlpha})`);
  innerGrad.addColorStop(1, `rgba(${KV.glow},0)`);
  ctx.fillStyle = innerGrad;
  ctx.fillRect(sX - starSize, sY - starSize, starSize * 2, starSize * 2);

  const finishPngExport = () => {
    try {
      const link = document.createElement('a');
      link.download = `layout_seite${activePageIdx+1}_${p.w}x${p.h}.png`;
      link.href = cvs.toDataURL('image/png');
      link.click();
    } catch (e) { alert('Fehler beim PNG Export.'); console.error(e); }
  };

  if (p.logoMode) {
    const logoH = starSize;
    const logoW = Math.round(logoH * LOGO_ASPECT);
    if (logoImgNode.complete && logoImgNode.naturalWidth > 0) {
      ctx.save(); ctx.globalAlpha = 1;
      ctx.drawImage(logoImgNode, sX - logoW / 2, sY - logoH / 2, logoW, logoH);
      ctx.restore();
      finishPngExport();
    } else {
      const tmp = new Image();
      tmp.onload = () => {
        ctx.save(); ctx.globalAlpha = 1;
        ctx.drawImage(tmp, sX - logoW / 2, sY - logoH / 2, logoW, logoH);
        ctx.restore();
        finishPngExport();
      };
      tmp.src = logoDataUri;
    }
  } else {
    ctx.save(); ctx.globalAlpha = 1;
    ctx.translate(sX, sY);
    ctx.drawImage(starImgNode, -starSize/2, -starSize/2, starSize, starSize);
    ctx.restore();
    finishPngExport();
  }
});

// --- SVG EXPORT ---
document.getElementById('btn-download-svg').addEventListener('click', () => {
  const p = pages[activePageIdx];
  const { list, arrowSize, starSize, sX, sY } = computeExportArrows(p);
  const scaleF = (arrowSize / 16.78).toFixed(6);
  const halfOrig = (16.78 / 2).toFixed(4);

  let s = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  s += `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${p.w} ${p.h}" width="${p.w}" height="${p.h}">\n`;
  s += `<defs>\n`;
  s += `  <radialGradient id="bg_rad" cx="${sX}" cy="${sY}" r="100%" gradientUnits="userSpaceOnUse">\n`;
  KV.bgStops.forEach(([c, pos]) => {
    s += `    <stop offset="${(pos * 100).toFixed(0)}%" stop-color="${c}"/>\n`;
  });
  s += `  </radialGradient>\n`;
  s += `  <linearGradient id="bg_lin" x1="0" y1="1" x2="0" y2="0">\n`;
  s += `    <stop offset="0%" stop-color="#000000" stop-opacity="1"/>\n`;
  s += `    <stop offset="50%" stop-color="#000000" stop-opacity="0"/>\n`;
  s += `    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>\n`;
  s += `  </linearGradient>\n`;
  s += `  <radialGradient id="inner_glow" cx="${sX}" cy="${sY}" r="${starSize}" gradientUnits="userSpaceOnUse">\n`;
  s += `    <stop offset="0%" stop-color="#cefb0b" stop-opacity="${KV.glowAlpha}"/>\n`;
  s += `    <stop offset="100%" stop-color="#cefb0b" stop-opacity="0"/>\n`;
  s += `  </radialGradient>\n`;
  s += `</defs>\n`;
  s += `<rect width="${p.w}" height="${p.h}" fill="url(#bg_rad)"/>\n`;
  s += `<rect width="${p.w}" height="${p.h}" fill="url(#bg_lin)"/>\n`;
  s += `<image xlink:href="${generateGrainImage(p.w, p.h)}" width="${p.w}" height="${p.h}" preserveAspectRatio="none" />\n`;
  s += `<g id="arrows">\n`;
  list.forEach(a => {
    s += `  <g transform="translate(${a.cx.toFixed(2)},${a.cy.toFixed(2)}) rotate(${a.rot.toFixed(2)}) scale(${scaleF}) translate(-${halfOrig},-${halfOrig})" opacity="${a.op.toFixed(3)}">\n`;
    s += `    <path fill="${a.color}" d="${ARROW_PATH_D}"/>\n  </g>\n`;
  });
  s += `</g>\n`;
  s += `<circle cx="${sX}" cy="${sY}" r="${starSize}" fill="url(#inner_glow)"/>\n`;
  if (p.logoMode) {
    const logoH = starSize;
    const logoW = Math.round(logoH * LOGO_ASPECT);
    const lx = (sX - logoW / 2).toFixed(2);
    const ly = (sY - logoH / 2).toFixed(2);
    s += `<image href="${logoDataUri}" x="${lx}" y="${ly}" width="${logoW}" height="${logoH}"/>\n`;
  } else {
    const starScaleV = (starSize / 59.8).toFixed(6);
    const starOX = (sX - starSize / 2).toFixed(2);
    const starOY = (sY - starSize / 2).toFixed(2);
    s += `<g transform="translate(${starOX},${starOY}) scale(${starScaleV})">\n`;
    STAR_PATHS.forEach(d => { s += `  <path fill="${KV.star}" d="${d}"/>\n`; });
    s += `</g>\n`;
  }
  s += `</svg>`;

  const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `layout_seite${activePageIdx+1}_${p.w}x${p.h}.svg`;
  link.href = url; link.click();
  URL.revokeObjectURL(url);
});

// =====================================================================
// LOGO SECTION
// =====================================================================

// Drei Varianten, je in Weiß und Schwarz. Jede Farbe wird immer auf dem
// jeweils gegenteiligen Untergrund gezeigt (Weiß auf Schwarz, Schwarz auf
// Weiß) – keine Sprach- oder Anwendungsauswahl mehr nötig.
const MC_LOGO_VARIANTS = {
  logo:  { label: 'Logo',           white: 'assets/logo-mc/logo-white.svg',       black: 'assets/logo-mc/logo-black.svg' },
  claim: { label: 'Logo mit Claim', white: 'assets/logo-mc/logo-claim-white.svg', black: 'assets/logo-mc/logo-claim-black.svg' },
  short: { label: 'Short Logo',     white: 'assets/logo-mc/logo-short-white.svg', black: 'assets/logo-mc/logo-short-black.svg' }
};
let logoVariant = 'logo';

function getLogoFilename(color) {
  const labelSlug = MC_LOGO_VARIANTS[logoVariant].label.replace(/\s+/g, '_');
  const colorLabel = color === 'white' ? 'Weiss' : 'Schwarz';
  return `mc_${labelSlug}_${colorLabel}`;
}

function updateLogoPreview() {
  const v = MC_LOGO_VARIANTS[logoVariant];
  document.getElementById('logo-preview-white').src = v.white;
  document.getElementById('logo-preview-black').src = v.black;
}

// Varianten-Chips
document.querySelectorAll('#logo-variant-group .filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#logo-variant-group .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    logoVariant = chip.dataset.variant;
    updateLogoPreview();
  });
});

function downloadLogoSvg(color) {
  const link = document.createElement('a');
  link.href = MC_LOGO_VARIANTS[logoVariant][color];
  link.download = getLogoFilename(color) + '.svg';
  link.click();
}

function downloadLogoPng(color) {
  const widthInput = document.getElementById('logo-png-width');
  const pxWidth = parseInt(widthInput.value);
  if (!pxWidth || pxWidth < 50) return showToast('Bitte eine gültige Breite eingeben.');

  const img = new Image();
  img.onload = () => {
    const aspect = img.naturalHeight / img.naturalWidth;
    const pxHeight = Math.round(pxWidth * aspect);
    const canvas = document.createElement('canvas');
    canvas.width = pxWidth;
    canvas.height = pxHeight;
    const ctx = canvas.getContext('2d');
    // Gegenfarbige Fläche, damit das PNG nicht auf transparentem Grund
    // unsichtbar wird (weißes Logo braucht einen dunklen Grund und umgekehrt).
    ctx.fillStyle = color === 'white' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, pxWidth, pxHeight);
    ctx.drawImage(img, 0, 0, pxWidth, pxHeight);
    const link = document.createElement('a');
    link.download = getLogoFilename(color) + `_${pxWidth}px.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.onerror = () => showToast('Fehler beim Laden des Logos.');
  img.src = MC_LOGO_VARIANTS[logoVariant][color];
}

document.getElementById('btn-logo-svg-white').addEventListener('click', () => downloadLogoSvg('white'));
document.getElementById('btn-logo-svg-black').addEventListener('click', () => downloadLogoSvg('black'));
document.getElementById('btn-logo-png-white').addEventListener('click', () => downloadLogoPng('white'));
document.getElementById('btn-logo-png-black').addEventListener('click', () => downloadLogoPng('black'));

updateLogoPreview();

// =====================================================================
// FARBEN SECTION
// =====================================================================

// Farbpalette gemäß mc_Slides_Master (Corporate Design mc-quadrat)
const MC_COLORS = [
  { name: "black",          hex: "#000000" },
  { name: "white",          hex: "#ffffff" },

  { name: "lime-100",       hex: "#ebfd9b" },
  { name: "lime",           hex: "#cefb0b" },
  { name: "lime-900",       hex: "#b5dd03" },

  { name: "turquoise-100",  hex: "#c2ffff" },
  { name: "turquoise",      hex: "#00fdff" },
  { name: "turquoise-900",  hex: "#00e0e0" },

  { name: "blue-100",       hex: "#85ccff" },
  { name: "blue",           hex: "#0096ff" },
  { name: "blue-900",       hex: "#0083e0" },

  { name: "berry-100",      hex: "#ff99ca" },
  { name: "berry",          hex: "#ff2f92" },
  { name: "berry-900",      hex: "#e0006c" },

  { name: "Grey 5",         hex: "#222222" },
  { name: "Grey 4",         hex: "#7f7f7f" },
  { name: "Grey 3",         hex: "#cfcfcf" },
  { name: "Grey 2",         hex: "#dadad9" },
  { name: "Grey 1",         hex: "#f2f2f2" }
];

function hexToRgbString(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

let colorsGridBuilt = false;

function buildColorsGrid() {
  if (colorsGridBuilt) return;
  colorsGridBuilt = true;
  const grid = document.getElementById('colors-grid');

  MC_COLORS.forEach(color => {
    const tile = document.createElement('div');
    tile.className = 'color-swatch';

    const swatch = document.createElement('div');
    swatch.className = 'swatch-color';
    swatch.style.background = color.hex;

    const info = document.createElement('div');
    info.className = 'swatch-info';
    info.innerHTML = `<div class="swatch-name">${color.name}</div>`
      + `<div class="swatch-hex">${color.hex}</div>`
      + `<div class="swatch-rgb">RGB ${hexToRgbString(color.hex)}</div>`;

    const copied = document.createElement('div');
    copied.className = 'swatch-copied';
    copied.textContent = 'Kopiert!';

    tile.appendChild(swatch);
    tile.appendChild(info);
    tile.appendChild(copied);

    tile.addEventListener('click', () => {
      navigator.clipboard.writeText(color.hex).then(() => {
        tile.classList.add('flash');
        showToast(`${color.hex} kopiert`);
        setTimeout(() => tile.classList.remove('flash'), 700);
      }).catch(() => {
        // Fallback for file:// protocol
        const ta = document.createElement('textarea');
        ta.value = color.hex;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        tile.classList.add('flash');
        showToast(`${color.hex} kopiert`);
        setTimeout(() => tile.classList.remove('flash'), 700);
      });
    });

    grid.appendChild(tile);
  });
}

// =====================================================================
// TEAMS HINTERGRUND – automatische Ordner-Erkennung
// =====================================================================

const TEAMS_DIR = 'assets/teams/';
const TEAMS_IMG_EXT = ['png', 'jpg', 'jpeg'];
// Bekannte, aktuelle Dateien als Rückfallebene, falls die Verzeichnis-Erkennung
// scheitert (z. B. andere Hosting-Umgebung ohne Verzeichnislisten oder file://).
const TEAMS_FALLBACK = ['v1.png', 'v2.png'];

let teamsGridBuilt = false;

/* Liest den Ordnerinhalt über die Verzeichnisliste des lokalen Servers.
   Zwei Server-Antworten werden verstanden:
   - JSON-Verzeichnisliste (z. B. der "serve"-Dev-Server auf Anfrage mit
     Accept: application/json)
   - klassische HTML-Verzeichnisliste mit <a href="…">-Einträgen (Standard
     bei python -m http.server, nginx autoindex, Apache mod_autoindex u. a.)
   Funktioniert nur, solange der Ordner selbst über HTTP erreichbar ist –
   auf file:// oder ohne jede Verzeichnisliste greift der Fallback. */
async function listTeamsFiles() {
  try {
    const res = await fetch(TEAMS_DIR, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();

    let names = [];
    try {
      const data = JSON.parse(text);
      names = (data.files || [])
        .filter(f => f.type === 'file' && TEAMS_IMG_EXT.includes((f.ext || '').toLowerCase()))
        .map(f => f.base);
    } catch (jsonErr) {
      // Keine JSON-Antwort -> als HTML-Verzeichnisliste interpretieren
      const doc = new DOMParser().parseFromString(text, 'text/html');
      names = [...doc.querySelectorAll('a[href]')]
        .map(a => decodeURIComponent(a.getAttribute('href').split('/').pop() || ''))
        .filter(name => TEAMS_IMG_EXT.includes((name.split('.').pop() || '').toLowerCase()));
    }

    names = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    if (names.length) return names;
  } catch (e) { /* Fallback unten */ }
  return TEAMS_FALLBACK;
}

function teamsLabelFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(\d+)\s*$/);
  return m ? `Version ${m[1]}` : base.replace(/[_-]+/g, ' ');
}

function buildTeamsGrid() {
  if (teamsGridBuilt) return;
  teamsGridBuilt = true;
  const grid = document.getElementById('teams-grid');

  listTeamsFiles().then(names => {
    names.forEach(name => {
      const src = TEAMS_DIR + name;

      const card = document.createElement('div');
      card.className = 'teams-card';

      const wrap = document.createElement('div');
      wrap.className = 'teams-preview-wrap';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Teams Hintergrund – ' + name;
      wrap.appendChild(img);

      const footer = document.createElement('div');
      footer.className = 'teams-card-footer';
      const label = document.createElement('div');
      label.className = 'teams-card-label';
      label.textContent = teamsLabelFromFilename(name);
      const meta = document.createElement('div');
      meta.className = 'teams-card-meta';
      meta.textContent = 'RGB · ' + name.split('.').pop().toUpperCase();

      const dl = document.createElement('a');
      dl.className = 'download-btn';
      dl.href = src;
      dl.download = 'mc_Teams_Hintergrund_' + name.replace(/[_-]+/g, '_');
      dl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Herunterladen';

      // Echte Maße erst nach dem Laden eintragen – so ist die Angabe nie
      // veraltet, egal welche Datei im Ordner liegt.
      img.addEventListener('load', () => {
        meta.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · RGB · ${name.split('.').pop().toUpperCase()}`;
      });

      footer.appendChild(label);
      footer.appendChild(meta);
      footer.appendChild(dl);
      card.appendChild(wrap);
      card.appendChild(footer);
      grid.appendChild(card);
    });
  });
}

// =====================================================================
// TOAST
// =====================================================================

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
