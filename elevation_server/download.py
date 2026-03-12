#!/usr/bin/env python3
"""
Download and merge SRTM elevation tiles for a given bounding box.

Usage:
    python download.py                        # default: Alps + Pyrenees
    python download.py --bounds W S E N      # custom area
    python download.py --chunk-size 5        # override chunk size (degrees)

The `elevation` package refuses to download more than ~100 tiles in a single
call.  This script splits the bounding box into small chunks (default 5×5°),
downloads each chunk separately, then mosaics them into a single GeoTIFF:
    elevation_server/data/elevation.tif

Requirements:
    pip install -r requirements.txt
    # GDAL command-line tools must also be installed:
    #   Ubuntu/Debian: sudo apt install gdal-bin
    #   macOS:         brew install gdal
"""

import argparse
import glob
import math
import os
import subprocess
import sys

DEFAULT_BOUNDS = (5.5, 44.5, 9.0, 47.0)  # W S E N — French/Italian/Swiss Alps around Chamonix
CHUNK_SIZE = 2                       # degrees — 2×2° = 4 tiles, well under the limit
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CHUNKS_DIR = os.path.join(DATA_DIR, "chunks")
OUTPUT_FILE = os.path.join(DATA_DIR, "elevation.tif")


def run(cmd, step):
    print("  $", " ".join(str(c) for c in cmd))
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"\n{step} failed (exit {result.returncode}).")
        print("Make sure GDAL (gdal-bin) is installed:")
        print("  Ubuntu/Debian : sudo apt install gdal-bin")
        print("  macOS         : brew install gdal")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Download SRTM elevation tiles.")
    parser.add_argument(
        "--bounds",
        nargs=4,
        type=float,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        default=list(DEFAULT_BOUNDS),
        help="Bounding box in WGS84 degrees (default: %(default)s)",
    )
    parser.add_argument(
        "--chunk-size",
        type=float,
        default=CHUNK_SIZE,
        metavar="DEGREES",
        help=f"Split the bounding box into chunks of this size (default: {CHUNK_SIZE}°)",
    )
    args = parser.parse_args()
    west, south, east, north = args.bounds
    chunk = args.chunk_size

    os.makedirs(CHUNKS_DIR, exist_ok=True)

    eio = os.path.join(os.path.dirname(sys.executable), "eio")

    # Build list of chunk bounding boxes
    xs = list(_frange(west,  east,  chunk))
    ys = list(_frange(south, north, chunk))

    chunks = []
    for x0 in xs:
        x1 = min(x0 + chunk, east)
        for y0 in ys:
            y1 = min(y0 + chunk, north)
            chunks.append((x0, y0, x1, y1))

    total = len(chunks)
    print(f"Bounds     : {west} {south} {east} {north}")
    print(f"Chunk size : {chunk}° ({total} chunk{'s' if total != 1 else ''})")
    print(f"Output     : {OUTPUT_FILE}")
    print()

    chunk_files = []
    for idx, (x0, y0, x1, y1) in enumerate(chunks, 1):
        chunk_file = os.path.join(CHUNKS_DIR, f"chunk_{x0}_{y0}_{x1}_{y1}.tif")
        chunk_files.append(chunk_file)

        if os.path.exists(chunk_file):
            print(f"[{idx}/{total}] Skipping {x0},{y0}→{x1},{y1} (already downloaded)")
            continue

        print(f"[{idx}/{total}] Downloading {x0},{y0}→{x1},{y1} …")
        run([eio, "clip",
             "--bounds", str(x0), str(y0), str(x1), str(y1),
             "--output", chunk_file],
            step=f"chunk {idx}/{total}")

    print()
    if total == 1:
        import shutil
        shutil.copy(chunk_files[0], OUTPUT_FILE)
    else:
        print(f"Merging {total} chunks → {OUTPUT_FILE} …")
        run(["gdal_merge.py", "-o", OUTPUT_FILE, "-of", "GTiff"] + chunk_files,
            step="gdal_merge.py")

    size_mb = os.path.getsize(OUTPUT_FILE) / 1024 / 1024
    print(f"\nDone — {OUTPUT_FILE}  ({size_mb:.0f} MB)")
    print("You can now start the server:  uvicorn server:app --port 8765")


def _frange(start, stop, step):
    """Yield float values from start up to (but not including) stop."""
    n = math.ceil((stop - start) / step)
    for i in range(n):
        yield round(start + i * step, 6)


if __name__ == "__main__":
    main()
