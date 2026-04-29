suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
  library(sf)
})

# Build GeoJSON files for the interactive Leaflet map:
#   data/incidents_united.geojson  -- UNITED records (Cyclone Harry window)
#   data/incidents_iom.geojson     -- IOM records (Cyclone Harry window)
#   data/sar_zones.geojson         -- IMO SAR zones (Italy / Malta / Libya / Tunisia)

SAR_RDS <- "/Users/giorgiocoppola/Desktop/Uni/Hertie School/6th Semester/thesis-cmr-mortality/data/processed/sar_zones.RDS"
sf::sf_use_s2(FALSE)

# Numbers / Excel may export CSV with ';' (European locale) or ',' (US locale).
# Detect from the header line and read accordingly.
read_smart <- function(path) {
  l1 <- readLines(path, n = 1, warn = FALSE)
  delim <- if (grepl(";", l1)) ";" else ","
  read_delim(path, delim = delim, show_col_types = FALSE)
}

# ---- UNITED ---------------------------------------------------------------
united <- read_smart("data/united_cyclone_harry.csv") |>
  filter(!is.na(latitude), !is.na(longitude))

united_sf <- united |>
  transmute(
    date     = as.character(incident_date_clean),
    n_deaths = as.integer(n_deaths),
    cause    = cause_of_death_text,
    longitude, latitude
  ) |>
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326)

st_write(united_sf, "data/incidents_united.geojson",
         driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE)
cat(sprintf("Wrote: data/incidents_united.geojson (%d records)\n", nrow(united_sf)))

# ---- IOM ------------------------------------------------------------------
iom <- read_smart("data/iom_cyclone_harry.csv") |>
  filter(!is.na(Latitude), !is.na(Longitude))

iom_sf <- iom |>
  transmute(
    date           = as.character(incident_date_clean),
    n_dead_missing = as.integer(`No. dead/missing`),
    cause          = `Cause of death (reported)`,
    location       = `Location of death`,
    country        = `Country of Incident`,
    Longitude, Latitude
  ) |>
  st_as_sf(coords = c("Longitude", "Latitude"), crs = 4326)

st_write(iom_sf, "data/incidents_iom.geojson",
         driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE)
cat(sprintf("Wrote: data/incidents_iom.geojson (%d records)\n", nrow(iom_sf)))

# ---- SAR zones ------------------------------------------------------------
sar <- readRDS(SAR_RDS) |>
  st_make_valid() |>
  st_simplify(dTolerance = 0.005)        # tiny simplification to shrink file

st_write(sar, "data/sar_zones.geojson",
         driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE)
cat(sprintf("Wrote: data/sar_zones.geojson (%d zones, %d KB)\n",
            nrow(sar),
            round(file.size("data/sar_zones.geojson") / 1024)))
