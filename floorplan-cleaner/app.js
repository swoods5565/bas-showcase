/* Floor plan cleaner: UI, PDF rendering, brush edits and export. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const S = {
    pdf: null, isPdf: false, image: null, fileName: 'floorplan', pageNum: 1, pageCount: 0,
    w: 0, h: 0, gray: null, original: null,     // original: canvas of the rendered page
    result: null,                                // { ink, walls, openings }
    final: null,                                 // { walls, openings } after brush edits
    layer: null, layerCtx: null, layerData: null, // colored result canvas
    crop: null, strokes: [], edit: null,
    view: 'overlay', tool: 'pan', zoom: 1, panX: 0, panY: 0,
    jobId: 0, theme: 'dark', userTouched: {},
  };

  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const viewport = $('viewport');

  // ---------- worker ----------
  const worker = new Worker('worker.js');
  const pending = new Map();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { if (m.id === S.jobId) status(m.label + '…', true); return; }
    const cb = pending.get(m.id);
    if (!cb) return;
    pending.delete(m.id);
    if (m.type === 'error') { status('Error: ' + m.message); console.error(m.message); return; }
    cb(m);
  };
  let nextId = 1;
  function ask(msg, transfer) {
    const id = nextId++;
    msg.id = id;
    return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage(msg, transfer || []); }).then((m) => m);
  }

  function status(text, busy) {
    const el = $('status');
    el.textContent = text;
    el.classList.toggle('busy', !!busy);
  }

  // ---------- controls ----------
  const sliders = ['threshold', 'minWall', 'lineMax', 'joinGap', 'minWallArea', 'maxOpening', 'pad'];
  const units = { threshold: '', minWall: ' px', lineMax: ' px', joinGap: ' px', minWallArea: ' px²', maxOpening: ' px', pad: ' px' };
  function showValues() {
    for (const k of sliders) $(k + '-out').textContent = $(k).value + units[k];
    $('res-out').textContent = '';
  }
  function params() {
    const useVec = !!(S.vec && S.vec.segs.length && $('useVec').checked);
    return {
      threshold: +$('threshold').value,
      minWall: +$('minWall').value,
      joinGap: +$('joinGap').value,
      minWallArea: +$('minWallArea').value,
      maxOpening: +$('maxOpening').value,
      keepOpenings: $('keepOpenings').checked,
      dropFrame: $('dropFrame').checked && !S.crop,
      crop: S.crop,
      segs: useVec ? S.vec.segs : null,
      arcs: useVec ? S.vec.arcs : null,
      text: useVec ? S.vec.text : null,
      lineMin: Math.max(1.5, Math.max(S.w, S.h) / 1600),
      lineMax: +$('lineMax').value,
    };
  }

  let debounce = 0;
  function scheduleProcess() {
    clearTimeout(debounce);
    debounce = setTimeout(processNow, 220);
  }

  for (const k of sliders) {
    $(k).addEventListener('input', () => {
      showValues();
      S.userTouched[k] = true;
      if (k === 'pad') return;
      scheduleProcess();
    });
  }
  for (const k of ['keepOpenings', 'dropFrame', 'useVec']) $(k).addEventListener('change', scheduleProcess);
  $('res').addEventListener('change', () => loadPage(true));
  $('no-text').addEventListener('change', () => loadPage(false));
  $('wallColor').addEventListener('input', () => { paintLayer(); redraw(); });
  $('openColor').addEventListener('input', () => { paintLayer(); redraw(); });
  $('fit').addEventListener('change', () => { $('custom-size').hidden = $('fit').value !== 'custom'; });
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const dark = b.dataset.preset === 'dark';
    $('wallColor').value = dark ? '#d8dee9' : '#4c566a';
    $('openColor').value = dark ? '#88c0d0' : '#3f7f95';
    paintLayer(); redraw();
  }));
  $('theme').addEventListener('click', () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = S.theme;
    $('theme').textContent = S.theme === 'dark' ? 'Light' : 'Dark';
    redraw();
    try { localStorage.setItem('fpc-theme', S.theme); } catch (e) { /* storage blocked */ }
  });
  try {
    const t = localStorage.getItem('fpc-theme');
    if (t) { S.theme = t; document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Light' : 'Dark'; }
  } catch (e) { /* storage blocked */ }

  document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  function setView(v) {
    S.view = v;
    document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === v));
    redraw();
  }
  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('#tools button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
    viewport.classList.toggle('crosshair', t === 'crop');
    viewport.classList.toggle('brushing', t === 'erase' || t === 'wall' || t === 'door');
    $('brush-cursor').hidden = true;
  }

  // ---------- loading ----------
  $('file').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); viewport.classList.add('dragover'); });
  viewport.addEventListener('dragleave', () => viewport.classList.remove('dragover'));
  viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    viewport.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  $('sample').addEventListener('click', async () => {
    status('Loading sample…', true);
    const buf = await (await fetch('sample-plan.pdf')).arrayBuffer();
    openPdf(new Uint8Array(buf), 'sample-plan');
  });

  async function openFile(file) {
    S.fileName = file.name.replace(/\.[^.]+$/, '') || 'floorplan';
    const buf = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ||
      (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);
    if (isPdf) return openPdf(buf, S.fileName);
    try {
      S.image = await createImageBitmap(file);
    } catch (err) {
      status('That file is not a PDF or an image this browser can read.');
      return;
    }
    S.isPdf = false; S.pdf = null;
    $('page-field').hidden = true;
    $('no-text').disabled = true;
    await loadPage(true);
  }

  async function openPdf(buf, name) {
    S.fileName = name;
    status('Opening PDF…', true);
    try {
      S.pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    } catch (err) {
      status('Could not open that PDF: ' + err.message);
      return;
    }
    S.isPdf = true; S.image = null;
    S.pageCount = S.pdf.numPages;
    S.pageNum = 1;
    $('page').max = S.pageCount;
    $('page').value = 1;
    $('page-count').textContent = 'of ' + S.pageCount;
    $('page-field').hidden = S.pageCount < 2;
    $('no-text').disabled = false;
    await loadPage(true);
  }

  $('page').addEventListener('change', () => gotoPage(+$('page').value));
  $('page-prev').addEventListener('click', () => gotoPage(S.pageNum - 1));
  $('page-next').addEventListener('click', () => gotoPage(S.pageNum + 1));
  function gotoPage(n) {
    if (!S.pdf) return;
    n = Math.max(1, Math.min(S.pageCount, n | 0));
    $('page').value = n;
    if (n === S.pageNum) return;
    S.pageNum = n;
    loadPage(true);
  }

  // Render the current source to a grayscale working image.
  // fresh: page, resolution or file changed, so crop and edits reset.
  async function loadPage(fresh) {
    if (!S.pdf && !S.image) return;
    const target = +$('res').value;
    status('Rendering…', true);
    const c = document.createElement('canvas');
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (S.isPdf) {
      const page = await S.pdf.getPage(S.pageNum);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: target / Math.max(base.width, base.height) });
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      // pdf.js draws real PDF text with fillText/strokeText. Skipping those
      // calls drops room names, notes and dimensions without cutting walls.
      const P = CanvasRenderingContext2D.prototype;
      const fill = P.fillText, stroke = P.strokeText;
      if ($('no-text').checked) { P.fillText = function () {}; P.strokeText = function () {}; }
      try {
        await page.render({ canvasContext: cx, viewport: vp, background: 'white' }).promise;
      } finally {
        P.fillText = fill; P.strokeText = stroke;
      }
      // Line work for double-line wall pairing and door swings.
      try {
        S.vec = await FPVector.extractSegments(page, vp, pdfjsLib);
      } catch (err) {
        console.warn('Could not read vector lines', err);
        S.vec = null;
      }
    } else {
      S.vec = null;
      const img = S.image;
      const s = Math.min(1, target / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(img, 0, 0, c.width, c.height);
    }
    const sizeChanged = c.width !== S.w || c.height !== S.h;
    S.w = c.width; S.h = c.height;
    S.original = c;
    const px = cx.getImageData(0, 0, S.w, S.h).data;
    const gray = new Uint8Array(S.w * S.h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
      gray[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
    }
    S.gray = gray;
    if (fresh || sizeChanged) {
      S.crop = null;
      S.strokes = [];
      S.edit = new Uint8Array(S.w * S.h);
      canvas.width = S.w; canvas.height = S.h;
      S.layer = document.createElement('canvas');
      S.layer.width = S.w; S.layer.height = S.h;
      S.layerCtx = S.layer.getContext('2d');
      S.layerData = S.layerCtx.createImageData(S.w, S.h);
      S.result = null;
      $('empty').hidden = true;
      $('dims').textContent = S.w + ' × ' + S.h + ' px' + (S.isPdf ? ' · page ' + S.pageNum : '');
      fitView();
      suggestDefaults();
      await autoWall();
    }
    processNow();
  }

  // Scale the pixel-based defaults to the working resolution, unless the
  // user already set them.
  function suggestDefaults() {
    const long = Math.max(S.w, S.h);
    const set = (k, v) => { if (!S.userTouched[k]) $(k).value = Math.round(v); };
    set('maxOpening', long / 12);
    set('lineMax', long / 130);
    const vec = !!(S.vec && S.vec.segs.length);
    $('useVec-row').hidden = $('lineMax-row').hidden = !vec;
    showValues();
  }

  async function autoWall() {
    if (!S.gray) return;
    status('Estimating wall thickness…', true);
    const m = await ask({ type: 'estimate', gray: S.gray.slice(), w: S.w, h: S.h, threshold: +$('threshold').value, crop: S.crop });
    if (m.thickness) $('minWall').value = m.thickness;
    // Wall stubs between a door and a window can be short, so keep this low.
    if (!S.userTouched.minWallArea) $('minWallArea').value = Math.min(5000, Math.round(20 * Math.pow(+$('minWall').value, 2) / 10) * 10);
    showValues();
  }
  $('auto-wall').addEventListener('click', async () => { await autoWall(); processNow(); });

  // ---------- processing ----------
  async function processNow() {
    if (!S.gray) return;
    const id = nextId;
    S.jobId = id;
    status('Cleaning…', true);
    const gray = S.gray.slice();
    const m = await ask({ type: 'process', gray, w: S.w, h: S.h, params: params() }, [gray.buffer]);
    if (m.id !== S.jobId) return; // a newer run superseded this one
    S.result = { ink: m.ink, walls: m.walls, openings: m.openings };
    S.final = { walls: new Uint8Array(S.w * S.h), openings: new Uint8Array(S.w * S.h) };
    paintLayer();
    redraw();
    $('dl-png').disabled = $('dl-svg').disabled = false;
    status('Ready. Use the brushes to touch up, then download.');
  }

  // Apply brush edits and color the result into the layer canvas.
  function paintLayer(x0 = 0, y0 = 0, x1 = S.w, y1 = S.h) {
    if (!S.result) return;
    const { ink, walls, openings } = S.result;
    const E = S.edit, FW = S.final.walls, FO = S.final.openings, d = S.layerData.data;
    const wc = hex($('wallColor').value), oc = hex($('openColor').value);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * S.w + x;
        const e = E[i];
        let fw = walls[i], fo = openings[i];
        if (e === 1) { fw = 0; fo = 0; }
        else if (e === 2) { fw = fw | ink[i] | fo; fo = 0; }
        else if (e === 3) { fo = (fo | ink[i]) & (fw ^ 1); }
        if (fw) fo = 0;
        FW[i] = fw; FO[i] = fo;
        const j = i * 4;
        if (fw) { d[j] = wc[0]; d[j + 1] = wc[1]; d[j + 2] = wc[2]; d[j + 3] = 255; }
        else if (fo) { d[j] = oc[0]; d[j + 1] = oc[1]; d[j + 2] = oc[2]; d[j + 3] = 255; }
        else d[j + 3] = 0;
      }
    }
    S.layerCtx.putImageData(S.layerData, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  function redraw() {
    if (!S.original) return;
    ctx.clearRect(0, 0, S.w, S.h);
    if (S.view === 'original' || S.view === 'overlay') {
      if (S.view === 'overlay') {
        ctx.fillStyle = S.theme === 'dark' ? '#2e3440' : '#ffffff';
        ctx.fillRect(0, 0, S.w, S.h);
        ctx.globalAlpha = 0.22;
      }
      ctx.drawImage(S.original, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (S.view !== 'original' && S.layer) ctx.drawImage(S.layer, 0, 0);
    const c = cropDrag || S.crop;
    if (c && S.view !== 'result') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.rect(0, 0, S.w, S.h);
      ctx.rect(c.x, c.y + c.h, c.w, -c.h);
      ctx.fill('evenodd');
      ctx.setLineDash([12 / S.zoom, 8 / S.zoom]);
      ctx.lineWidth = 2 / S.zoom;
      ctx.strokeStyle = '#88c0d0';
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.setLineDash([]);
    }
  }

  // ---------- view: zoom and pan ----------
  function applyTransform() {
    canvas.style.transform = `translate(${S.panX}px, ${S.panY}px) scale(${S.zoom})`;
  }
  function fitView() {
    const r = viewport.getBoundingClientRect();
    if (!S.w || !r.width) return;
    S.zoom = Math.min(r.width / S.w, r.height / S.h) * 0.94;
    S.panX = (r.width - S.w * S.zoom) / 2;
    S.panY = (r.height - S.h * S.zoom) / 2;
    applyTransform();
  }
  $('fitview').addEventListener('click', fitView);
  window.addEventListener('resize', () => { if (S.w) fitView(); });
  viewport.addEventListener('wheel', (e) => {
    if (!S.w) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015));
    const z = Math.max(0.02, Math.min(16, S.zoom * f));
    S.panX = mx - (mx - S.panX) * (z / S.zoom);
    S.panY = my - (my - S.panY) * (z / S.zoom);
    S.zoom = z;
    applyTransform();
    if (S.crop) redraw();
  }, { passive: false });

  function toImage(e) {
    const r = viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left - S.panX) / S.zoom, y: (e.clientY - r.top - S.panY) / S.zoom };
  }

  // ---------- pointer tools ----------
  let drag = null, cropDrag = null, spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    const k = e.key.toLowerCase();
    const map = { h: 'pan', c: 'crop', e: 'erase', w: 'wall', d: 'door' };
    if (map[k]) setTool(map[k]);
    else if (k === 'f') fitView();
    else if (k === '[') { $('brush').value = Math.max(4, +$('brush').value - 4); }
    else if (k === ']') { $('brush').value = Math.min(120, +$('brush').value + 4); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  viewport.addEventListener('pointerdown', (e) => {
    if (!S.result || e.target.closest('.empty')) return;
    viewport.setPointerCapture(e.pointerId);
    const p = toImage(e);
    const tool = (e.button === 1 || spaceDown) ? 'pan' : S.tool;
    if (tool === 'pan') {
      drag = { tool, sx: e.clientX, sy: e.clientY, px: S.panX, py: S.panY };
      viewport.classList.add('dragging');
    } else if (tool === 'crop') {
      drag = { tool, ox: p.x, oy: p.y };
      cropDrag = { x: p.x, y: p.y, w: 0, h: 0 };
    } else {
      const mode = { erase: 1, wall: 2, door: 3 }[tool];
      // Brush size is in screen pixels so it feels the same at any zoom.
      const stroke = { mode, r: +$('brush').value / 2 / S.zoom, pts: [p.x, p.y] };
      S.strokes.push(stroke);
      drag = { tool, stroke };
      stamp(stroke, 0);
    }
  });
  viewport.addEventListener('pointermove', (e) => {
    const brushTool = S.tool === 'erase' || S.tool === 'wall' || S.tool === 'door';
    const cur = $('brush-cursor');
    if (brushTool && S.result && !spaceDown) {
      const r = viewport.getBoundingClientRect();
      const size = +$('brush').value;
      cur.hidden = false;
      cur.style.left = (e.clientX - r.left) + 'px';
      cur.style.top = (e.clientY - r.top) + 'px';
      cur.style.width = cur.style.height = size + 'px';
    }
    if (!drag) return;
    const p = toImage(e);
    if (drag.tool === 'pan') {
      S.panX = drag.px + e.clientX - drag.sx;
      S.panY = drag.py + e.clientY - drag.sy;
      applyTransform();
    } else if (drag.tool === 'crop') {
      cropDrag = normRect(drag.ox, drag.oy, p.x, p.y);
      redraw();
    } else {
      const s = drag.stroke;
      s.pts.push(p.x, p.y);
      stamp(s, s.pts.length - 4);
    }
  });
  viewport.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
  const endDrag = () => {
    if (!drag) return;
    viewport.classList.remove('dragging');
    if (drag.tool === 'crop') {
      const c = cropDrag;
      cropDrag = null;
      if (c && c.w > 10 && c.h > 10) { S.crop = c; processNow(); }
      redraw();
    }
    drag = null;
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  function normRect(ax, ay, bx, by) {
    const x0 = Math.max(0, Math.min(ax, bx)), y0 = Math.max(0, Math.min(ay, by));
    const x1 = Math.min(S.w, Math.max(ax, bx)), y1 = Math.min(S.h, Math.max(ay, by));
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  }

  // Paint a stroke into the edit mask, from point index `from` (a flat
  // array offset) to its end, then repaint just the touched rectangle.
  function stamp(s, from, noPaint) {
    const pts = s.pts, r = s.r, r2 = r * r, E = S.edit;
    let bx0 = S.w, by0 = S.h, bx1 = 0, by1 = 0;
    const dot = (cx, cy) => {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(S.w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(S.h - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) E[y * S.w + x] = s.mode;
        }
      }
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0;
      if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    };
    from = Math.max(0, from);
    dot(pts[from], pts[from + 1]);
    for (let i = from + 2; i < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, r / 2)));
      for (let k = 1; k <= n; k++) dot(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
    }
    if (noPaint || bx1 < bx0) return;
    paintLayer(bx0, by0, bx1 + 1, by1 + 1);
    redraw();
  }

  function undo() {
    if (!S.strokes.length) return;
    S.strokes.pop();
    replayEdits();
  }
  function replayEdits() {
    S.edit = new Uint8Array(S.w * S.h);
    for (const s of S.strokes) stamp(s, 0, true);
    paintLayer();
    redraw();
  }
  $('undo').addEventListener('click', undo);
  $('clear-edits').addEventListener('click', () => { S.strokes = []; replayEdits(); });
  $('clear-crop').addEventListener('click', () => { if (S.crop) { S.crop = null; processNow(); } });

  // ---------- export ----------
  // Bounding box of everything kept, limited to the crop.
  function contentBox() {
    const { walls, openings } = S.final;
    const c = S.crop || { x: 0, y: 0, w: S.w, h: S.h };
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const i = y * S.w + x;
        if (walls[i] || openings[i]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return c;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // Output size, scale and offset for the chosen canvas option.
  function layout(box) {
    const pad = +$('pad').value;
    const mode = $('fit').value;
    if (mode === 'trim') return { W: box.w + 2 * pad, H: box.h + 2 * pad, s: 1, dx: pad, dy: pad };
    const W = mode === 'custom' ? +$('fitW').value : 1920;
    const H = mode === 'custom' ? +$('fitH').value : 1080;
    const s = Math.min((W - 2 * pad) / box.w, (H - 2 * pad) / box.h);
    return { W, H, s, dx: (W - box.w * s) / 2, dy: (H - box.h * s) / 2 };
  }
  function outName(ext) {
    return S.fileName + (S.isPdf && S.pageCount > 1 ? '-p' + S.pageNum : '') + '-clean.' + ext;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  $('dl-png').addEventListener('click', () => {
    const box = contentBox(), L = layout(box);
    const out = document.createElement('canvas');
    out.width = Math.round(L.W); out.height = Math.round(L.H);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.drawImage(S.layer, box.x, box.y, box.w, box.h, L.dx, L.dy, box.w * L.s, box.h * L.s);
    out.toBlob((b) => download(b, outName('png')), 'image/png');
  });

  $('dl-svg').addEventListener('click', async () => {
    const box = contentBox(), L = layout(box);
    status('Tracing SVG…', true);
    const m = await ask({
      type: 'svg', w: S.w, h: S.h, box, scale: L.s, epsilon: 0.8,
      layers: [{ mask: S.final.walls }, { mask: S.final.openings }],
    });
    const f = (v) => Math.round(v * 100) / 100;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(L.W)}" height="${Math.round(L.H)}" viewBox="0 0 ${Math.round(L.W)} ${Math.round(L.H)}">
  <g transform="translate(${f(L.dx)} ${f(L.dy)})">
    <path id="walls" fill="${$('wallColor').value}" d="${m.paths[0]}"/>
    <path id="doors-windows" fill="${$('openColor').value}" d="${m.paths[1]}"/>
  </g>
</svg>
`;
    download(new Blob([svg], { type: 'image/svg+xml' }), outName('svg'));
    status('Ready. Use the brushes to touch up, then download.');
  });

  showValues();
})();
