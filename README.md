# Meridian BAS — Building Automation Graphics Showcase

An interactive, zero-build showcase of building automation system (BAS) graphics and utility dashboards for **Meridian Tower**, a fictional four-story, 72,000 ft² office building. It runs as a static site, so it can be hosted on GitHub Pages.

Every value on every page is a live, BACnet-style point from an in-browser simulation. Outdoor air comes from **real weather for the site**.

## What's inside

| Page | Highlights |
|---|---|
| **Overview** | Auto-orbiting 3D building, live KPI ticker, 3D-tilt page tiles |
| **Building 3D (dollhouse)** | CSS-3D stacked floor plans with extruded walls, glazing and rooftop equipment. Heat-map modes: temperature, Δ setpoint, CO₂, airflow, occupancy. Drag to orbit, explode or isolate floors, click a room to open its VAV. The building's shadow follows the real sun. |
| **AHU-1** | 1920×1080 SVG graphic: damper blades rotate with position, fan speed drives rotor speed, airflow animation, coil piping. Guideline 36 sequence status, AFDD rules, and a live psychrometric process chart (OA → MA → SA). |
| **VAV summary** | Sortable table of all 40 boxes, a level × zone temperature matrix, and "rogue zone" request ranking |
| **VAV (×40)** | Terminal-unit graphic, a live G36 dual-maximum control diagram with the operating point, 62.1 ventilation math, key plan, trends, and a fault you can clear by dispatching a tech |
| **Chilled-water plant** | Variable-primary plant, 2 chillers, 2 towers, and the pumps. Gauges for kW/ton, ΔT, approach and load. |
| **Heating hot water** | Condensing boilers with animated flames, the OA reset curve, and the condensing-efficiency curve |
| **Energy & utilities** | Live demand, today's kWh/therms/gallons/CO₂, an end-use stacked profile, 12 months of history, change-point weather normalization, and EUI vs. the ENERGY STAR median |
| **Outdoor conditions** | Live weather, AQI, NWS alerts, an interactive psych chart, economizer-hour forecast, and the climate zone estimated from degree-days |
| **Alarms & events** | BACnet notification classes, acknowledgement, return-to-normal, and an event log |
| **Graphics standard** | Palette, semantic colors, value states, typography, the 1920×1080 canvas, point naming, the priority array, ISA-101, and references |

### Interactions worth trying
- **Click any value** to open the BACnet point inspector. It shows the object identifier, status flags, the 16-level priority array, and a trend. You can **write at priority 8** or relinquish the command. Commands act on the physics. For example, set `AHU-1.SF-SS` to Off and watch the zones drift and the alarms fire.
- **⌘/Ctrl-K** (or `/`) opens a command palette that searches 700+ points, all equipment and all pages.
- **HP-HMI** toggles an ISA-101 high-performance mode, where gray means normal and color is reserved for abnormal states.
- **Time-lapse 1× / 10× / 60×** speeds up the controller clock. Trim-and-respond resets, occupancy and the energy accumulators all evolve.
- **Outdoor conditions → search a city** re-drives the whole building from that city's weather, with the climate zone, economizer high limit and sun angles recalculated.

## Industry standards applied
- **ASHRAE 135 (BACnet):** object types (AI/AO/AV/BI/BO/BV/MSV), the priority array (8 = manual operator, 16 = program), status flags, Out_Of_Service, notification classes and COV increments
- **ASHRAE Guideline 36:** trim-and-respond SAT reset (55–65 °F, OAT-scheduled) and duct-static reset (0.5–1.5 in. w.c.), dual-maximum VAV logic (heating max DAT = space + 20 °F, capped at 90 °F), zone CO₂ DCV, and AFDD-style rules
- **ASHRAE 90.1:** the fixed dry-bulb economizer high limit depends on the climate zone (65 / 70 / 75 °F)
- **ASHRAE 62.1:** Vbz = Rp·Pz + Ra·Az, and system minimum OA = ΣVbz / Ev
- **ASHRAE 55:** comfort envelopes on the psychrometric chart
- **ASHRAE Handbook—Fundamentals:** Hyland–Wexler saturation pressure, with wet bulb, dew point and enthalpy at site barometric pressure
- **ASHRAE Guideline 14:** 3-parameter change-point regression with R² and CV(RMSE)
- **ENERGY STAR Portfolio Manager:** national median office EUI (site 52.9 / source 116.4 kBtu/ft²) and source-site ratios of 2.70 (electricity) and 1.05 (gas)
- **EPA:** eGRID2022 U.S. average of 823.1 lb CO₂/MWh, and 0.0053 t CO₂/therm for natural gas
- **ISA-101:** the high-performance HMI mode

## Live public data (no API keys)
| Source | Used for |
|---|---|
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Current conditions and a 24 h history + 48 h forecast (temperature, RH, dew point, wind, cloud, GHI/DNI, sunrise/sunset) |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI, PM2.5, PM10, O₃ and NO₂ |
| [Open-Meteo Historical (ERA5)](https://open-meteo.com/en/docs/historical-weather-api) | 12 months of daily mean temperature, which feed the HDD/CDD, the climate zone and the modeled utility history |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | The city search |
| [NOAA / NWS API](https://www.weather.gov/documentation/services-web-api) | Active watches and warnings (US only), merged into the alarm list |

If the APIs are unreachable, the site falls back to a deterministic synthetic climate. Weather data is provided by Open-Meteo under CC BY 4.0, and the site credits it on the home page.

## Deploy to GitHub Pages

**Option A — GitHub Actions (recommended, already configured)**
1. Create a new repository on GitHub, for example `bas-showcase`.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<you>/bas-showcase.git
   git branch -M main
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
4. The workflow `.github/workflows/pages.yml` publishes the site. When it finishes, the site is at `https://<you>.github.io/bas-showcase/`.

**Option B — Deploy from branch**
Go to **Settings → Pages → Source: Deploy from a branch** and choose `main` / `(root)`. The `.nojekyll` file makes GitHub serve the files as-is.

All paths are relative and routing is hash-based (`#/ahu`, `#/vav/VAV-3-02` …), so the site works from any sub-path and needs no server rewrites.

## Run locally
The site uses native ES modules, so serve it over HTTP. Opening it with `file://` won't work.
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Customize
- **Building, zones and loads:** `assets/js/building.js`
- **Points, sequences and physics:** `assets/js/sim.js` (every point is defined with `def()`)
- **Theme (Nord dark/light, ISA-101):** the CSS variables at the top of `assets/css/main.css`
- **Default site:** `DEFAULT_LOC` in `assets/js/weather.js`
- **Energy model and benchmark factors:** `assets/js/energymodel.js`

## Project structure
```
index.html                 app shell (loads assets/js/app.js as an ES module)
404.html, .nojekyll        GitHub Pages helpers
.github/workflows/pages.yml
assets/css/main.css        design system, theme tokens, 3D dollhouse, graphics styles
assets/js/app.js           boot sequence, router + View Transitions, point binding, inspector, palette
assets/js/sim.js           BACnet-style point database + simulation + alarm engine
assets/js/weather.js       public API client, solar position, climate-zone estimate
assets/js/psychro.js       psychrometrics (IP units)
assets/js/dollhouse.js     CSS-3D dollhouse building
assets/js/charts.js        SVG charts (line/area/stacked, bars, scatter, sparkline, gauge)
assets/js/psychchart.js    interactive psychrometric chart
assets/js/energymodel.js   hourly/daily energy model, benchmarks, change-point regression
assets/js/pages/*.js       one module per page
```

Meridian Tower and its equipment are fictional. The sequences and figures are for demonstration and are not design values.
