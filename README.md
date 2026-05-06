# Data Bit 1 — More than 40,000 dead or missing at sea reaching Europe since 2014. The real number is higher.

**Author:** Giorgio Coppola · **Date:** May 2026 · GRAD-E1493 Data Journalism, Hertie School

A short interactive piece on the **IOM Missing Migrants Project** record (2014–2026), restricted to the five sea corridors to Europe — Central, Western and Eastern Mediterranean, the Atlantic route to the Canary Islands, and the English Channel. Death points are coloured by sea corridor and overlaid on the broader African and Eurasian migration-route network. The map has a month-level period slider (with month/year dropdowns) and four filters: sea corridor, region of origin, cause of death, and incident size.

Current dataset: **3,394 events · 40,665 dead or missing**, January 2014 through early May 2026.

## View

**[Open on raw.githack.com](https://raw.githack.com/data-journalism-26/data-bit-1-giorgio/main/article.html)** · or run a local server:

```bash
make serve
# http://localhost:8000/article.html
```

(Opening `article.html` directly via `file://` will fail — `fetch()` can't read local GeoJSON.)

## Layout

```
.
├── article.html          # HTML shell + article copy + methodology dropdown
├── assets/
│   ├── style.css         # all visual styling
│   ├── article.js        # Leaflet setup, render, filters, slider, legend
│   └── scrollytelling.js # IntersectionObserver scene reveal
├── data/
│   ├── raw/              # iom_europe.csv (curated input)
│   └── built/            # routes.json + incidents_iom.geojson (fetched by the page)
├── R/                    # build scripts (R 01 → 03 produce the runtime artefacts)
├── Makefile
└── README.md
```

### Where to edit what

- **Route geometry** (corridor polylines, hubs, palette, sea-route arrival cities) → `R/03_build_routes.R`, then `make routes`
- **Map / filter behaviour** (Leaflet, slider, dropdowns) → `assets/article.js`
- **Visual styling** → `assets/style.css`
- **Article copy + methodology dropdown** → `article.html`
- **Incident data pipeline** (CSV → GeoJSON, including the English Channel sea/coast filter) → `R/02_build_geojson.R`, then `make geojson`

## Rebuilding the data

The runtime artefacts in `data/built/` ship with the repo, so `make serve` works out of the box. To regenerate them from the curated IOM CSV in `data/raw/`:

```bash
make            # rebuilds GeoJSON + routes.json
make serve      # preview at http://localhost:8000
```

To pull newer IOM data: download the latest [MissingMigrants-Global-*.csv](https://missingmigrants.iom.int/downloads), drop it into `data/raw/`, and run `make update`. New Main IDs are appended; the GeoJSON is rebuilt.

The R scripts use `dplyr`, `readr`, `sf`, `lubridate`, `stringr`, `rnaturalearth`, `jsonlite`, `tibble`. The full pipeline isn't fully reproducible end-to-end — `R/01_filter_europe.R` reads from a private RDS — but everything from the curated CSV onward is.

## Sources

- **IOM Missing Migrants Project** — <https://missingmigrants.iom.int/downloads>. Incident-level data; cumulative roll-ups dropped so events aren't double-counted.
- **Basemap** — CartoDB Positron, © OpenStreetMap contributors, ODbL.
- **Migration-route overlay** — hand-digitized 62 corridor polylines + 12 main migration hubs + 4 sea-route arrival points (Lampedusa, Lesbos, Canary Islands, Almería), traced from IOM's [Global Overview of Migration Routes](https://dtm.iom.int/global-overview-of-migration-routes-portal) portal. Geometry is approximate; corridor countries were sanity-checked against IOM DTM displacement data.

## Methodology (brief)

- **Sea-routes scope.** The GeoJSON is restricted to the five sea corridors connecting to Europe. Land routes (Sahara desert, Türkiye–Europe land, Western Balkans, Belarus–EU, Italy–France, Ukraine → Europe) and post-arrival deaths inside Europe are filtered out at build time.
- **English Channel filter.** Because IOM's *Mainland Europe to the UK* bucket mixes Channel-crossing drownings with inland truck and motorway deaths, that route alone is restricted spatially: incidents must fall in the Channel itself or within 5 km of the French or British coast.
- **One feature = one event.** Rows sharing (lat, lon, date) are aggregated; `n_dead` is summed and the underlying row count surfaces in the tooltip.
- **Coordinate cleanup.** Each (lat, lon) is checked against the named country of incident; rows farther than 500 km are tested for a longitude sign-flip, lat-lon swap, or both, and the variant kept only if it lands within 200 km of the country polygon. Unrescuable rows are dropped.
- For the full walkthrough, see the *Data and methods* dropdown at the bottom of the article.

## AI disclosure

Claude Code (Anthropic) was used to support the design of the page, the troubleshooting and refinement of the map code, and the build pipeline. Editorial decisions, data wrangling, analysis, interpretation, and writing are the author's.
