/* Claude features for the claude.ai version: find the plan on the sheet,
   review the result, and a shared list of lessons Claude reads every time. */
(function () {
  'use strict';

  const F = window.FPC, S = F.S, $ = F.$;
  const ui = {
    crop: $('ai-crop'), review: $('ai-review'), auto: $('ai-autocrop'),
    busy: $('ai-busy'), busyText: $('ai-busy-text'), stop: $('ai-stop'),
    msg: $('ai-msg'), out: $('ai-out'),
    lcount: $('ai-lcount'), llist: $('ai-llist'), lnew: $('ai-lnew'), ladd: $('ai-ladd'), learn: $('ai-learn'),
  };
  let sample = null, db = null, downloads = null, maxImages = 0;
  let lessons = [];          // [{id, text}]
  let ctl = null, busy = false;
  let review = null;         // last review: {issues:[{rect,type,note,done}], ...}

  try { const v = localStorage.getItem('fpc-autocrop'); if (v) ui.auto.checked = v === '1'; } catch (e) { /* storage blocked */ }
  ui.auto.addEventListener('change', () => { try { localStorage.setItem('fpc-autocrop', ui.auto.checked ? '1' : '0'); } catch (e) { /* storage blocked */ } });

  // ---------- capabilities ----------
  const claude = window.claude;
  const use = (n) => (claude && claude.use ? claude.use(n).catch(() => null) : Promise.resolve(null));

  use('downloads').then((d) => { downloads = d; });
  window.FPCHooks = {
    save: async (blob, name) => {
      if (!downloads) { F.status('Downloads are not available in this view.'); return; }
      try {
        await downloads.save({ filename: name, data: blob });
        F.status('Saved ' + name + '.');
      } catch (e) {
        if (e && e.code === 'declined') F.status('Download cancelled.');
        else F.status('Could not save the file here (' + (e && e.code || 'error') + ').');
      }
    },
  };

  use('sample').then(async (s) => {
    sample = s;
    if (!s) { $('ai-on').hidden = true; $('ai-off').hidden = false; return; }
    try {
      const lim = await s.limits();
      maxImages = lim && lim.images ? lim.images.maxCount : 0;
    } catch (e) { maxImages = 0; }
    if (!maxImages) {
      $('ai-on').hidden = true;
      $('ai-off').textContent = 'Claude cannot look at images in this view, so finding and reviewing plans is off. The cleaner and brushes still work.';
      $('ai-off').hidden = false;
      return;
    }
    refreshButtons();
  });

  use('db').then((d) => {
    db = d;
    if (!d) { ui.lcount.textContent = 'not available here'; return; }
    d.collection('lessons').orderBy('at').onSnapshot((snap) => {
      lessons = snap.docs.map((doc) => ({ id: doc.id, text: String((doc.data() || {}).text || '') })).filter((l) => l.text);
      renderLessons();
    }, (e) => { ui.lcount.textContent = 'could not load (' + e.code + ')'; });
    refreshButtons();
  });

  function refreshButtons() {
    const ready = !!(sample && maxImages && S.result && !busy);
    ui.crop.disabled = !ready;
    ui.review.disabled = !ready;
    ui.ladd.disabled = !db || !ui.lnew.value.trim();
    ui.learn.disabled = !ready;
    $('ai-learn-row').hidden = !(sample && maxImages && userStrokes().length);
  }
  ui.lnew.addEventListener('input', refreshButtons);
  F.on('processed', refreshButtons);
  document.getElementById('viewport').addEventListener('pointerup', () => setTimeout(refreshButtons, 0));
  ['undo', 'clear-edits'].forEach((id) => $(id).addEventListener('click', () => setTimeout(refreshButtons, 0)));

  // A new page clears what Claude said about the old one.
  F.on('opened', (info) => {
    clearOut();
    refreshButtons();
    if (!info.sample && ui.auto.checked && sample && maxImages && S.isPdf) findPlan(true);
  });

  // ---------- messages ----------
  const COPY = {
    not_granted: 'Claude was not allowed to run. Use the button again and choose Allow when asked.',
    rate_limited: 'Claude is busy or your usage limit was reached. Wait a minute and try again.',
    invalid_json: 'Claude\'s answer could not be read. Try again.',
    empty_completion: 'Claude did not answer. Try again.',
    upstream_error: 'Claude did not answer. Try again.',
    prompt_too_large: 'The drawing was too large to send. Crop to a smaller area and try again.',
    image_rejected: 'The drawing image was not accepted. Try a lower working resolution.',
    refused: 'Claude declined this request.',
    session_expired: 'Your Claude session ended. Reload the page.',
    cancelled: 'Stopped.',
  };
  const copyFor = (e) => COPY[e && e.code] || 'Claude is not available in this view right now.';
  function say(text, err) { ui.msg.textContent = text; ui.msg.hidden = !text; ui.msg.classList.toggle('err', !!err); }
  function clearOut() { ui.out.textContent = ''; say(''); review = null; F.setMarks([]); }

  let timer = 0;
  function startBusy(label) {
    busy = true;
    ctl = new AbortController();
    const t0 = Date.now();
    ui.busy.hidden = false;
    const tick = () => { ui.busyText.textContent = label + ' ' + Math.round((Date.now() - t0) / 1000) + ' s'; };
    tick();
    timer = setInterval(tick, 1000);
    say('');
    refreshButtons();
    return ctl.signal;
  }
  function endBusy() { busy = false; clearInterval(timer); ui.busy.hidden = true; refreshButtons(); }
  ui.stop.addEventListener('click', () => ctl && ctl.abort());

  function lessonText() {
    if (!lessons.length) return '';
    return '\nLessons this team has taught you from earlier plans. Follow them:\n' +
      lessons.map((l) => '- ' + l.text).join('\n') + '\n';
  }

  // ---------- images ----------
  // Draw `src` region r into an image with 0-1000 rulers on the top and left
  // edges, sized to stay under the ~1.2 MP the platform sends.
  const M = 34;
  function rulerImage(draw, rw, rh) {
    const budget = 1150000;
    const s = Math.min(1, Math.sqrt(budget / (rw * rh)) * 0.97);
    let dw = Math.round(rw * s), dh = Math.round(rh * s);
    while ((dw + M) * (dh + M) > budget) { dw = Math.round(dw * 0.97); dh = Math.round(dh * 0.97); }
    const c = document.createElement('canvas');
    c.width = dw + M; c.height = dh + M;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.save(); x.translate(M, M); draw(x, dw, dh); x.restore();
    x.fillStyle = '#c0392b'; x.strokeStyle = '#c0392b'; x.lineWidth = 1;
    x.font = '700 12px Arial, sans-serif'; x.textBaseline = 'middle';
    for (let u = 0; u <= 1000; u += 50) {
      const px = M + u / 1000 * dw, py = M + u / 1000 * dh, long = u % 100 === 0;
      x.beginPath();
      x.moveTo(px, M - (long ? 10 : 5)); x.lineTo(px, M);
      x.moveTo(M - (long ? 10 : 5), py); x.lineTo(M, py);
      x.stroke();
      if (long && u < 1000) {
        x.textAlign = 'center'; x.fillText(String(u), Math.min(c.width - 14, px), 10);
        x.save(); x.translate(10, py); x.rotate(-Math.PI / 2); x.fillText(String(u), 0, 0); x.restore();
      }
    }
    x.strokeRect(M - 0.5, M - 0.5, dw + 1, dh + 1);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  // Map a [l, t, r, b] box in 0-1000 units of region `r` to working pixels.
  function fromUnits(b, r) {
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number' || !isFinite(v))) return null;
    let [l, t, rr, bb] = b.map((v) => Math.max(0, Math.min(1000, v)));
    if (rr < l) [l, rr] = [rr, l];
    if (bb < t) [t, bb] = [bb, t];
    const x0 = r.x + l / 1000 * r.w, y0 = r.y + t / 1000 * r.h;
    const x1 = r.x + rr / 1000 * r.w, y1 = r.y + bb / 1000 * r.h;
    return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) };
  }
  // The sheet with its PDF text, so title blocks and notes are recognizable.
  async function sheetCanvas() {
    if (!S.isPdf) return S.original;
    const page = await S.pdf.getPage(S.pageNum);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp, background: 'white' }).promise;
    return c;
  }

  // ---------- 1. find the plan ----------
  ui.crop.addEventListener('click', () => findPlan(false));

  async function findPlan(auto) {
    if (busy || !sample) return;
    const signal = startBusy(auto ? 'Claude is finding the plan…' : 'Claude is finding the plan…');
    try {
      const sheet = await sheetCanvas();
      const img = await rulerImage((x, w, h) => x.drawImage(sheet, 0, 0, w, h), sheet.width, sheet.height);
      const prompt = `You are helping turn an architectural drawing sheet into a clean floor plan graphic for a building automation system.

The image is one whole drawing sheet. The red rulers on the top and left edges run from 0 to 1000 across the width and down the height of the sheet.

Find the main floor plan: the building drawing itself, with all of its exterior walls, curtain walls, interior walls, doors, windows, stairs and columns.
Leave out everything that is not part of that plan:
- the title block (usually a band along the right or bottom edge with the architect's logo, project name, sheet number, stamps and revision table)
- the key plan (a small thumbnail of the whole building, often with one area shaded)
- legends, general notes, sheet notes and keynote lists
- enlarged details or sections that sit apart from the building
- the north arrow, scale bars and the drawing title under the plan
If a match line cuts the building, the plan ends at the match line.
${lessonText()}
Reply with only JSON in this shape:
{"plan": [left, top, right, bottom], "exclude": [{"box": [left, top, right, bottom], "what": "key plan"}], "note": "one short sentence on what you found"}

Use the 0-1000 ruler units. Make the plan box generous: include a little empty paper rather than cut off any wall, column or door swing. Put in "exclude" only things that fall inside the plan box but are not part of the building (for example a key plan, a notes block or a logo inside the drawing area). Use [] when there are none.`;
      const ans = await sample.json(prompt, { images: img, signal });
      const page = { x: 0, y: 0, w: S.w, h: S.h };
      let box = fromUnits(ans && ans.plan, page);
      if (!box || box.w < S.w * 0.05 || box.h < S.h * 0.05) throw { code: 'invalid_json' };
      box = snapToGutters(box);
      F.removeEdits((s) => s.tag === 'auto');
      const ex = (Array.isArray(ans.exclude) ? ans.exclude : []).slice(0, 8)
        .map((e) => ({ r: fromUnits(e && e.box, page), what: String(e && e.what || 'not part of the plan').slice(0, 60) }))
        .filter((e) => e.r && e.r.w * e.r.h < box.w * box.h * 0.5);
      await F.setCrop(box);
      ex.forEach((e) => F.addEdit(1, e.r, 'auto'));
      F.setMarks(ex.map((e) => ({ ...e.r, label: 'Left out: ' + e.what })));
      F.fitView();
      showCropCard(String(ans.note || '').slice(0, 300), ex);
    } catch (e) {
      say(e && e.code === 'cancelled' ? 'Stopped.' : 'Could not find the plan. ' + copyFor(e), e && e.code !== 'cancelled');
    } finally {
      endBusy();
    }
  }

  function pad(r, f) {
    const p = Math.round(Math.max(S.w, S.h) * f);
    const x0 = Math.max(0, r.x - p), y0 = Math.max(0, r.y - p);
    const x1 = Math.min(S.w, r.x + r.w + p), y1 = Math.min(S.h, r.y + r.h + p);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Move each edge outward to the nearest strip of blank paper (within 3% of
  // the sheet) so a box that is a little tight does not slice through walls,
  // then add a small margin. Never cross a long straight line: that is the
  // border of the title block or of the sheet.
  function snapToGutters(r) {
    const g = S.gray, W = S.w, H = S.h, th = +$('threshold').value;
    const reach = Math.round(Math.max(W, H) * 0.03), margin = Math.round(Math.max(W, H) * 0.006);
    const colInk = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) if (g[y * W + x] < th) n++; return n; };
    const rowInk = (y, x0, x1) => { let n = 0; for (let x = x0, i = y * W + x0; x < x1; x++, i++) if (g[i] < th) n++; return n; };
    let x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w) - 1, y1 = Math.min(H, r.y + r.h) - 1;
    const edge = (from, step, n, ink, span) => {
      const blank = Math.max(2, span * 0.002), border = span * 0.5;
      let v = from, k = 0;
      for (; k <= reach; k++, v += step) {            // out to the first blank strip
        if (v < 0 || v >= n) return v - step;
        const c = ink(v);
        if (c > border) return v - 2 * step;
        if (c <= blank) break;
      }
      if (k > reach) return from;
      for (let m = 0; m < margin; m++) {              // then a little margin
        const u = v + step;
        if (u < 0 || u >= n || ink(u) > border) break;
        v = u;
      }
      return v;
    };
    x0 = edge(x0, -1, W, (x) => colInk(x, y0, y1), y1 - y0);
    x1 = edge(x1, 1, W, (x) => colInk(x, y0, y1), y1 - y0);
    y0 = edge(y0, -1, H, (y) => rowInk(y, x0, x1), x1 - x0);
    y1 = edge(y1, 1, H, (y) => rowInk(y, x0, x1), x1 - x0);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(text, fn, cls) { const b = el('button', 'btn sm' + (cls ? ' ' + cls : ''), text); b.addEventListener('click', fn); return b; }

  function showCropCard(note, ex) {
    clearOutKeepMarks();
    const card = el('div', 'ai-card');
    card.append(el('p', '', 'Cropped to the plan.' + (note ? ' ' + note : '')));
    if (ex.length) card.append(el('p', 'muted small', 'Also left out inside the crop: ' + ex.map((e) => e.what).join(', ') + '.'));
    const row = el('div', 'row');
    row.append(btn('Undo crop', async () => {
      F.removeEdits((s) => s.tag === 'auto');
      F.setMarks([]);
      await F.setCrop(null);
      F.fitView();
      clearOut();
    }), btn('Hide boxes', () => F.setMarks([])));
    card.append(row);
    ui.out.append(card);
  }
  function clearOutKeepMarks() { ui.out.textContent = ''; review = null; }

  // ---------- 2. review the result ----------
  ui.review.addEventListener('click', runReview);

  const SETTINGS = {
    threshold: { label: 'Ink darkness', min: 40, max: 240, about: 'pixels darker than this count as ink (0 black to 255 white). Lower it to ignore gray furniture, hatching and screened backgrounds; raise it if faint walls are missed.' },
    minWall: { label: 'Wall thickness, min', min: 2, max: 40, about: 'px. Solid strokes thinner than this are not walls (used for plans whose walls are drawn as thick solid lines).' },
    lineMax: { label: 'Double-line wall, widest', min: 4, max: 80, about: 'px. The widest gap between two parallel thin lines that get filled in as a wall. Raise it if thick walls drawn as two lines are missed; lower it if unrelated parallel lines (furniture, casework, stairs) are being filled in as walls.' },
    joinGap: { label: 'Join double-line walls (scans)', min: 0, max: 30, about: 'px. Only for scanned images: fills the space between two lines of a wall. Leave 0 for PDFs.' },
    minWallArea: { label: 'Smallest wall piece', min: 0, max: 5000, about: 'px². Wall pieces smaller than this are dropped. Lower it if short wall stubs or columns are missing; raise it if specks and small symbols are kept.' },
    maxOpening: { label: 'Widest door / window', min: 10, max: 800, about: 'px. Gaps in walls wider than this are not treated as doors or windows.' },
  };
  const FLAGS = {
    useVec: 'read wall lines from the PDF vectors (true is best for CAD/Revit PDFs)',
    keepOpenings: 'keep doors and windows',
  };

  function currentSettings() {
    const lines = [];
    for (const [k, d] of Object.entries(SETTINGS)) {
      if (k === 'joinGap' && S.isPdf) continue;
      if (k === 'lineMax' && $('lineMax-row').hidden) continue;
      lines.push(`- ${k} = ${$(k).value} (range ${d.min}-${d.max}): ${d.about}`);
    }
    for (const [k, d] of Object.entries(FLAGS)) {
      if (k === 'useVec' && $('useVec-row').hidden) continue;
      lines.push(`- ${k} = ${$(k).checked}: ${d}`);
    }
    return lines.join('\n');
  }

  // Area Claude looks at: the crop, else everything the result kept.
  function reviewArea() {
    if (S.crop) return S.crop;
    let x0 = S.w, y0 = S.h, x1 = -1, y1 = -1;
    const { walls, openings } = S.final;
    for (let y = 0; y < S.h; y += 2) {
      for (let x = 0, i = y * S.w; x < S.w; x += 2, i += 2) {
        if (walls[i] || openings[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return { x: 0, y: 0, w: S.w, h: S.h };
    return pad({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, 0.01);
  }
  function tiles(area) {
    const big = Math.max(area.w, area.h) > 2600 && maxImages >= 8;
    const nx = big ? 2 : 1, ny = big ? 2 : 1, ov = 0.04;
    const out = [], names = 'ABCD';
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const tw = area.w / nx, th = area.h / ny;
        const x0 = Math.max(area.x, area.x + i * tw - (i ? tw * ov : 0));
        const y0 = Math.max(area.y, area.y + j * th - (j ? th * ov : 0));
        const x1 = Math.min(area.x + area.w, area.x + (i + 1) * tw + (i < nx - 1 ? tw * ov : 0));
        const y1 = Math.min(area.y + area.h, area.y + (j + 1) * th + (j < ny - 1 ? th * ov : 0));
        out.push({ name: names[j * nx + i], x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) });
      }
    }
    return out;
  }
  // The cleaner's result for region r: walls black, doors/windows blue, on white.
  function resultCanvas(r) {
    const c = document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    const x = c.getContext('2d');
    const id = x.createImageData(r.w, r.h), d = id.data;
    const { walls, openings } = S.final;
    for (let y = 0; y < r.h; y++) {
      for (let xx = 0; xx < r.w; xx++) {
        const i = (r.y + y) * S.w + r.x + xx, j = (y * r.w + xx) * 4;
        if (walls[i]) { d[j] = d[j + 1] = d[j + 2] = 0; }
        else if (openings[i]) { d[j] = 30; d[j + 1] = 102; d[j + 2] = 245; }
        else { d[j] = d[j + 1] = d[j + 2] = 255; }
        d[j + 3] = 255;
      }
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  async function runReview() {
    if (busy || !sample || !S.final) return;
    const signal = startBusy('Claude is reviewing…');
    try {
      const area = reviewArea();
      const T = tiles(area);
      const images = [];
      for (const t of T) {
        images.push(await rulerImage((x, w, h) => x.drawImage(S.original, t.x, t.y, t.w, t.h, 0, 0, w, h), t.w, t.h));
        const rc = resultCanvas(t);
        images.push(await rulerImage((x, w, h) => x.drawImage(rc, 0, 0, w, h), t.w, t.h));
      }
      const tileWords = T.length > 1
        ? `The plan is split into ${T.length} overlapping tiles: A top left, B top right, C bottom left, D bottom right. The images come in order: tile A original, tile A result, tile B original, tile B result, and so on.`
        : 'There are two images: first the original drawing, then the cleaner\'s result for the same area. Use "A" as the tile name.';
      const prompt = `You are checking the output of an automatic floor plan cleaner. It makes building automation graphics, so it should keep only walls, doors and windows and drop everything else.

In each result image, walls are black and doors/windows are blue. Everything else should be gone: text, dimensions, room tags, furniture, plumbing fixtures, casework, hatching, grid lines and bubbles, section and elevation marks, symbols, and anything from the title block.
Structural columns are kept as walls. Curtain walls and storefront glazing count as windows (blue). Door swings are kept as doors (blue).
The original images have their PDF text removed already.

${tileWords}
The red rulers on the top and left of every image run from 0 to 1000 across and down that image.

Current settings (pixels are at the working resolution of ${S.w} x ${S.h}):
${currentSettings()}
${lessonText()}
Find the most important problems, at most 12, biggest first:
- "missed_wall": a wall in the original that is missing or has a gap in the result
- "missed_door": a door or door swing that is missing
- "missed_window": a window or curtain wall that is missing or drawn as a wall
- "extra": something kept that is not a wall, door or window
Ignore problems smaller than a few pixels, and anything that is only in the overlap between tiles if you already listed it.

Reply with only JSON in this shape:
{"verdict": "good" or "needs_work",
 "summary": "one or two plain sentences on how good the result is",
 "issues": [{"tile": "A", "type": "missed_wall", "box": [left, top, right, bottom], "kept_as": "", "note": "short description, e.g. east wall of the lobby"}],
 "settings": [{"name": "lineMax", "value": 34, "why": "short reason"}],
 "lesson": ""}

For "extra" issues set "kept_as" to "wall" if the result shows it in black or "door" if in blue; otherwise leave it "". Boxes use the 0-1000 ruler units of that tile's images and should hug the problem. Suggest a settings change only when it would clearly fix a pattern of problems; otherwise use []. Use only the setting names listed above. "lesson" is a short general rule (under 25 words) worth remembering for future plans when this review found a repeatable pattern; otherwise "".`;
      const ans = await sample.json(prompt, { images, signal });
      showReview(ans, T);
    } catch (e) {
      say(e && e.code === 'cancelled' ? 'Stopped.' : 'Could not review. ' + copyFor(e), e && e.code !== 'cancelled');
    } finally {
      endBusy();
    }
  }

  const TYPE = {
    missed_wall: { label: 'Missing wall', act: 'Bring back as wall', mode: 2 },
    missed_door: { label: 'Missing door', act: 'Bring back as door', mode: 3 },
    missed_window: { label: 'Missing window', act: 'Bring back as window', mode: 3 },
    extra: { label: 'Should not be here', act: 'Erase it', mode: 1 },
  };

  function showReview(ans, T) {
    clearOut();
    if (!ans || typeof ans !== 'object') { say('Could not review. ' + copyFor({ code: 'invalid_json' }), true); return; }
    const byName = Object.fromEntries(T.map((t) => [t.name, t]));
    const issues = (Array.isArray(ans.issues) ? ans.issues : []).slice(0, 12).map((it) => {
      const t = byName[String(it && it.tile || 'A').toUpperCase()] || T[0];
      const r = fromUnits(it && it.box, t);
      const type = TYPE[it && it.type] ? it.type : 'extra';
      // Erase only the layer the extra thing was kept in, so walls inside the box survive.
      const mode = type !== 'extra' ? TYPE[type].mode : it.kept_as === 'door' ? 4 : it.kept_as === 'wall' ? 5 : 1;
      return r ? { rect: r, type, mode, note: String(it.note || '').slice(0, 200), done: false } : null;
    }).filter(Boolean);
    review = { issues };
    const card = el('div', 'ai-card');
    const verdict = ans.verdict === 'good' ? 'good' : 'needs_work';
    const head = el('p');
    head.append(el('span', 'verdict ' + verdict, verdict === 'good' ? 'Looks good' : 'Needs work'), ' ', String(ans.summary || '').slice(0, 400));
    card.append(head);

    if (issues.length) {
      const ol = el('ol', 'issues');
      issues.forEach((it, i) => {
        const li = el('li', 'issue');
        li.append(el('span', 'num', String(i + 1)), el('span', 'what', TYPE[it.type].label), el('span', 'note', it.note));
        const acts = el('div', 'acts');
        const fix = btn(TYPE[it.type].act, (e) => {
          e.stopPropagation();
          if (it.done) return;
          it.stroke = F.addEdit(it.mode, it.rect, 'review');
          it.done = true; li.classList.add('done'); fix.disabled = true; undoB.hidden = false;
          refreshButtons();
        });
        const undoB = btn('Undo', (e) => {
          e.stopPropagation();
          F.removeEdits((s) => s === it.stroke);
          it.done = false; li.classList.remove('done'); fix.disabled = false; undoB.hidden = true;
        });
        undoB.hidden = true;
        acts.append(fix, undoB);
        li.append(acts);
        li.addEventListener('click', () => select(i));
        ol.append(li);
      });
      card.append(ol);
      card.append(el('p', 'muted small', 'Click an item to zoom to it. The fix buttons work like the brushes: Undo removes them.'));
    }
    F.setMarks(issues.map((it, i) => ({ ...it.rect, label: String(i + 1) })));

    const sets = (Array.isArray(ans.settings) ? ans.settings : [])
      .filter((s) => s && SETTINGS[s.name] && typeof s.value === 'number' && isFinite(s.value))
      .map((s) => ({ name: s.name, value: Math.round(Math.max(SETTINGS[s.name].min, Math.min(SETTINGS[s.name].max, s.value))), why: String(s.why || '').slice(0, 160) }))
      .filter((s) => String(s.value) !== $(s.name).value);
    if (sets.length) {
      const sc = el('div', 'ai-card');
      sc.append(el('p', '', 'Suggested settings'));
      const tb = el('table', 'settings');
      sets.forEach((s) => {
        const tr = el('tr');
        tr.append(el('td', '', SETTINGS[s.name].label), el('td', '', $(s.name).value + ' → ' + s.value), el('td', 'muted', s.why));
        tb.append(tr);
      });
      sc.append(tb);
      const row = el('div', 'row');
      const apply = btn('Apply settings', async () => {
        sets.forEach((s) => F.setSetting(s.name, s.value));
        apply.disabled = true;
        F.setMarks([]);
        await F.processNow();
        say('Settings applied and the plan was cleaned again. Review again to check.');
      }, 'primary');
      row.append(apply);
      sc.append(row);
      ui.out.append(card, sc);
    } else {
      ui.out.append(card);
    }

    const lesson = String(ans.lesson || '').trim().slice(0, 300);
    if (lesson && db) ui.out.append(lessonCard([lesson], 'review'));
  }

  function select(i) {
    if (!review) return;
    const it = review.issues[i];
    ui.out.querySelectorAll('.issue').forEach((li, k) => li.classList.toggle('sel', k === i));
    F.setMarks(review.issues.map((x, k) => ({ ...x.rect, label: String(k + 1), color: k === i ? '#d08770' : undefined })), i);
    const m = Math.max(it.rect.w, it.rect.h) * 2 + 200;
    F.zoomTo({ x: it.rect.x + it.rect.w / 2 - m / 2, y: it.rect.y + it.rect.h / 2 - m / 2, w: m, h: m });
  }

  // ---------- 3. lessons ----------
  function renderLessons() {
    ui.lcount.textContent = lessons.length ? '(' + lessons.length + ')' : '(none yet)';
    ui.llist.textContent = '';
    if (!lessons.length) {
      ui.llist.append(el('li', 'empty', 'No lessons yet. Save one below, or use "Learn from my edits" after you erase something or bring it back.'));
      return;
    }
    lessons.forEach((l) => {
      const li = el('li');
      li.append(el('span', '', l.text));
      const del = el('button', '', '×');
      del.title = 'Delete this lesson';
      del.setAttribute('aria-label', 'Delete lesson');
      del.addEventListener('click', () => db.collection('lessons').doc(l.id).delete().catch((e) => say('Could not delete the lesson (' + e.code + ').', true)));
      li.append(del);
      ui.llist.append(li);
    });
  }
  async function saveLesson(text, from) {
    if (!db) return false;
    try {
      await db.collection('lessons').add({ text: text.slice(0, 300), from, at: Date.now() });
      return true;
    } catch (e) {
      say(e.code === 'invalid_argument' ? 'You can read lessons here but not add them. Ask the page owner for Contributor access.' : 'Could not save the lesson (' + e.code + ').', true);
      return false;
    }
  }
  ui.ladd.addEventListener('click', async () => {
    const t = ui.lnew.value.trim();
    if (!t) return;
    ui.ladd.disabled = true;
    if (await saveLesson(t, 'typed')) { ui.lnew.value = ''; say('Lesson saved. Claude will use it from now on.'); }
    refreshButtons();
  });

  function lessonCard(list, from) {
    const card = el('div', 'ai-card');
    card.append(el('p', '', list.length > 1 ? 'Claude suggests remembering these. Keep the ones you agree with:' : 'Claude suggests remembering this:'));
    const boxes = list.map((t) => {
      const lab = el('label', 'suggest');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
      lab.append(cb, el('span', '', t));
      card.append(lab);
      return { cb, t };
    });
    const row = el('div', 'row');
    const save = btn('Save lessons', async () => {
      save.disabled = true;
      let n = 0;
      for (const b of boxes) if (b.cb.checked && await saveLesson(b.t, from)) n++;
      card.replaceChildren(el('p', '', n ? `Saved ${n} lesson${n > 1 ? 's' : ''}. Claude will use ${n > 1 ? 'them' : 'it'} from now on.` : 'Nothing saved.'));
      if (n) $('ai-lessons').open = true;
    }, 'primary');
    row.append(save, btn('Not now', () => card.remove()));
    card.append(row);
    return card;
  }

  // Brush strokes the user made (not Claude's crop exclusions or fixes).
  function userStrokes() { return S.strokes.filter((s) => !s.tag); }
  function strokeBox(s) {
    if (s.rect) return { ...s.rect };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.pts.length; i += 2) {
      x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]);
      y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
    }
    return { x: x0 - s.r, y: y0 - s.r, w: x1 - x0 + 2 * s.r, h: y1 - y0 + 2 * s.r };
  }
  function groupBoxes(strokes) {
    let boxes = strokes.map((s) => ({ ...strokeBox(s), modes: new Set([s.mode]) }));
    const near = (a, b, m) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) {
        for (let j = i + 1; j < boxes.length && !merged; j++) {
          if (near(boxes[i], boxes[j], 60)) {
            const a = boxes[i], b = boxes[j];
            const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            boxes[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, modes: new Set([...a.modes, ...b.modes]) };
            boxes.splice(j, 1);
            merged = true;
          }
        }
      }
    }
    return boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, Math.min(4, maxImages));
  }

  ui.learn.addEventListener('click', async () => {
    if (busy || !sample) return;
    const strokes = userStrokes();
    if (!strokes.length) return;
    const signal = startBusy('Claude is looking at your edits…');
    try {
      const groups = groupBoxes(strokes);
      const images = [];
      for (const g of groups) {
        const m = Math.max(150, Math.max(g.w, g.h) * 0.6);
        const r = { x: Math.max(0, Math.round(g.x - m)), y: Math.max(0, Math.round(g.y - m)) };
        r.w = Math.min(S.w, Math.round(g.x + g.w + m)) - r.x;
        r.h = Math.min(S.h, Math.round(g.y + g.h + m)) - r.y;
        // Original in gray with the edits tinted on top.
        const c = document.createElement('canvas');
        c.width = r.w; c.height = r.h;
        const x = c.getContext('2d');
        x.drawImage(S.original, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        const id = x.getImageData(0, 0, r.w, r.h), d = id.data;
        const tint = { 1: [220, 40, 40], 2: [20, 160, 60], 3: [30, 102, 245] };
        for (let y = 0; y < r.h; y++) {
          for (let xx = 0; xx < r.w; xx++) {
            const mode = S.edit[(r.y + y) * S.w + r.x + xx], j = (y * r.w + xx) * 4;
            const t = tint[mode];
            if (!t) continue;
            d[j] = d[j] * 0.45 + t[0] * 0.55; d[j + 1] = d[j + 1] * 0.45 + t[1] * 0.55; d[j + 2] = d[j + 2] * 0.45 + t[2] * 0.55;
          }
        }
        x.putImageData(id, 0, 0);
        images.push(await rulerImage((ctx, w, h) => ctx.drawImage(c, 0, 0, w, h), r.w, r.h));
      }
      const prompt = `An automatic floor plan cleaner keeps only walls, doors and windows from architectural drawings, to make building automation graphics. A person corrected its output by hand.

Each image shows part of the original drawing (PDF text removed). The person's corrections are tinted:
- red: they ERASED what the cleaner kept there, so it should not have been kept
- green: they brought it back as a WALL, so the cleaner missed a wall
- blue: they brought it back as a DOOR or WINDOW, so the cleaner missed it
${lessonText()}
Write 1 to 3 short lessons (each under 25 words) that would help you catch the same kind of problem on future plans, when finding the plan on a sheet or reviewing a cleaned result. Make them general (about the kind of thing, how to recognize it, and what to do), not about this one drawing's coordinates. Do not repeat a lesson already listed above.

Reply with only JSON: {"lessons": ["...", "..."]}`;
      const ans = await sample.json(prompt, { images, signal });
      const list = (ans && Array.isArray(ans.lessons) ? ans.lessons : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 3);
      if (!list.length) { say('Claude had no new lessons from these edits.'); return; }
      ui.out.prepend(lessonCard(list, 'edits'));
    } catch (e) {
      say(e && e.code === 'cancelled' ? 'Stopped.' : 'Could not learn from the edits. ' + copyFor(e), e && e.code !== 'cancelled');
    } finally {
      endBusy();
    }
  });

  // Open with the sample plan so the page shows what it does.
  if (!S.original) $('sample').click();
})();
