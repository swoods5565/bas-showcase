# Floor Plan Cleaner

Turns an architectural floor plan PDF into a clean, transparent image of just the walls, doors and windows, ready to use as the base layer of an enteliWEB / enteliVIZ floor plan graphic.

Everything runs in the browser. Files are never uploaded anywhere.

## How to use

1. **Open** a PDF (or a PNG/JPG scan). Pick the page if the PDF has several.
2. **Crop** (C) to box in just the plan, leaving out the title block, notes and key plan.
3. **Tune** the detection sliders while watching the Overlay view:
   - *Ink darkness*: lower it to ignore gray furniture, screened backgrounds and hatching.
   - *Wall thickness, min*: anything thinner is not a wall. **Auto** estimates it from the drawing.
   - *Join double-line walls*: for walls drawn as two thin lines, set this a little wider than the gap between the lines.
   - *Widest door / window*: wall gaps up to this size are searched for door swings and window lines.
4. **Touch up** with the brushes: **Erase** (E) removes anything, **Wall** (W) and **Door/Win** (D) bring back lines from the original that were missed. Undo with Ctrl+Z.
5. **Download** a transparent PNG or a layered SVG (`walls` and `doors-windows` paths). The default canvas fits the plan inside 1920 × 1080, the ENTEC graphic size.

Pan by dragging with the Pan tool (H), the middle mouse button or with Space held. Scroll to zoom, F to fit.

## How it works

1. pdf.js renders the page. PDF text is skipped during rendering, so room names, dimensions and notes vanish without cutting the walls under them.
2. Pixels darker than the threshold become "ink".
3. Walls are the ink that survives a morphological opening sized to the minimum wall thickness: thick strokes stay, thin linework (dimensions, furniture, grids, hatching) goes. Short breaks where other lines cross a wall are mended, and small pieces and the sheet border are dropped.
4. Openings are found by closing the wall mask along rows and columns: slots about one wall thick between wall ends are door or window openings. Thin linework that touches a slot (door leaves, swings, window glazing) is kept.
5. The SVG is traced from the final masks along pixel edges and simplified (Douglas-Peucker).

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | UI, rendering, brush edits, export |
| `engine.js` | Image-processing pipeline (no DOM; runs in the worker and in Node) |
| `worker.js` | Runs the pipeline off the main thread |
| `vendor/` | pdf.js 3.11.174 (Apache-2.0) |
| `sample-plan.pdf` | Synthetic test plan used by "Try a sample plan" |

## Limits

- Works best on vector PDFs exported from CAD/Revit and clean scans. Very faint or noisy scans need a manual threshold and more brush work.
- Text drawn as vector strokes (SHX fonts) is not real PDF text, so it is removed by the thickness filter rather than the text skip; bold text may survive and need the eraser.
- Curved walls are kept, but door detection assumes openings in horizontal or vertical walls.
