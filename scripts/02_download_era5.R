suppressPackageStartupMessages({
  library(ecmwfr)
})

out_dir <- "data/era5"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

# Bbox covering full Cyclone Harry footprint:
#   north 45 (Alps/Balkans), west -5 (Iberian formation),
#   south 28 (Libya coast),  east 25 (Greece)
# ecmwfr expects c(N, W, S, E)
AREA <- c(45, -5, 28, 25)

VARIABLES <- c(
  "10m_u_component_of_wind",
  "10m_v_component_of_wind",
  "mean_sea_level_pressure",
  "total_precipitation",
  "significant_height_of_combined_wind_waves_and_swell"
)

HOURS <- sprintf("%02d:00", 0:23)

# ---- 1) Tiny test pull: 1 timestep, 1 variable, ~10 KB ----
download_test <- function() {
  req <- list(
    dataset_short_name = "reanalysis-era5-single-levels",
    product_type       = "reanalysis",
    variable           = "mean_sea_level_pressure",
    year               = "2026",
    month              = "01",
    day                = "20",
    time               = "12:00",
    area               = AREA,
    data_format        = "netcdf",
    download_format    = "unarchived",
    target             = "era5_test.nc"
  )
  message("Submitting test request to CDS...")
  wf_request(request = req, transfer = TRUE, path = out_dir,
             time_out = 600, verbose = TRUE)
}

# ---- 2) Full pulls: one request per month ----
download_window <- function(year, month, days, target) {
  req <- list(
    dataset_short_name = "reanalysis-era5-single-levels",
    product_type       = "reanalysis",
    variable           = VARIABLES,
    year               = as.character(year),
    month              = sprintf("%02d", month),
    day                = sprintf("%02d", days),
    time               = HOURS,
    area               = AREA,
    data_format        = "netcdf",
    download_format    = "unarchived",
    target             = target
  )
  message("Submitting full request: ", target)
  wf_request(request = req, transfer = TRUE, path = out_dir,
             time_out = 7200, verbose = TRUE)
}

# Allow piecewise execution from the command line:
#   Rscript 02_download_era5.R test
#   Rscript 02_download_era5.R jan
#   Rscript 02_download_era5.R feb
args <- commandArgs(trailingOnly = TRUE)
mode <- if (length(args) == 0) "test" else args[1]

if (mode == "test") {
  f <- download_test()
  cat("Test file:", f, "\n")
  cat("Size (bytes):", file.size(f), "\n")
} else if (mode == "jan") {
  download_window(2026, 1, 12:31, "era5_2026-01-12_to_2026-01-31.nc")
} else if (mode == "feb") {
  download_window(2026, 2, 1:17, "era5_2026-02-01_to_2026-02-17.nc")
} else if (mode == "both") {
  download_window(2026, 1, 12:31, "era5_2026-01-12_to_2026-01-31.nc")
  download_window(2026, 2, 1:17,  "era5_2026-02-01_to_2026-02-17.nc")
} else {
  stop("Unknown mode: ", mode, ". Use test | jan | feb | both")
}
