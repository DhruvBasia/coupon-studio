/*
 * Coupon Studio – rendering engine.
 *
 * A single layout routine drives two "painters": a canvas painter for the live preview and a jsPDF painter for
 * the exported PDF, so what you see on screen is exactly what gets printed. All geometry is in millimetres.
 */
(function (global) {
  'use strict';

  const PT = 25.4 / 72;               // millimetres per typographic point
  const BASE_W = 51.5, BASE_H = 29.2; // coupon size the default design was drawn for (mm)

  const FONTS = [
    { id: 'Outfit-Regular', label: 'Outfit Regular' },
    { id: 'Outfit-Medium', label: 'Outfit Medium' },
    { id: 'Outfit-Bold', label: 'Outfit Bold' },
    { id: 'Outfit-ExtraBold', label: 'Outfit Extra Bold' },
    { id: 'Poppins-SemiBold', label: 'Poppins Semi Bold' },
    { id: 'Poppins-ExtraBoldItalic', label: 'Poppins Extra Bold Italic' },
    { id: 'PlayfairDisplay-Bold', label: 'Playfair Display Bold' },
    { id: 'PlayfairDisplay-BoldItalic', label: 'Playfair Display Bold Italic' },
    { id: 'PlayfairDisplay-BlackItalic', label: 'Playfair Display Black Italic' },
    { id: 'Cinzel-Bold', label: 'Cinzel Bold (classic caps)' },
    { id: 'DancingScript-Bold', label: 'Dancing Script Bold (handwritten)' },
    { id: 'BebasNeue-Regular', label: 'Bebas Neue (condensed)' },
  ];

  const PAPERS = {
    A4: [210, 297], A3: [297, 420], A5: [148, 210],
    Letter: [215.9, 279.4], Legal: [215.9, 355.6],
  };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ------------------------------------------------------------------ colours */

  function rgb(hex) {
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  /** Blend colour a towards colour b by t (0 → a, 1 → b). */
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }

  /* ------------------------------------------------------------------ fonts */

  const family = (id) => 'CG_' + id;

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) {
      fontsReady = Promise.all(FONTS.map((f) => {
        const face = new FontFace(family(f.id), b64ToBytes(global.COUPON_FONT_DATA[f.id]));
        return face.load().then((loaded) => document.fonts.add(loaded));
      }));
    }
    return fontsReady;
  }

  /* ------------------------------------------------------------------ text measuring
   * Text is measured glyph-by-glyph without kerning. jsPDF does not kern either, so the preview and the PDF
   * place every character at exactly the same position. */

  const MS = 200;
  const mctx = document.createElement('canvas').getContext('2d');
  const advCache = new Map();
  const boxCache = new Map();

  function useFont(ctx, id, px) {
    ctx.font = px + 'px "' + family(id) + '"';
    if ('fontKerning' in ctx) ctx.fontKerning = 'none';
  }
  function adv(id, ch) {
    const key = id + '\u0000' + ch;
    let v = advCache.get(key);
    if (v === undefined) {
      useFont(mctx, id, MS);
      v = mctx.measureText(ch).width / MS;
      advCache.set(key, v);
    }
    return v;
  }
  /** Width in mm of `str` at font size `size` (mm) with `cs` mm of extra space between characters. */
  function textWidth(str, id, size, cs) {
    let w = 0, n = 0;
    for (const ch of str) { w += adv(id, ch); n++; }
    return w * size + (cs || 0) * Math.max(0, n - 1);
  }
  /** Ink ascent / descent of `str` as a fraction of the font size. */
  function inkBox(str, id) {
    const key = id + '\u0000' + str;
    let v = boxCache.get(key);
    if (!v) {
      useFont(mctx, id, MS);
      const m = mctx.measureText(str || 'H');
      v = { a: m.actualBoundingBoxAscent / MS, d: Math.max(0, m.actualBoundingBoxDescent / MS) };
      boxCache.set(key, v);
    }
    return v;
  }
  function capHeight(id) { return inkBox('H', id).a; }

  /* ------------------------------------------------------------------ painters */

  function roundRectPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  /** Draws onto a 2D canvas; `k` = pixels per millimetre, (ox, oy) = pixel offset. */
  class CanvasPainter {
    constructor(ctx, k, ox = 0, oy = 0) { this.c = ctx; this.k = k; this.ox = ox; this.oy = oy; }
    X(x) { return this.ox + x * this.k; }
    Y(y) { return this.oy + y * this.k; }
    _stroke(o) {
      const c = this.c;
      c.strokeStyle = o.stroke;
      c.lineWidth = Math.max(0.5, (o.lw || 0.2) * this.k);
      c.setLineDash(o.dash ? o.dash.map((d) => d * this.k) : []);
      c.stroke();
    }
    rect(x, y, w, h, o) {
      const c = this.c;
      if (o.r) roundRectPath(c, this.X(x), this.Y(y), w * this.k, h * this.k, o.r * this.k);
      else { c.beginPath(); c.rect(this.X(x), this.Y(y), w * this.k, h * this.k); }
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) this._stroke(o);
    }
    line(x1, y1, x2, y2, o) {
      const c = this.c;
      c.beginPath();
      c.moveTo(this.X(x1), this.Y(y1));
      c.lineTo(this.X(x2), this.Y(y2));
      this._stroke(o);
    }
    poly(pts, o) {
      const c = this.c;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(this.X(x), this.Y(y)) : c.moveTo(this.X(x), this.Y(y))));
      c.closePath();
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) this._stroke(o);
    }
    circle(x, y, r, o) {
      const c = this.c;
      c.beginPath();
      c.arc(this.X(x), this.Y(y), r * this.k, 0, Math.PI * 2);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) this._stroke(o);
    }
    text(str, x, y, o) {
      const c = this.c;
      useFont(c, o.font, o.size * this.k);
      c.fillStyle = o.color;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      let cx = x;
      for (const ch of str) {
        c.fillText(ch, this.X(cx), this.Y(y));
        cx += adv(o.font, ch) * o.size + (o.cs || 0);
      }
    }
    image(img, x, y, w, h) {
      const c = this.c;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img.canvas, this.X(x), this.Y(y), w * this.k, h * this.k);
    }
  }

  /** Draws into a jsPDF document whose unit is millimetres. */
  class PdfPainter {
    constructor(doc) { this.d = doc; }
    _style(o) {
      const d = this.d;
      if (o.fill) d.setFillColor(o.fill);
      if (o.stroke) {
        d.setDrawColor(o.stroke);
        d.setLineWidth(o.lw || 0.2);
        d.setLineDashPattern(o.dash || [], 0);
      }
      return o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S';
    }
    rect(x, y, w, h, o) {
      const style = this._style(o);
      if (o.r) this.d.roundedRect(x, y, w, h, Math.min(o.r, w / 2, h / 2), Math.min(o.r, w / 2, h / 2), style);
      else this.d.rect(x, y, w, h, style);
    }
    line(x1, y1, x2, y2, o) {
      this._style(o);
      this.d.line(x1, y1, x2, y2, 'S');
    }
    poly(pts, o) {
      const style = this._style(o);
      const deltas = [];
      for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      this.d.lines(deltas, pts[0][0], pts[0][1], [1, 1], style, true);
    }
    circle(x, y, r, o) {
      const style = this._style(o);
      this.d.circle(x, y, r, style);
    }
    text(str, x, y, o) {
      const d = this.d;
      d.setFont(o.font, 'normal');
      d.setFontSize(o.size / PT);
      d.setTextColor(o.color);
      d.text(str, x, y, { charSpace: o.cs || 0, baseline: 'alphabetic' });
    }
    image(img, x, y, w, h) {
      this.d.addImage(img.dataUrl, 'PNG', x, y, w, h, img.key, 'SLOW');
    }
  }

  /* ------------------------------------------------------------------ content helpers */

  function formatDate(iso, fmt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const y = +m[1], mo = +m[2], d = +m[3];
    const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    const pad = (v) => String(v).padStart(2, '0');
    const tokens = {
      YYYY: String(y), MMMM: MONTHS[mo - 1], MMM: MONTHS[mo - 1].slice(0, 3), MM: pad(mo),
      DD: pad(d), D: String(d), dddd: DAYS[dow], ddd: DAYS[dow].slice(0, 3),
    };
    return fmt.replace(/YYYY|MMMM|MMM|MM|DD|dddd|ddd|D/g, (t) => tokens[t]);
  }

  function dateText(S) {
    const D = S.date;
    if (D.custom) return D.customText || '';
    const a = formatDate(D.start, D.format);
    if (D.range && D.end && D.end !== D.start) return a + ' – ' + formatDate(D.end, D.format);
    return a;
  }

  function numberText(S, n) {
    const N = S.num;
    const v = Math.round(N.start) + n;
    const body = String(Math.abs(v)).padStart(Math.max(1, N.digits), '0');
    return (N.prefix ? N.prefix + N.sep : '') + (v < 0 ? '-' : '') + body + (N.suffix || '');
  }

  /* ------------------------------------------------------------------ page grid */

  function computeGrid(S) {
    const P = S.page;
    let [pw, ph] = PAPERS[P.size] || PAPERS.A4;
    if (P.orientation === 'landscape') [pw, ph] = [ph, pw];
    const mx = Math.max(0, +P.marginX || 0), my = Math.max(0, +P.marginY || 0), g = Math.max(0, +P.gap || 0);
    let cols, rows, cw, ch;
    if (P.mode === 'fixed') {
      cw = Math.max(5, +P.width || 50);
      ch = Math.max(5, +P.height || 28);
      cols = Math.max(0, Math.floor((pw - 2 * mx + g) / (cw + g) + 1e-9));
      rows = Math.max(0, Math.floor((ph - 2 * my + g) / (ch + g) + 1e-9));
    } else {
      cols = Math.max(1, Math.round(+P.cols || 1));
      rows = Math.max(1, Math.round(+P.rows || 1));
      cw = (pw - 2 * mx - g * (cols - 1)) / cols;
      ch = (ph - 2 * my - g * (rows - 1)) / rows;
    }
    const gw = cols * cw + (cols - 1) * g, gh = rows * ch + (rows - 1) * g;
    const x0 = (pw - gw) / 2, y0 = (ph - gh) / 2;
    const perPage = cols * rows;
    const count = Math.max(0, Math.round(+S.num.count || 0));
    const pages = perPage > 0 ? Math.max(1, Math.ceil(count / perPage)) : 0;
    const valid = cols > 0 && rows > 0 && cw >= 10 && ch >= 6;
    return { pw, ph, cols, rows, cw, ch, gap: g, x0, y0, gw, gh, perPage, count, pages, valid };
  }

  /** Coupon index (0-based) printed in a cell, or -1 when the cell stays blank. */
  function cellNumber(S, G, page, cell) {
    const n = S.num.order === 'stack' ? cell * G.pages + page : page * G.perPage + cell;
    return n < G.count ? n : -1;
  }

  /* ------------------------------------------------------------------ coupon layout */

  function computeLayout(S, w, h, logo, G) {
    const s = Math.min(w / BASE_W, h / BASE_H);
    const st = S.style;
    const L = { w, h, s, S };

    const ob = Math.min(Math.max(0, +st.inset || 0), w / 4, h / 4);
    const ib = 0.85 * s;
    L.outer = { x: ob, y: ob, w: w - 2 * ob, h: h - 2 * ob, r: Math.max(0, Math.min(+st.radius || 0, (h - 2 * ob) / 2)) };
    L.inner = { x: ob + ib, y: ob + ib, w: w - 2 * (ob + ib), h: h - 2 * (ob + ib), r: Math.max(0, L.outer.r - ib * 0.7) };
    const padX = 1.2 * s, padY = 0.45 * s;
    const box = { x: L.inner.x + padX, y: L.inner.y + padY, w: L.inner.w - 2 * padX, h: L.inner.h - 2 * padY };
    L.box = box;

    // Build the vertical stack; shrink everything if it does not fit.
    let f = 1, items, unit, extraTop = 0;
    for (let iter = 0; iter < 10; iter++) {
      items = buildItems(S, s * f, box, G);
      const total = items.reduce((a, it) => a + it.h, 0);
      const gapUnits = items.reduce((a, it) => a + it.gap, 0) + 0.7;
      unit = (box.h - total) / gapUnits;
      if (unit >= 0.3 * s * f || f < 0.35) break;
      f *= 0.92;
    }
    const maxUnit = 2.2 * s;
    if (unit > maxUnit) {
      const gapUnits = items.reduce((a, it) => a + it.gap, 0) + 0.7;
      extraTop = ((unit - maxUnit) * gapUnits) / 2;
      unit = maxUnit;
    }
    unit = Math.max(0, unit);
    let y = box.y + extraTop;
    for (const it of items) {
      y += it.gap * unit;
      it.top = y;
      y += it.h;
    }
    L.items = items;

    // Watermark logo, kept inside the coupon border.
    if (S.show.logo && logo) {
      const maxW = L.outer.w * 0.98, maxH = L.outer.h * 0.98;
      let lw = (L.outer.w * S.logo.size) / 100, lh = lw / logo.aspect;
      if (lh > maxH) { lh = maxH; lw = lh * logo.aspect; }
      if (lw > maxW) { lw = maxW; lh = lw / logo.aspect; }
      const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
      const cx = clamp(w / 2 + (S.logo.offsetX / 100) * w, ob + lw / 2, w - ob - lw / 2);
      const cy = clamp(h / 2 + (S.logo.offsetY / 100) * h, ob + lh / 2, h - ob - lh / 2);
      L.logo = { x: cx - lw / 2, y: cy - lh / 2, w: lw, h: lh };
    }
    return L;
  }

  function fitSize(str, font, size, track, maxW) {
    const w = textWidth(str, font, size, track * size);
    return w > maxW && w > 0 ? (size * maxW) / w : size;
  }

  function textItem(str, font, size, track, color, gap, maxW) {
    size = fitSize(str, font, size, track, maxW);
    const b = inkBox(str, font);
    return { type: 'text', str, font, size, cs: track * size, color, gap, asc: b.a * size, h: (b.a + b.d) * size,
      w: textWidth(str, font, size, track * size) };
  }

  function buildItems(S, u, box, G) {
    const T = S.text, F = S.fonts, Z = S.sizes, C = S.colors, sh = S.show, st = S.style;
    const items = [];
    const has = (v) => typeof v === 'string' && v.trim() !== '';

    if (sh.heading && has(T.heading)) {
      items.push(textItem(T.heading, F.heading, 5.8 * PT * u * Z.heading / 100, 0.045, C.primary, 0.9, box.w));
    }
    if (sh.divider) items.push({ type: 'divider', h: 0.9 * u, gap: 0.75, u });
    if (sh.title && has(T.title)) {
      items.push(textItem(T.title, F.title, 8.6 * PT * u * Z.title / 100, 0.01, C.primary, 0.95, box.w));
    }
    const dateVal = dateText(S);
    if (sh.date && (has(dateVal) || has(T.dateLabel))) {
      const label = has(T.dateLabel) ? T.dateLabel.trim() + ' ' : '';
      let size = 5.6 * PT * u * Z.date / 100;
      const wAt = (sz) => textWidth(label, F.body, sz, 0) + textWidth(dateVal, F.number, sz, 0);
      if (wAt(size) > box.w) size *= box.w / wAt(size);
      const b1 = inkBox(label || 'H', F.body), b2 = inkBox(dateVal || 'H', F.number);
      const a = Math.max(b1.a, b2.a), d = Math.max(b1.d, b2.d);
      items.push({ type: 'date', label, value: dateVal, size, gap: 0.8, asc: a * size, h: (a + d) * size,
        w: wAt(size), lw: textWidth(label, F.body, size, 0) });
    }
    if (sh.extra && has(T.extra)) {
      items.push(textItem(T.extra, F.body, 4.6 * PT * u * Z.extra / 100, 0.02, C.muted, 0.6, box.w));
    }
    if (sh.ribbon) items.push(ribbonItem(S, u, box, G));
    if (sh.authorized && has(T.authorized)) {
      const it = textItem(T.authorized, F.body, 4.7 * PT * u * Z.authorized / 100, 0.12, C.muted, 0.95, box.w);
      it.type = 'auth';
      it.lineGap = sh.signLine ? 0.9 * u : 0;
      it.h += it.lineGap;
      it.lineLen = Math.min(box.w, Math.max(it.w * 1.25, 12 * u));
      items.push(it);
    }
    return items;
  }

  function ribbonItem(S, u, box, G) {
    const T = S.text, F = S.fonts, st = S.style;
    const label = (T.numberLabel || '').trim();
    const style = st.ribbon;

    // Width of the widest possible coupon number, so every ribbon on the sheet is identical.
    const last = numberText(S, Math.max(0, (G ? G.count : 1) - 1));
    const first = numberText(S, 0);
    let maxDigit = 0;
    for (const dch of '0123456789') maxDigit = Math.max(maxDigit, adv(F.number, dch));
    const widest = (str) => {
      let w = 0;
      for (const ch of str) w += /[0-9]/.test(ch) ? maxDigit : adv(F.number, ch);
      return w;
    };
    const numEm = Math.max(widest(first), widest(last));

    const geom = (size) => {
      const rh = size * 2.05;
      const tip = style === 'arrow' || style === 'banner' ? rh * 0.42 : 0;
      const padL = (style === 'banner' ? tip : 0) + (style === 'pill' ? rh * 0.62 : rh * 0.5);
      const padR = style === 'pill' ? rh * 0.32 : rh * 0.28;
      const labW = label ? textWidth(label, F.number, size, 0.05 * size) : 0;
      const chipPad = st.chip === 'none' ? 0 : size * 0.55;
      const chipW = numEm * size + 2 * chipPad;
      const gapLC = label ? (st.chip === 'none' ? size * 0.55 : rh * 0.36) : 0;
      const totalW = padL + labW + gapLC + chipW + padR + tip;
      return { size, rh, tip, padL, labW, chipW, chipPad, gapLC, totalW };
    };
    let g = geom(5.6 * PT * u * S.sizes.ribbon / 100);
    if (g.totalW > box.w) g = geom(g.size * box.w / g.totalW);
    return Object.assign({ type: 'ribbon', label, h: g.rh, gap: 1.05 }, g);
  }

  /* ------------------------------------------------------------------ drawing */

  function drawCoupon(p, ox, oy, L, numStr, logo) {
    const S = L.S, C = S.colors, st = S.style, s = L.s, o = L.outer, inn = L.inner, box = L.box;

    p.rect(ox + o.x, oy + o.y, o.w, o.h, { r: o.r, fill: C.paper });
    if (L.logo && logo) p.image(logo, ox + L.logo.x, oy + L.logo.y, L.logo.w, L.logo.h);

    const dash = [0.75 * s, 0.48 * s];
    if (st.border === 'double' || st.border === 'solid') {
      p.rect(ox + o.x, oy + o.y, o.w, o.h, { r: o.r, stroke: C.primary, lw: 0.24 * s });
    }
    if (st.border === 'double') {
      p.rect(ox + inn.x, oy + inn.y, inn.w, inn.h, { r: inn.r, stroke: C.primary, lw: 0.17 * s, dash });
    } else if (st.border === 'dashed') {
      p.rect(ox + o.x, oy + o.y, o.w, o.h, { r: o.r, stroke: C.primary, lw: 0.22 * s, dash });
    }

    const cx = ox + L.w / 2;
    for (const it of L.items) {
      const top = oy + it.top;
      if (it.type === 'text') {
        p.text(it.str, cx - it.w / 2, top + it.asc, { font: it.font, size: it.size, color: it.color, cs: it.cs });
      } else if (it.type === 'divider') {
        const u = it.u, y = top + it.h / 2, len = 5.6 * u, gap = 1.0 * u, d = 0.45 * u;
        const lo = { stroke: C.accent, lw: 0.22 * u };
        p.line(cx - gap - len, y, cx - gap, y, lo);
        p.line(cx + gap, y, cx + gap + len, y, lo);
        p.poly([[cx, y - d], [cx + d, y], [cx, y + d], [cx - d, y]], { fill: C.accent });
      } else if (it.type === 'date') {
        const x = cx - it.w / 2, base = top + it.asc;
        if (it.label) p.text(it.label, x, base, { font: S.fonts.body, size: it.size, color: C.text });
        p.text(it.value, x + it.lw, base, { font: S.fonts.number, size: it.size, color: C.text });
      } else if (it.type === 'ribbon') {
        drawRibbon(p, ox, top, L, it, numStr);
      } else if (it.type === 'auth') {
        const align = st.authAlign;
        const lx = align === 'left' ? ox + box.x : align === 'center' ? cx - it.lineLen / 2 : ox + box.x + box.w - it.lineLen;
        if (it.lineGap) {
          p.line(lx, top, lx + it.lineLen, top, { stroke: mix(C.muted, '#ffffff', 0.35), lw: 0.16 * s });
        }
        const tx = lx + (it.lineLen - it.w) / 2;
        p.text(it.str, tx, top + it.lineGap + it.asc, { font: it.font, size: it.size, color: it.color, cs: it.cs });
      }
    }
  }

  function drawRibbon(p, ox, top, L, it, numStr) {
    const S = L.S, C = S.colors, st = S.style, F = S.fonts, box = L.box;
    const style = st.ribbon;
    const w = it.totalW, h = it.rh, tip = it.tip;
    const align = st.ribbonAlign;
    const x = align === 'left' ? ox + box.x : align === 'right' ? ox + box.x + box.w - w : ox + box.x + (box.w - w) / 2;
    const y = top;

    if (style === 'arrow') {
      p.poly([[x, y], [x + w - tip, y], [x + w, y + h / 2], [x + w - tip, y + h], [x, y + h]], { fill: C.primary });
    } else if (style === 'banner') {
      p.poly([[x, y], [x + w, y], [x + w - tip, y + h / 2], [x + w, y + h], [x, y + h], [x + tip, y + h / 2]], { fill: C.primary });
    } else if (style === 'pill') {
      p.rect(x, y, w, h, { r: h / 2, fill: C.primary });
    } else {
      p.rect(x, y, w, h, { r: h * 0.12, fill: C.primary });
    }

    const cap = capHeight(F.number) * it.size;
    const base = y + h / 2 + cap / 2;
    let cx = x + it.padL;
    if (it.label) {
      p.text(it.label, cx, base, { font: F.number, size: it.size, color: '#ffffff', cs: 0.05 * it.size });
      cx += it.labW + it.gapLC;
    }
    const chipH = h * 0.7;
    if (st.chip === 'tint') {
      p.rect(cx, y + (h - chipH) / 2, it.chipW, chipH, { r: chipH * 0.22, fill: mix(C.primary, '#ffffff', 0.2) });
    } else if (st.chip === 'white') {
      p.rect(cx, y + (h - chipH) / 2, it.chipW, chipH, { r: chipH * 0.22, fill: '#ffffff' });
    }
    const numColor = st.chip === 'white' ? C.primary : '#ffffff';
    const nw = textWidth(numStr, F.number, it.size, 0);
    p.text(numStr, cx + (it.chipW - nw) / 2, base, { font: F.number, size: it.size, color: numColor });
  }

  /* ------------------------------------------------------------------ cut lines */

  function edges(start, size, n, gap) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = start + i * (size + gap);
      out.push(a, a + size);
    }
    const uniq = [];
    out.sort((a, b) => a - b).forEach((v) => { if (!uniq.length || Math.abs(v - uniq[uniq.length - 1]) > 1e-6) uniq.push(v); });
    return uniq;
  }

  /** Scissors symbol centred at (x, y), pointing along `angle` (radians). */
  function scissors(p, x, y, size, angle, color) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const T = (px, py) => [x + (px * ca - py * sa) * size, y + (px * sa + py * ca) * size];
    const lw = 0.07 * size;
    // Finger rings on the left, blades crossing at the pivot (0, 0) and ending in points on the right.
    p.circle(...T(-0.34, -0.2), 0.12 * size, { stroke: color, lw });
    p.circle(...T(-0.34, 0.2), 0.12 * size, { stroke: color, lw });
    const blade = (hx, hy, tx, ty) => {
      const dx = tx - hx, dy = ty - hy, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
      const px = hx + dx * 0.3, py = hy + dy * 0.3; // widest part, just past the pivot
      p.poly([T(hx + nx * 0.035, hy + ny * 0.035), T(px + nx * 0.06, py + ny * 0.06), T(tx, ty),
        T(px - nx * 0.06, py - ny * 0.06), T(hx - nx * 0.035, hy - ny * 0.035)], { fill: color });
    };
    blade(-0.24, -0.12, 0.55, 0.15);
    blade(-0.24, 0.12, 0.55, -0.15);
  }

  function drawCutLines(p, S, G) {
    const P = S.page;
    if (P.cut === 'none' || !G.valid) return;
    const xs = edges(G.x0, G.cw, G.cols, G.gap);
    const ys = edges(G.y0, G.ch, G.rows, G.gap);
    const o = { stroke: P.cutColor, lw: Math.max(0.05, +P.cutWidth || 0.2), dash: P.cutStyle === 'dashed' ? [1.2, 0.9] : P.cutStyle === 'dotted' ? [0.25, 0.75] : null };

    if (P.cut === 'crop') {
      const len = 4, off = 1;
      const tick = (a1, a2) => a2 - a1 > 1.2;
      for (const x of xs) {
        if (tick(Math.max(0, G.y0 - off - len), G.y0 - off)) p.line(x, Math.max(0, G.y0 - off - len), x, G.y0 - off, { ...o, dash: null });
        if (tick(G.y0 + G.gh + off, Math.min(G.ph, G.y0 + G.gh + off + len))) p.line(x, G.y0 + G.gh + off, x, Math.min(G.ph, G.y0 + G.gh + off + len), { ...o, dash: null });
      }
      for (const y of ys) {
        if (tick(Math.max(0, G.x0 - off - len), G.x0 - off)) p.line(Math.max(0, G.x0 - off - len), y, G.x0 - off, y, { ...o, dash: null });
        if (tick(G.x0 + G.gw + off, Math.min(G.pw, G.x0 + G.gw + off + len))) p.line(G.x0 + G.gw + off, y, Math.min(G.pw, G.x0 + G.gw + off + len), y, { ...o, dash: null });
      }
      return;
    }

    const full = P.cut === 'full';
    for (const x of xs) p.line(x, full ? 0 : G.y0, x, full ? G.ph : G.y0 + G.gh, o);
    for (const y of ys) p.line(full ? 0 : G.x0, y, full ? G.pw : G.x0 + G.gw, y, o);

    if (P.scissors) {
      const sz = 2.6;
      // Place each symbol in the page margin when there is room, otherwise right at the edge.
      const top = G.y0 >= sz + 0.6 ? G.y0 / 2 : sz / 2 + 0.2;
      const bottom = G.ph - G.y0 - G.gh >= sz + 0.6 ? G.ph - (G.ph - G.y0 - G.gh) / 2 : G.ph - sz / 2 - 0.2;
      const left = G.x0 >= sz + 0.6 ? G.x0 / 2 : sz / 2 + 0.2;
      const right = G.pw - G.x0 - G.gw >= sz + 0.6 ? G.pw - (G.pw - G.x0 - G.gw) / 2 : G.pw - sz / 2 - 0.2;
      const color = mix(P.cutColor, '#000000', 0.15);
      if (full || G.y0 >= sz + 0.6) {
        for (const x of xs) { scissors(p, x, top, sz, Math.PI / 2, color); scissors(p, x, bottom, sz, -Math.PI / 2, color); }
      }
      if (full || G.x0 >= sz + 0.6) {
        for (const y of ys) { scissors(p, left, y, sz, 0, color); scissors(p, right, y, sz, Math.PI, color); }
      }
    }
  }

  /* ------------------------------------------------------------------ pages */

  function renderPage(p, S, G, L, logo, page, background) {
    if (background) p.rect(0, 0, G.pw, G.ph, { fill: '#ffffff' });
    if (!G.valid) return;
    drawCutLines(p, S, G);
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        const n = cellNumber(S, G, page, r * G.cols + c);
        if (n < 0) continue;
        drawCoupon(p, G.x0 + c * (G.cw + G.gap), G.y0 + r * (G.ch + G.gap), L, numberText(S, n), logo);
      }
    }
  }

  /** Draws one page of the sheet into a canvas at `k` px per mm. */
  function drawSheet(canvas, S, logo, page, k) {
    const G = computeGrid(S);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const L = G.valid ? computeLayout(S, G.cw, G.ch, logo, G) : null;
    renderPage(new CanvasPainter(ctx, k), S, G, L, logo, page, true);
    return G;
  }

  /** Draws a single coupon (with its cut lines) filling the canvas; `margin` is in mm. */
  function drawSingle(canvas, S, logo, n, k, margin) {
    const G = computeGrid(S);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!G.valid) return G;
    const p = new CanvasPainter(ctx, k);
    const L = computeLayout(S, G.cw, G.ch, logo, G);
    p.rect(0, 0, G.cw + 2 * margin, G.ch + 2 * margin, { fill: '#ffffff' });
    if (S.page.cut !== 'none') {
      const o = { stroke: S.page.cutColor, lw: Math.max(0.05, +S.page.cutWidth || 0.2), dash: S.page.cutStyle === 'dashed' ? [1.2, 0.9] : S.page.cutStyle === 'dotted' ? [0.25, 0.75] : null };
      const x1 = margin, y1 = margin, x2 = margin + G.cw, y2 = margin + G.ch;
      p.line(x1, 0, x1, y2 + margin, o); p.line(x2, 0, x2, y2 + margin, o);
      p.line(0, y1, x2 + margin, y1, o); p.line(0, y2, x2 + margin, y2, o);
    }
    drawCoupon(p, margin, margin, L, numberText(S, n), logo);
    return G;
  }

  /* ------------------------------------------------------------------ PDF export */

  /** Lets the page repaint (progress bar) without setTimeout, which browsers throttle in background tabs. */
  function yieldToBrowser() {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
  }

  async function buildPdf(S, logo, onProgress) {
    await loadFonts();
    const { jsPDF } = global.jspdf;
    const G = computeGrid(S);
    if (!G.valid) throw new Error('The page layout does not fit any coupons. Check the rows, columns and margins.');
    if (G.count < 1) throw new Error('Set the number of coupons to at least 1.');
    const orientation = G.pw > G.ph ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: [G.pw, G.ph], compress: true });

    const used = new Set([S.fonts.heading, S.fonts.title, S.fonts.body, S.fonts.number]);
    for (const id of used) {
      doc.addFileToVFS(id + '.ttf', global.COUPON_FONT_DATA[id]);
      doc.addFont(id + '.ttf', id, 'normal');
    }
    doc.setLineCap('butt');
    doc.setLineJoin('miter');

    const L = computeLayout(S, G.cw, G.ch, logo, G);
    const painter = new PdfPainter(doc);
    let lastYield = performance.now();
    for (let page = 0; page < G.pages; page++) {
      if (page > 0) doc.addPage([G.pw, G.ph], orientation);
      renderPage(painter, S, G, L, logo, page, false);
      if (performance.now() - lastYield > 60 || page === G.pages - 1) {
        if (onProgress) onProgress(page + 1, G.pages);
        await yieldToBrowser();
        lastYield = performance.now();
      }
    }
    doc.setProperties({
      title: [S.text.heading, S.text.title, 'Coupons'].filter(Boolean).join(' – '),
      creator: 'Coupon Studio',
    });
    return doc;
  }

  global.CouponRender = {
    FONTS, PAPERS, PT, loadFonts, computeGrid, computeLayout, drawSheet, drawSingle, buildPdf,
    numberText, dateText, formatDate, mix, rgb, cellNumber,
  };
})(window);
