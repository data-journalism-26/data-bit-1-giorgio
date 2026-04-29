suppressPackageStartupMessages({
  library(dplyr)
  library(stringr)
  library(readr)
})

iom_path    <- "/Users/giorgiocoppola/Desktop/Uni/Hertie School/6th Semester/thesis-cmr-mortality/data/processed/iom_mmp_incidents.RDS"
united_path <- "/Users/giorgiocoppola/Desktop/Uni/Hertie School/6th Semester/thesis-cmr-mortality/data/processed/united_incidents.RDS"
out_dir     <- "data"

iom    <- readRDS(iom_path)
united <- readRDS(united_path)

# ---- UNITED: explicit text filter ----
united_harry <- united |>
  filter(str_detect(cause_of_death_text, regex("cyclone Harry", ignore_case = TRUE))) |>
  arrange(incident_date_clean) |>
  mutate(source_dataset = "UNITED")

# ---- IOM: Central Mediterranean, Jan 14 - Feb 17 2026 ----
iom_harry <- iom |>
  filter(Route == "Central Mediterranean",
         incident_date_clean >= as.Date("2026-01-14"),
         incident_date_clean <= as.Date("2026-02-17")) |>
  arrange(incident_date_clean) |>
  mutate(source_dataset = "IOM")

# ---- Sanity checks ----
stopifnot(nrow(united_harry) > 0, nrow(iom_harry) > 0)

cat("UNITED records:", nrow(united_harry),
    "| total deaths:", sum(united_harry$n_deaths, na.rm = TRUE), "\n")
cat("IOM    records:", nrow(iom_harry),
    "| total dead/missing:", sum(iom_harry$`No. dead/missing`, na.rm = TRUE), "\n")

cat("\nUNITED date range:",
    as.character(min(united_harry$incident_date_clean)), "to",
    as.character(max(united_harry$incident_date_clean)), "\n")
cat("IOM    date range:",
    as.character(min(iom_harry$incident_date_clean)), "to",
    as.character(max(iom_harry$incident_date_clean)), "\n")

# Coordinate completeness check (needed for the map)
cat("\nUNITED rows missing lat/lon:",
    sum(is.na(united_harry$latitude) | is.na(united_harry$longitude)), "\n")
cat("IOM    rows missing lat/lon:",
    sum(is.na(iom_harry$Latitude) | is.na(iom_harry$Longitude)), "\n")

# ---- Write CSVs ----
united_out <- file.path(out_dir, "united_cyclone_harry.csv")
iom_out    <- file.path(out_dir, "iom_cyclone_harry.csv")

write_csv(united_harry, united_out)
write_csv(iom_harry,    iom_out)

cat("\nWrote:\n  ", united_out, "\n  ", iom_out, "\n")
