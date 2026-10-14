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
  function fillGaps(mask, w, h, maxLen, horizontal, runs) {
    const out = mask.slice();
    // With runs, only bridge between ends of walls running the same way as
    // the gap (a doorway), not across a room between two side walls.
    const along = runs ? (horizontal ? runs.h : runs.v) : null;
    const cross = runs ? (horizontal ? runs.v : runs.h) : null;
    const endOk = (i) => !runs || 1.5 * along[i] > cross[i];
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
          if (lastFg >= 0 && gap > 0 && gap <= maxLen && endOk(base + lastFg * step) && endOk(i)) {
            for (let k = lastFg + 1; k < b; k++) out[base + k * step] = 1;
          }
          lastFg = b;
        }
      }
    }
    return out;
  }

  // Length of the horizontal and vertical foreground run through each pixel.
  function runLengths(mask, w, h) {
    const H = new Uint16Array(w * h), V = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!mask[y * w + x]) { x++; continue; }
        let e = x;
        while (e < w && mask[y * w + e]) e++;
        const len = Math.min(65535, e - x);
        for (let k = x; k < e; k++) H[y * w + k] = len;
        x = e;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (!mask[y * w + x]) { y++; continue; }
        let e = y;
        while (e < h && mask[e * w + x]) e++;
        const len = Math.min(65535, e - y);
        for (let k = y; k < e; k++) V[k * w + x] = len;
        y = e;
      }
    }
    return { h: H, v: V };
  }

  // Separable square max filter of radius r.
  function maxFilter(src, w, h, r) {
    const tmp = new src.constructor(w * h), out = new src.constructor(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[y * w + k] > m) m = src[y * w + k];
        tmp[y * w + x] = m;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x];
        out[y * w + x] = m;
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
   *   segs           vector line segments (Float32Array) or null
   *   lineMin/lineMax gap range for walls drawn as two parallel lines, px
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

    let windowStrips = null;
    if (p.segs && p.segs.length && p.lineMax > 0) {
      tick('Pairing double-line walls');
      const minT = Math.max(2, p.lineMin || 3);
      const pw = pairWalls(p.segs, w, h, minT, p.lineMax, p.crop);
      const pair = pw.mask;
      windowStrips = pw.windows;
      // Take in the drawn face lines too, then fill corners and end caps.
      const near = dilate(pair, w, h, 1);
      let lw = new Uint8Array(w * h);
      for (let i = 0; i < lw.length; i++) lw[i] = pair[i] | (near[i] & ink[i]);
      lw = fillPockets(lw, ink, w, h, 3 * p.lineMax * p.lineMax, 2 * p.lineMax);
      if (p.crop) {
        const c = p.crop;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x < c.x || y < c.y || x >= c.x + c.w || y >= c.y + c.h) lw[y * w + x] = 0;
          }
        }
      }
      for (let i = 0; i < walls.length; i++) walls[i] |= lw[i];
    }
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
      const runs = runLengths(walls, w, h);
      const gh = fillGaps(walls, w, h, p.maxOpening, true, runs);
      const gv = fillGaps(walls, w, h, p.maxOpening, false, runs);
      // A real opening is a slot about one wall thick, filled along the wall
      // direction. Filled regions thick in the other direction too are
      // corridors or closets, so each direction is checked on its own.
      // slotLen holds each slot's width along the wall.
      const gaps = new Uint8Array(w * h);
      const slotLen = new Uint16Array(w * h);
      const slot = Math.max(6, 5 * p.minWall, 1.3 * (p.segs ? p.lineMax || 0 : 0));
      for (const [g, horiz] of [[gh, true], [gv, false]]) {
        for (let i = 0; i < g.length; i++) g[i] &= walls[i] ^ 1;
        components(g, w, h, (pix, n, bb) => {
          const across = horiz ? bb.maxY - bb.minY + 1 : bb.maxX - bb.minX + 1;
          if (across > slot) return;
          const len = Math.min(65535, horiz ? bb.maxX - bb.minX + 1 : bb.maxY - bb.minY + 1);
          for (let k = 0; k < n; k++) { gaps[pix[k]] = 1; if (len > slotLen[pix[k]]) slotLen[pix[k]] = len; }
        });
      }
      // Openings known from the vector drawing: windows drawn inside a wall
      // and door swings.
      const depth = Math.max(5 * p.minWall, p.segs ? 1.3 * p.lineMax : 0);
      if (p.arcs && p.arcs.length) {
        const ds = doorSlots(p.arcs, walls, ink, w, h, depth);
        const doors = ds.slots;
        for (let i = 0; i < doors.length; i++) if (ds.swing[i] && ink[i]) openings[i] = 1;
        for (let i = 0; i < doors.length; i++) {
          if (doors[i]) { walls[i] = 0; gaps[i] = 1; }
        }
        // Each door strip's length is its arc radius.
        for (let a = 0; a < p.arcs.length; a += 7) {
          const cx = Math.round(p.arcs[a]), cy = Math.round(p.arcs[a + 1]), rr = Math.ceil(p.arcs[a + 2]) + 2;
          for (let y = Math.max(0, cy - rr); y <= Math.min(h - 1, cy + rr); y++) {
            for (let x = Math.max(0, cx - rr); x <= Math.min(w - 1, cx + rr); x++) {
              const i = y * w + x;
              if (doors[i] && slotLen[i] < rr) slotLen[i] = rr;
            }
          }
        }
      }
      if (windowStrips) {
        for (let i = 0; i < windowStrips.length; i++) {
          if (windowStrips[i] && !walls[i]) {
            gaps[i] = 1;
            if (ink[i]) openings[i] = 1;
          }
        }
      }
      const reach = Math.max(3, r + 3);
      const nearLen = maxFilter(slotLen, w, h, reach);
      const wallPad = dilate(walls, w, h, 1);
      const thin = new Uint8Array(w * h);
      for (let i = 0; i < thin.length; i++) thin[i] = ink[i] & (wallPad[i] ^ 1);
      const maxSpan = p.maxOpening * 1.6;
      components(thin, w, h, (pix, n, bb) => {
        if (n < 4) return;
        const bw = bb.maxX - bb.minX + 1, bh = bb.maxY - bb.minY + 1;
        if (bw > maxSpan || bh > maxSpan) return;
        let hits = 0, L = 0;
        for (let k = 0; k < n; k++) {
          const v = nearLen[pix[k]];
          if (v) { hits++; if (v > L) L = v; }
        }
        if (hits < 2) return;
        // A door swing or window is about as big as its opening; furniture
        // that merely touches a window is not.
        if (Math.max(bw, bh) > 1.3 * L + 2 * reach) return;
        // Text and small symbols beside an opening are much smaller than it.
        if (Math.max(bw, bh) < 0.3 * L) return;
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

  // Fill a convex polygon (flat x,y list) into a mask.
  function fillConvex(mask, w, h, pts) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { if (pts[i] < y0) y0 = pts[i]; if (pts[i] > y1) y1 = pts[i]; }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h - 1, Math.ceil(y1));
    const n = pts.length / 2;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const ax = pts[2 * i], ay = pts[2 * i + 1];
        const bx = pts[(2 * i + 2) % pts.length], by = pts[(2 * i + 3) % pts.length];
        if ((ay <= yc && by >= yc) || (by <= yc && ay >= yc)) {
          const x = ay === by ? Math.min(ax, bx) : ax + (bx - ax) * (yc - ay) / (by - ay);
          const x2 = ay === by ? Math.max(ax, bx) : x;
          if (x < lo) lo = x; if (x2 > hi) hi = x2;
        }
      }
      if (hi < lo) continue;
      const xa = Math.max(0, Math.round(lo)), xb = Math.min(w - 1, Math.round(hi));
      for (let x = xa; x <= xb; x++) mask[y * w + x] = 1;
    }
  }

  /* Walls drawn as two parallel lines (CAD style), from vector segments.
   * segs: Float32Array x1,y1,x2,y2 in pixels. A pair of parallel segments
   * minT..maxT apart that run alongside each other long enough is a wall;
   * the strip between them is filled. A pair with a third parallel line
   * just outside it at the same spacing is a repeating pattern (stair
   * treads, hatching), not a wall.
   */
  function pairWalls(segs, w, h, minT, maxT, crop) {
    const mask = new Uint8Array(w * h);
    const windows = new Uint8Array(w * h);
    const n = segs.length / 4;
    const BUCKETS = 180;
    const byBucket = Array.from({ length: BUCKETS }, () => []);
    const ang = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x1 = segs[4 * i], y1 = segs[4 * i + 1], x2 = segs[4 * i + 2], y2 = segs[4 * i + 3];
      if (Math.hypot(x2 - x1, y2 - y1) < minT) continue;
      if (crop) {
        const inside = (x, y) => x >= crop.x && x <= crop.x + crop.w && y >= crop.y && y <= crop.y + crop.h;
        if (!inside(x1, y1) && !inside(x2, y2)) continue;
      }
      let a = Math.atan2(y2 - y1, x2 - x1);
      if (a < 0) a += Math.PI;
      if (a >= Math.PI) a -= Math.PI;
      ang[i] = a;
      // Buckets are centred on whole degrees so axis-aligned walls stay exact.
      byBucket[Math.round(a / Math.PI * BUCKETS) % BUCKETS].push(i);
    }
    const stats = new Float64Array(Math.ceil(maxT) + 2);
    for (let b = 0; b < BUCKETS; b++) {
      // Group this bucket with its neighbours so near-parallel lines meet.
      const ids = byBucket[b].concat(byBucket[(b + 1) % BUCKETS], byBucket[(b + BUCKETS - 1) % BUCKETS]);
      if (!byBucket[b].length || ids.length < 2) continue;
      const ca = b / BUCKETS * Math.PI;
      const ux = Math.cos(ca), uy = Math.sin(ca), nx = -uy, ny = ux;
      const own = byBucket[b].length;
      const g = ids.map((i, idx) => {
        const x1 = segs[4 * i], y1 = segs[4 * i + 1], x2 = segs[4 * i + 2], y2 = segs[4 * i + 3];
        const t1 = x1 * ux + y1 * uy, t2 = x2 * ux + y2 * uy;
        return { i, o: ((x1 + x2) * nx + (y1 + y2) * ny) / 2, t0: Math.min(t1, t2), t1: Math.max(t1, t2), own: idx < own };
      });
      g.sort((p, q) => p.o - q.o);
      const overlapLen = (p, a0, a1) => Math.min(p.t1, a1) - Math.max(p.t0, a0);
      for (let i = 0; i < g.length; i++) {
        const A = g[i];
        if (!A.own) continue; // each pair is handled once, in its own bucket
        for (let j = i + 1; j < g.length; j++) {
          const B = g[j];
          const sep = B.o - A.o;
          if (sep > maxT) break;
          if (sep < minT) continue;
          const a0 = Math.max(A.t0, B.t0), a1 = Math.min(A.t1, B.t1);
          const len = a1 - a0;
          if (len < Math.max(1.5 * sep, 3 * minT)) continue;
          // A wall's two faces have nothing parallel between them. Lines
          // between them along part of the run are a window drawn in the
          // wall; lines between them all along are something else (a door
          // leaf lying beside a wall, for example).
          const inner = [];
          for (let k = i + 1; k < j; k++) {
            if (g[k].o - A.o > 0.5 && B.o - g[k].o > 0.5 && overlapLen(g[k], a0, a1) > 0) {
              inner.push([Math.max(g[k].t0, a0), Math.min(g[k].t1, a1)]);
            }
          }
          inner.sort((p, q) => p[0] - q[0]);
          const glass = [];
          for (const iv of inner) {
            const last = glass[glass.length - 1];
            if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]);
            else glass.push(iv.slice());
          }
          let covered = 0;
          for (const iv of glass) covered += iv[1] - iv[0];
          if (covered > 0.98 * len) continue;
          // Repeating pattern check, just outside either line.
          let repeated = false;
          const win = sep * 1.2;
          for (let k = i - 1; k >= 0 && A.o - g[k].o <= win; k--) {
            if (A.o - g[k].o > 0.5 && overlapLen(g[k], a0, a1) > 0.5 * len) { repeated = true; break; }
          }
          for (let k = j + 1; !repeated && k < g.length && g[k].o - B.o <= win; k++) {
            if (g[k].o - B.o > 0.5 && overlapLen(g[k], a0, a1) > 0.5 * len) repeated = true;
          }
          if (repeated) continue;
          stats[Math.round(sep)] += len;
          const strip = (target, s0, s1) => fillConvex(target, w, h, [
            s0 * ux + A.o * nx, s0 * uy + A.o * ny,
            s1 * ux + A.o * nx, s1 * uy + A.o * ny,
            s1 * ux + B.o * nx, s1 * uy + B.o * ny,
            s0 * ux + B.o * nx, s0 * uy + B.o * ny,
          ]);
          let at = a0;
          for (const iv of glass) {
            if (iv[0] > at) strip(mask, at, iv[0]);
            strip(windows, iv[0], iv[1]);
            at = Math.max(at, iv[1]);
          }
          if (a1 > at) strip(mask, at, a1);
        }
      }
    }
    for (let i = 0; i < mask.length; i++) if (mask[i]) windows[i] = 0;
    return { mask, windows, stats };
  }

  /* Door swings from vector arcs. The arc's centre is the hinge; the arc
   * end that lies along the wall marks the far jamb. The strip from hinge
   * to jamb, one wall deep on the side away from the swing, is the opening.
   * Returns a mask of those strips.
   */
  function doorSlots(arcs, walls, ink, w, h, depth) {
    const out = new Uint8Array(w * h);
    const swing = new Uint8Array(w * h); // pixels along the arc and the leaf
    const dot = (x, y) => {
      for (let yy = Math.round(y) - 2; yy <= Math.round(y) + 2; yy++) {
        for (let xx = Math.round(x) - 2; xx <= Math.round(x) + 2; xx++) {
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) swing[yy * w + xx] = 1;
        }
      }
    };
    const at = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1;
    };
    for (let a = 0; a < arcs.length; a += 7) {
      const cx = arcs[a], cy = arcs[a + 1], r = arcs[a + 2];
      const ends = [[arcs[a + 3], arcs[a + 4]], [arcs[a + 5], arcs[a + 6]]];
      let best = null, bestScore = -1;
      for (let e = 0; e < 2; e++) {
        const [ex, ey] = ends[e], [fx, fy] = ends[1 - e];
        const dx = (ex - cx) / r, dy = (ey - cy) / r;
        let nx = -dy, ny = dx;
        // Point the normal away from the swing (towards the wall).
        if ((fx - cx) * nx + (fy - cy) * ny > 0) { nx = -nx; ny = -ny; }
        let score = 0;
        for (let t = 0.1; t < 0.95; t += 0.1) {
          for (let q = 2; q <= depth; q += 2) {
            const i = at(cx + dx * r * t + nx * q, cy + dy * r * t + ny * q);
            if (i >= 0) score += walls[i] * 2 + ink[i];
          }
        }
        if (score > bestScore) { bestScore = score; best = { dx, dy, nx, ny, fx, fy }; }
      }
      const { dx, dy, nx, ny, fx, fy } = best;
      // Arc from one end to the other the short way, then the leaf.
      const a0 = Math.atan2(arcs[a + 4] - cy, arcs[a + 3] - cx);
      let da = Math.atan2(arcs[a + 6] - cy, arcs[a + 5] - cx) - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.ceil(Math.abs(da) * r);
      for (let k = 0; k <= steps; k++) {
        const t = a0 + da * k / steps;
        dot(cx + r * Math.cos(t), cy + r * Math.sin(t));
      }
      const ls = Math.ceil(r);
      for (let k = 0; k <= ls; k++) dot(cx + (fx - cx) * k / ls, cy + (fy - cy) * k / ls);
      const p = (t, q) => [cx + dx * t + nx * q, cy + dy * t + ny * q];
      fillConvex(out, w, h, [...p(-1, -2), ...p(r + 1, -2), ...p(r + 1, depth), ...p(-1, depth)]);
    }
    return { slots: out, swing };
  }

  // Fill small background pockets that touch walls on most sides: the
  // corner and T-junction squares and end caps that line pairing misses.
  function fillPockets(walls, ink, w, h, maxArea, maxSpan) {
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < solid.length; i++) solid[i] = walls[i] | ink[i];
    const bg = new Uint8Array(w * h);
    for (let i = 0; i < bg.length; i++) bg[i] = solid[i] ^ 1;
    const out = walls.slice();
    const near = dilate(walls, w, h, 2);
    components4(bg, w, h, (pix, n, bb) => {
      if (n > maxArea) return;
      if (bb.maxX - bb.minX + 1 > maxSpan || bb.maxY - bb.minY + 1 > maxSpan) return;
      let touch = 0;
      for (let k = 0; k < n; k++) if (near[pix[k]]) touch++;
      if (touch < 0.3 * n) return;
      for (let k = 0; k < n; k++) out[pix[k]] = 1;
    }, maxArea);
    return out;
  }

  // 4-connected components with an early size cap (big regions are skipped
  // without collecting all their pixels).
  function components4(mask, w, h, visit, cap) {
    const seen = new Uint8Array(w * h);
    let stack = new Int32Array(1 << 16);
    const pix = new Int32Array(cap + 1);
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0, n = 0, big = false;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const i = stack[--sp];
        if (n <= cap) pix[n] = i; else big = true;
        n++;
        const x = i % w, y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const j of nb) {
          if (j >= 0 && mask[j] && !seen[j]) {
            seen[j] = 1;
            if (sp === stack.length) { const t = new Int32Array(stack.length * 2); t.set(stack); stack = t; }
            stack[sp++] = j;
          }
        }
      }
      if (!big) visit(pix, n, { minX, minY, maxX, maxY });
    }
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
    distInside, distOutside, dilate, erode, fillGaps, components, toInk, runLengths, maxFilter,
    estimateWallThickness, processPlan, traceMask, simplifyClosed, loopsToPath,
    fillConvex, pairWalls, doorSlots, fillPockets, components4,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPEngine = api;
})(typeof self !== 'undefined' ? self : this);
