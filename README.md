# Data Bit 1 — Cyclone Harry on the Central Mediterranean migration route

**Author:** Giorgio Coppola · **Date:** April 2026 · GRAD-E1493 Data Journalism, Hertie School

A short data journalism piece reconstructing the path of an extratropical cyclone that crossed the central Mediterranean between 12 January and 17 February 2026, and overlaying the migrant shipwrecks reported during the same window. Built around three visualisations: a static snapshot at the storm's peak, a 25-second animation of the full storm window with a running death toll, and an interactive Leaflet map with hover tooltips and a UNITED ↔ IOM source toggle.

## Read the piece in the browser

**[Open the data bit on raw.githack.com →](https://raw.githack.com/data-journalism-26/data-bit-1-giorgio/main/index.html)**

The page renders best on a real HTTP origin (raw.githack works fine). If you open `index.html` from disk via `file://`, the GeoJSON files for the interactive map will be blocked by the browser's same-origin policy. Locally, run a small server first:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Repository layout

```
.
├── index.html                  # the published piece (entry point)
├── data/
│   ├── united_cyclone_harry.csv    # UNITED records, filtered to the storm window
│   ├── iom_cyclone_harry.csv       # IOM records, filtered to the storm window
│   ├── incidents_united.geojson    # generated for the Leaflet map
│   ├── incidents_iom.geojson       # generated for the Leaflet map
│   └── sar_zones.geojson           # IMO Search-and-Rescue zone polygons
├── output/
│   └── video/cyclone_harry_full.mp4             # 25 s animation, 12 fps
├── scripts/
│   ├── 01_filter_cyclone_harry.R   # methodology record: how the two CSVs were filtered (not part of `make`; needs private upstream RDS)
│   ├── 02_download_era5.py         # ECMWF / Copernicus CDS download via cdsapi (`make download`)
│   ├── 03_snapshot_map.R           # static peak snapshot with MSLP contours
│   ├── 04_animate.R                # render frames + encode MP4
│   └── 05_build_geojson.R          # CSVs + SAR RDS -> GeoJSON for the web map
├── data-bit-cyclone-harry.Rproj
├── Makefile                    # `make` rebuilds the deliverables; see "How to reproduce"
├── .gitignore                  # excludes the raw ERA5 NetCDFs and basemap tile cache
└── README.md
```

## How to reproduce

The repo ships with the filtered CSVs, the MP4, and the static PNG, so the published page works out of the box. The build is wired into a `Makefile`. From the project root:

```bash
make            # rebuild snapshot, animation, geojson (default)
make maps       # static snapshot only
make anim       # animation only (~10 min)
make geojson    # GeoJSON files consumed by the Leaflet map
make help       # list all targets
```

**One heavy step is kept out of `make all`** and must be invoked explicitly because it requires a Copernicus account (see "Source datasets" below):

```bash
make download   # re-download the ERA5 NetCDFs from Copernicus (slow)
```

**Requirements:**

- R (≥ 4.3) with `terra`, `ncdf4`, `sf`, `rnaturalearth`, `maptiles`, `tidyterra`, `ggplot2`, `ggtext`, `cowplot`, `dplyr`, `readr`, `av`
- Python (≥ 3.10) with `cdsapi` — only if you run `make download`
- A free [Copernicus CDS](https://cds.climate.copernicus.eu/) account with a `~/.cdsapirc` token — only for `make download`

## Data sources

The two incident CSVs (`data/united_cyclone_harry.csv`, `data/iom_cyclone_harry.csv`) and the SAR-zone GeoJSON ship with the repo so the build is reproducible without registering with the original sources. The ERA5 NetCDFs are the one input that requires a free Copernicus account and is therefore not committed.

- **ERA5 reanalysis — wind, mean sea-level pressure, etc.** (NetCDFs in `data/era5/`, *not committed*.) Hourly single-levels from the ECMWF reanalysis, bbox 45°N–28°N / 5°W–25°E, 0.25° grid, retrieved through the [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/). The download script (`scripts/02_download_era5.py`) hits the CDS API and requires a **free CDS account and a `~/.cdsapirc` token**. This is the only step that cannot be reproduced offline; everything downstream runs from cached files.
- **UNITED for Intercultural Action — *List of Refugee Deaths*.** A public dataset of refugee and migrant deaths recorded since 1993, distributed by the network. Available at <https://unitedagainstrefugeedeaths.eu/about-the-campaign/about-the-united-list-of-deaths/>. The CSV in this repo is filtered to records whose cause-of-death text mentions Cyclone Harry.
- **IOM Missing Migrants Project.** Incident-level data from the International Organization for Migration. Downloadable as CSV from <https://missingmigrants.iom.int/downloads> after a free email registration. The CSV in this repo is filtered to Central Mediterranean route records dated 14 Jan – 17 Feb 2026.
- **IMO Search-and-Rescue zones (`data/sar_zones.geojson`).** Boundary polygons for Italy, Malta, Tunisia, and Libya, parsed from the official GML files at the IMO GISIS Global SAR Plan portal (<https://gisis.imo.org/>, registration required). The GeoJSON in this repo is the post-processed output.
- **Basemap.** CartoDB Voyager (no labels) tiles served via [maptiles](https://github.com/riatelab/maptiles), © OpenStreetMap contributors, used under ODbL.

## AI disclosure

Claude Code (Anthropic) was used to support: the design of the HTML page; the data-download workflow against the Copernicus Climate Data Store API; troubleshooting and refinement of the code that produces the interactive map; and the rendering and interactivity of the storm animation. Editorial decisions, data wrangling, analysis and interpretation, as well as the writing are the author's.

