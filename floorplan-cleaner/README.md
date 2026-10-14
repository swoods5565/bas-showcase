# Floor Plan Cleaner

Turns an architectural floor plan PDF into a clean, transparent image of just the walls, doors and windows, ready to use as the base layer of an enteliWEB / enteliVIZ floor plan graphic.

Everything runs in the browser. Files are never uploaded anywhere.

## How to use

1. **Open** a PDF (or a PNG/JPG scan). Pick the page if the PDF has several.
2. **Crop** (C) to box in just the plan, leaving out the title block, notes and key plan.
3. **Tune** the detection sliders while watching the Overlay view:
   - *Ink darkness*: lower it to ignore gray furniture, screened backgrounds and hatching.
   - *Wall thickness, min*: anything thinner is not a wall. **Auto** estimates it from the drawing.
   - *Read wall lines from the PDF* / *Double-line wall, widest*: for CAD drawings (AutoCAD, Revit, DWG TrueView) where walls are two thin parallel lines. Set the width a little wider than the thickest wall.
   - *Join double-line walls (scans)*: the same idea for scanned or flattened plans, done on pixels.
   - *Widest door / window*: wall gaps up to this size are searched for door swings and window lines.
4. **Touch up** with the brushes: **Erase** (E) removes anything, **Wall** (W) and **Door/Win** (D) bring back lines from the original that were missed. Undo with Ctrl+Z.
5. **Download** a transparent PNG or a layered SVG (`walls` and `doors-windows` paths). The default canvas fits the plan inside 1920 × 1080, the ENTEC graphic size.

Pan by dragging with the Pan tool (H), the middle mouse button or with Space held. Scroll to zoom, F to fit.

## How it works

1. pdf.js renders the page. PDF text is skipped during rendering, so room names, dimensions and notes vanish without cutting the walls under them.
2. Pixels darker than the threshold become "ink". For vector PDFs the straight lines and arcs are also read from the page.
3. Walls are the ink that survives a morphological opening sized to the minimum wall thickness: thick strokes stay, thin linework (dimensions, furniture, grids, hatching) goes. Short breaks where other lines cross a wall are mended, and small pieces and the sheet border are dropped.
4. Double-line walls (vector PDFs): parallel lines a wall's width apart that run alongside each other become a filled wall. Only painted lines count (clipping paths and white masks are skipped), thin filled rectangles count as one line (Revit draws lines this way), and broken pieces of one line are joined first. A pair is ruled out when a third parallel line runs just outside it (stair treads), when PDF text sits between the lines (room tags, title boxes), or when either line carries 45° ticks (dimension strings). Lines between the pair along part of its length are a window; along all of it, glazing such as a curtain wall. Corners and end caps are filled afterwards. When a drawing has double-line walls, thick single strokes (match lines, symbols) are not treated as walls.
5. Door swings (vector PDFs): quarter-circle arcs, whether drawn as curves or as runs of short straight pieces, are door swings. The arc's centre is the hinge, and the strip from hinge to the far jamb is cut out of the wall as the opening.
6. Openings are found by closing the wall mask along rows and columns: slots about one wall thick between wall ends are door or window openings. Thin linework that touches a slot (door leaves, swings, window glazing) is kept.
7. The SVG is traced from the final masks along pixel edges and simplified (Douglas-Peucker).

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | UI, rendering, brush edits, export |
| `engine.js` | Image-processing pipeline (no DOM; runs in the worker and in Node) |
| `vector.js` | Reads line segments and door-swing arcs from a PDF page |
| `worker.js` | Runs the pipeline off the main thread |
| `vendor/` | pdf.js 3.11.174 (Apache-2.0) |
| `sample-plan.pdf` | Synthetic test plan used by "Try a sample plan" |

## Limits

- Works best on vector PDFs exported from CAD/Revit and clean scans. Very faint or noisy scans need a manual threshold and more brush work.
- Text drawn as vector strokes (SHX fonts) is not real PDF text, so it is removed by the thickness filter rather than the text skip; bold text may survive and need the eraser.
- Curved walls are not paired as double-line walls, and raster door detection assumes horizontal or vertical walls (vector door swings work at any angle).

## Claude version

`claude-page/` holds the claude.ai Artifact version of this tool. It loads the same `app.js`, `engine.js`, `vector.js` and `worker.js`, and adds `claude.js`:

- **Find the plan**: Claude looks at the whole sheet and returns the plan's box, leaving out the title block, key plan, notes and logos. The box edges then move out to the nearest blank paper without crossing the title block border.
- **Review result**: Claude compares the original with the result (in 2 × 2 tiles on big plans), lists missed walls, doors and windows and things that should not be there, and can suggest setting changes. Each fix is an edit you can undo.
- **Lessons**: a shared list stored in the Artifact's database. Claude reads it on every request, and can suggest new lessons from a review or from your brush edits.

It is published with `claude-page/page.html` as the page and the other files at the same relative paths (`vendor/` included). It needs the `sample` (with images), `db` and `downloads` capabilities. The GitHub Pages version does not use it.
