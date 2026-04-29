suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
  library(terra)
  library(ncdf4)
  library(ggplot2)
  library(sf)
  library(rnaturalearth)
  library(maptiles)
  library(tidyterra)
  library(ggforce)
  library(ggtext)
  library(patchwork)
  library(cowplot)
})

ERA5  <- "data/era5"
TILES <- "data/tiles"
OUT   <- "output/figures"

dir.create(TILES, showWarnings = FALSE, recursive = TRUE)
dir.create(OUT,   showWarnings = FALSE, recursive = TRUE)
sf::sf_use_s2(FALSE)
Sys.setlocale("LC_TIME", "en_US.UTF-8")

# ---- 1. ERA5 atmospheric data ----
u10 <- rast(file.path(ERA5, "jan_atm_instant.nc"), subds = "u10")
v10 <- rast(file.path(ERA5, "jan_atm_instant.nc"), subds = "v10")
msl <- rast(file.path(ERA5, "jan_atm_instant.nc"), subds = "msl")

nc <- nc_open(file.path(ERA5, "jan_atm_instant.nc"))
times <- as.POSIXct("1970-01-01", tz = "UTC") + ncvar_get(nc, "valid_time")
nc_close(nc)
stopifnot(nlyr(u10) == length(times))

# ---- 2. Pick timestep ----
storm_box <- ext(8, 22, 32, 42)
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0 || tolower(args[1]) == "peak") {
  harry_window <- which(times >= as.POSIXct("2026-01-16", tz = "UTC") &
                        times <= as.POSIXct("2026-01-23 23:00:00", tz = "UTC"))
  msl_box <- crop(msl[[harry_window]], storm_box)
  mins <- global(msl_box, "min", na.rm = TRUE)$min
  peak_idx <- harry_window[which.min(mins)]
} else {
  target <- as.POSIXct(args[1], tz = "UTC")
  peak_idx <- which.min(abs(as.numeric(times - target)))
  if (abs(as.numeric(times[peak_idx] - target, units = "hours")) > 0.5)
    stop("Requested time not within available timesteps: ", args[1])
}

peak_time <- times[peak_idx]
peak_msl  <- as.numeric(global(msl[[peak_idx]] / 100, "min", na.rm = TRUE))
cat(sprintf("Snapshot: %s UTC | min MSLP %.1f hPa\n",
            format(peak_time, "%Y-%m-%d %H:%M"), peak_msl))

# ---- 3. Wind speed at that timestep (km/h, bilinear-smoothed) ----
u  <- u10[[peak_idx]]
v  <- v10[[peak_idx]]
ws <- sqrt(u^2 + v^2) * 3.6                 # m/s -> km/h
ws <- terra::disagg(ws, fact = 4, method = "bilinear")
names(ws) <- "wind"

# MSLP at the same timestep, in hPa, smoothed for nicer contour curves.
msl_at <- msl[[peak_idx]] / 100
msl_at <- terra::disagg(msl_at, fact = 4, method = "bilinear")
names(msl_at) <- "msl"
msl_df <- as.data.frame(msl_at, xy = TRUE)

# ---- 4. Bounding box and world layer ----
MAP_X <- c(5, 22)
MAP_Y <- c(29, 42)

bbox_sf <- st_as_sfc(st_bbox(c(xmin = MAP_X[1] - 0.5, ymin = MAP_Y[1] - 0.5,
                               xmax = MAP_X[2] + 0.5, ymax = MAP_Y[2] + 0.5),
                             crs = 4326))

# Use medium-detail mask (lighter polygons -> much less memory while masking
# the OSM raster). Coastline drawn on top uses the high-detail version.
world_mask <- ne_countries(scale = "medium", returnclass = "sf")
coast      <- ne_coastline(scale = "large",  returnclass = "sf")

# Wind kept on full extent — OSM masked to land covers it cleanly at the coast.
ws_df <- as.data.frame(ws, xy = TRUE)

# Helper: fetch tiles, mask to land. The masked tile is cached to disk so
# subsequent runs skip the expensive mask step entirely.
get_basemap <- function(provider) {
  cache_file <- file.path(TILES, paste0(gsub("[^A-Za-z0-9]+", "-", provider),
                                        "_z8_masked.tif"))
  if (file.exists(cache_file)) return(rast(cache_file))

  tile <- maptiles::get_tiles(bbox_sf, provider = provider,
                              zoom = 8, crop = TRUE,
                              cachedir = TILES, forceDownload = FALSE)
  if (!terra::same.crs(tile, "EPSG:4326")) tile <- project(tile, "EPSG:4326")
  masked <- mask(tile, vect(world_mask))
  writeRaster(masked, cache_file, datatype = "INT1U", overwrite = TRUE)
  masked
}

# Story-relevant places to label (basemap is no-labels).
# Real lon/lat for the dot; `pos` says where the label sits relative to the dot:
#   "right" | "left" | "above" | "below"
cities <- tibble::tribble(
  ~name,             ~lon,    ~lat,    ~pos,
  "Tunis",            10.18,   36.81,   "left",
  "Sfax",             10.76,   34.74,   "left",
  "Tripoli",          13.18,   32.89,   "below",
  "Algiers",           3.06,   36.75,   "right",
  "Palermo",          13.36,   38.12,   "below",
  "Catania",          15.09,   37.50,   "right",
  "Cagliari",          9.11,   39.22,   "below",
  "Valletta",         14.51,   35.90,   "below",
  "Lampedusa",        12.60,   35.50,   "right",
  "Reggio Calabria",  15.65,   38.11,   "right",
  "Benghazi",         20.06,   32.12,   "left",
  "Napoli",           14.23,   40.85,   "above"
) |>
  dplyr::mutate(
    nx = dplyr::case_when(pos == "right" ~  0.15, pos == "left" ~ -0.15, TRUE ~ 0),
    ny = dplyr::case_when(pos == "above" ~  0.16, pos == "below" ~ -0.16, TRUE ~ 0),
    hj = dplyr::case_when(pos == "right" ~  0,    pos == "left" ~  1,    TRUE ~ 0.5),
    vj = dplyr::case_when(pos == "above" ~  0,    pos == "below" ~  1,   TRUE ~ 0.5)
  )
seas <- tibble::tribble(
  ~name,                      ~lon,   ~lat,
  "Mediterranean Sea",         16.0,   35.0,
  "Strait of Sicily",          12.6,   36.6,
  "Tyrrhenian Sea",            12.2,   40.0,
  "Ionian Sea",                18.5,   37.5
)

# ---- 5. Shipwrecks ----
# Numbers / Excel may export CSV with ';' (Italian locale) or ',' — auto-detect.
.read_smart <- function(p) {
  l1 <- readLines(p, n = 1, warn = FALSE)
  read_delim(p, delim = if (grepl(";", l1)) ";" else ",",
             show_col_types = FALSE)
}
united <- .read_smart("data/united_cyclone_harry.csv")
united_at <- united |> filter(incident_date_clean <= as.Date(peak_time))
cat(sprintf("UNITED records up to that time: %d (deaths %d)\n",
            nrow(united_at), sum(united_at$n_deaths, na.rm = TRUE)))

# Global maxima for legend reference. Cached to disk so we only compute once.
CACHE_FILE <- file.path(ERA5, "_globals.rds")
if (file.exists(CACHE_FILE)) {
  globals <- readRDS(CACHE_FILE)
  max_deaths_global <- globals$max_deaths_global
  max_wind_global   <- globals$max_wind_global
  max_wind_lim      <- globals$max_wind_lim
} else {
  max_deaths_global <- max(united$n_deaths, na.rm = TRUE)
  ws_jan_all        <- sqrt(u10^2 + v10^2) * 3.6
  max_wind_global   <- max(global(ws_jan_all, "max", na.rm = TRUE)$max, na.rm = TRUE)
  max_wind_lim      <- ceiling(max_wind_global / 5) * 5
  saveRDS(list(max_deaths_global = max_deaths_global,
               max_wind_global   = max_wind_global,
               max_wind_lim      = max_wind_lim),
          CACHE_FILE)
}
cat(sprintf("Global max: wind = %.1f km/h | deaths in one record = %d\n",
            max_wind_global, max_deaths_global))

# ---- 6. Style ----
# White -> pale blue (calm) -> green/yellow (moderate) -> orange/red (strong)
# -> dark red (peak). Break ratios are scaled to the *actual* data max so the
# deepest red lines up with the highest wind in the dataset.
wind_colours <- c("#FFFFFF", "#D2EAF7", "#9EC8E8", "#7DCC4E",
                  "#FFE74C", "#FFA500", "#FF4500", "#9C1F1F")
.wind_ratios <- c(0, 10, 20, 30, 50, 75, 100, 120) / 120
wind_breaks  <- round(.wind_ratios * max_wind_lim, 1)

base_theme <- theme_minimal(base_size = 11) +
  theme(panel.background = element_rect(fill = NA, colour = NA),
        panel.grid.major = element_line(colour = "grey92", linewidth = 0.2),
        panel.grid.minor = element_blank(),
        plot.title    = element_text(size = 13, face = "bold"),
        plot.subtitle = element_text(size = 9.5, colour = "grey45"),
        axis.text     = element_blank(),
        axis.ticks    = element_blank(),
        legend.position = "bottom",
        legend.box      = "horizontal",
        legend.justification = "center",
        legend.box.just      = "center",
        legend.box.spacing = unit(8, "pt"),
        legend.spacing.x   = unit(20, "pt"),
        legend.key.size = unit(0.55, "cm"),
        legend.title    = element_text(size = 9),
        legend.text     = element_text(size = 8),
        legend.margin   = margin(t = 4, b = 0))

n_wrecks_at <- nrow(united_at)
n_deaths_at <- sum(united_at$n_deaths, na.rm = TRUE)

date_label_html <- paste0(
  "<span style='font-size:12pt;color:#1a1a1a'><b>",
  format(peak_time, "%d %B %Y", tz = "Europe/Rome"),
  "</b></span><br>",
  "<span style='font-size:10pt;color:#666666'>",
  format(peak_time, "%H:%M %Z", tz = "Europe/Rome"),
  "</span><br>",
  "<span style='font-size:6pt'>&nbsp;</span><br>",
  "<span style='font-size:9.5pt;color:#666666'>Reported shipwrecks: ",
  "<span style='color:#7A1B1B'><b>", n_wrecks_at, "</b></span></span><br>",
  "<span style='font-size:9.5pt;color:#666666'>Estim. dead or missing: ",
  "<span style='color:#7A1B1B'><b>",
  format(n_deaths_at, big.mark = ","),
  "</b></span></span>"
)
date_box <- tibble::tibble(
  x = MAP_X[1] + 0.25,
  y = MAP_Y[1] + 0.25,
  label = date_label_html
)

# ---- 7. Build a plot for a given provider ----
build_plot <- function(provider, maxcell = Inf) {
  base_tile <- get_basemap(provider)

  ggplot() +
    geom_raster(data = ws_df, aes(x = x, y = y, fill = wind), alpha = 0.88) +
    scale_fill_gradientn(
      colours = wind_colours,
      values  = scales::rescale(wind_breaks),
      limits  = c(0, max_wind_lim),
      breaks  = unique(c(0, 30, 60, max_wind_lim)),
      name    = "Wind speed\n(km/h)") +
    geom_spatraster_rgb(data = base_tile, alpha = 1, maxcell = maxcell) +
    geom_sf(data = coast, colour = "grey20", linewidth = 0.18) +
    geom_contour(data = msl_df,
                 aes(x = x, y = y, z = msl, colour = after_stat(level)),
                 linewidth = 0.5, alpha = 0.9,
                 breaks = seq(980, 1024, by = 4)) +
    scale_colour_distiller(palette = "Blues", direction = -1,
                           name = "Pressure\n(hPa)",
                           limits = c(984, 1024),
                           breaks = c(984, 1004, 1024)) +
    geom_text(data = seas, aes(x = lon, y = lat, label = name),
              size = 4.2, fontface = "italic", colour = "grey25", alpha = 0.85) +
    geom_point(data = cities, aes(x = lon, y = lat),
               size = 0.9, colour = "grey10") +
    geom_text(data = cities,
              aes(x = lon + nx, y = lat + ny, label = name,
                  hjust = hj, vjust = vj),
              size = 3.6, fontface = "bold", colour = "grey10") +
    ggtext::geom_richtext(
      data = date_box,
      aes(x = x, y = y, label = label),
      hjust = 0, vjust = 0,
      family = "sans",
      lineheight = 1.25,
      fill = scales::alpha("white", 0.93),
      label.colour = "grey55",
      label.padding = unit(c(6, 10, 6, 10), "pt"),
      label.r = unit(3, "pt"),
      label.size = 0.4
    ) +
    # n=1: solid red point. n>1: alpha bubble with border.
    geom_point(data = dplyr::filter(united_at, n_deaths == 1),
               aes(x = longitude, y = latitude),
               shape = 16, colour = "#D32F2F", size = 1.4, alpha = 0.95) +
    geom_point(data = dplyr::filter(united_at, n_deaths > 1),
               aes(x = longitude, y = latitude, size = n_deaths),
               shape = 21, fill = "#D32F2F", colour = "#7A1B1B",
               stroke = 0.5, alpha = 0.65) +
    scale_size_continuous(
      range     = c(3, 14),
      transform = "sqrt",
      limits    = c(1, max_deaths_global),
      breaks    = unique(c(1, 10, 100, max_deaths_global)),
      name      = "Number of deaths per shipwreck") +
    guides(
      fill = guide_colourbar(
        title.position = "top",
        barwidth = unit(5, "cm"),
        barheight = unit(0.35, "cm"),
        order = 1),
      colour = guide_colourbar(
        title.position = "top",
        barwidth = unit(3.5, "cm"),
        barheight = unit(0.35, "cm"),
        reverse = TRUE,
        order = 2),
      size = guide_legend(
        direction = "horizontal",
        title.position = "top",
        label.position = "bottom",
        nrow = 1,
        override.aes = list(fill = "#D32F2F", colour = "#7A1B1B",
                            stroke = 0.5, alpha = 0.65),
        order = 3)) +
    coord_sf(xlim = MAP_X, ylim = MAP_Y, expand = FALSE) +
    labs(title    = "Cyclone Harry over the Central Mediterranean migration route",
         subtitle = "More than 1,000 people are presumed to have died crossing the route at the end of January, during the storm.",
         caption  = paste0(
           "**Data sources:** ",
           "Wind: hourly ERA5 reanalysis (ECMWF / Copernicus Climate Data Store). ",
           "Shipwrecks: UNITED for Intercultural Action, List of Refugee Deaths. ",
           "Basemap: CartoDB · OpenStreetMap contributors (ODbL).<br>",
           "**Notes:** ",
           "Each red circle marks a reported sinking or body recovery; circle size scales with the ",
           "number of dead or missing. Many bodies were never recovered."
         ),
         x = NULL, y = NULL) +
    base_theme +
    theme(plot.title    = element_text(size = 18, face = "bold", colour = "grey5"),
          plot.subtitle = element_text(size = 12, colour = "grey25", lineheight = 1.15,
                                       margin = margin(t = 2, b = 6)),
          plot.caption  = ggtext::element_textbox_simple(
            size = 10, colour = "grey25", hjust = 0,
            lineheight = 1.35,
            padding = margin(8, 10, 8, 10),
            margin  = margin(t = 10),
            fill = "grey97", box.color = "grey55", linewidth = 0.4,
            r = unit(2, "pt")))
}

# ---- 8. Render ----
# Usage: Rscript 03_snapshot_map.R peak     (final quality, DPI 280)
PROVIDER   <- "CartoDB.VoyagerNoLabels"
RENDER_DPI <- 280
RENDER_W   <- 9
RENDER_H   <- 10.5
cat(sprintf("Rendering: %s | %gx%g in @ %d dpi\n",
            PROVIDER, RENDER_W, RENDER_H, RENDER_DPI))

stamp    <- format(peak_time, "%Y-%m-%d_%H%MZ")
p        <- build_plot(PROVIDER, maxcell = Inf)
out_file <- file.path(OUT, paste0("snapshot_", stamp, "_mslp.png"))
ggsave(out_file, p, width = RENDER_W, height = RENDER_H, dpi = RENDER_DPI)
cat("Saved:", out_file, "\n")
