/*!
 * FrotakOrb — esfera de partículas animada para a Frotak IA.
 * Sem dependências. Canvas 2D com escrita direta de pixels.
 *
 * Uso:
 *   const orb = new FrotakOrb(document.querySelector('canvas'), {
 *     colors: ['#000000', '#4CE657', '#000000'], // topo, meio, base
 *     background: '#05070D',
 *   });
 *   orb.setState('idle' | 'listening' | 'thinking' | 'speaking');
 *   orb.setLevel(0..1);        // opcional: volume da voz nos estados listening/speaking
 *   const stop = orb.connectAudio(fonte); // liga um MediaStream (microfone/WebRTC) ou
 *                                         // elemento de áudio direto no setLevel; stop() desliga
 *   orb.setColors([...]);      // troca a paleta a qualquer momento
 *   orb.destroy();
 */
(function (global) {
  'use strict';

  var STATES = {
    // amp: ondulação da superfície; speed: velocidade da onda; spin: giro; freq: "rugosidade"
    // gain: quanto o volume da voz deforma; scale: tamanho relativo
    idle:      { amp: 0.075, speed: 0.45, spin: 0.10, freq: 1.0,  glow: 0.85, gain: 0,    scale: 1 },
    listening: { amp: 0.06,  speed: 0.70, spin: 0.06, freq: 1.6,  glow: 0.95, gain: 0.11, scale: 0.92 },
    thinking:  { amp: 0.17,  speed: 1.70, spin: 0.55, freq: 1.4,  glow: 1.0,  gain: 0,    scale: 1 },
    speaking:  { amp: 0.20,  speed: 1.25, spin: 0.22, freq: 1.25, glow: 1.0,  gain: 0.16, scale: 1 }
  };

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    if (isNaN(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function FrotakOrb(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rows = opts.rows || 96;          // linhas de latitude
    this.density = opts.density || 230;   // pontos no equador
    this.radius = opts.radius || 0.33;    // fração do menor lado do canvas
    this.state = opts.state || 'idle';
    this.level = 0;
    this.autoLevel = opts.autoLevel !== false; // simula fala quando não há áudio
    this._levelSetAt = -1e9;
    this.cur = Object.assign({}, STATES[this.state]);
    this.t = 0;
    this.phase = 0;
    this.rot = 0;
    this.reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setColors(opts.colors || ['#000000', '#4CE657', '#000000']);
    this.setBackground(opts.background || '#05070D');
    this._buildPoints();
    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(this._resize);
      this._ro.observe(canvas);
    } else {
      global.addEventListener('resize', this._resize);
    }
    this._resize();
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  FrotakOrb.prototype.setState = function (s) {
    if (STATES[s]) this.state = s;
  };

  FrotakOrb.prototype.setLevel = function (v) {
    this.level = Math.max(0, Math.min(1, v || 0));
    // só conta como áudio real se houver som; silêncio longo volta para a simulação
    if (this.level > 0.02) this._levelSetAt = this.t;
  };

  FrotakOrb.prototype.setColors = function (colors) {
    var c = colors.map(hexToRgb);
    if (c.length === 1) c = [c[0], c[0], c[0]];
    if (c.length === 2) c = [c[0], [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2, (c[0][2] + c[1][2]) / 2], c[1]];
    // tabela de 256 cores do gradiente vertical (topo -> base)
    var lut = new Float32Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var k = i / 255, a, b, u;
      if (k < 0.5) { a = c[0]; b = c[1]; u = k * 2; } else { a = c[1]; b = c[2]; u = (k - 0.5) * 2; }
      u = u * u * (3 - 2 * u);
      lut[i * 3] = lerp(a[0], b[0], u);
      lut[i * 3 + 1] = lerp(a[1], b[1], u);
      lut[i * 3 + 2] = lerp(a[2], b[2], u);
    }
    this.lut = lut;
  };

  FrotakOrb.prototype.setBackground = function (hex) {
    this.bg = hexToRgb(hex);
  };

  FrotakOrb.prototype._buildPoints = function () {
    var pts = [];
    for (var r = 1; r < this.rows; r++) {
      var theta = (r / this.rows) * Math.PI;
      var sy = Math.cos(theta), sr = Math.sin(theta);
      var n = Math.max(6, Math.round(this.density * sr));
      for (var j = 0; j < n; j++) {
        var phi = (j / n) * Math.PI * 2 + r * 0.17;
        pts.push(sr * Math.cos(phi), sy, sr * Math.sin(phi));
      }
    }
    this.pts = new Float32Array(pts);
    this.count = pts.length / 3;
  };

  FrotakOrb.prototype._resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height && this.img) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.dpr = dpr;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Float32Array(w * h * 3);
  };

  FrotakOrb.prototype._frame = function (now) {
    var dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (this.reduced) dt *= 0.25;
    this.t += dt;

    // aproxima suavemente os parâmetros do estado atual
    var target = STATES[this.state], cur = this.cur, k = 1 - Math.pow(0.02, dt);
    for (var key in target) cur[key] = lerp(cur[key], target[key], k);

    // nível de fala: áudio real se setLevel foi chamado recentemente, senão simulado
    var lvl = 0;
    if (this.state === 'speaking' || this.state === 'listening') {
      if (this.t - this._levelSetAt < 1.2) lvl = this.level;
      else if (this.autoLevel) {
        var t = this.t;
        if (this.state === 'speaking') {
          var syl = Math.max(0, Math.sin(t * 11.0) * Math.sin(t * 4.3 + 1.1));
          lvl = Math.min(1, syl * (0.55 + 0.45 * Math.sin(t * 0.9)) * 1.6);
        } else {
          // frotista falando: frases curtas com pausas
          var talk = Math.max(0, Math.sin(t * 0.8)) > 0.35 ? 1 : 0;
          lvl = talk * Math.max(0, Math.sin(t * 8.5) * Math.sin(t * 3.1 + 0.4)) * 1.3;
        }
      }
    }
    this._lvl = lerp(this._lvl || 0, lvl, 1 - Math.pow(0.0005, dt));

    this.phase += dt * cur.speed;
    this.rot += dt * cur.spin;
    this._draw();
    this._raf = requestAnimationFrame(this._frame);
  };

  FrotakOrb.prototype._draw = function () {
    var W = this.canvas.width, H = this.canvas.height;
    var buf = this.buf, data = this.img.data, lut = this.lut, bg = this.bg;
    buf.fill(0);

    var cx = W / 2, cy = H / 2;
    var lvl = this._lvl || 0;
    var amp = this.cur.amp + lvl * this.cur.gain;
    // encolhe a base conforme a deformação cresce, para os picos não saírem do canvas
    var R = Math.min(W, H) * this.radius * this.cur.scale * (1 + lvl * 0.05) / (1 + (amp - 0.075) * 0.9);
    var f = this.cur.freq, p = this.phase, glow = this.cur.glow;
    var cr = Math.cos(this.rot), sr = Math.sin(this.rot);
    var tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    var persp = 3.2;
    var dot = this.dpr >= 1.5 ? 2 : 1;
    var pts = this.pts, n = this.count;

    for (var i = 0; i < n; i++) {
      var x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];

      // ondulação orgânica: soma de senos em campo 3D (barato e suave)
      var d =
        Math.sin(2.6 * f * x + p * 1.1 + Math.sin(2.1 * f * y + p * 0.7)) * Math.cos(3.1 * f * y - p * 0.9) * 0.6 +
        Math.sin(4.3 * f * z + 3.2 * f * x - p * 1.6) * 0.3 +
        Math.sin(6.5 * f * y + 2.0 * z + p * 2.3) * 0.18 * (0.4 + lvl * 1.6);
      var rr = 1 + amp * d;

      var px = x * rr, py = y * rr, pz = z * rr;
      // giro no eixo Y
      var rx = px * cr + pz * sr, rz = -px * sr + pz * cr;
      // inclinação no eixo X
      var ry = py * ct - rz * st;
      rz = py * st + rz * ct;

      var s = persp / (persp - rz);
      var X = cx + rx * s * R, Y = cy - ry * s * R;
      var xi = X | 0, yi = Y | 0;
      if (xi < 0 || yi < 0 || xi >= W - dot || yi >= H - dot) continue;

      // gradiente pela posição vertical na tela
      var gy = (Y - (cy - R * 1.2)) / (R * 2.4);
      var li = (gy < 0 ? 0 : gy > 1 ? 255 : (gy * 255) | 0) * 3;

      // profundidade: frente brilhante, fundo visível mas apagado
      var depth = (rz + 1.15) / 2.3;
      depth = depth < 0 ? 0 : depth > 1 ? 1 : depth;
      // cristas da onda mais claras
      var crest = 0.65 + 0.35 * (d * 0.5 + 0.5);
      // borda (silhueta) um pouco mais acesa, como na referência
      var rim = 1 - Math.abs(rz) / rr;
      var a = (0.12 + 0.88 * depth * depth) * crest * glow * (0.85 + rim * 0.5) * 1.7;

      var cr0 = lut[li] * a, cg0 = lut[li + 1] * a, cb0 = lut[li + 2] * a;
      for (var oy = 0; oy < dot; oy++) {
        var o = ((yi + oy) * W + xi) * 3;
        for (var ox = 0; ox < dot; ox++, o += 3) {
          buf[o] += cr0; buf[o + 1] += cg0; buf[o + 2] += cb0;
        }
      }
    }

    // compõe sobre o fundo
    var b0 = bg[0], b1 = bg[1], b2 = bg[2];
    for (var j = 0, q = 0, L = W * H; j < L; j++, q += 3) {
      var o4 = j * 4;
      data[o4] = b0 + buf[q];
      data[o4 + 1] = b1 + buf[q + 1];
      data[o4 + 2] = b2 + buf[q + 2];
      data[o4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  };

  // Lê o volume de um MediaStream (microfone, WebRTC) ou de um elemento de áudio/vídeo
  // e alimenta setLevel a cada quadro. Retorna uma função que desliga a leitura.
  // Nunca mexe na reprodução: o elemento de áudio continua tocando como antes.
  // Se não der para ler o volume (navegador sem suporte, áudio de outro domínio),
  // a esfera simplesmente continua com a fala simulada.
  FrotakOrb.prototype.connectAudio = function (source, opts) {
    opts = opts || {};
    var self = this, noop = function () {};
    try {
      var stream = source;
      if (typeof MediaStream === 'undefined' || !(source instanceof MediaStream)) {
        // elemento <audio>/<video>: copia o som sem desviar a saída dele
        var cap = source && (source.captureStream || source.mozCaptureStream);
        if (!cap) return noop;
        stream = cap.call(source);
      }
      if (!stream.getAudioTracks().length) return noop;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return noop;
      var ctx = opts.context || this._audioCtx || (this._audioCtx = new AC());
      var node = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      node.connect(analyser); // só análise, nada vai para o alto-falante
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(noop);
      var buf = new Uint8Array(analyser.fftSize), raf, sens = opts.sensitivity || 4, stopped = false;
      (function tick() {
        if (stopped) return;
        analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) { var x = (buf[i] - 128) / 128; sum += x * x; }
        self.setLevel(Math.min(1, Math.sqrt(sum / buf.length) * sens));
        raf = requestAnimationFrame(tick);
      })();
      return function () {
        stopped = true;
        cancelAnimationFrame(raf);
        try { node.disconnect(); } catch (e) {}
        self.setLevel(0);
      };
    } catch (e) {
      return noop;
    }
  };

  FrotakOrb.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    else global.removeEventListener('resize', this._resize);
  };

  FrotakOrb.STATES = STATES;
  global.FrotakOrb = FrotakOrb;
  if (typeof module !== 'undefined' && module.exports) module.exports = FrotakOrb;
})(typeof window !== 'undefined' ? window : this);
