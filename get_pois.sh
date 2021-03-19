#!/bin/bash

save_pois()
{
  bounds="$1"
  type_poi="$2"
  save_file="$3"
  
  url="https://overpass-api.de/api/interpreter?data=[out:json][timeout:15];(node[$type_poi]($bounds);way[$type_poi]($bounds);relation[$type_poi]($bounds););out%20body%20geom;"
  wget "$url" -O "$save_file"
}


# Those bounds are roughly the French Alps and a bit of Switzerland and Italy
bounds="44.59946692494541,4.630125461347195,46.72319697007933,8.097280867457206"

jsondir="./json"
save_pois "$bounds" "tourism=alpine_hut" "$jsondir/alpine_hut.json"
sleep 10
save_pois "$bounds" "tourism=wilderness_hut" "$jsondir/wilderness_hut.json"
sleep 10
save_pois "$bounds" "natural=peak" "$jsondir/peak.json"
