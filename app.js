/* Coupon Studio – editor, live preview and export wiring. */
(function () {
  'use strict';

  const R = window.CouponRender;
  const STORAGE_KEY = 'couponStudio.settings.v1';
  const DESIGNS_KEY = 'couponStudio.designs.v1';

  // Neutral starting point: no real event's name, prefix or logo ships with the page.
  const todayIso = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const DEFAULTS = {
    text: {
      heading: 'YOUR EVENT NAME', title: 'REFRESHMENT', dateLabel: 'Date :', extra: '',
      numberLabel: 'COUPON NO.', authorized: 'AUTHORIZED',
    },
    show: {
      heading: true, divider: true, title: true, date: true, extra: false, ribbon: true, authorized: true,
      signLine: true, logo: true,
    },
    date: { start: todayIso(), end: todayIso(), range: false, format: 'DD.MM.YYYY', custom: false, customText: '' },
    num: { prefix: 'EVT', sep: '-', suffix: '', start: 1, count: 200, digits: 3, order: 'page' },
    logo: { src: null, name: '', opacity: 28, size: 78, offsetX: 0, offsetY: 3, mode: 'original', removeWhite: true, trim: true },
    colors: { primary: '#d12e2e', accent: '#f2b300', text: '#334155', muted: '#64748b', paper: '#ffffff' },
    fonts: { heading: 'Outfit-Bold', title: 'PlayfairDisplay-BoldItalic', body: 'Outfit-Medium', number: 'Outfit-Bold' },
    sizes: { heading: 100, title: 100, date: 100, extra: 100, ribbon: 100, authorized: 100 },
    style: { border: 'double', radius: 1.4, inset: 1.4, ribbon: 'arrow', chip: 'tint', ribbonAlign: 'center', authAlign: 'right' },
    page: {
      size: 'A4', orientation: 'portrait', mode: 'fit', cols: 4, rows: 10, width: 50, height: 28,
      marginX: 5, marginY: 5, gap: 0, cut: 'full', cutStyle: 'dashed', cutWidth: 0.2, cutColor: '#94a3b8', scissors: true,
    },
  };

  const THEMES = [
    { name: 'Crimson', primary: '#d12e2e', accent: '#f2b300', text: '#334155', muted: '#64748b', paper: '#ffffff' },
    { name: 'Pink', primary: '#db2777', accent: '#f59e0b', text: '#3f3346', muted: '#7a6878', paper: '#ffffff' },
    { name: 'Royal blue', primary: '#1d4ed8', accent: '#f2b300', text: '#1e293b', muted: '#64748b', paper: '#ffffff' },
    { name: 'Navy & gold', primary: '#1e3a8a', accent: '#c9a227', text: '#1f2937', muted: '#6b7280', paper: '#fffdf6' },
    { name: 'Emerald', primary: '#047857', accent: '#eab308', text: '#1f3a33', muted: '#5f7470', paper: '#ffffff' },
    { name: 'Teal', primary: '#0f766e', accent: '#f97316', text: '#1e3a3a', muted: '#5b7171', paper: '#ffffff' },
    { name: 'Purple', primary: '#6d28d9', accent: '#f59e0b', text: '#2e2445', muted: '#6e6585', paper: '#ffffff' },
    { name: 'Orange', primary: '#ea580c', accent: '#0e7490', text: '#3b2a1f', muted: '#7c6a5c', paper: '#ffffff' },
    { name: 'Maroon & gold', primary: '#7f1d1d', accent: '#c9a227', text: '#3a2323', muted: '#7a5f5f', paper: '#fffaf3' },
    { name: 'Coffee', primary: '#7c4a1e', accent: '#d4a017', text: '#3b2f25', muted: '#7d6c5c', paper: '#fffaf2' },
    { name: 'Sky', primary: '#0284c7', accent: '#f43f5e', text: '#1e2f3d', muted: '#5f7180', paper: '#ffffff' },
    { name: 'Charcoal', primary: '#1f2937', accent: '#d4a017', text: '#1f2937', muted: '#6b7280', paper: '#ffffff' },
  ];

  const COUPON_TYPES = ['REFRESHMENT', 'BREAKFAST', 'LUNCH', 'HIGH TEA', 'DINNER', 'SNACKS', 'TEA / COFFEE', 'ENTRY PASS', 'WELCOME KIT'];

  const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'DD-MM-YYYY', 'D MMM YYYY', 'D MMMM YYYY', 'MMM D, YYYY', 'ddd, DD.MM.YYYY', 'dddd, D MMMM YYYY'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ================================================================ state */

  function merge(base, over) {
    const out = Array.isArray(base) ? [] : {};
    for (const k of Object.keys(base)) {
      const b = base[k], o = over ? over[k] : undefined;
      if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, o);
      else if (o !== undefined && (b === null || typeof o === typeof b)) out[k] = o;
      else out[k] = b;
    }
    return out;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return merge(DEFAULTS, JSON.parse(raw));
    } catch (e) { /* storage unavailable – fall back to defaults */ }
    return clone(DEFAULTS);
  }

  let state = loadState();
  let saveTimer = null, storageWarned = false;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, state, { logo: Object.assign({}, state.logo, { src: null }) })));
        } catch (e2) { /* ignore */ }
        if (!storageWarned) { storageWarned = true; toast('This logo is too large to be remembered after closing the page – export your settings to keep it.'); }
      }
    }, 300);
  }

  const getPath = (path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), state);
  function setPath(path, value) {
    const keys = path.split('.');
    let o = state;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  }

  /* ================================================================ form binding */

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
    if (el.type === 'number' || el.type === 'range' || el.dataset.type === 'number') {
      if (el.value === '') return undefined;
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : undefined;
    }
    return el.value;
  }

  function syncForm() {
    for (const el of $$('[data-bind]')) {
      const v = getPath(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = el.value === String(v);
      else if (document.activeElement !== el) el.value = v == null ? '' : String(v);
    }
    syncDerived();
  }

  function syncDerived() {
    for (const out of $$('output[data-for]')) {
      const v = getPath(out.dataset.for);
      const unit = out.dataset.unit || '';
      out.textContent = (typeof v === 'number' && v > 0 && /offset/.test(out.dataset.for) ? '+' : '') + v + unit;
    }
    for (const el of $$('[data-show-if]')) {
      const cond = el.dataset.showIf;
      let ok;
      if (cond.includes('=')) { const [p, val] = cond.split('='); ok = String(getPath(p)) === val; }
      else if (cond.startsWith('!')) ok = !getPath(cond.slice(1));
      else ok = !!getPath(cond);
      el.hidden = !ok;
    }
    $('#startDateLabel').textContent = state.date.range ? 'Start date' : 'Date';
    $$('.chip', $('#typeChips')).forEach((c) => c.classList.toggle('active', c.dataset.value === state.text.title));
    const cur = state.colors;
    $$('.swatch').forEach((sw, i) => {
      const t = THEMES[i];
      sw.classList.toggle('active', t.primary === cur.primary && t.accent === cur.accent);
    });
    updateDateFormatLabels();
    updateSummaries();
  }

  function onFormInput(e) {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const v = readInput(el);
    if (v === undefined) return;
    let value = v;
    if (el.type === 'number') {
      const min = el.min !== '' ? parseFloat(el.min) : -Infinity, max = el.max !== '' ? parseFloat(el.max) : Infinity;
      value = Math.min(max, Math.max(min, v));
      if (el.step === '1') value = Math.round(value);
    }
    setPath(el.dataset.bind, value);
    if (el.dataset.bind === 'date.start' && state.date.end && state.date.end < value) state.date.end = value;
    if (el.dataset.bind === 'page.mode' && value === 'fixed') {
      // Start the exact-size inputs from the current grid so switching modes does not jump.
      const G = R.computeGrid(Object.assign({}, state, { page: Object.assign({}, state.page, { mode: 'fit' }) }));
      state.page.width = Math.round(G.cw * 10) / 10;
      state.page.height = Math.round(G.ch * 10) / 10;
      syncForm();
    }
    syncDerived();
    persist();
    scheduleRender();
  }

  /* ================================================================ static UI */

  function buildStaticUI() {
    const chips = $('#typeChips');
    for (const t of COUPON_TYPES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t; b.dataset.value = t;
      b.addEventListener('click', () => { state.text.title = t; syncForm(); persist(); scheduleRender(); });
      chips.appendChild(b);
    }

    const sw = $('#themeSwatches');
    THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.title = t.name; b.setAttribute('aria-label', t.name + ' theme');
      b.style.background = t.primary; b.style.setProperty('--acc', t.accent);
      b.addEventListener('click', () => {
        Object.assign(state.colors, { primary: t.primary, accent: t.accent, text: t.text, muted: t.muted, paper: t.paper });
        syncForm(); persist(); scheduleRender();
      });
      sw.appendChild(b);
    });

    for (const sel of $$('.font-select')) {
      for (const f of R.FONTS) {
        const o = document.createElement('option');
        o.value = f.id; o.textContent = f.label; o.style.fontFamily = '"CG_' + f.id + '"';
        sel.appendChild(o);
      }
    }

    const df = $('#dateFormat');
    for (const f of DATE_FORMATS) {
      const o = document.createElement('option');
      o.value = f; df.appendChild(o);
    }
  }

  function updateDateFormatLabels() {
    const iso = state.date.start || todayIso();
    for (const o of $('#dateFormat').options) o.textContent = R.formatDate(iso, o.value) || o.value;
  }

  function updateSummaries() {
    const G = R.computeGrid(state);
    const first = R.numberText(state, 0), last = R.numberText(state, Math.max(0, G.count - 1));
    const per = G.perPage;
    $('#numSummary').innerHTML = G.count > 0
      ? `Numbers run <b>${esc(first)}</b> → <b>${esc(last)}</b> · ${G.count.toLocaleString()} coupons on <b>${G.pages}</b> page${G.pages === 1 ? '' : 's'}` +
        (per && G.count % per ? ` (last page has ${G.count % per} filled)` : '')
      : 'Set how many coupons you need.';

    const gs = $('#gridSummary');
    if (!G.valid) {
      gs.className = 'note warn';
      gs.innerHTML = 'These settings leave no room for coupons. Reduce the margins, rows or columns, or the coupon size.';
    } else {
      gs.className = 'note';
      gs.innerHTML = `Each coupon is exactly <b>${fmt(G.cw)} × ${fmt(G.ch)} mm</b> · <b>${G.cols} × ${G.rows}</b> = ${per} per page` +
        `<br>Grid starts ${fmt(G.x0)} mm from the left edge and ${fmt(G.y0)} mm from the top.`;
    }

    const sum = G.valid
      ? `${state.text.title || 'Coupons'} · ${G.count.toLocaleString()} coupons · ${G.pages} page${G.pages === 1 ? '' : 's'} · ${fmt(G.cw)} × ${fmt(G.ch)} mm`
      : 'Layout needs attention';
    $('#summary').textContent = sum;
  }

  const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ================================================================ logo processing */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = src;
    });
  }

  let logoSeq = 0;
  const logoCache = { sig: null, promise: null };

  function getLogo() {
    const Lg = state.logo;
    const src = Lg.src;
    if (!src) { logoCache.sig = null; return Promise.resolve(null); }
    const sig = [src.length, src.slice(-48), Lg.opacity, Lg.mode, Lg.removeWhite, Lg.trim, Lg.mode === 'tint' ? state.colors.primary : ''].join('|');
    if (logoCache.sig !== sig) {
      logoCache.sig = sig;
      logoCache.promise = loadImage(src).then((img) => processLogo(img, Lg, state.colors.primary)).catch(() => null);
    }
    return logoCache.promise;
  }

  function processLogo(img, Lg, tint) {
    const MAX = 1200;
    let w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
    const sc = Math.min(1, MAX / Math.max(w, h));
    w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    const [tr, tg, tb] = R.rgb(tint);
    const op = Math.max(0, Math.min(1, Lg.opacity / 100));
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      let r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3] / 255;
      if (Lg.removeWhite) {
        const mn = Math.min(r, g, b);
        if (mn > 200) a *= Math.max(0, (252 - mn) / 52);
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (Lg.mode === 'grayscale') { r = g = b = l; }
      else if (Lg.mode === 'tint') { a *= Math.min(1, (1 - l / 255) * 1.6); r = tr; g = tg; b = tb; }
      if (a > 0.03) {
        const x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(a * op * 255);
    }
    if (maxX < 0) return null; // nothing visible
    ctx.putImageData(id, 0, 0);
    let out = cv;
    if (Lg.trim) {
      const pad = 2;
      const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
      const cw = Math.min(w, maxX + pad + 1) - x0, ch = Math.min(h, maxY + pad + 1) - y0;
      out = document.createElement('canvas');
      out.width = cw; out.height = ch;
      out.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
    }
    return { canvas: out, dataUrl: out.toDataURL('image/png'), key: 'logo' + ++logoSeq, aspect: out.width / out.height };
  }

  function drawLogoThumb(logo) {
    const c = $('#logoThumbCanvas');
    if (!logo) { c.width = 1; c.height = 1; return; }
    const W = 240, H = 112;
    const sc = Math.min(W / logo.canvas.width, H / logo.canvas.height);
    c.width = Math.max(1, Math.round(logo.canvas.width * sc));
    c.height = Math.max(1, Math.round(logo.canvas.height * sc));
    c.style.width = c.width / 2 + 'px'; c.style.height = c.height / 2 + 'px';
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo.canvas, 0, 0, c.width, c.height);
  }

  async function acceptLogoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Please choose an image file (PNG, JPG, SVG or WebP).', 'error'); return; }
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Could not read the file.'));
        fr.readAsDataURL(file);
      });
      const img = await loadImage(dataUrl);
      // Store a reasonably sized PNG so settings stay small enough to remember.
      const MAX = 1400;
      let w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
      const sc = Math.min(1, MAX / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      state.logo.src = cv.toDataURL('image/png');
      state.logo.name = file.name;
      state.show.logo = true;
      storageWarned = false;
      syncForm(); persist(); scheduleRender();
      toast('Logo updated.');
    } catch (e) {
      toast(e.message || 'That image could not be used.', 'error');
    }
  }

  /* ================================================================ preview */

  const view = { mode: 'sheet', page: 0, coupon: 0, zoom: 1 };
  let renderQueued = false, renderToken = 0;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    // requestAnimationFrame pauses in background tabs, so a timer makes sure the preview still catches up.
    const run = () => { if (!renderQueued) return; renderQueued = false; render(); };
    requestAnimationFrame(run);
    setTimeout(run, 150);
  }

  async function render() {
    const token = ++renderToken;
    const logo = await getLogo();
    if (token !== renderToken) return;
    drawLogoThumb(logo);
    $('#logoName').textContent = state.logo.src ? (state.logo.name || 'Your logo') : 'No logo yet';
    $('#btnLogoReset').hidden = !state.logo.src;
    $('#logoThumb').classList.toggle('empty', !state.logo.src);

    const G = R.computeGrid(state);
    const stage = $('#stage'), canvas = $('#sheet');
    const availW = Math.max(200, stage.clientWidth - 56), availH = Math.max(200, stage.clientHeight - 56);
    const dprBase = Math.min(window.devicePixelRatio || 1, 2.5);
    const useLogo = state.show.logo ? logo : null;

    view.page = Math.min(Math.max(0, view.page), Math.max(0, G.pages - 1));
    view.coupon = Math.min(Math.max(0, view.coupon), Math.max(0, G.count - 1));
    stage.classList.toggle('single', view.mode === 'single');

    let k, wmm, hmm;
    const margin = 4;
    if (view.mode === 'sheet') {
      wmm = G.pw; hmm = G.ph;
      k = Math.min(availW / wmm, availH / hmm) * view.zoom;
    } else {
      wmm = G.cw + 2 * margin; hmm = G.ch + 2 * margin;
      k = Math.min(availW / wmm, availH / hmm, 22) * view.zoom;
    }
    const cssW = wmm * k, cssH = hmm * k;
    const dpr = Math.max(0.5, Math.min(dprBase, Math.sqrt(40e6 / (cssW * cssH))));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    if (view.mode === 'sheet') R.drawSheet(canvas, state, useLogo, view.page, k * dpr);
    else R.drawSingle(canvas, state, useLogo, view.coupon, k * dpr, margin);

    const pct = Math.round((k / (96 / 25.4)) * 100);
    $('#btnZoomFit').textContent = view.zoom === 1 ? 'Fit · ' + pct + '%' : pct + '%';
    if (view.mode === 'sheet') {
      $('#pageInfo').textContent = G.pages ? `Page ${view.page + 1} / ${G.pages}` : 'No pages';
    } else {
      $('#pageInfo').textContent = G.count ? R.numberText(state, view.coupon) + `  (${view.coupon + 1} / ${G.count})` : '—';
    }
    $('#btnPrev').disabled = view.mode === 'sheet' ? view.page <= 0 : view.coupon <= 0;
    $('#btnNext').disabled = view.mode === 'sheet' ? view.page >= G.pages - 1 : view.coupon >= G.count - 1;

    const pageNums = [];
    if (G.valid && view.mode === 'sheet') {
      for (let c = 0; c < G.perPage; c++) { const n = R.cellNumber(state, G, view.page, c); if (n >= 0) pageNums.push(n); }
    }
    $('#statusbar').innerHTML = G.valid
      ? [
        `Paper <b>${state.page.size} ${state.page.orientation}</b> (${fmt(G.pw)} × ${fmt(G.ph)} mm)`,
        `Coupon <b>${fmt(G.cw)} × ${fmt(G.ch)} mm</b>`,
        `<b>${G.cols} × ${G.rows}</b> per page`,
        view.mode === 'sheet' && pageNums.length
          ? `This page: <b>${esc(R.numberText(state, Math.min(...pageNums)))} – ${esc(R.numberText(state, Math.max(...pageNums)))}</b>`
          : '',
        'Double-click a coupon to inspect it',
      ].filter(Boolean).join('<span>·</span>')
      : 'The page layout does not fit any coupons – check the Paper & cutting settings.';
  }

  function couponAt(evt) {
    const G = R.computeGrid(state);
    const canvas = $('#sheet');
    const rect = canvas.getBoundingClientRect();
    const mmX = ((evt.clientX - rect.left) / rect.width) * G.pw;
    const mmY = ((evt.clientY - rect.top) / rect.height) * G.ph;
    const c = Math.floor((mmX - G.x0) / (G.cw + G.gap)), r = Math.floor((mmY - G.y0) / (G.ch + G.gap));
    if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return -1;
    return R.cellNumber(state, G, view.page, r * G.cols + c);
  }

  function setView(mode) {
    view.mode = mode;
    view.zoom = 1;
    $$('input[name="view"]').forEach((r) => { r.checked = r.value === mode; });
    scheduleRender();
  }

  /* ================================================================ PDF */

  function fileName() {
    const title = (state.text.title || 'Coupons').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const name = [state.num.prefix, title, 'Coupons'].filter(Boolean).join(' ');
    return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  let busy = false, lastPdfUrl = null;
  async function makePdf(mode) {
    if (busy) return;
    if (isHosted()) mode = 'download';
    busy = true;
    $('#busy').hidden = false;
    $('#busyText').textContent = 'Preparing…';
    $('#busyBar').style.width = '0%';
    $('#btnDownload').disabled = $('#btnPreviewPdf').disabled = true;
    try {
      await R.loadFonts();
      const logo = state.show.logo ? await getLogo() : null;
      const doc = await R.buildPdf(state, logo, (i, n) => {
        $('#busyText').textContent = `Building page ${i} of ${n}…`;
        $('#busyBar').style.width = Math.round((i / n) * 100) + '%';
      });
      const name = fileName();
      if (mode === 'download') {
        $('#busy').hidden = true;
        if (await saveFile(name, doc.output('blob'), 'application/pdf')) toast(`Saved “${name}”`);
      } else {
        if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
        const blob = doc.output('blob');
        lastPdfUrl = URL.createObjectURL(blob);
        $('#pdfFrame').src = lastPdfUrl;
        $('#pdfOpenTab').href = lastPdfUrl;
        $('#pdfDownload').href = lastPdfUrl;
        $('#pdfDownload').download = name;
        $('#pdfTitle').textContent = name + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB';
        $('#pdfModal').hidden = false;
      }
    } catch (e) {
      console.error(e);
      toast(e.message || 'Something went wrong while building the PDF.', 'error');
    } finally {
      busy = false;
      $('#busy').hidden = true;
      $('#btnDownload').disabled = $('#btnPreviewPdf').disabled = false;
    }
  }

  /* ================================================================ saved designs */

  function readDesigns() {
    try { return JSON.parse(localStorage.getItem(DESIGNS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeDesigns(d) {
    try { localStorage.setItem(DESIGNS_KEY, JSON.stringify(d)); return true; } catch (e) {
      toast('Could not save – browser storage is full. Use “Export settings file” instead.', 'error');
      return false;
    }
  }
  function renderDesigns() {
    const list = $('#designList');
    const d = readDesigns();
    const names = Object.keys(d).sort((a, b) => (d[b].savedAt || 0) - (d[a].savedAt || 0));
    list.innerHTML = '';
    if (!names.length) {
      list.innerHTML = '<li class="empty">No saved designs yet</li>';
      return;
    }
    for (const n of names) {
      const li = document.createElement('li');
      const when = d[n].savedAt ? new Date(d[n].savedAt).toLocaleDateString() : '';
      li.innerHTML = `<span title="${esc(n)}">${esc(n)}<br><small>${esc(when)}</small></span>`;
      const load = document.createElement('button');
      load.className = 'btn small'; load.type = 'button'; load.textContent = 'Load';
      load.addEventListener('click', () => {
        state = merge(DEFAULTS, d[n].settings);
        syncForm(); persist(); scheduleRender();
        toast(`Loaded “${n}”`);
      });
      const del = document.createElement('button');
      del.className = 'btn small ghost'; del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!(await askConfirm(`Delete the saved design “${n}”?`, 'Delete'))) return;
        const all = readDesigns(); delete all[n]; writeDesigns(all); renderDesigns();
      });
      li.append(load, del);
      list.appendChild(li);
    }
  }

  /* ================================================================ hosting helpers
   * The same page runs locally (opened from disk) and as a hosted claude.ai artifact. Hosted pages cannot start
   * downloads, print or show confirm() boxes, so file saves go through the viewer's `downloads` capability and
   * confirmations use an in-page dialog. */

  const isHosted = () => !!(window.claude && typeof window.claude.use === 'function');

  async function saveFile(name, data, mime) {
    if (isHosted()) {
      const downloads = await window.claude.use('downloads');
      if (!downloads) throw new Error('Saving files is not available in this view of the page.');
      try {
        await downloads.save({ filename: name, data });
        return true;
      } catch (e) {
        if (e && e.code === 'declined') return false;
        if (e && e.code === 'rate_limited') throw new Error('A save prompt is already open – finish that one first.');
        throw new Error((e && e.message) || 'The file could not be saved.');
      }
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  let confirmResolve = null;
  function askConfirm(message, okLabel) {
    if (confirmResolve) confirmResolve(false);
    $('#confirmText').textContent = message;
    $('#confirmYes').textContent = okLabel || 'OK';
    $('#confirmBox').hidden = false;
    $('#confirmYes').focus();
    return new Promise((resolve) => { confirmResolve = resolve; });
  }
  function closeConfirm(answer) {
    $('#confirmBox').hidden = true;
    if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(answer); }
  }

  /* ================================================================ toasts */

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
  }

  /* ================================================================ events */

  function wire() {
    const editor = $('#editor');
    editor.addEventListener('input', onFormInput);
    editor.addEventListener('change', onFormInput);

    $('#logoFile').addEventListener('change', (e) => { acceptLogoFile(e.target.files[0]); e.target.value = ''; });
    $('#btnLogoReset').addEventListener('click', () => {
      state.logo.src = null; state.logo.name = '';
      syncForm(); persist(); scheduleRender();
    });
    const dz = $('#dropZone');
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0; document.body.classList.remove('dragging');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) acceptLogoFile(f);
    });
    dz.addEventListener('click', () => $('#logoFile').click());

    $('#btnDownload').addEventListener('click', () => makePdf('download'));
    $('#btnPreviewPdf').addEventListener('click', () => makePdf('preview'));
    $('#pdfClose').addEventListener('click', () => { $('#pdfModal').hidden = true; });
    $('#pdfModal').addEventListener('click', (e) => { if (e.target === $('#pdfModal')) $('#pdfModal').hidden = true; });

    $$('input[name="view"]').forEach((r) => r.addEventListener('change', () => setView(r.value)));
    $('#btnPrev').addEventListener('click', () => { if (view.mode === 'sheet') view.page--; else view.coupon--; scheduleRender(); });
    $('#btnNext').addEventListener('click', () => { if (view.mode === 'sheet') view.page++; else view.coupon++; scheduleRender(); });
    $('#btnZoomIn').addEventListener('click', () => { view.zoom = Math.min(8, view.zoom * 1.25); scheduleRender(); });
    $('#btnZoomOut').addEventListener('click', () => { view.zoom = Math.max(0.25, view.zoom / 1.25); scheduleRender(); });
    $('#btnZoomFit').addEventListener('click', () => { view.zoom = 1; scheduleRender(); });
    $('#stage').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      view.zoom = Math.min(8, Math.max(0.25, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      scheduleRender();
    }, { passive: false });
    $('#sheet').addEventListener('dblclick', (e) => {
      if (view.mode !== 'sheet') { setView('sheet'); return; }
      const n = couponAt(e);
      if (n >= 0) { view.coupon = n; setView('single'); }
    });

    const syncThemeButton = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
      $('#btnTheme').title = label;
      $('#btnTheme').setAttribute('aria-label', label);
    };
    syncThemeButton();
    $('#btnTheme').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('couponStudio.theme', next); } catch (e) { /* storage blocked */ }
      syncThemeButton();
    });

    $('#confirmYes').addEventListener('click', () => closeConfirm(true));
    $('#confirmNo').addEventListener('click', () => closeConfirm(false));
    $('#confirmBox').addEventListener('click', (e) => { if (e.target === $('#confirmBox')) closeConfirm(false); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $('#pdfModal').hidden = true; closeConfirm(false); return; }
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') $('#btnNext').click();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') $('#btnPrev').click();
    });

    window.addEventListener('resize', scheduleRender);

    $('#btnSaveDesign').addEventListener('click', async () => {
      const name = $('#designName').value.trim() || [state.num.prefix, state.text.title].filter(Boolean).join(' ') || 'My design';
      const all = readDesigns();
      if (all[name] && !(await askConfirm(`Replace the saved design “${name}”?`, 'Replace'))) return;
      all[name] = { savedAt: Date.now(), settings: clone(state) };
      if (writeDesigns(all)) { $('#designName').value = ''; renderDesigns(); toast(`Saved “${name}”`); }
    });
    $('#designName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnSaveDesign').click(); });

    $('#btnExport').addEventListener('click', async () => {
      const name = fileName().replace(/\.pdf$/, '') + ' settings.json';
      try {
        if (await saveFile(name, JSON.stringify({ app: 'coupon-studio', version: 1, settings: state }, null, 2), 'application/json')) {
          toast(`Saved “${name}”`);
        }
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        state = merge(DEFAULTS, data.settings || data);
        syncForm(); persist(); scheduleRender();
        toast('Settings imported.');
      } catch (err) {
        toast('That file is not a Coupon Studio settings file.', 'error');
      }
    });
    $('#btnReset').addEventListener('click', async () => {
      if (!(await askConfirm('Reset every setting (text, numbering, logo, colours and layout) back to the defaults? Saved designs are kept.', 'Reset'))) return;
      state = clone(DEFAULTS);
      syncForm(); persist(); scheduleRender();
      toast('Everything is back to the defaults.');
    });
  }

  /* ================================================================ start */

  async function start() {
    // Hosted pages cannot print or show an embedded PDF, so only "Download PDF" is offered there.
    if (isHosted()) $('#btnPreviewPdf').hidden = true;
    buildStaticUI();
    syncForm();
    wire();
    renderDesigns();
    try {
      await R.loadFonts();
    } catch (e) {
      toast('Fonts failed to load – the preview may look different from the PDF.', 'error');
    }
    render();
  }

  start();
})();
