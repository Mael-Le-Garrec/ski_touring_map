#!/usr/bin/env python3
"""
Local elevation API server.

Exposes a single endpoint that is API-compatible with Open-Meteo:
    GET /v1/elevation?latitude=47.1,47.2&longitude=4.7,4.8
    → {"elevation": [1234.5, 2345.6]}

Start:
    uvicorn server:app --host 0.0.0.0 --port 8765

Environment variables:
    ELEVATION_ALLOWED_ORIGINS — Comma-separated list of allowed CORS origins.
                                 Default: https://maps.hatrix.fr
    ELEVATION_MAX_POINTS       — Maximum number of coordinate pairs per request (default: 500).
"""

import os
import threading
from typing import List, Optional

import rasterio
from rasterio.transform import rowcol
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

TIFF_PATH = os.path.join(os.path.dirname(__file__), "data", "elevation.tif")

_DEFAULT_ORIGINS = "https://maps.hatrix.fr"
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ELEVATION_ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]
MAX_POINTS      = int(os.environ.get("ELEVATION_MAX_POINTS", "500"))

# Disable /docs and /redoc in production — elevation data is not sensitive but
# there is no reason to advertise the API surface publicly.
app = FastAPI(title="Local Elevation API", docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# -- Dataset handle (opened once, band cached) --------------------------------

_ds_lock = threading.Lock()
_ds:   Optional[rasterio.DatasetReader] = None
_band: Optional[object] = None  # numpy ndarray — cached after first read


def _get_dataset():
    global _ds, _band
    if _ds is None:
        with _ds_lock:
            if _ds is None:
                if not os.path.exists(TIFF_PATH):
                    raise RuntimeError(
                        f"Elevation file not found: {TIFF_PATH}\n"
                        "Run  python download.py  first."
                    )
                _ds = rasterio.open(TIFF_PATH)
                _band = _ds.read(1)   # read once, cache for all requests
    return _ds, _band


@app.on_event("startup")
def _startup():
    """Open the dataset and cache the band at startup."""
    try:
        ds, _ = _get_dataset()
        print(f"Elevation file   : {TIFF_PATH}")
        print(f"CRS              : {ds.crs}")
        print(f"Bounds           : {ds.bounds}")
        print(f"Resolution       : {ds.res} degrees/pixel")
        print(f"Allowed origins  : {ALLOWED_ORIGINS}")
        print(f"Max points/req   : {MAX_POINTS}")
    except RuntimeError as exc:
        print(f"WARNING: {exc}")


def _sample_elevations(latitudes: List[float], longitudes: List[float]) -> List[float]:
    ds, band = _get_dataset()
    nodata   = ds.nodata
    results: List[float] = []

    for lat, lon in zip(latitudes, longitudes):
        try:
            row, col = rowcol(ds.transform, lon, lat)
            if 0 <= row < band.shape[0] and 0 <= col < band.shape[1]:
                value = float(band[row, col])
                if nodata is not None and value == nodata:
                    value = 0.0
            else:
                value = 0.0
        except Exception:
            value = 0.0
        results.append(value)

    return results


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@app.get("/v1/elevation")
def get_elevation(
    latitude: str = Query(..., description="Comma-separated latitudes"),
    longitude: str = Query(..., description="Comma-separated longitudes"),
):
    """Return elevation values for a list of (lat, lon) pairs."""
    try:
        lats = [float(x) for x in latitude.split(",")]
        lons = [float(x) for x in longitude.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="latitude and longitude must be comma-separated numbers")

    if len(lats) != len(lons):
        raise HTTPException(status_code=400, detail="latitude and longitude must have the same number of values")

    if len(lats) == 0:
        return {"elevation": []}

    if len(lats) > MAX_POINTS:
        raise HTTPException(status_code=400, detail=f"Too many points — maximum is {MAX_POINTS}")

    if any(lat < -90 or lat > 90 for lat in lats):
        raise HTTPException(status_code=400, detail="latitude values must be in the range -90..90")

    if any(lon < -180 or lon > 180 for lon in lons):
        raise HTTPException(status_code=400, detail="longitude values must be in the range -180..180")

    try:
        elevations = _sample_elevations(lats, lons)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {"elevation": elevations}
