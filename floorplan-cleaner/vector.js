/* Floor plan cleaner: straight line segments from a PDF page.
 *
 * CAD exports (AutoCAD, Revit, DWG TrueView) usually draw walls as two thin
 * parallel lines. Reading the vector paths gives exact lines to pair up,
 * which the raster thickness test cannot see.
 *
 * extractSegments(page, viewport, pdfjsLib) resolves to
 *   { segs: Float32Array x1,y1,x2,y2, arcs: Float32Array cx,cy,r,ax,ay,bx,by }
 * in viewport (rendered pixel) coordinates. arcs are roughly quarter-circle
 * curves, which in a floor plan are door swings.
 */
(function (root) {
  'use strict';

  async function extractSegments(page, viewport, pdfjsLib) {
    const OPS = pdfjsLib.OPS;
    const mul = pdfjsLib.Util.transform;
    const list = await page.getOperatorList();
    const out = [], arcs = [];
    let ctm = viewport.transform.slice();
    const tp = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    // A run of consecutive Bezier curves, as sampled device points.
    let chain = [];
    const flushChain = () => {
      if (chain.length >= 6) fitArc(chain, arcs);
      chain = [];
    };
    const addCurve = (m, x0, y0, x1, y1, x2, y2, x3, y3) => {
      for (let k = chain.length ? 1 : 0; k <= 4; k++) {
        const t = k / 4, u = 1 - t;
        const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        const q = tp(m, x, y);
        chain.push(q[0], q[1]);
      }
    };
    const stack = [];

    const push = (m, ax, ay, bx, by) => {
      const x1 = m[0] * ax + m[2] * ay + m[4], y1 = m[1] * ax + m[3] * ay + m[5];
      const x2 = m[0] * bx + m[2] * by + m[4], y2 = m[1] * bx + m[3] * by + m[5];
      if (x1 !== x2 || y1 !== y2) out.push(x1, y1, x2, y2);
    };

    for (let k = 0; k < list.fnArray.length; k++) {
      const fn = list.fnArray[k], args = list.argsArray[k];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (args[0]) ctm = mul(ctm, args[0]);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.constructPath) {
        const ops = args[0], co = args[1];
        let j = 0, cx = 0, cy = 0, sx = 0, sy = 0;
        for (const op of ops) {
          if (op !== OPS.curveTo && op !== OPS.curveTo2 && op !== OPS.curveTo3) flushChain();
          if (op === OPS.moveTo) { cx = sx = co[j++]; cy = sy = co[j++]; }
          else if (op === OPS.lineTo) { const x = co[j++], y = co[j++]; push(ctm, cx, cy, x, y); cx = x; cy = y; }
          else if (op === OPS.curveTo) {
            const a = co[j++], b = co[j++], c = co[j++], d = co[j++], x = co[j++], y = co[j++];
            addCurve(ctm, cx, cy, a, b, c, d, x, y); cx = x; cy = y;
          } else if (op === OPS.curveTo2) { // first control point = current point
            const c = co[j++], d = co[j++], x = co[j++], y = co[j++];
            addCurve(ctm, cx, cy, cx, cy, c, d, x, y); cx = x; cy = y;
          } else if (op === OPS.curveTo3) { // second control point = end point
            const a = co[j++], b = co[j++], x = co[j++], y = co[j++];
            addCurve(ctm, cx, cy, a, b, x, y, x, y); cx = x; cy = y;
          }
          else if (op === OPS.closePath) { push(ctm, cx, cy, sx, sy); cx = sx; cy = sy; }
          else if (op === OPS.rectangle) {
            const x = co[j++], y = co[j++], w = co[j++], h = co[j++];
            push(ctm, x, y, x + w, y); push(ctm, x + w, y, x + w, y + h);
            push(ctm, x + w, y + h, x, y + h); push(ctm, x, y + h, x, y);
            cx = sx = x; cy = sy = y;
          }
        }
        flushChain();
      }
    }
    return { segs: new Float32Array(out), arcs: new Float32Array(arcs) };
  }

  // Circle through the first, middle and last points; keep it when every
  // point lies on it and it sweeps roughly a quarter turn.
  function fitArc(p, arcs) {
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
    arcs.push(ox, oy, r, ax, ay, cx, cy);
  }

  const api = { extractSegments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPVector = api;
})(typeof self !== 'undefined' ? self : this);
