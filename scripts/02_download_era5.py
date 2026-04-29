"""Download ERA5 hourly single-levels for the Cyclone Harry window.

Two requests, run sequentially:
  1) 2026-01-12 .. 2026-01-31
  2) 2026-02-01 .. 2026-02-17

Variables: 10m u/v wind, MSLP, total precipitation, significant wave height.
Bbox: 45N -5E 28N 25E (covers Iberian formation through eastern Mediterranean).
Resolution: native ERA5 0.25 deg.
"""

import sys
from pathlib import Path
import cdsapi

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "era5"
OUT_DIR.mkdir(parents=True, exist_ok=True)

AREA = [45, -5, 28, 25]  # N, W, S, E

VARIABLES = [
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "mean_sea_level_pressure",
    "total_precipitation",
    "significant_height_of_combined_wind_waves_and_swell",
]

HOURS = [f"{h:02d}:00" for h in range(24)]


def request(year: str, month: str, days: list[str], target: Path) -> None:
    print(f"Submitting: {target.name}", flush=True)
    c = cdsapi.Client()
    c.retrieve(
        "reanalysis-era5-single-levels",
        {
            "product_type": "reanalysis",
            "variable": VARIABLES,
            "year": year,
            "month": month,
            "day": days,
            "time": HOURS,
            "area": AREA,
            "data_format": "netcdf",
            "download_format": "unarchived",
        },
        str(target),
    )
    print(f"Wrote: {target} ({target.stat().st_size:,} bytes)", flush=True)


def jan() -> None:
    request("2026", "01",
            [f"{d:02d}" for d in range(12, 32)],
            OUT_DIR / "era5_2026-01-12_to_2026-01-31.nc")


def feb() -> None:
    request("2026", "02",
            [f"{d:02d}" for d in range(1, 18)],
            OUT_DIR / "era5_2026-02-01_to_2026-02-17.nc")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"
    if mode == "jan":
        jan()
    elif mode == "feb":
        feb()
    elif mode == "both":
        jan()
        feb()
    else:
        sys.exit(f"Unknown mode: {mode}. Use jan | feb | both")
