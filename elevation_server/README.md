# Local Elevation Server

A self-hosted elevation API that serves SRTM data from a local GeoTIFF file.
The HTTP API is compatible with Open-Meteo so only the base URL needs to
change in the app.

## Setup

### 1. System dependency

GDAL must be installed (used by the `elevation` package to download and merge
SRTM tiles).

```bash
# Ubuntu / Debian
sudo apt install gdal-bin

# macOS
brew install gdal
```

### 2. Python environment

```bash
cd elevation_server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Download elevation tiles

```bash
python download.py
```

This downloads SRTM tiles for the French/Italian/Swiss Alps around Chamonix
and merges them into `data/elevation.tif`.

To download a different area, pass a bounding box:

```bash
python download.py --bounds -5 42 16 49   # Pyrenees → Western Alps only
python download.py --bounds -30 25 45 72  # All of Europe
```

Tiles are cached by the `elevation` package in `~/.cache/elevation`, so
re-running with an overlapping bounding box is fast.

### 4. Configure CORS

The server only accepts requests from origins listed in `_DEFAULT_ORIGINS`
inside `server.py`. By default this is:

```python
_DEFAULT_ORIGINS = "https://maps.hatrix.fr"
```

**To allow additional origins** (e.g. for local development), either:

- Edit `_DEFAULT_ORIGINS` directly in `server.py`:

  ```python
  _DEFAULT_ORIGINS = "https://maps.hatrix.fr,http://localhost,http://localhost:8080"
  ```

- Or pass the `ELEVATION_ALLOWED_ORIGINS` environment variable at startup
  (comma-separated, no spaces around commas):

  ```bash
  ELEVATION_ALLOWED_ORIGINS="https://maps.hatrix.fr,http://localhost:8080" \
    uvicorn server:app --host 0.0.0.0 --port 8765
  ```

### 5. Start the server

```bash
uvicorn server:app --port 8765
```

Use `--host 0.0.0.0` to make the server accessible to the network.

## Connecting the app

In `map.html` the `StraightLine` router is already pointed at the production
server. To use a local instance instead, change the URL:

```js
var straightLine = new L.Routing.StraightLine({
    elevationApiBaseUrl: 'http://localhost:8765/v1/elevation',
});
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ELEVATION_ALLOWED_ORIGINS` | `https://maps.hatrix.fr` | Comma-separated list of allowed CORS origins |
| `ELEVATION_MAX_POINTS` | `500` | Maximum coordinate pairs per request |

## API

```
GET /v1/elevation?latitude=47.1,47.2&longitude=4.7,4.8
→ {"elevation": [1234.5, 2345.6]}
```

Identical to the Open-Meteo format.
