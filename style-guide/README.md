# ENTEC Graphics Standard

A visual style guide for ENTEC enteliWEB / enteliVIZ graphics. Static files, no build step, relative paths only.

- **Online:** served by GitHub Pages at `/bas-showcase/style-guide/`.
- **In enteliWEB:** copy this folder to the server's public graphics folder
  (for example `.../enteliweb/public/svggraphics/graphics/style-guide/`) and add a row to the
  building's project CSV with the `URL` column set to `/enteliweb/public/svggraphics/graphics/style-guide/index.html`.
- Must be served over http(s); opening `index.html` straight from disk won't run the scripts.
- Lato loads from Google Fonts when online and falls back to the server's Lato or Arial when not.

Theme colors live in `themes.js` and `style.css` under the same names as the enteliVIZ `CSS.json` theme keys.
