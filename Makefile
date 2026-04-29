# Reproducible build for the Cyclone Harry data bit.
#
# Default target rebuilds the three deliverables (static snapshot, animation,
# GeoJSON for the Leaflet map) from the cached CSVs and ERA5 NetCDFs.
#
# Heavy steps that touch external resources or overwrite the curated CSVs
# (`filter`, `download`) are phony and must be invoked explicitly.

R       := Rscript
PY      := python3

# ---- Outputs ----
CSV_UNITED := data/united_cyclone_harry.csv
CSV_IOM    := data/iom_cyclone_harry.csv

NC_JAN := data/era5/jan_atm_instant.nc
NC_FEB := data/era5/feb_atm_instant.nc

SNAPSHOT := output/figures/snapshot_2026-01-22_1500Z_mslp.png
VIDEO    := output/video/cyclone_harry_full.mp4
GEOJSON  := data/incidents_united.geojson

.PHONY: all maps anim geojson download clean help
.DEFAULT_GOAL := all

# ---- Default: rebuild visualisations ----
all: $(SNAPSHOT) $(VIDEO) $(GEOJSON)

maps:    $(SNAPSHOT)
anim:    $(VIDEO)
geojson: $(GEOJSON)

# Static snapshot at the storm peak with MSLP contours.
$(SNAPSHOT): scripts/03_snapshot_map.R $(CSV_UNITED) $(NC_JAN)
	$(R) $< peak

# 25-second animation across the whole storm window.
# Depends on the snapshot because script 03 builds the masked basemap tile
# cache and the _globals.rds that script 04 reads from disk.
$(VIDEO): scripts/04_animate.R $(SNAPSHOT) $(CSV_UNITED) $(NC_JAN) $(NC_FEB)
	$(R) $< full

# GeoJSON layers consumed by the Leaflet map. Script 05 emits three files;
# we declare one representative output here.
$(GEOJSON): scripts/05_build_geojson.R $(CSV_UNITED) $(CSV_IOM)
	$(R) $<

# ---- Manual / heavy step (NOT in `all`) ----

# Re-download the ERA5 NetCDFs from Copernicus CDS.
# REQUIRES a free CDS account and a ~/.cdsapirc token, plus minutes-to-hours
# of queue time. Skip unless the .nc files are actually missing.
download:
	$(PY) scripts/02_download_era5.py both

# ---- Cleanup ----
clean:
	rm -f $(SNAPSHOT) $(VIDEO)
	rm -f data/incidents_united.geojson data/incidents_iom.geojson data/sar_zones.geojson
	rm -rf output/frames

help:
	@echo "Targets:"
	@echo "  make            -> build snapshot, animation, geojson (default)"
	@echo "  make maps       -> static snapshot only"
	@echo "  make anim       -> animation only"
	@echo "  make geojson    -> GeoJSON files for the Leaflet map"
	@echo "  make download   -> re-download ERA5 from Copernicus (NEEDS CDS ACCOUNT)"
	@echo "  make clean      -> remove generated visualisations"
