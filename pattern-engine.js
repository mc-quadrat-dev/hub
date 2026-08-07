// =====================================================================
// PATTERN-ENGINE (unverändert übernommen aus dem Muster-Prototyp)
//  1. PatternWave – animiertes SVG-Pattern, abhängigkeitsfrei
//  2. PW_TILE_POINTS – Geometrie der Basis-Kachel
//  3. gifenc v1.0.3 (MIT, Matt DesLauriers) – GIF-Encoder
// Die mc-spezifische Oberfläche liegt in pattern.js.
// =====================================================================

/* =============================================================================
 * PatternWave – animiertes SVG-Hintergrund-Pattern ("Sound of Conil")
 * -----------------------------------------------------------------------------
 * Framework-unabhängig, keine Abhängigkeiten. Bindet ein einzelnes Kachel-SVG
 * (das Basis-Tile) in einen Container ein, wiederholt es vertikal und animiert
 * jedes Polygon einzeln als sanfte "Welle".
 *
 * Bewegungsidee:
 *   - Einblenden als Welle von LINKS nach RECHTS   (Startverzögerung ∝ x)
 *   - kurzes Verharren (alle Elemente sichtbar = wie das Stand-Bild)
 *   - Ausblenden als Welle von RECHTS nach LINKS   (Startverzögerung ∝ 1−x)
 *   - kurze Pause, dann von vorn (nahtloser Loop)
 *
 * Alle sichtbaren Eigenschaften hängen an EINEM CONFIG-Objekt (siehe DEFAULTS).
 * Die Werte lassen sich zur Laufzeit ändern (instance.setConfig({...})).
 *
 * Deterministisch: renderAt(t) berechnet den Frame allein aus der Zeit t
 * (keine Zufallszahlen pro Frame) → identisch bei jedem Aufruf, ideal fürs
 * bildgenaue MP4-Rendering.
 * ========================================================================== */
(function (global) {
  'use strict';

  var VBW = 964.1;      // viewBox-Breite des Basis-Tiles
  var TILE_H = 342.11;  // vertikale Kachel-Periode (nahtlose Wiederholung)

  // ---- Standard-Konfiguration --------------------------------------------
  // Diese Werte sind die "Single Source of Truth". Das Vorschau-Panel schreibt
  // live in eine Kopie hiervon; der "Werte kopieren"-Button gibt genau dieses
  // Objekt als Code aus.
  var DEFAULTS = {
    // — Tempo / Welle —  (Werte sind loop-sicher: die Engine erzwingt immer einen
    //   sauberen, leeren Gap → perfekter, nahtloser Loop, egal was eingestellt wird)
    loopDuration: 18,     // Sekunden pro kompletter Ein-/Ausblend-Zyklus
    waveSpread: 0.38,     // Wie breit die Welle über die Fläche gestaffelt ist (0..1 des Zyklus)
    fadeSoftness: 0.03,   // Ein-/Ausblend-Dauer eines einzelnen Elements (0..1 des Zyklus)
    holdFraction: 0.3,    // Anteil des Zyklus, in dem alles voll sichtbar bleibt
    jitter: 0.03,         // Zufalls-Streuung der Startzeiten (nur vorwärts, 0 = mechanisch)
    easing: 'smooth',     // 'linear' | 'sine' | 'smooth' | 'back'
    direction: 'ltr',     // 'ltr' | 'rtl' | 'ttb' | 'btt' | 'diag' | 'diag-rev'

    // — Charakter pro Element —
    opacityMin: 0.1,      // Deckkraft im "verschwunden"-Zustand (0 = Loop startet/endet leer)
    opacityMax: 1.0,      // Deckkraft im "voll sichtbar"-Zustand
    scaleShare: 0.6,      // Anteil Elemente, die skalieren (0..1)
    scaleMin: 0.85,       // Startgröße beim Einblenden (1 = kein Skalieren)
    rotateShare: 0.3,     // Anteil Elemente, die rotieren (0..1)
    rotateDeg: 5,         // maximaler Drehwinkel (Grad), wird zum Peak hin auf 0 abgebaut
    rotateDir: 'random',  // 'cw' | 'ccw' | 'random'

    // — Zusatz-Bewegungen —
    shimmerEnabled: false,
    shimmerAmount: 0.1,   // Amplitude des Dauer-Pulsierens (Deckkraft)
    shimmerSpeed: 1,      // Pulse pro Loop (wird auf ganze Zahl gerundet → loop-periodisch)
    driftEnabled: false,
    driftAmount: 4,       // max. Positions-Versatz beim Ein-/Ausblenden (SVG-Einheiten)

    // — Layout / Darstellung —
    coverWidthFactor: 0.61, // Basis-Tile-Breite relativ zur Container-Breite
    singleTile: false,    // true = genau EINE Kachel (für kachelbare Strip-/GIF-Exporte)
    fadeStart: 0.5,       // horizontaler Rechts-Fade: ab hier (0..1 der Tile-Breite) beginnt das Ausblenden
    fadeEnd: 1,           // ... hier ist es komplett ausgeblendet
    bg: '#26213f',        // Hintergrundfarbe der Fläche
    fill: '#3e3763',      // Farbe der Pattern-Elemente

    // — Verhalten —
    fps: 30,              // Bildrate-Drosselung im Echtzeit-Betrieb
    respectReducedMotion: true // bei prefers-reduced-motion: statisch, voll sichtbar
  };

  // ---- kleine Helfer ------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // deterministischer PRNG (mulberry32), damit jitter/rotation/shimmer pro
  // Element fix sind (reproduzierbar über alle Seeks hinweg)
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Punkt-String → Zahlen-Array; Geometrie ohne DOM-Messung
  function parsePoints(str) {
    return (str || '').trim().split(/[\s,]+/).map(Number).filter(function (n) { return !isNaN(n); });
  }
  function bboxOf(nums) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var x = nums[i], y = nums[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function offsetPointsStr(nums, dy) {
    var out = [];
    for (var i = 0; i + 1 < nums.length; i += 2) { out.push(nums[i], nums[i + 1] + dy); }
    return out.join(' ');
  }

  function easeFn(name) {
    switch (name) {
      case 'linear': return function (x) { return x; };
      case 'smooth': return function (x) { return x * x * (3 - 2 * x); };
      case 'back':   return function (x) { var c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
      case 'sine':
      default:       return function (x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); };
    }
  }

  // ---- Instanz ------------------------------------------------------------
  function PatternWave(container, tileSource, userConfig) {
    this.container = container;
    this.tileSource = tileSource; // <svg> oder <g> mit den Basis-<polygon>en
    this.config = Object.assign({}, DEFAULTS, userConfig || {});
    this.els = [];       // { node, xn, yn, u, rot, rotSign, scales, jit, shPhase, driftAng }
    this.contentMaxX = VBW;
    this._raf = null;
    this._lastFrame = -1;
    this._t0 = null;
    this._paused = false;
    this._ease = easeFn(this.config.easing);
    this._build();
    this._recomputeWave();
    PatternWave._instances.push(this);
  }

  PatternWave._instances = [];

  PatternWave.prototype._basePolys = function () {
    // Polygone aus der Quelle einsammeln (nur die Pattern-Elemente, nicht den
    // Hintergrund-<rect>).
    var src = this.tileSource;
    var polys = src.querySelectorAll('polygon, path');
    return Array.prototype.slice.call(polys);
  };

  PatternWave.prototype._build = function () {
    var cfg = this.config;
    var c = this.container;
    c.innerHTML = '';
    c.style.position = c.style.position || 'relative';
    c.style.overflow = 'hidden';
    c.style.background = cfg.bg;

    var rect = c.getBoundingClientRect();
    var cw = rect.width || c.clientWidth || 800;
    var ch = rect.height || c.clientHeight || 600;

    var coverW = cw * cfg.coverWidthFactor;
    var unitPx = coverW / VBW;
    var tilePx = TILE_H * unitPx;
    // singleTile: genau eine Kachel (nahtlos vertikal kachelbar → schmaler GIF-Strip)
    var nTiles = cfg.singleTile ? 1 : Math.max(1, Math.ceil(ch / tilePx) + 1);
    var vbH = nTiles * TILE_H;

    var svgns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VBW + ' ' + vbH);
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = coverW + 'px';
    svg.style.height = (nTiles * tilePx) + 'px';
    svg.style.pointerEvents = 'none';
    this.svg = svg;
    // früh einhängen, damit getBBox() unten zuverlässig misst
    c.appendChild(svg);

    // Rechts-Fade als Maske (horizontaler Verlauf über die Tile-Breite)
    var uid = 'pwmask_' + (PatternWave._instances.length) + '_' + Math.floor(vbH);
    var defs = document.createElementNS(svgns, 'defs');
    var grad = document.createElementNS(svgns, 'linearGradient');
    grad.setAttribute('id', uid + '_g');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '1'); grad.setAttribute('y2', '0');
    var stops = [
      [0, 1], [cfg.fadeStart, 1], [cfg.fadeEnd, 0], [1, 0]
    ];
    stops.forEach(function (s) {
      var st = document.createElementNS(svgns, 'stop');
      st.setAttribute('offset', (s[0] * 100) + '%');
      st.setAttribute('stop-color', '#fff');
      st.setAttribute('stop-opacity', String(s[1]));
      grad.appendChild(st);
    });
    var mask = document.createElementNS(svgns, 'mask');
    mask.setAttribute('id', uid);
    mask.setAttribute('maskUnits', 'objectBoundingBox');
    mask.setAttribute('maskContentUnits', 'objectBoundingBox');
    var mrect = document.createElementNS(svgns, 'rect');
    mrect.setAttribute('x', '0'); mrect.setAttribute('y', '0');
    mrect.setAttribute('width', '1'); mrect.setAttribute('height', '1');
    mrect.setAttribute('fill', 'url(#' + uid + '_g)');
    mask.appendChild(mrect);
    defs.appendChild(grad);
    defs.appendChild(mask);
    svg.appendChild(defs);

    var group = document.createElementNS(svgns, 'g');
    group.setAttribute('mask', 'url(#' + uid + ')');
    svg.appendChild(group);

    // Basis-Polygone als Punkt-Arrays + Geometrie (kein DOM-getBBox nötig)
    var baseNodes = this._basePolys();
    var base = baseNodes.map(function (n) {
      var nums = parsePoints(n.getAttribute('points') || '');
      return { nums: nums, bb: bboxOf(nums) };
    });
    var maxX = 0;
    base.forEach(function (b) { if (b.bb.x1 > maxX) maxX = b.bb.x1; });
    this.contentMaxX = maxX || VBW;
    this.els = [];

    // Kanten-Polygone klassifizieren + Naht-Paare (untere↔obere Hälfte) bestimmen.
    // So laufen über die Kachel-Naht laufende Formen später als EINE Einheit.
    var EPS = 0.6, BOT = TILE_H + 0.18; // Unterkante ≈ 342.29
    var isTop = {}, isBot = {}, topIdx = [], botIdx = [];
    base.forEach(function (b, j) {
      if (b.bb.y0 <= 0.18 + EPS) { isTop[j] = true; topIdx.push(j); }
      if (b.bb.y1 >= BOT - EPS)  { isBot[j] = true; botIdx.push(j); }
    });
    var pairOf = {}; // bottomIndex -> topIndex (bester x-Überlapp)
    botIdx.forEach(function (bj) {
      var bb = base[bj].bb, best = -1, bestO = 0;
      topIdx.forEach(function (tj) {
        var o = Math.min(bb.x1, base[tj].bb.x1) - Math.max(bb.x0, base[tj].bb.x0);
        if (o > bestO) { bestO = o; best = tj; }
      });
      if (best >= 0 && bestO > 1) pairOf[bj] = best;
    });

    var self = this, rng = mulberry32(1337);
    function cx(b) { return (b.bb.x0 + b.bb.x1) / 2; }
    function cy(b) { return (b.bb.y0 + b.bb.y1) / 2; }
    function makePoly(nums, dy, fadeOnly) {
      var p = document.createElementNS(svgns, 'polygon');
      p.setAttribute('points', offsetPointsStr(nums, dy));
      p.setAttribute('fill', cfg.fill);
      if (!fadeOnly) { p.style.transformBox = 'fill-box'; p.style.transformOrigin = 'center'; }
      p.style.willChange = fadeOnly ? 'opacity' : 'transform, opacity';
      return p;
    }
    function pushUnit(node, cxAbs, cyAbs, fadeOnly) {
      var r0 = rng(), r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
      self.els.push({
        node: node,
        cx: cxAbs, cy: cyAbs,
        xn: clamp01(cxAbs / self.contentMaxX),
        yn: clamp01((((cyAbs % TILE_H) + TILE_H) % TILE_H) / TILE_H),
        u: 0,
        fadeOnly: !!fadeOnly,
        doRot: !fadeOnly && (r0 < cfg.rotateShare),
        doScale: !fadeOnly && (r1 < cfg.scaleShare),
        rotSign: r2 < 0.5 ? -1 : 1,
        jit: r3,               // 0..1 (nur Vorwärts-Versatz → Loop bleibt sauber)
        shPhase: r4,           // 0..1
        driftAng: r5 * Math.PI * 2
      });
    }

    // 1) Innen-Polygone: pro Kachel einzeln (Offset in die Punkte eingebacken)
    for (var i = 0; i < nTiles; i++) {
      var dy = i * TILE_H;
      for (var j = 0; j < base.length; j++) {
        if (isTop[j] || isBot[j]) continue;
        var b = base[j];
        var node = makePoly(b.nums, dy, false);
        group.appendChild(node);
        pushUnit(node, cx(b), cy(b) + dy, false);
      }
    }

    // 2) Naht-Einheiten: untere Hälfte (Kachel i) + obere Hälfte (Kachel i+1)
    //    in EINER animierten <g> → gemeinsame Zeit + gemeinsamer Mittelpunkt auf der Naht.
    for (var s = 0; s < nTiles - 1; s++) {
      var sy = s * TILE_H;
      Object.keys(pairOf).forEach(function (bjStr) {
        var bj = +bjStr, tj = pairOf[bj];
        var g = document.createElementNS(svgns, 'g');
        g.style.transformBox = 'fill-box';
        g.style.transformOrigin = 'center';
        g.style.willChange = 'transform, opacity';
        g.appendChild(makePoly(base[bj].nums, sy, false));            // untere Hälfte
        g.appendChild(makePoly(base[tj].nums, sy + TILE_H, false));   // obere Hälfte (nächste Kachel)
        group.appendChild(g);
        pushUnit(g, cx(base[bj]), sy + TILE_H, false);                // Wave-Pos = x der Form, y = Naht
      });
    }

    // 3) Karten-Randhälften ohne Partner (oberste/unterste Kante): nur Opacity → kein Aufreißen
    topIdx.forEach(function (tj) {
      var b = base[tj], node = makePoly(b.nums, 0, true);
      group.appendChild(node);
      pushUnit(node, cx(b), cy(b), true);
    });
    var lastDy = (nTiles - 1) * TILE_H;
    botIdx.forEach(function (bj) {
      var b = base[bj], node = makePoly(b.nums, lastDy, true);
      group.appendChild(node);
      pushUnit(node, cx(b), cy(b) + lastDy, true);
    });
  };

  // Wellen-Position u pro Element aus der Richtung ableiten (0 = zuerst dran)
  PatternWave.prototype._recomputeWave = function () {
    var dir = this.config.direction;
    for (var i = 0; i < this.els.length; i++) {
      var e = this.els[i], u;
      switch (dir) {
        case 'rtl':      u = 1 - e.xn; break;
        case 'ttb':      u = e.yn; break;
        case 'btt':      u = 1 - e.yn; break;
        case 'diag':     u = (e.xn + e.yn) / 2; break;
        case 'diag-rev': u = ((1 - e.xn) + e.yn) / 2; break;
        case 'ltr':
        default:         u = e.xn; break;
      }
      e.u = clamp01(u);
    }
  };

  // Deckkraft/Transform für Zeit t (Sekunden) berechnen und anwenden.
  PatternWave.prototype.renderAt = function (t) {
    var cfg = this.config;

    if (cfg.respectReducedMotion && PatternWave._reducedMotion) {
      return this._renderStatic();
    }

    var loop = Math.max(0.1, cfg.loopDuration);
    var c = ((t % loop) + loop) % loop / loop; // 0..1

    // ----- Loop-Garantie -----------------------------------------------------
    // Budget aus Einblend-Spanne (spread+ramp+jitter), Halte-Phase und einem
    // ERZWUNGENEN leeren Gap. Passt das nicht in einen Zyklus, wird alles
    // proportional herunterskaliert. So ist der Loop IMMER perfekt & nahtlos:
    // bei c=0 und im Gap ist jedes Element env=0 (leer), egal welche Regler.
    var GAP_MIN = 0.05;
    var spread = Math.max(0, cfg.waveSpread);
    var ramp = Math.max(0.001, cfg.fadeSoftness);
    var hold = Math.max(0, cfg.holdFraction);
    var jit = Math.max(0, cfg.jitter);
    var span = spread + ramp + jit;          // Ein- bzw. Ausblend-Spanne inkl. max. Jitter
    var total = 2 * span + hold;
    var maxTotal = 1 - GAP_MIN;
    if (total > maxTotal) { var k = maxTotal / total; spread *= k; ramp *= k; hold *= k; jit *= k; span = spread + ramp + jit; }
    var disStart = span + hold;              // Beginn der Ausblend-Phase
    var ease = this._ease;
    var shCyc = Math.max(1, Math.round(cfg.shimmerSpeed || 1)); // ganze Zyklen → periodisch

    for (var i = 0; i < this.els.length; i++) {
      var e = this.els[i];
      var jd = e.jit * jit;                  // 0..jit (nur vorwärts)
      var appearAt = e.u * spread + jd;
      var disappearAt = disStart + (1 - e.u) * spread + jd;

      var envIn = clamp01((c - appearAt) / ramp);
      var envOut = clamp01((c - disappearAt) / ramp);
      var env = clamp01(envIn - envOut);      // 0..1 roh
      var e2 = ease(env);                     // geglättet

      // Deckkraft
      var op = cfg.opacityMin + (cfg.opacityMax - cfg.opacityMin) * e2;
      if (cfg.shimmerEnabled && cfg.shimmerAmount > 0) {
        var ph = 2 * Math.PI * (shCyc * (t / loop) + e.shPhase);
        op += cfg.shimmerAmount * Math.sin(ph) * e2; // *e2 → im leeren Gap bleibt es leer
      }
      op = clamp01(op);

      // Transform (scale + rotate um den eigenen Mittelpunkt, optional drift).
      // fadeOnly-Einheiten (Karten-Randhälften) bekommen KEIN Transform → kein Aufreißen.
      var tf = '';
      if (!e.fadeOnly && cfg.driftEnabled && cfg.driftAmount > 0) {
        var d = cfg.driftAmount * (1 - e2);
        tf += 'translate(' + (Math.cos(e.driftAng) * d).toFixed(2) + 'px,' +
              (Math.sin(e.driftAng) * d).toFixed(2) + 'px) ';
      }
      if (!e.fadeOnly && e.doScale && cfg.scaleMin < 1) {
        var s = cfg.scaleMin + (1 - cfg.scaleMin) * e2;
        tf += 'scale(' + s.toFixed(4) + ') ';
      }
      if (!e.fadeOnly && e.doRot && cfg.rotateDeg > 0) {
        var sign = cfg.rotateDir === 'cw' ? 1 : (cfg.rotateDir === 'ccw' ? -1 : e.rotSign);
        var ang = cfg.rotateDeg * (1 - e2) * sign;   // beim Peak (e2=1) exakt 0° → ruhig/lesbar
        tf += 'rotate(' + ang.toFixed(2) + 'deg)';
      }

      var node = e.node;
      node.style.opacity = op.toFixed(3);
      node.style.transform = tf;
    }
  };

  PatternWave.prototype._renderStatic = function () {
    for (var i = 0; i < this.els.length; i++) {
      var n = this.els[i].node;
      n.style.opacity = String(this.config.opacityMax);
      n.style.transform = '';
    }
  };

  // ---- Steuerung ----------------------------------------------------------
  PatternWave.prototype.play = function () {
    if (!this._paused && this._raf) return;
    this._paused = false;
    var self = this;
    var frameMs = 1000 / Math.max(1, this.config.fps);
    function tick(now) {
      if (self._paused) { self._raf = null; return; }
      if (self._t0 == null) self._t0 = now;
      if (now - self._lastFrame >= frameMs || self._lastFrame < 0) {
        self._lastFrame = now;
        self.renderAt((now - self._t0) / 1000);
      }
      self._raf = global.requestAnimationFrame(tick);
    }
    this._raf = global.requestAnimationFrame(tick);
  };

  PatternWave.prototype.pause = function () {
    this._paused = true;
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = null; }
  };

  PatternWave.prototype.setConfig = function (partial) {
    var needWave = partial && ('direction' in partial);
    var needRebuild = partial && (
      'coverWidthFactor' in partial || 'fadeStart' in partial ||
      'fadeEnd' in partial || 'bg' in partial || 'fill' in partial ||
      'scaleShare' in partial || 'rotateShare' in partial
    );
    Object.assign(this.config, partial || {});
    this._ease = easeFn(this.config.easing);
    if (needRebuild) { this._build(); this._recomputeWave(); }
    else if (needWave) { this._recomputeWave(); }
  };

  PatternWave.prototype.rebuild = function () {
    var wasPaused = this._paused;
    this._build();
    this._recomputeWave();
    if (!wasPaused) { this._lastFrame = -1; }
  };

  PatternWave.prototype.destroy = function () {
    this.pause();
    if (this.container) this.container.innerHTML = '';
    var idx = PatternWave._instances.indexOf(this);
    if (idx >= 0) PatternWave._instances.splice(idx, 1);
  };

  // ---- globale Helfer -----------------------------------------------------
  // reduced-motion beobachten
  PatternWave._reducedMotion = false;
  try {
    var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
    PatternWave._reducedMotion = mq.matches;
    mq.addEventListener('change', function (ev) { PatternWave._reducedMotion = ev.matches; });
  } catch (e) {}

  // bildgenaues Seeken ALLER Instanzen auf Zeit t (für MP4-Export)
  global.__seek = function (t) {
    PatternWave._instances.forEach(function (inst) {
      inst.pause();
      var saved = inst.config.respectReducedMotion;
      inst.config.respectReducedMotion = false;
      inst.renderAt(t);
      inst.config.respectReducedMotion = saved;
    });
  };

  // Bequemer Konstruktor: baut die Quelle aus einer reinen Punkte-Liste
  // (["x y x y ...", ...]) statt aus einem vorhandenen DOM-SVG.
  PatternWave.fromPoints = function (container, pointsArray, userConfig) {
    var svgns = 'http://www.w3.org/2000/svg';
    var src = document.createElementNS(svgns, 'svg');
    src.setAttribute('width', '0');
    src.setAttribute('height', '0');
    src.style.position = 'absolute';
    src.style.width = '0';
    src.style.height = '0';
    src.style.overflow = 'hidden';
    src.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < pointsArray.length; i++) {
      var p = document.createElementNS(svgns, 'polygon');
      p.setAttribute('points', pointsArray[i]);
      src.appendChild(p);
    }
    // muss im DOM hängen, damit getBBox() funktioniert
    document.body.appendChild(src);
    var inst = new PatternWave(container, src, userConfig);
    if (src.parentNode) src.parentNode.removeChild(src);
    return inst;
  };

  global.PatternWave = PatternWave;
  global.PatternWave.DEFAULTS = DEFAULTS;
})(window);

window.PW_TILE_POINTS = ["135.64 .18 124.45 14.43 80.69 14.43 69.75 .18 135.64 .18","192.89 342.29 152.6 342.29 158.5 336.39 158.5 328.05 166.85 328.05 172.75 322.15 178.65 328.05 186.99 328.05 186.99 336.39 192.89 342.29","192.89 .18 186.99 6.09 186.99 14.43 178.65 14.43 172.74 20.33 166.85 14.43 158.5 14.43 158.5 6.09 152.6 .18 192.89 .18","275.71 .18 264.77 14.43 221 14.43 209.82 .18 275.71 .18","135.64 342.29 69.75 342.29 80.69 328.05 124.45 328.05 135.64 342.29","32.81 327.99 21.62 342.29 0 342.29 0 320.67 14.3 309.49 14.3 327.99 32.81 327.99","32.81 14.49 14.3 14.49 14.3 32.99 0 21.81 0 .18 21.63 .18 21.62 .19 32.81 14.49","275.71 342.29 209.82 342.29 221 328.05 264.77 328.05 275.71 342.29","55.78 51.52 86.09 51.52 97.27 37.28 86.09 23.03 55.78 23.03 66.97 37.28 55.78 51.52","235.08 299.81 228.58 293.32 228.58 286.14 221.41 286.14 214.93 279.67 208.46 286.14 208.41 286.14 208.41 286.19 199.06 295.54 199.12 315.62 219.2 315.69 235.08 299.81","286.87 23.03 256.56 23.03 245.38 37.28 256.56 51.52 286.87 51.52 275.69 37.28 286.87 23.03","124 56.65 130.48 63.12 136.95 56.65 136.99 56.65 136.99 56.6 146.35 47.25 146.29 27.17 126.21 27.1 110.33 42.98 116.83 49.47 116.83 56.65 124 56.65","55.78 319.74 86.09 319.74 97.27 305.5 86.09 291.25 55.78 291.25 66.97 305.5 55.78 319.74","286.87 291.25 256.56 291.25 245.38 305.5 256.56 319.74 286.87 319.74 275.69 305.5 286.87 291.25","221.43 56.63 228.6 56.63 228.6 49.45 235.08 42.98 228.6 36.5 228.6 36.46 228.56 36.46 219.2 27.1 199.12 27.17 199.06 47.25 214.93 63.12 221.43 56.63","116.85 306.33 126.21 315.69 146.29 315.62 146.35 295.54 130.48 279.67 123.98 286.17 116.81 286.17 116.81 293.34 110.33 299.81 116.81 306.29 116.81 306.33 116.85 306.33","91.24 156.99 102.18 171.24 91.24 185.48 47.48 185.48 36.29 171.24 47.48 156.99 91.24 156.99","116.26 193.95 85.96 193.95 74.77 208.19 85.96 222.44 116.26 222.44 105.08 208.19 116.26 193.95","116.26 120.04 85.96 120.04 74.77 134.28 85.96 148.53 116.26 148.53 105.08 134.28 116.26 120.04","254.08 185.48 243.14 171.24 254.08 156.99 297.85 156.99 309.03 171.24 297.85 185.48 254.08 185.48","227.9 148.53 258.21 148.53 269.39 134.28 258.21 120.04 227.9 120.04 239.09 134.28 227.9 148.53","227.9 222.44 258.21 222.44 269.39 208.19 258.21 193.95 227.9 193.95 239.09 208.19 227.9 222.44","186.99 89.7 172.74 100.64 158.5 89.7 158.5 45.94 172.74 34.75 186.99 45.94 186.99 89.7","149.95 115.91 149.95 85.6 135.71 74.41 121.46 85.6 121.46 115.91 135.71 104.72 149.95 115.91","223.86 115.91 223.86 85.6 209.62 74.41 195.37 85.6 195.37 115.91 209.62 104.72 223.86 115.91","158.5 252.66 172.74 241.72 186.99 252.66 186.99 296.42 172.74 307.61 158.5 296.42 158.5 252.66","263.23 230.11 283.31 230.18 283.37 250.26 254.64 278.99 234.39 278.72 234.5 258.84 263.23 230.11","195.37 226.48 195.37 256.79 209.62 267.97 223.86 256.79 223.86 226.48 209.62 237.66 195.37 226.48","14.24 78.74 14.24 122.5 0 133.69 0 67.79 14.24 78.74","90.79 63.61 110.87 63.68 110.94 83.76 82.21 112.49 61.96 112.22 62.06 92.35 90.79 63.61","22.94 59.94 22.94 90.24 37.18 101.43 51.43 90.24 51.43 59.94 37.18 71.12 22.94 59.94","121.46 226.48 121.46 256.79 135.71 267.97 149.95 256.79 149.95 226.48 135.71 237.66 121.46 226.48","172.74 192.86 187.05 204.05 187.05 185.54 205.55 185.54 194.37 171.24 205.55 156.93 187.05 156.93 187.05 138.43 172.74 153.35 158.44 138.43 158.44 156.93 139.94 156.93 151.12 171.24 139.94 185.54 158.44 185.54 158.44 204.05 172.74 192.86","306.42 223.5 306.47 223.5 306.47 223.45 315.82 214.09 315.76 194.02 295.68 193.95 279.8 209.83 286.3 216.32 286.3 223.5 293.48 223.5 299.95 229.97 306.42 223.5","20.15 171.24 14.25 177.14 14.25 185.48 5.9 185.48 0 191.38 0 151.1 5.9 156.99 14.25 156.99 14.25 165.34 20.15 171.24","290.91 55.05 290.91 85.36 305.16 96.54 319.4 85.36 319.4 55.05 305.16 66.23 290.91 55.05","63.16 132.65 56.67 126.16 56.67 118.98 49.49 118.98 43.02 112.51 36.54 118.98 36.5 118.98 36.5 119.03 27.14 128.38 27.21 148.46 47.29 148.53 63.16 132.65","231.63 83.76 231.69 63.68 251.77 63.61 280.5 92.35 280.24 112.6 260.36 112.49 231.63 83.76","14.24 219.1 14.24 262.86 0 273.8 0 207.91 14.24 219.1","51.43 287.43 51.43 257.12 37.18 245.94 22.94 257.12 22.94 287.43 37.18 276.25 51.43 287.43","110.83 258.84 110.76 278.92 90.69 278.99 61.96 250.26 62.22 230.01 82.1 230.11 110.83 258.84","319.4 287.49 319.4 257.18 305.16 246 290.91 257.18 290.91 287.49 305.16 276.3 319.4 287.49","286.32 139.17 295.68 148.53 315.76 148.46 315.82 128.38 299.95 112.51 293.45 119 286.28 119 286.28 126.18 279.8 132.65 286.28 139.13 286.28 139.17 286.32 139.17","36.52 223.47 43.02 229.97 49.51 223.47 56.69 223.47 56.69 216.3 63.16 209.83 56.69 203.35 56.69 203.31 56.64 203.31 47.29 193.95 27.21 194.02 27.14 214.09 36.52 223.47 36.52 223.47 36.52 223.47","471 .18 462.05 11.58 427.04 11.58 418.28 .18 471 .18","528.8 342.29 500.59 342.29 504.72 338.16 504.72 332.32 510.57 332.32 514.7 328.19 518.83 332.32 524.67 332.32 524.67 338.16 528.8 342.29","528.8 .18 524.67 4.31 524.67 10.15 518.83 10.15 514.7 14.28 510.57 10.15 504.72 10.15 504.72 4.31 500.59 .18 528.8 .18","602.83 .18 596.81 8.02 572.75 8.02 566.59 .18 602.83 .18","471 342.29 418.28 342.29 427.04 330.9 462.05 330.9 471 342.29","602.83 342.29 566.59 342.29 572.75 334.46 596.81 334.46 602.83 342.29","428.79 159.84 437.54 171.24 428.79 182.64 393.78 182.64 384.83 171.24 393.78 159.84 428.79 159.84","454.06 196.18 429.82 196.18 420.87 207.57 429.82 218.97 454.06 218.97 445.11 207.57 454.06 196.18","454.06 122.26 429.82 122.26 420.87 133.66 429.82 145.06 454.06 145.06 445.11 133.66 454.06 122.26","607.48 178.43 602.22 171.6 607.48 164.76 628.48 164.76 633.85 171.6 628.48 178.43 607.48 178.43","579.19 141.49 595.86 141.49 602.01 133.66 595.86 125.83 579.19 125.83 585.34 133.66 579.19 141.49","579.19 215.41 595.86 215.41 602.01 207.57 595.86 199.74 579.19 199.74 585.34 207.57 579.19 215.41","524.58 82.59 514.61 90.25 504.64 82.59 504.64 51.96 514.61 44.13 524.58 51.96 524.58 82.59","488.34 110.19 488.34 87.46 477.66 79.07 466.97 87.46 466.97 110.19 477.66 101.8 488.34 110.19","560.83 106.95 560.83 87.25 551.57 79.98 542.31 87.25 542.31 106.95 551.57 99.68 560.83 106.95","504.64 258.64 514.61 250.98 524.58 258.64 524.58 289.27 514.61 297.1 504.64 289.27 504.64 258.64","600.38 240.49 611.42 240.52 611.46 251.57 595.65 267.37 584.52 267.22 584.57 256.29 600.38 240.49","542.31 233.12 542.31 252.82 551.57 260.09 560.83 252.82 560.83 233.12 551.57 240.39 542.31 233.12","402.73 52.42 426.97 52.42 435.92 41.03 426.97 29.63 402.73 29.63 411.68 41.03 402.73 52.42","431.87 67.83 447.94 67.89 447.99 83.95 425 106.94 408.8 106.72 408.89 90.82 431.87 67.83","364.89 59.31 364.89 89.62 379.13 100.8 393.38 89.62 393.38 59.31 379.13 70.5 364.89 59.31","466.97 232.2 466.97 254.93 477.66 263.32 488.34 254.93 488.34 232.2 477.66 240.59 466.97 232.2","514.61 186.37 524.63 194.2 524.63 181.25 537.58 181.25 529.75 171.23 537.58 161.22 524.63 161.22 524.63 148.27 514.61 156.06 504.6 148.27 504.6 161.22 491.65 161.22 499.48 171.23 491.65 181.25 504.6 181.25 504.6 194.2 514.61 186.37","640.13 218.02 643.23 221.13 646.34 218.02 646.36 218.02 646.36 218 650.85 213.51 650.82 203.87 641.18 203.84 633.56 211.46 636.68 214.58 636.68 218.02 640.13 218.02","570.72 297.07 566.5 292.84 566.5 288.18 561.84 288.18 557.63 283.97 553.42 288.18 553.39 288.18 553.39 288.21 547.31 294.29 547.35 307.34 560.41 307.39 570.72 297.07","640.27 65.21 640.27 79.76 647.11 85.13 653.94 79.76 653.94 65.21 647.11 70.58 640.27 65.21","619.49 27.14 602.82 27.14 596.67 34.98 602.82 42.81 619.49 42.81 613.34 34.98 619.49 27.14","405.11 130.96 398.61 124.46 398.61 117.29 391.44 117.29 384.97 110.82 378.49 117.29 378.45 117.29 378.45 117.33 369.09 126.69 369.16 146.77 389.23 146.84 405.11 130.96","467.04 54.29 471.89 59.14 476.75 54.29 476.78 54.29 476.78 54.25 483.8 47.23 483.75 32.18 468.69 32.13 461.66 39.16 461.66 39.16 461.66 39.16 456.78 44.03 461.66 48.9 461.66 54.29 467.04 54.29","584.57 82.1 584.61 71.05 595.65 71.02 611.46 86.82 611.31 97.96 600.38 97.9 584.57 82.1","393.38 283.76 393.38 253.45 379.13 242.26 364.89 253.45 364.89 283.76 379.13 272.57 393.38 283.76","402.73 314.6 426.97 314.6 435.92 303.2 426.97 291.81 402.73 291.81 411.68 303.2 402.73 314.6","447.99 257.17 447.94 273.23 431.87 273.29 408.89 250.3 409.1 234.1 425 234.19 447.99 257.17","619.49 295.66 602.82 295.66 596.67 303.5 602.82 311.33 619.49 311.33 613.34 303.5 619.49 295.66","653.94 274.42 653.94 259.88 647.11 254.51 640.27 259.88 640.27 274.42 647.11 269.05 653.94 274.42","559.41 50.59 564.07 50.59 564.07 45.93 568.28 41.72 564.07 37.51 564.07 37.49 564.04 37.49 557.96 31.4 544.91 31.45 544.87 44.5 555.19 54.82 559.41 50.59","634.25 130.45 638.74 134.95 648.38 134.91 648.41 125.28 640.79 117.66 637.67 120.77 634.23 120.77 634.23 124.22 631.12 127.33 634.23 130.43 634.23 130.45 634.25 130.45","391.46 224.1 398.64 224.1 398.64 216.92 405.11 210.45 398.64 203.97 398.64 203.93 398.59 203.93 389.23 194.57 369.16 194.64 369.09 214.72 384.97 230.59 391.46 224.1","461.67 302.26 468.69 309.28 483.75 309.23 483.8 294.17 471.89 282.27 467.02 287.14 461.64 287.14 461.64 292.52 456.78 297.37 461.64 302.23 461.64 302.26 461.67 302.26","374.92 327.99 363.73 342.3 324.22 342.3 309.3 327.99 327.81 327.99 327.81 309.49 342.11 320.67 356.41 309.49 356.41 327.99 374.92 327.99","374.92 14.49 356.41 14.49 356.41 32.99 342.11 21.81 327.81 32.99 327.81 14.49 309.3 14.49 324.22 .18 363.73 .18 374.63 14.12 374.92 14.49","356.35 78.74 356.35 122.5 342.11 133.69 327.87 122.5 327.87 78.74 342.11 67.8 356.35 78.74","356.35 219.1 356.35 262.86 342.11 273.8 327.87 262.86 327.87 219.1 342.11 207.92 356.35 219.1","362.25 171.24 356.35 177.14 356.35 185.48 348.01 185.48 342.11 191.39 336.21 185.48 327.87 185.48 327.87 177.14 321.96 171.24 327.87 165.34 327.87 157 336.21 157 342.11 151.1 348.01 157 356.35 157 356.35 165.34 362.25 171.24","694.07 4.47 688.52 4.47 688.52 10.02 684.22 6.67 679.93 10.02 679.93 4.47 674.38 4.47 677.74 .18 689.59 .18 694.07 4.47","694.07 338.01 689.59 342.3 677.74 342.3 674.38 338.01 679.93 338.01 679.93 332.46 684.22 335.81 688.52 332.46 688.52 338.01 694.07 338.01","753.42 169.19 754.99 171.24 753.42 173.29 747.12 173.29 745.51 171.24 747.12 169.19 753.42 169.19","781.11 204.47 776.11 204.47 774.27 206.82 776.11 209.17 781.11 209.17 779.27 206.82 781.11 204.47","779.95 130.55 774.95 130.55 773.1 132.9 774.95 135.25 779.95 135.25 778.11 132.9 779.95 130.55","766.74 90.58 763.43 90.57 763.42 87.26 768.16 82.52 771.5 82.56 771.48 85.84 766.74 90.58","690.27 171.24 688.5 173.01 688.5 175.51 685.99 175.51 684.22 177.28 682.45 175.51 679.95 175.51 679.95 173.01 678.18 171.24 679.95 169.47 679.95 166.97 682.45 166.97 684.22 165.2 685.99 166.97 688.5 166.97 688.5 169.47 690.27 171.24","727.12 125.22 725.57 123.67 724.01 125.22 724 125.22 724 125.23 721.76 127.48 721.77 132.29 726.59 132.31 730.4 128.5 728.84 126.94 728.84 125.22 727.12 125.22","724.6 270.28 724.6 263.01 721.18 260.33 717.76 263.01 717.76 270.28 721.18 267.6 724.6 270.28","756.79 307.85 761.79 307.85 763.63 305.5 761.79 303.15 756.79 303.15 758.63 305.5 756.79 307.85","774.3 256.71 774.29 260.02 770.98 260.03 766.24 255.29 766.28 251.95 769.56 251.97 774.3 256.71","758 39.33 763 39.33 764.85 36.98 763 34.63 758 34.63 759.85 36.98 758 39.33","717.81 71.03 717.81 78.31 721.23 80.99 724.65 78.31 724.65 71.03 721.23 73.72 717.81 71.03","731.28 212.1 729.03 209.85 724.22 209.87 724.2 214.69 728.01 218.5 729.57 216.94 731.29 216.94 731.29 215.22 732.84 213.66 731.29 212.11 731.29 212.1 731.28 212.1","688.5 234.57 688.5 247.7 684.22 250.98 684.22 250.97 679.95 247.7 679.95 234.57 684.22 231.22 684.22 231.21 688.5 234.57","688.5 93.64 688.5 106.77 684.22 110.13 684.22 110.12 679.95 106.77 679.95 93.64 684.22 90.36 688.5 93.64"];

/* gifenc v1.0.3 (MIT, Matt DesLauriers) – vendored als Browser-Global window.gifenc. Auto-generiert. */
(function(){
"use strict";
var exports={};
var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/index.js
__markAsModule(exports);
__export(exports, {
  GIFEncoder: () => GIFEncoder,
  applyPalette: () => applyPalette,
  default: () => src_default,
  nearestColor: () => nearestColor,
  nearestColorIndex: () => nearestColorIndex,
  nearestColorIndexWithDistance: () => nearestColorIndexWithDistance,
  prequantize: () => prequantize,
  quantize: () => quantize,
  snapColorsToPalette: () => snapColorsToPalette
});

// src/constants.js
var constants_default = {
  signature: "GIF",
  version: "89a",
  trailer: 59,
  extensionIntroducer: 33,
  applicationExtensionLabel: 255,
  graphicControlExtensionLabel: 249,
  imageSeparator: 44,
  signatureSize: 3,
  versionSize: 3,
  globalColorTableFlagMask: 128,
  colorResolutionMask: 112,
  sortFlagMask: 8,
  globalColorTableSizeMask: 7,
  applicationIdentifierSize: 8,
  applicationAuthCodeSize: 3,
  disposalMethodMask: 28,
  userInputFlagMask: 2,
  transparentColorFlagMask: 1,
  localColorTableFlagMask: 128,
  interlaceFlagMask: 64,
  idSortFlagMask: 32,
  localColorTableSizeMask: 7
};

// src/stream.js
function createStream(initialCapacity = 256) {
  let cursor = 0;
  let contents = new Uint8Array(initialCapacity);
  return {
    get buffer() {
      return contents.buffer;
    },
    reset() {
      cursor = 0;
    },
    bytesView() {
      return contents.subarray(0, cursor);
    },
    bytes() {
      return contents.slice(0, cursor);
    },
    writeByte(byte) {
      expand(cursor + 1);
      contents[cursor] = byte;
      cursor++;
    },
    writeBytes(data, offset = 0, byteLength = data.length) {
      expand(cursor + byteLength);
      for (let i = 0; i < byteLength; i++) {
        contents[cursor++] = data[i + offset];
      }
    },
    writeBytesView(data, offset = 0, byteLength = data.byteLength) {
      expand(cursor + byteLength);
      contents.set(data.subarray(offset, offset + byteLength), cursor);
      cursor += byteLength;
    }
  };
  function expand(newCapacity) {
    var prevCapacity = contents.length;
    if (prevCapacity >= newCapacity)
      return;
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
    if (prevCapacity != 0)
      newCapacity = Math.max(newCapacity, 256);
    const oldContents = contents;
    contents = new Uint8Array(newCapacity);
    if (cursor > 0)
      contents.set(oldContents.subarray(0, cursor), 0);
  }
}

// src/lzwEncode.js
var BITS = 12;
var DEFAULT_HSIZE = 5003;
var MASKS = [
  0,
  1,
  3,
  7,
  15,
  31,
  63,
  127,
  255,
  511,
  1023,
  2047,
  4095,
  8191,
  16383,
  32767,
  65535
];
function lzwEncode(width, height, pixels, colorDepth, outStream = createStream(512), accum = new Uint8Array(256), htab = new Int32Array(DEFAULT_HSIZE), codetab = new Int32Array(DEFAULT_HSIZE)) {
  const hsize = htab.length;
  const initCodeSize = Math.max(2, colorDepth);
  accum.fill(0);
  codetab.fill(0);
  htab.fill(-1);
  let cur_accum = 0;
  let cur_bits = 0;
  const init_bits = initCodeSize + 1;
  const g_init_bits = init_bits;
  let clear_flg = false;
  let n_bits = g_init_bits;
  let maxcode = (1 << n_bits) - 1;
  const ClearCode = 1 << init_bits - 1;
  const EOFCode = ClearCode + 1;
  let free_ent = ClearCode + 2;
  let a_count = 0;
  let ent = pixels[0];
  let hshift = 0;
  for (let fcode = hsize; fcode < 65536; fcode *= 2) {
    ++hshift;
  }
  hshift = 8 - hshift;
  outStream.writeByte(initCodeSize);
  output(ClearCode);
  const length = pixels.length;
  for (let idx = 1; idx < length; idx++) {
    next_block: {
      const c = pixels[idx];
      const fcode = (c << BITS) + ent;
      let i = c << hshift ^ ent;
      if (htab[i] === fcode) {
        ent = codetab[i];
        break next_block;
      }
      const disp = i === 0 ? 1 : hsize - i;
      while (htab[i] >= 0) {
        i -= disp;
        if (i < 0)
          i += hsize;
        if (htab[i] === fcode) {
          ent = codetab[i];
          break next_block;
        }
      }
      output(ent);
      ent = c;
      if (free_ent < 1 << BITS) {
        codetab[i] = free_ent++;
        htab[i] = fcode;
      } else {
        htab.fill(-1);
        free_ent = ClearCode + 2;
        clear_flg = true;
        output(ClearCode);
      }
    }
  }
  output(ent);
  output(EOFCode);
  outStream.writeByte(0);
  return outStream.bytesView();
  function output(code) {
    cur_accum &= MASKS[cur_bits];
    if (cur_bits > 0)
      cur_accum |= code << cur_bits;
    else
      cur_accum = code;
    cur_bits += n_bits;
    while (cur_bits >= 8) {
      accum[a_count++] = cur_accum & 255;
      if (a_count >= 254) {
        outStream.writeByte(a_count);
        outStream.writeBytesView(accum, 0, a_count);
        a_count = 0;
      }
      cur_accum >>= 8;
      cur_bits -= 8;
    }
    if (free_ent > maxcode || clear_flg) {
      if (clear_flg) {
        n_bits = g_init_bits;
        maxcode = (1 << n_bits) - 1;
        clear_flg = false;
      } else {
        ++n_bits;
        maxcode = n_bits === BITS ? 1 << n_bits : (1 << n_bits) - 1;
      }
    }
    if (code == EOFCode) {
      while (cur_bits > 0) {
        accum[a_count++] = cur_accum & 255;
        if (a_count >= 254) {
          outStream.writeByte(a_count);
          outStream.writeBytesView(accum, 0, a_count);
          a_count = 0;
        }
        cur_accum >>= 8;
        cur_bits -= 8;
      }
      if (a_count > 0) {
        outStream.writeByte(a_count);
        outStream.writeBytesView(accum, 0, a_count);
        a_count = 0;
      }
    }
  }
}
var lzwEncode_default = lzwEncode;

// src/rgb-packing.js
function rgb888_to_rgb565(r, g, b) {
  return r << 8 & 63488 | g << 2 & 992 | b >> 3;
}
function rgba8888_to_rgba4444(r, g, b, a) {
  return r >> 4 | g & 240 | (b & 240) << 4 | (a & 240) << 8;
}
function rgb888_to_rgb444(r, g, b) {
  return r >> 4 << 8 | g & 240 | b >> 4;
}

// src/pnnquant2.js
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function sqr(value) {
  return value * value;
}
function find_nn(bins, idx, hasAlpha) {
  var nn = 0;
  var err = 1e100;
  const bin1 = bins[idx];
  const n1 = bin1.cnt;
  const wa = bin1.ac;
  const wr = bin1.rc;
  const wg = bin1.gc;
  const wb = bin1.bc;
  for (var i = bin1.fw; i != 0; i = bins[i].fw) {
    const bin = bins[i];
    const n2 = bin.cnt;
    const nerr2 = n1 * n2 / (n1 + n2);
    if (nerr2 >= err)
      continue;
    var nerr = 0;
    if (hasAlpha) {
      nerr += nerr2 * sqr(bin.ac - wa);
      if (nerr >= err)
        continue;
    }
    nerr += nerr2 * sqr(bin.rc - wr);
    if (nerr >= err)
      continue;
    nerr += nerr2 * sqr(bin.gc - wg);
    if (nerr >= err)
      continue;
    nerr += nerr2 * sqr(bin.bc - wb);
    if (nerr >= err)
      continue;
    err = nerr;
    nn = i;
  }
  bin1.err = err;
  bin1.nn = nn;
}
function create_bin() {
  return {
    ac: 0,
    rc: 0,
    gc: 0,
    bc: 0,
    cnt: 0,
    nn: 0,
    fw: 0,
    bk: 0,
    tm: 0,
    mtm: 0,
    err: 0
  };
}
function create_bin_list(data, format) {
  const bincount = format === "rgb444" ? 4096 : 65536;
  const bins = new Array(bincount);
  const size = data.length;
  if (format === "rgba4444") {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const a = color >> 24 & 255;
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgba8888_to_rgba4444(r, g, b, a);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.ac += a;
      bin.cnt++;
    }
  } else if (format === "rgb444") {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgb888_to_rgb444(r, g, b);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.cnt++;
    }
  } else {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgb888_to_rgb565(r, g, b);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.cnt++;
    }
  }
  return bins;
}
function quantize(rgba, maxColors, opts = {}) {
  const {
    format = "rgb565",
    clearAlpha = true,
    clearAlphaColor = 0,
    clearAlphaThreshold = 0,
    oneBitAlpha = false
  } = opts;
  if (!rgba || !rgba.buffer) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  const data = new Uint32Array(rgba.buffer);
  let useSqrt = opts.useSqrt !== false;
  const hasAlpha = format === "rgba4444";
  const bins = create_bin_list(data, format);
  const bincount = bins.length;
  const bincountMinusOne = bincount - 1;
  const heap = new Uint32Array(bincount + 1);
  var maxbins = 0;
  for (var i = 0; i < bincount; ++i) {
    const bin = bins[i];
    if (bin != null) {
      var d = 1 / bin.cnt;
      if (hasAlpha)
        bin.ac *= d;
      bin.rc *= d;
      bin.gc *= d;
      bin.bc *= d;
      bins[maxbins++] = bin;
    }
  }
  if (sqr(maxColors) / maxbins < 0.022) {
    useSqrt = false;
  }
  var i = 0;
  for (; i < maxbins - 1; ++i) {
    bins[i].fw = i + 1;
    bins[i + 1].bk = i;
    if (useSqrt)
      bins[i].cnt = Math.sqrt(bins[i].cnt);
  }
  if (useSqrt)
    bins[i].cnt = Math.sqrt(bins[i].cnt);
  var h, l, l2;
  for (i = 0; i < maxbins; ++i) {
    find_nn(bins, i, false);
    var err = bins[i].err;
    for (l = ++heap[0]; l > 1; l = l2) {
      l2 = l >> 1;
      if (bins[h = heap[l2]].err <= err)
        break;
      heap[l] = h;
    }
    heap[l] = i;
  }
  var extbins = maxbins - maxColors;
  for (i = 0; i < extbins; ) {
    var tb;
    for (; ; ) {
      var b1 = heap[1];
      tb = bins[b1];
      if (tb.tm >= tb.mtm && bins[tb.nn].mtm <= tb.tm)
        break;
      if (tb.mtm == bincountMinusOne)
        b1 = heap[1] = heap[heap[0]--];
      else {
        find_nn(bins, b1, false);
        tb.tm = i;
      }
      var err = bins[b1].err;
      for (l = 1; (l2 = l + l) <= heap[0]; l = l2) {
        if (l2 < heap[0] && bins[heap[l2]].err > bins[heap[l2 + 1]].err)
          l2++;
        if (err <= bins[h = heap[l2]].err)
          break;
        heap[l] = h;
      }
      heap[l] = b1;
    }
    var nb = bins[tb.nn];
    var n1 = tb.cnt;
    var n2 = nb.cnt;
    var d = 1 / (n1 + n2);
    if (hasAlpha)
      tb.ac = d * (n1 * tb.ac + n2 * nb.ac);
    tb.rc = d * (n1 * tb.rc + n2 * nb.rc);
    tb.gc = d * (n1 * tb.gc + n2 * nb.gc);
    tb.bc = d * (n1 * tb.bc + n2 * nb.bc);
    tb.cnt += nb.cnt;
    tb.mtm = ++i;
    bins[nb.bk].fw = nb.fw;
    bins[nb.fw].bk = nb.bk;
    nb.mtm = bincountMinusOne;
  }
  let palette = [];
  var k = 0;
  for (i = 0; ; ++k) {
    let r = clamp(Math.round(bins[i].rc), 0, 255);
    let g = clamp(Math.round(bins[i].gc), 0, 255);
    let b = clamp(Math.round(bins[i].bc), 0, 255);
    let a = 255;
    if (hasAlpha) {
      a = clamp(Math.round(bins[i].ac), 0, 255);
      if (oneBitAlpha) {
        const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
        a = a <= threshold ? 0 : 255;
      }
      if (clearAlpha && a <= clearAlphaThreshold) {
        r = g = b = clearAlphaColor;
        a = 0;
      }
    }
    const color = hasAlpha ? [r, g, b, a] : [r, g, b];
    const exists = existsInPalette(palette, color);
    if (!exists)
      palette.push(color);
    if ((i = bins[i].fw) == 0)
      break;
  }
  return palette;
}
function existsInPalette(palette, color) {
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    let matchesRGB = p[0] === color[0] && p[1] === color[1] && p[2] === color[2];
    let matchesAlpha = p.length >= 4 && color.length >= 4 ? p[3] === color[3] : true;
    if (matchesRGB && matchesAlpha)
      return true;
  }
  return false;
}

// src/color.js
function euclideanDistanceSquared(a, b) {
  var sum = 0;
  var n;
  for (n = 0; n < a.length; n++) {
    const dx = a[n] - b[n];
    sum += dx * dx;
  }
  return sum;
}

// src/palettize.js
function roundStep(byte, step) {
  return step > 1 ? Math.round(byte / step) * step : byte;
}
function prequantize(rgba, {roundRGB = 5, roundAlpha = 10, oneBitAlpha = null} = {}) {
  const data = new Uint32Array(rgba.buffer);
  for (let i = 0; i < data.length; i++) {
    const color = data[i];
    let a = color >> 24 & 255;
    let b = color >> 16 & 255;
    let g = color >> 8 & 255;
    let r = color & 255;
    a = roundStep(a, roundAlpha);
    if (oneBitAlpha) {
      const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
      a = a <= threshold ? 0 : 255;
    }
    r = roundStep(r, roundRGB);
    g = roundStep(g, roundRGB);
    b = roundStep(b, roundRGB);
    data[i] = a << 24 | b << 16 | g << 8 | r << 0;
  }
}
function applyPalette(rgba, palette, format = "rgb565") {
  if (!rgba || !rgba.buffer) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (palette.length > 256) {
    throw new Error("applyPalette() only works with 256 colors or less");
  }
  const data = new Uint32Array(rgba.buffer);
  const length = data.length;
  const bincount = format === "rgb444" ? 4096 : 65536;
  const index = new Uint8Array(length);
  const cache = new Array(bincount);
  const hasAlpha = format === "rgba4444";
  if (format === "rgba4444") {
    for (let i = 0; i < length; i++) {
      const color = data[i];
      const a = color >> 24 & 255;
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const key = rgba8888_to_rgba4444(r, g, b, a);
      const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGBA(r, g, b, a, palette);
      index[i] = idx;
    }
  } else {
    const rgb888_to_key = format === "rgb444" ? rgb888_to_rgb444 : rgb888_to_rgb565;
    for (let i = 0; i < length; i++) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const key = rgb888_to_key(r, g, b);
      const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGB(r, g, b, palette);
      index[i] = idx;
    }
  }
  return index;
}
function nearestColorIndexRGBA(r, g, b, a, palette) {
  let k = 0;
  let mindist = 1e100;
  for (let i = 0; i < palette.length; i++) {
    const px2 = palette[i];
    const a2 = px2[3];
    let curdist = sqr2(a2 - a);
    if (curdist > mindist)
      continue;
    const r2 = px2[0];
    curdist += sqr2(r2 - r);
    if (curdist > mindist)
      continue;
    const g2 = px2[1];
    curdist += sqr2(g2 - g);
    if (curdist > mindist)
      continue;
    const b2 = px2[2];
    curdist += sqr2(b2 - b);
    if (curdist > mindist)
      continue;
    mindist = curdist;
    k = i;
  }
  return k;
}
function nearestColorIndexRGB(r, g, b, palette) {
  let k = 0;
  let mindist = 1e100;
  for (let i = 0; i < palette.length; i++) {
    const px2 = palette[i];
    const r2 = px2[0];
    let curdist = sqr2(r2 - r);
    if (curdist > mindist)
      continue;
    const g2 = px2[1];
    curdist += sqr2(g2 - g);
    if (curdist > mindist)
      continue;
    const b2 = px2[2];
    curdist += sqr2(b2 - b);
    if (curdist > mindist)
      continue;
    mindist = curdist;
    k = i;
  }
  return k;
}
function snapColorsToPalette(palette, knownColors, threshold = 5) {
  if (!palette.length || !knownColors.length)
    return;
  const paletteRGB = palette.map((p) => p.slice(0, 3));
  const thresholdSq = threshold * threshold;
  const dim = palette[0].length;
  for (let i = 0; i < knownColors.length; i++) {
    let color = knownColors[i];
    if (color.length < dim) {
      color = [color[0], color[1], color[2], 255];
    } else if (color.length > dim) {
      color = color.slice(0, 3);
    } else {
      color = color.slice();
    }
    const r = nearestColorIndexWithDistance(paletteRGB, color.slice(0, 3), euclideanDistanceSquared);
    const idx = r[0];
    const distanceSq = r[1];
    if (distanceSq > 0 && distanceSq <= thresholdSq) {
      palette[idx] = color;
    }
  }
}
function sqr2(a) {
  return a * a;
}
function nearestColorIndex(colors, pixel, distanceFn = euclideanDistanceSquared) {
  let minDist = Infinity;
  let minDistIndex = -1;
  for (let j = 0; j < colors.length; j++) {
    const paletteColor = colors[j];
    const dist = distanceFn(pixel, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      minDistIndex = j;
    }
  }
  return minDistIndex;
}
function nearestColorIndexWithDistance(colors, pixel, distanceFn = euclideanDistanceSquared) {
  let minDist = Infinity;
  let minDistIndex = -1;
  for (let j = 0; j < colors.length; j++) {
    const paletteColor = colors[j];
    const dist = distanceFn(pixel, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      minDistIndex = j;
    }
  }
  return [minDistIndex, minDist];
}
function nearestColor(colors, pixel, distanceFn = euclideanDistanceSquared) {
  return colors[nearestColorIndex(colors, pixel, distanceFn)];
}

// src/index.js
function GIFEncoder(opt = {}) {
  const {initialCapacity = 4096, auto = true} = opt;
  const stream = createStream(initialCapacity);
  const HSIZE = 5003;
  const accum = new Uint8Array(256);
  const htab = new Int32Array(HSIZE);
  const codetab = new Int32Array(HSIZE);
  let hasInit = false;
  return {
    reset() {
      stream.reset();
      hasInit = false;
    },
    finish() {
      stream.writeByte(constants_default.trailer);
    },
    bytes() {
      return stream.bytes();
    },
    bytesView() {
      return stream.bytesView();
    },
    get buffer() {
      return stream.buffer;
    },
    get stream() {
      return stream;
    },
    writeHeader,
    writeFrame(index, width, height, opts = {}) {
      const {
        transparent = false,
        transparentIndex = 0,
        delay = 0,
        palette = null,
        repeat = 0,
        colorDepth = 8,
        dispose = -1
      } = opts;
      let first = false;
      if (auto) {
        if (!hasInit) {
          first = true;
          writeHeader();
          hasInit = true;
        }
      } else {
        first = Boolean(opts.first);
      }
      width = Math.max(0, Math.floor(width));
      height = Math.max(0, Math.floor(height));
      if (first) {
        if (!palette) {
          throw new Error("First frame must include a { palette } option");
        }
        encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth);
        encodeColorTable(stream, palette);
        if (repeat >= 0) {
          encodeNetscapeExt(stream, repeat);
        }
      }
      const delayTime = Math.round(delay / 10);
      encodeGraphicControlExt(stream, dispose, delayTime, transparent, transparentIndex);
      const useLocalColorTable = Boolean(palette) && !first;
      encodeImageDescriptor(stream, width, height, useLocalColorTable ? palette : null);
      if (useLocalColorTable)
        encodeColorTable(stream, palette);
      encodePixels(stream, index, width, height, colorDepth, accum, htab, codetab);
    }
  };
  function writeHeader() {
    writeUTFBytes(stream, "GIF89a");
  }
}
function encodeGraphicControlExt(stream, dispose, delay, transparent, transparentIndex) {
  stream.writeByte(33);
  stream.writeByte(249);
  stream.writeByte(4);
  if (transparentIndex < 0) {
    transparentIndex = 0;
    transparent = false;
  }
  var transp, disp;
  if (!transparent) {
    transp = 0;
    disp = 0;
  } else {
    transp = 1;
    disp = 2;
  }
  if (dispose >= 0) {
    disp = dispose & 7;
  }
  disp <<= 2;
  const userInput = 0;
  stream.writeByte(0 | disp | userInput | transp);
  writeUInt16(stream, delay);
  stream.writeByte(transparentIndex || 0);
  stream.writeByte(0);
}
function encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth = 8) {
  const globalColorTableFlag = 1;
  const sortFlag = 0;
  const globalColorTableSize = colorTableSize(palette.length) - 1;
  const fields = globalColorTableFlag << 7 | colorDepth - 1 << 4 | sortFlag << 3 | globalColorTableSize;
  const backgroundColorIndex = 0;
  const pixelAspectRatio = 0;
  writeUInt16(stream, width);
  writeUInt16(stream, height);
  stream.writeBytes([fields, backgroundColorIndex, pixelAspectRatio]);
}
function encodeNetscapeExt(stream, repeat) {
  stream.writeByte(33);
  stream.writeByte(255);
  stream.writeByte(11);
  writeUTFBytes(stream, "NETSCAPE2.0");
  stream.writeByte(3);
  stream.writeByte(1);
  writeUInt16(stream, repeat);
  stream.writeByte(0);
}
function encodeColorTable(stream, palette) {
  const colorTableLength = 1 << colorTableSize(palette.length);
  for (let i = 0; i < colorTableLength; i++) {
    let color = [0, 0, 0];
    if (i < palette.length) {
      color = palette[i];
    }
    stream.writeByte(color[0]);
    stream.writeByte(color[1]);
    stream.writeByte(color[2]);
  }
}
function encodeImageDescriptor(stream, width, height, localPalette) {
  stream.writeByte(44);
  writeUInt16(stream, 0);
  writeUInt16(stream, 0);
  writeUInt16(stream, width);
  writeUInt16(stream, height);
  if (localPalette) {
    const interlace = 0;
    const sorted = 0;
    const palSize = colorTableSize(localPalette.length) - 1;
    stream.writeByte(128 | interlace | sorted | 0 | palSize);
  } else {
    stream.writeByte(0);
  }
}
function encodePixels(stream, index, width, height, colorDepth = 8, accum, htab, codetab) {
  lzwEncode_default(width, height, index, colorDepth, stream, accum, htab, codetab);
}
function writeUInt16(stream, short) {
  stream.writeByte(short & 255);
  stream.writeByte(short >> 8 & 255);
}
function writeUTFBytes(stream, text) {
  for (var i = 0; i < text.length; i++) {
    stream.writeByte(text.charCodeAt(i));
  }
}
function colorTableSize(length) {
  return Math.max(Math.ceil(Math.log2(length)), 1);
}
var src_default = GIFEncoder;


window.gifenc=exports;
})();

