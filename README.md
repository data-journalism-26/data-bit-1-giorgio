# Data Bit 1 — Cyclone Harry on the Central Mediterranean migration route

**Author:** Giorgio Coppola · **Date:** April 2026 · GRAD-E1493 Data Journalism, Hertie School

A short data journalism piece reconstructing the path of an extratropical cyclone that crossed the central Mediterranean at the end of January 2026, and overlaying the migrant shipwrecks reported during the same window. 

## Read the piece in the browser

**[Open the data bit on raw.githack.com](https://raw.githack.com/data-journalism-26/data-bit-1-giorgio/main/article.html)**

The page renders best on a real HTTP origin (like raw.githack). If you open `article.html` from disk via `file://`, the GeoJSON files for the interactive map will be blocked by the browser's same-origin policy. Locally, run a small server first:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/article.html
```

## Repository layout

```
.
├── article.html                    # article
├── data/
│   ├── united_cyclone_harry.csv    # UNITED records, filtered to the storm window
│   ├── iom_cyclone_harry.csv       # IOM records, filtered to the storm window
│   ├── incidents_united.geojson    # generated for the Leaflet map
│   ├── incidents_iom.geojson       # generated for the Leaflet map
│   └── sar_zones.geojson           # IMO Search-and-Rescue zone polygons
├── output/
│   └── video/cyclone_harry_full.mp4             # 25 s animation, 12 fps
├── scripts/
│   ├── 01_filter_cyclone_harry.R   # how the two CSVs were filtered from original data (not part of `make`; original data available upon request)
│   ├── 02_download_era5.py         # ECMWF / Copernicus CDS download via cdsapi (`make download`)
│   ├── 03_snapshot_map.R           # static snapshot (check)
│   ├── 04_animate.R                # render frames + encode MP4
│   └── 05_build_geojson.R          # CSVs + SAR RDS -> GeoJSON for the web map
├── data-bit-cyclone-harry.Rproj
├── Makefile                    # `make` rebuilds the deliverables; see "How to reproduce"
├── .gitignore                  # excludes the raw ERA5 NetCDFs and basemap tile cache
└── README.md
```

## How to reproduce

The data work is wired into a `Makefile`. From the project root:

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
- **IOM Missing Migrants Project.** Incident-level data from the International Organization for Migration. Downloadable as CSV from <https://missingmigrants.iom.int/downloads>. The CSV in this repo is filtered to Central Mediterranean route records dated 14 Jan – 17 Feb 2026.
- **IMO Search-and-Rescue zones (`data/sar_zones.geojson`).** Boundary polygons for Italy, Malta, Tunisia, and Libya, parsed from the official GML files at the IMO GISIS Global SAR Plan portal (<https://gisis.imo.org/>, registration required). The GeoJSON in this repo is the post-processed output.
- **Basemap.** CartoDB Voyager (no labels) tiles served via [maptiles](https://github.com/riatelab/maptiles), © OpenStreetMap contributors, used under ODbL.

## Methodology

The two incident CSVs are filtered from the upstream UNITED and IOM datasets: UNITED records are kept where the cause-of-death text matches "cyclone Harry" (case-insensitive regex); IOM records are kept where the route is the Central Mediterranean and the incident date falls between 14 January and 17 February 2026.

ERA5 wind speed is computed from the 10-metre u and v components and converted to km/h; the 0.25° grid is bilinearly interpolated by a factor of four for smoother colour and contour rendering. Mean sea-level pressure is converted to hPa and contoured every 4 hPa. Within the central Mediterranean (8°–22°E / 32°–42°N), the cyclone reaches its lowest pressure (994 hPa) on 22 January 2026 at 15:00 UTC.

The animation samples the full storm window at three-hour steps (~296 frames) and is encoded at 12 fps with the R `av` package; shipwrecks appear on the day they were reported, and the running counter in the lower-left sums every UNITED record up to that frame's date. The interactive Leaflet map exports each incident as a GeoJSON point keeping its date, casualty count, and free-text cause; the IMO Search-and-Rescue polygons are slightly simplified before export.

## AI disclosure

Claude Code (Anthropic) was used to support: the design of the HTML page; the data-download workflow against the Copernicus Climate Data Store API; troubleshooting and refinement of the code that produces the interactive map; supported the reproducibility pipeline; and the rendering and interactivity of the storm animation. Editorial decisions, data wrangling, analysis and interpretation, as well as the writing are the author's.

