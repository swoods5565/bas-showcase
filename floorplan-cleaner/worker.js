/* Runs the cleanup pipeline off the main thread. */
importScripts('engine.js');

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'process') {
      const progress = (label) => self.postMessage({ type: 'progress', id: m.id, label });
      const r = FPEngine.processPlan(m.gray, m.w, m.h, m.params, progress);
      self.postMessage({ type: 'result', id: m.id, ink: r.ink, walls: r.walls, openings: r.openings },
        [r.ink.buffer, r.walls.buffer, r.openings.buffer]);
    } else if (m.type === 'estimate') {
      const ink = FPEngine.toInk(m.gray, m.w, m.h, m.threshold, m.crop);
      self.postMessage({ type: 'estimate', id: m.id, thickness: FPEngine.estimateWallThickness(ink, m.w, m.h) });
    } else if (m.type === 'svg') {
      const paths = m.layers.map((L) => {
        const loops = FPEngine.traceMask(L.mask, m.w, m.h, m.box, m.epsilon);
        return FPEngine.loopsToPath(loops, m.box.x, m.box.y, m.scale);
      });
      self.postMessage({ type: 'svg', id: m.id, paths });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
