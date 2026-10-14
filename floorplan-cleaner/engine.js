/* Floor plan cleaner: image-processing engine.
 *
 * Pure functions on typed arrays, no DOM. Runs inside the Web Worker
 * (worker.js) and in Node for tests.
 *
 * Masks are Uint8Array(w*h) holding 0 or 1.
 * Distances use the 3-4 chamfer metric, so 3 units ~= 1 pixel.
 */
(function (root) {
  'use strict';

  const INF = 65000;

  // Chamfer distance from every foreground pixel to the nearest background
  // pixel. Pixels outside the image count as background.
  function distInside(mask, w, h) {
    const d = new Uint16Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        let v = d[i];
        if (!v) continue;
        const l = x > 0 ? d[i - 1] : 0;
        const u = y > 0 ? d[i - w] : 0;
        const ul = x > 0 && y > 0 ? d[i - w - 1] : 0;
        const ur = x < w - 1 && y > 0 ? d[i - w + 1] : 0;
        if (l + 3 < v) v = l + 3;
        if (u + 3 < v) v = u + 3;
        if (ul + 4 < v) v = ul + 4;
        if (ur + 4 < v) v = ur + 4;
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = w - 1; x >= 0; x--) {
        const i = row + x;
        let v = d[i];
        if (!v) continue;
        const r = x < w - 1 ? d[i + 1] : 0;
        const dn = y < h - 1 ? d[i + w] : 0;
        const dr = x < w - 1 && y < h - 1 ? d[i + w + 1] : 0;
        const dl = x > 0 && y < h - 1 ? d[i + w - 1] : 0;
        if (r + 3 < v) v = r + 3;
        if (dn + 3 < v) v = dn + 3;
        if (dr + 4 < v) v = dr + 4;
        if (dl + 4 < v) v = dl + 4;
        d[i] = v;
      }
    }
    return d;
  }

  // Chamfer distance from every pixel to the nearest foreground pixel.
  // Unlike distInside, the image border is not treated as foreground.
  function distOutside(mask, w, h) {
    const d = new Uint16Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        if (!v) continue;
        if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
        if (y > 0) {
          if (d[i - w] + 3 < v) v = d[i - w] + 3;
          if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4;
          if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4;
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        if (!v) continue;
        if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
        if (y < h - 1) {
          if (d[i + w] + 3 < v) v = d[i + w] + 3;
          if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4;
          if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4;
        }
        d[i] = v;
      }
    }
    return d;
  }

  function dilate(mask, w, h, r) {
    if (r <= 0) return mask.slice();
    const d = distOutside(mask, w, h);
    const out = new Uint8Array(w * h);
    const lim = 3 * r;
    for (let i = 0; i < out.length; i++) out[i] = d[i] <= lim ? 1 : 0;
    return out;
  }

  function erode(mask, w, h, r) {
    if (r <= 0) return mask.slice();
    const d = distInside(mask, w, h);
    const out = new Uint8Array(w * h);
    const lim = 3 * r;
    for (let i = 0; i < out.length; i++) out[i] = d[i] > lim ? 1 : 0;
    return out;
  }

  // Fill background runs no longer than maxLen that have foreground on both
  // ends, along rows (horizontal) and columns (vertical). This is a closing
  // with a line element and is what finds door and window openings in walls.
  function fillGaps(mask, w, h, maxLen, horizontal) {
    const out = mask.slice();
    const n = horizontal ? h : w;
    const len = horizontal ? w : h;
    const step = horizontal ? 1 : w;
    for (let a = 0; a < n; a++) {
      const base = horizontal ? a * w : a;
      let lastFg = -1;
      for (let b = 0; b < len; b++) {
        const i = base + b * step;
        if (mask[i]) {
          const gap = b - lastFg - 1;
          if (lastFg >= 0 && gap > 0 && gap <= maxLen) {
            for (let k = lastFg + 1; k < b; k++) out[base + k * step] = 1;
          }
          lastFg = b;
        }
      }
    }
    return out;
  }

  // 8-connected components. Calls visit(pixelIndices, count, bbox) for each
  // and returns nothing; callers decide what to keep.
  function components(mask, w, h, visit) {
    const seen = new Uint8Array(w * h);
    let stack = new Int32Array(1 << 16);
    let pix = new Int32Array(1 << 16);
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0, n = 0;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      stack[sp++] = s;
      seen[s] = 1;
      while (sp) {
        const i = stack[--sp];
        if (n === pix.length) { const p = new Int32Array(pix.length * 2); p.set(pix); pix = p; }
        pix[n++] = i;
        const x = i % w, y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (mask[j] && !seen[j]) {
              seen[j] = 1;
              if (sp === stack.length) { const t = new Int32Array(stack.length * 2); t.set(stack); stack = t; }
              stack[sp++] = j;
            }
          }
        }
      }
      visit(pix, n, { minX, minY, maxX, maxY });
    }
  }

  // Grayscale (0 = black) to ink mask, honoring an optional crop rectangle.
  function toInk(gray, w, h, threshold, crop) {
    const ink = new Uint8Array(w * h);
    const x0 = crop ? Math.max(0, crop.x | 0) : 0;
    const y0 = crop ? Math.max(0, crop.y | 0) : 0;
    const x1 = crop ? Math.min(w, (crop.x + crop.w) | 0) : w;
    const y1 = crop ? Math.min(h, (crop.y + crop.h) | 0) : h;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (gray[i] < threshold) ink[i] = 1;
      }
    }
    return ink;
  }

  // Guess the wall thickness in pixels from the stroke-width histogram.
  // Thin linework dominates the low end; walls form the next strong peak.
  function estimateWallThickness(ink, w, h) {
    const d = distInside(ink, w, h);
    const hist = new Float64Array(64);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const v = d[i];
        if (!v) continue;
        // Ridge pixel: at least as deep as its 4 neighbours.
        if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - w] && v >= d[i + w]) {
          const t = Math.min(63, Math.round((2 * v) / 3)); // approx stroke width
          hist[t]++;
        }
      }
    }
    // Walls come in several thicknesses (exterior, interior); the thinnest
    // class that forms a real peak sets the minimum.
    // Weight by thickness: a thick stroke has fewer ridge pixels per unit of
    // ink, and sheet borders and title-block rules are thin but long.
    for (let t = 0; t < 64; t++) hist[t] *= t;
    let max = 0;
    for (let t = 5; t < 64; t++) if (hist[t] > max) max = hist[t];
    if (max < 2000) return 0;
    for (let t = 5; t < 63; t++) {
      if (hist[t] >= 0.3 * max && hist[t] >= hist[t - 1] && hist[t] >= hist[t + 1]) {
        return Math.max(3, Math.round(t * 0.75));
      }
    }
    return 0;
  }

  /* Main pipeline.
   * params: {
   *   threshold      gray level below which a pixel is ink (0-255)
   *   minWall        minimum wall thickness in px
   *   joinGap        close gaps up to this many px first (double-line walls)
   *   minWallArea    drop wall pieces smaller than this many px
   *   maxOpening     widest door/window opening in px
   *   keepOpenings   detect doors and windows
   *   dropFrame      drop wall pieces spanning most of the page (sheet border)
   *   crop           {x,y,w,h} or null
   * }
   * returns { ink, walls, openings }
   */
  function processPlan(gray, w, h, params, progress) {
    const p = params;
    const tick = progress || function () {};
    tick('Finding ink');
    const ink = toInk(gray, w, h, p.threshold, p.crop);

    let solid = ink;
    if (p.joinGap > 0) {
      tick('Joining double-line walls');
      const r = Math.max(1, Math.round(p.joinGap / 2));
      solid = erode(dilate(ink, w, h, r), w, h, r);
    }

    tick('Finding thick strokes');
    const r = Math.max(1, Math.ceil(p.minWall / 2));
    const inside = distInside(solid, w, h);
    const core = new Uint8Array(w * h);
    for (let i = 0; i < core.length; i++) core[i] = inside[i] >= 3 * r ? 1 : 0;
    const grown = dilate(core, w, h, r);
    let walls = new Uint8Array(w * h);
    for (let i = 0; i < walls.length; i++) walls[i] = grown[i] & solid[i];
    // Mend hairline breaks where lighter linework crosses a wall.
    const mend = Math.max(2, Math.round(p.minWall / 2));
    walls = fillGaps(fillGaps(walls, w, h, mend, true), w, h, mend, false);

    tick('Dropping small pieces');
    const area = p.crop ? p.crop.w * p.crop.h : w * h;
    const spanW = p.crop ? p.crop.w : w, spanH = p.crop ? p.crop.h : h;
    const keptWalls = new Uint8Array(w * h);
    components(walls, w, h, (pix, n, bb) => {
      if (n < p.minWallArea) return;
      if (p.dropFrame) {
        const bw = bb.maxX - bb.minX + 1, bh = bb.maxY - bb.minY + 1;
        // A sheet border is huge but almost empty.
        if (bw > 0.85 * spanW && bh > 0.85 * spanH && n < 0.15 * area) return;
      }
      for (let k = 0; k < n; k++) keptWalls[pix[k]] = 1;
    });
    walls = keptWalls;

    let openings = new Uint8Array(w * h);
    if (p.keepOpenings && p.maxOpening > 0) {
      tick('Finding doors and windows');
      const gh = fillGaps(walls, w, h, p.maxOpening, true);
      const gv = fillGaps(walls, w, h, p.maxOpening, false);
      // A real opening is a slot about one wall thick, filled along the wall
      // direction. Filled regions thick in the other direction too are
      // corridors or closets, so each direction is checked on its own.
      const gaps = new Uint8Array(w * h);
      const slot = Math.max(6, 5 * p.minWall);
      for (const [g, horiz] of [[gh, true], [gv, false]]) {
        for (let i = 0; i < g.length; i++) g[i] &= walls[i] ^ 1;
        components(g, w, h, (pix, n, bb) => {
          const across = horiz ? bb.maxY - bb.minY + 1 : bb.maxX - bb.minX + 1;
          if (across > slot) return;
          for (let k = 0; k < n; k++) gaps[pix[k]] = 1;
        });
      }
      const nearGap = dilate(gaps, w, h, Math.max(3, r + 3));
      const wallPad = dilate(walls, w, h, 1);
      const thin = new Uint8Array(w * h);
      for (let i = 0; i < thin.length; i++) thin[i] = ink[i] & (wallPad[i] ^ 1);
      const maxSpan = p.maxOpening * 1.6;
      components(thin, w, h, (pix, n, bb) => {
        if (n < 4) return;
        const bw = bb.maxX - bb.minX + 1, bh = bb.maxY - bb.minY + 1;
        if (bw > maxSpan || bh > maxSpan) return;
        let hits = 0;
        for (let k = 0; k < n; k++) if (nearGap[pix[k]]) hits++;
        if (hits < 2) return;
        for (let k = 0; k < n; k++) openings[pix[k]] = 1;
      });
      // Ink that sits inside the wall line of an opening (window sills,
      // glazing, door jamb ticks) is part of the opening too.
      for (let i = 0; i < openings.length; i++) {
        if (ink[i] && gaps[i] && !walls[i]) openings[i] = 1;
      }
    }

    return { ink, walls, openings };
  }

  // Trace a binary mask into closed polygons along pixel edges, then
  // simplify. Returns an array of loops, each a flat [x0,y0,x1,y1,...].
  // Outer boundaries run clockwise and holes counter-clockwise (y down), so
  // fill-rule nonzero or evenodd both render correctly.
  function traceMask(mask, w, h, box, epsilon) {
    const x0 = box ? box.x : 0, y0 = box ? box.y : 0;
    const x1 = box ? box.x + box.w : w, y1 = box ? box.y + box.h : h;
    const W = w + 1;
    // out-edge bits per vertex: 1 = +x, 2 = +y, 4 = -x, 8 = -y
    const edges = new Map();
    const add = (vx, vy, bit) => {
      const k = vy * W + vx;
      edges.set(k, (edges.get(k) || 0) | bit);
    };
    const at = (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? mask[y * w + x] : 0);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!mask[y * w + x]) continue;
        if (!at(x, y - 1)) add(x, y, 1);
        if (!at(x + 1, y)) add(x + 1, y, 2);
        if (!at(x, y + 1)) add(x + 1, y + 1, 4);
        if (!at(x - 1, y)) add(x, y + 1, 8);
      }
    }
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    const loops = [];
    for (const [startKey] of edges) {
      if (!edges.get(startKey)) continue;
      const pts = [];
      let k = startKey;
      let dir = -1;
      for (;;) {
        const bits = edges.get(k) || 0;
        if (!bits) break;
        let nd = -1;
        if (dir < 0) {
          for (let b = 0; b < 4; b++) if (bits & (1 << b)) { nd = b; break; }
        } else {
          // At a saddle prefer turning right, which keeps diagonal pixels
          // in one shape (8-connectivity for the foreground).
          const order = [(dir + 1) & 3, dir, (dir + 3) & 3];
          for (const b of order) if (bits & (1 << b)) { nd = b; break; }
          if (nd < 0) break;
        }
        const vx = k % W, vy = (k - vx) / W;
        if (nd !== dir) pts.push(vx, vy);
        const left = bits & ~(1 << nd);
        if (left) edges.set(k, left); else edges.delete(k);
        dir = nd;
        k = (vy + DY[nd]) * W + (vx + DX[nd]);
        if (k === startKey && !edges.get(k)) break;
      }
      if (pts.length >= 6) loops.push(epsilon > 0 ? simplifyClosed(pts, epsilon) : pts);
    }
    return loops.filter((l) => l.length >= 6);
  }

  // Douglas-Peucker on a closed polygon given as a flat coordinate list.
  function simplifyClosed(pts, eps) {
    const n = pts.length / 2;
    if (n < 4) return pts;
    // Split at the vertex farthest from vertex 0 so both halves are open.
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) {
      const dx = pts[2 * i] - pts[0], dy = pts[2 * i + 1] - pts[1];
      const dd = dx * dx + dy * dy;
      if (dd > fd) { fd = dd; far = i; }
    }
    const keep = new Uint8Array(n + 1);
    keep[0] = keep[far] = keep[n] = 1;
    const px = (i) => pts[2 * (i % n)], py = (i) => pts[2 * (i % n) + 1];
    const e2 = eps * eps;
    const stack = [0, far, far, n];
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      if (b - a < 2) continue;
      const ax = px(a), ay = py(a), bx = px(b), by = py(b);
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy || 1;
      let mi = -1, md = e2;
      for (let i = a + 1; i < b; i++) {
        const wx = px(i) - ax, wy = py(i) - ay;
        const cross = vx * wy - vy * wx;
        const dd = (cross * cross) / len2;
        if (dd > md) { md = dd; mi = i; }
      }
      if (mi >= 0) { keep[mi] = 1; stack.push(a, mi, mi, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }

  function loopsToPath(loops, ox, oy, s) {
    const f = (v) => Math.round(v * 100) / 100;
    let d = '';
    for (const l of loops) {
      d += 'M' + f((l[0] - ox) * s) + ' ' + f((l[1] - oy) * s);
      for (let i = 2; i < l.length; i += 2) d += 'L' + f((l[i] - ox) * s) + ' ' + f((l[i + 1] - oy) * s);
      d += 'Z';
    }
    return d;
  }

  const api = {
    distInside, distOutside, dilate, erode, fillGaps, components, toInk,
    estimateWallThickness, processPlan, traceMask, simplifyClosed, loopsToPath,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPEngine = api;
})(typeof self !== 'undefined' ? self : this);
