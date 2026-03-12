# Ski Touring Map

Demo: ![https://maps.hatrix.fr/ski_touring/](https://maps.hatrix.fr/ski_touring/)

Interactive Leaflet map for ski touring planning with:

- Multiple base maps (OutdoorActive, OpenTopoMap, OSM, IGN, Satellite)
- Snow-related overlays (OpenSlopeMap steepness, ski pistes, IGN winter layers, Strava heatmap)
- Route planning with multiple routers, including off-trail straight-line routing
- Elevation profile and route statistics
- POI overlays (huts, viewpoints, paragliding spots)
- GPX track loading and export support
- URL persistence (map position, layers, waypoints, router, opacity, markers)

No build step is required. This is a static web app.

## Quick Start

1. Clone the repository.
2. Serve the folder with a local HTTP server (recommended; avoid opening directly via `file://`).
3. Open `map.html` in your browser.

Example using Python:

```bash
cd ski_touring
python3 -m http.server 8000
```

Then open: `http://localhost:8000/map.html`

## Base Maps

- OpenTopoMap
- OutdoorActive Summer
- OutdoorActive Winter
- OpenStreetMap
- IGN v2 (Plan IGN)
- Satellite

## Overlay Layers

- IGN Slopes
- IGN Trace Hivernale
- Open Slopes
- Ski Pistes
- Strava Ski Heatmap
- Paragliding
- Huts
- Viewpoints
- GPX

## Routing Backends

- OpenRouteService Walking
- Brouter Walking
- Brouter Cycling
- Straight Line (off-trail / no-road-network mode)

## Major Features

## Routing

- Click to set start/end/via points
- Drag route line to insert waypoints
- Per-waypoint popup actions:
	- Remove waypoint
	- Invert route
	- Toggle "significant" (changes icon/size for vias)
- Route summary with distance/time/elevation stats
- Export current route to GPX (via BRouter export URL)

## Elevation

- Elevation chart shown for found routes
- Straight-line router includes elevation sampling and computed elevation metrics

## Layer Panel UX

- Always expanded layer panel
- Grouped sections (Base Maps, Tile Overlays, POI & Tracks)
- Opacity sliders for active tile overlays

## Map/State Persistence in URL

The app persists and restores:

- Position: `lat`, `lng`, `z`
- Base map: `basemap`
- Active overlays: `overlays`
- User markers: `markers`
- Route waypoints: `waypoints`
- Router: `router`
- Per-overlay opacity: `opacity`

This makes routes/share links reproducible.

## Right-Click Context Menu

On map right-click:

- Start Here
- End Here
- Create Marker
- Copy Location

## Data Sources

- Base/overlay map tiles: OutdoorActive, OpenStreetMap, OpenTopoMap, IGN (data.geopf.fr),
OpenSlopeMap, OpenSnowMap, Strava-style tiles
- POIs: OpenStreetMap data via Overpass API (saved as local JSON)
- GPX: Local files in `dist/gpx/`

## Project Structure

```text
.
├── map.html                     # Main app
├── index.html                   # Redirects to map.html
├── get_pois.sh                  # Helper to refresh POI JSON from Overpass
├── json/                        # Local POI datasets
├── images/                      # Marker and UI assets
└── dist/
		├── L.Routing.*.js          # Router backends (ORS, BRouter, StraightLine)
		├── leaflet-controls-routing.*
		├── leaflet-routing-machine.*
		├── gpx/                    # GPX tracks shown as overlay
		└── ...                     # Leaflet plugins / CSS / helper scripts
```

## Updating POI Data

`get_pois.sh` queries Overpass and writes JSON files in `json/`.

Run:

```bash
./get_pois.sh
```

Notes:

- Bounds are defined in the script to target the Alps around Chamonix.
- Some POI queries are commented out; uncomment as needed.
- The script sleeps between calls to be polite to Overpass.

## Adding GPX Tracks

Place `.gpx` files in:

- `dist/gpx/`

The app scans that directory and adds tracks to the `GPX` overlay.

## Configuration Notes

- OpenRouteService key is currently hardcoded in `map.html`.
- If tiles or APIs change, update corresponding URLs in `map.html` and router files.

## Troubleshooting

- Blank map or missing assets:
	- Ensure you run via HTTP server, not `file://`.
- Route/elevation intermittency:
	- Reload the page and verify network/API availability.
    - The app should avoid sending too many requests at once. If it still is an issue, wait and
    retry.
- Missing POIs:
	- Regenerate JSON with `./get_pois.sh`.
- Shared link not restoring expected state:
	- Check URL contains relevant parameters (`waypoints`, `router`, `overlays`, `opacity`, etc.).

## License / Attribution

This project depends on multiple external tile/API providers and open datasets. Ensure your usage
complies with each provider's terms and attribution requirements.
