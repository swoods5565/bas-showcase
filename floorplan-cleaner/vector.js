/* Floor plan cleaner: straight line segments from a PDF page.
 *
 * CAD exports (AutoCAD, Revit, DWG TrueView) usually draw walls as two thin
 * parallel lines. Reading the vector paths gives exact lines to pair up,
 * which the raster thickness test cannot see.
 *
 * extractSegments(page, viewport, pdfjsLib) resolves to
 *   { segs: Float32Array x1,y1,x2,y2, widths: Float32Array (stroke width of
 *     each segment), arcs: Float32Array cx,cy,r,ax,ay,bx,by,
 *     text: Float32Array cx,cy,height of each text run }
 * in viewport (rendered pixel) coordinates. arcs are roughly quarter-circle
 * curves or polylines, which in a floor plan are door swings.
 *
 * Only paths painted in a visible colour count: clipping paths and white
 * masking fills are skipped, and lines are cut to the active clip. Revit
 * draws many lines as thin filled rectangles; those become one line along
 * their centre.
 */
(function (root) {
  'use strict';

  async function extractSegments(page, viewport, pdfjsLib) {
    const OPS = pdfjsLib.OPS;
    const mul = pdfjsLib.Util.transform;
    const list = await page.getOperatorList();
    const out = [], outW = [], arcs = [];
    const pxPerPt = viewport.scale || 1;
    // A filled shape no wider than this is a line drawn as a thin fill.
    const thinFill = 1.5 * pxPerPt;

    // The parts of the graphics state that matter here.
    let g = { ctm: viewport.transform.slice(), lw: 1, fc: [0, 0, 0], sc: [0, 0, 0], clips: [] };
    const stack = [];
    const tp = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const devW = (m) => Math.max(1, g.lw * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])));
    const visible = (c) => !(c && c[0] >= 235 && c[1] >= 235 && c[2] >= 235);

    // Subpaths of the path being built, in device coordinates:
    // { pts: [x, y, ...], curve: [true when that segment is part of a curve], closed }.
    let subs = [], cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
    const startSub = (x, y) => {
      const q = tp(g.ctm, x, y);
      cur = { pts: [q[0], q[1]], curve: [], closed: false };
      subs.push(cur);
    };
    const lineTo = (x, y, curve) => {
      if (!cur) startSub(cx, cy);
      const q = tp(g.ctm, x, y), n = cur.pts.length;
      if (q[0] === cur.pts[n - 2] && q[1] === cur.pts[n - 1]) return;
      cur.pts.push(q[0], q[1]);
      cur.curve.push(curve);
    };
    const curveTo = (x1, y1, x2, y2, x3, y3) => {
      const x0 = cx, y0 = cy;
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, u = 1 - t;
        lineTo(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3, true);
      }
    };

    // Cut a segment to the active clip regions; emit gets each visible piece.
    const clipped = (x1, y1, x2, y2, emit) => {
      let parts = [[0, 1]];
      const dx = x2 - x1, dy = y2 - y1;
      for (const reg of g.clips) {
        const inBox = Math.min(x1, x2) >= reg.x0 && Math.max(x1, x2) <= reg.x1 &&
          Math.min(y1, y2) >= reg.y0 && Math.max(y1, y2) <= reg.y1;
        if (reg.box && inBox) continue;
        if (Math.max(x1, x2) < reg.x0 || Math.min(x1, x2) > reg.x1 || Math.max(y1, y2) < reg.y0 || Math.min(y1, y2) > reg.y1) return;
        const ts = [0, 1];
        for (const poly of reg.polys) {
          for (let i = 0, n = poly.length; i < n; i += 2) {
            const ax = poly[i], ay = poly[i + 1], ex = poly[(i + 2) % n] - ax, ey = poly[(i + 3) % n] - ay;
            const den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((ax - x1) * ey - (ay - y1) * ex) / den;
            const u = ((ax - x1) * dy - (ay - y1) * dx) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
          }
        }
        ts.sort((a, b) => a - b);
        const next = [];
        for (let i = 0; i + 1 < ts.length; i++) {
          const a = ts[i], b = ts[i + 1];
          if (b - a < 1e-6) continue;
          const m = (a + b) / 2;
          if (!insideRegion(reg, x1 + dx * m, y1 + dy * m)) continue;
          for (const [p0, p1] of parts) {
            const lo = Math.max(a, p0), hi = Math.min(b, p1);
            if (hi > lo) next.push([lo, hi]);
          }
        }
        parts = next;
        if (!parts.length) return;
      }
      for (const [a, b] of parts) emit(x1 + dx * a, y1 + dy * a, x1 + dx * b, y1 + dy * b);
    };
    const pushSeg = (x1, y1, x2, y2, wd) => {
      clipped(x1, y1, x2, y2, (a, b, c, d) => {
        if (Math.abs(c - a) + Math.abs(d - b) < 0.05) return;
        out.push(a, b, c, d);
        outW.push(wd);
      });
    };
    const pushArc = (arc) => {
      // A swing outside the clip is not drawn.
      let ok = true;
      for (const reg of g.clips) if (!insideRegion(reg, (arc[3] + arc[5]) / 2, (arc[4] + arc[6]) / 2) && !insideRegion(reg, arc[3], arc[4])) ok = false;
      if (ok) arcs.push(...arc);
    };

    const paint = (stroke, fill) => {
      const wd = devW(g.ctm);
      for (const s of subs) {
        const p = s.pts, n = p.length / 2;
        if (n < 2) continue;
        // A thin filled quadrilateral is one line along its middle.
        if (fill && !stroke && thinQuad(s, thinFill, pushSeg)) continue;
        findArcs(s, pushArc);
        for (let i = 0; i + 1 < n; i++) {
          if (!s.curve[i]) pushSeg(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3], wd);
        }
        if ((s.closed || fill) && n > 2) pushSeg(p[2 * n - 2], p[2 * n - 1], p[0], p[1], wd);
      }
    };
    const clip = () => {
      const polys = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of subs) {
        if (s.pts.length < 6) continue;
        polys.push(s.pts.slice());
        for (let i = 0; i < s.pts.length; i += 2) {
          x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]);
          y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
        }
      }
      if (!polys.length) return;
      // A single axis-aligned rectangle: its bounding box is the region.
      const box = polys.length === 1 && isAxisRect(polys[0]);
      g.clips = g.clips.concat([{ polys, x0, y0, x1, y1, box }]);
    };
    const resetPath = () => { subs = []; cur = null; };

    for (let k = 0; k < list.fnArray.length; k++) {
      const fn = list.fnArray[k], args = list.argsArray[k];
      switch (fn) {
        case OPS.save: stack.push(Object.assign({}, g)); break;
        case OPS.restore: g = stack.pop() || g; break;
        case OPS.transform: g.ctm = mul(g.ctm, args); break;
        case OPS.setLineWidth: g.lw = args[0]; break;
        case OPS.setGState:
          for (const [key, val] of args[0] || []) if (key === 'LW') g.lw = val;
          break;
        case OPS.setFillRGBColor: g.fc = rgb(args); break;
        case OPS.setStrokeRGBColor: g.sc = rgb(args); break;
        case OPS.paintFormXObjectBegin:
          stack.push(Object.assign({}, g));
          if (args[0]) g.ctm = mul(g.ctm, args[0]);
          break;
        case OPS.paintFormXObjectEnd: g = stack.pop() || g; break;
        case OPS.constructPath: {
          // pdf.js splits long paths over several constructPath ops, so the
          // path and the current point carry over from one to the next.
          const ops = args[0], co = args[1];
          let j = 0;
          for (const op of ops) {
            if (op === OPS.moveTo) { cx = sx = co[j++]; cy = sy = co[j++]; startSub(cx, cy); }
            else if (op === OPS.lineTo) { const x = co[j++], y = co[j++]; lineTo(x, y, false); cx = x; cy = y; }
            else if (op === OPS.curveTo) {
              const a = co[j++], b = co[j++], c = co[j++], d = co[j++], x = co[j++], y = co[j++];
              curveTo(a, b, c, d, x, y); cx = x; cy = y;
            } else if (op === OPS.curveTo2) { // first control point = current point
              const c = co[j++], d = co[j++], x = co[j++], y = co[j++];
              curveTo(cx, cy, c, d, x, y); cx = x; cy = y;
            } else if (op === OPS.curveTo3) { // second control point = end point
              const a = co[j++], b = co[j++], x = co[j++], y = co[j++];
              curveTo(a, b, x, y, x, y); cx = x; cy = y;
            } else if (op === OPS.closePath) {
              if (cur) cur.closed = true;
              cx = sx; cy = sy; cur = null;
            } else if (op === OPS.rectangle) {
              const x = co[j++], y = co[j++], w = co[j++], h = co[j++];
              startSub(x, y); lineTo(x + w, y, false); lineTo(x + w, y + h, false); lineTo(x, y + h, false);
              cur.closed = true; cur = null;
              cx = sx = x; cy = sy = y;
            }
          }
          break;
        }
        case OPS.stroke: case OPS.closeStroke:
          if (fn === OPS.closeStroke && cur) cur.closed = true;
          if (visible(g.sc)) paint(true, false);
          resetPath(); break;
        case OPS.fill: case OPS.eoFill:
          if (visible(g.fc)) paint(false, true);
          resetPath(); break;
        case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke:
          if (visible(g.sc)) paint(true, false);
          else if (visible(g.fc)) paint(false, true);
          resetPath(); break;
        case OPS.clip: case OPS.eoClip: clip(); break;
        case OPS.endPath: resetPath(); break;
      }
    }
    // Some exporters (Revit) draw an arc as separate one-chord paths; join
    // short segments end to end and look for swings in the chains.
    chainArcs(out, 8 * pxPerPt, (arc) => arcs.push(...arc));
    return {
      segs: new Float32Array(out), widths: new Float32Array(outW), arcs: new Float32Array(arcs),
      text: await textCentres(page, viewport, mul),
    };
  }

  // Centre and height of each run of PDF text. Walls never hold text, so a
  // "wall" with text inside is a room tag, a title box or a label.
  async function textCentres(page, viewport, mul) {
    const out = [];
    try {
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const m = mul(viewport.transform, it.transform);
        const fx = Math.hypot(m[0], m[1]) || 1, fy = Math.hypot(m[2], m[3]) || 1;
        const dx = m[0] / fx, dy = m[1] / fx, ux = m[2] / fy, uy = m[3] / fy;
        const wd = (it.width || 0) * viewport.scale, ht = fy;
        out.push(m[4] + dx * wd / 2 + ux * ht * 0.35, m[5] + dy * wd / 2 + uy * ht * 0.35, ht);
      }
    } catch (err) { /* no text layer */ }
    return new Float32Array(out);
  }

  function chainArcs(segs, maxLen, emit) {
    const key = (x, y) => Math.round(x * 20) + ',' + Math.round(y * 20);
    const at = new Map();
    const short = [];
    for (let i = 0; i < segs.length; i += 4) {
      if (Math.hypot(segs[i + 2] - segs[i], segs[i + 3] - segs[i + 1]) > maxLen) continue;
      short.push(i);
      for (const e of [0, 2]) {
        const k = key(segs[i + e], segs[i + e + 1]);
        const l = at.get(k);
        if (l) l.push(i); else at.set(k, [i]);
      }
    }
    const used = new Set();
    // The other segment meeting this one at its end e, when exactly two meet.
    const nextAt = (i, e) => {
      const l = at.get(key(segs[i + e], segs[i + e + 1]));
      return l && l.length === 2 ? (l[0] === i ? l[1] : l[0]) : -1;
    };
    for (const i0 of short) {
      if (used.has(i0)) continue;
      // Walk back to one end of the chain, then forward collecting points.
      let i = i0, e = 0, guard = 0;
      for (;;) {
        const j = nextAt(i, e);
        if (j < 0 || j === i0 || guard++ > 10000) break;
        const k = key(segs[i + e], segs[i + e + 1]);
        e = key(segs[j], segs[j + 1]) === k ? 2 : 0;
        i = j;
      }
      // Now i is an end segment and e is its free end.
      const pts = [segs[i + e], segs[i + e + 1]];
      for (guard = 0; guard < 10000; guard++) {
        used.add(i);
        const o = 2 - e;
        pts.push(segs[i + o], segs[i + o + 1]);
        const j = nextAt(i, o);
        if (j < 0 || used.has(j)) break;
        e = key(segs[j], segs[j + 1]) === key(segs[i + o], segs[i + o + 1]) ? 0 : 2;
        i = j;
      }
      if (pts.length >= 10) findArcs({ pts }, emit);
    }
  }

  function rgb(args) {
    if (typeof args[0] === 'string' && args[0][0] === '#') {
      const s = args[0];
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }
    return [args[0], args[1], args[2]];
  }

  function isAxisRect(p) {
    if (p.length !== 8) return false;
    const xs = new Set([p[0], p[2], p[4], p[6]].map((v) => Math.round(v * 100)));
    const ys = new Set([p[1], p[3], p[5], p[7]].map((v) => Math.round(v * 100)));
    return xs.size === 2 && ys.size === 2;
  }

  // Even-odd test of a point against all of a region's subpaths.
  function insideRegion(reg, x, y) {
    let inside = false;
    for (const poly of reg.polys) {
      for (let i = 0, n = poly.length, j = n - 2; i < n; j = i, i += 2) {
        const yi = poly[i + 1], yj = poly[j + 1];
        if ((yi > y) !== (yj > y) && x < (poly[j] - poly[i]) * (y - yi) / (yj - yi) + poly[i]) inside = !inside;
      }
    }
    return inside;
  }

  // A closed four-corner shape whose short sides are at most maxW long
  // becomes the line joining the middles of its short sides.
  function thinQuad(s, maxW, pushSeg) {
    const p = s.pts;
    let n = p.length / 2;
    if (n === 5 && Math.abs(p[0] - p[8]) < 0.01 && Math.abs(p[1] - p[9]) < 0.01) n = 4;
    if (n !== 4) return false;
    const L = (i) => Math.hypot(p[2 * ((i + 1) % 4)] - p[2 * i], p[2 * ((i + 1) % 4) + 1] - p[2 * i + 1]);
    const a = (L(0) + L(2)) / 2, b = (L(1) + L(3)) / 2;
    const short = Math.min(a, b), long = Math.max(a, b);
    if (short > maxW || long < 2 * short) return false;
    const mid = (i) => [(p[2 * i] + p[2 * ((i + 1) % 4)]) / 2, (p[2 * i + 1] + p[2 * ((i + 1) % 4) + 1]) / 2];
    const [m0, m1] = a < b ? [mid(0), mid(2)] : [mid(1), mid(3)];
    pushSeg(m0[0], m0[1], m1[0], m1[1], Math.max(1, short));
    return true;
  }

  // Door swings: runs of short chords that turn gently and the same way,
  // from Bezier curves or from arcs exported as polylines.
  function findArcs(s, emit) {
    const p = s.pts, n = p.length / 2;
    if (n < 4) return;
    let start = 0, prevA = null, prevL = 0, turn = 0;
    const flush = (end) => { if (end - start >= 3) fitArc(p.slice(2 * start, 2 * end + 2), emit); };
    for (let i = 0; i + 1 < n; i++) {
      const dx = p[2 * i + 2] - p[2 * i], dy = p[2 * i + 3] - p[2 * i + 1];
      const a = Math.atan2(dy, dx), l = Math.hypot(dx, dy);
      if (prevA !== null) {
        let da = a - prevA;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        const sign = Math.abs(da) > 0.005 ? Math.sign(da) : 0;
        const smooth = Math.abs(da) < 0.45 && l < 3 * prevL + 1 && prevL < 3 * l + 1 && !(turn && sign && sign !== turn);
        if (!smooth) { flush(i); start = i; turn = 0; }
        else if (sign) turn = sign;
      }
      prevA = a; prevL = l;
    }
    flush(n - 1);
  }

  // Circle through the first, middle and last points; keep it when every
  // point lies on it and it sweeps roughly a quarter turn.
  function fitArc(p, emit) {
    const n = p.length / 2, m = n >> 1;
    const ax = p[0], ay = p[1], bx = p[2 * m], by = p[2 * m + 1], cx = p[2 * n - 2], cy = p[2 * n - 1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-6) return;
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ox = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const oy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r = Math.hypot(ax - ox, ay - oy);
    if (r < 6) return;
    for (let i = 0; i < n; i++) if (Math.abs(Math.hypot(p[2 * i] - ox, p[2 * i + 1] - oy) - r) > 0.06 * r + 0.5) return;
    let sweep = 0;
    for (let i = 1; i < n; i++) {
      let da = Math.atan2(p[2 * i + 1] - oy, p[2 * i] - ox) - Math.atan2(p[2 * i - 1] - oy, p[2 * i - 2] - ox);
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      sweep += da;
    }
    sweep = Math.abs(sweep) * 180 / Math.PI;
    if (sweep < 60 || sweep > 120) return;
    emit([ox, oy, r, ax, ay, cx, cy]);
  }

  const api = { extractSegments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPVector = api;
})(typeof self !== 'undefined' ? self : this);
