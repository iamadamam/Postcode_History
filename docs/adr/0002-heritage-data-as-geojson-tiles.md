# Heritage data is stored as small GeoJSON tiles

The four datasets come to about 26 MB of GeoJSON, which is too much for a phone to download for every lookup on a site with no backend. `scripts/fetch_data.py` cuts them into a grid of cells, each 0.05° of latitude by 0.08° of longitude (about 5.5 × 5.2 km in Northern Ireland). It writes one GeoJSON FeatureCollection per non-empty cell to `site/data/tiles/{x}_{y}.geojson`, along with a `site/data/manifest.json` listing the cells. A lookup loads only the one to four cells that overlap the 1 km Search Area, typically 20–500 KB before compression.

Each record is reduced to `type`, `ref`, `title` and a list of readable `facts` when the tiles are built, so the browser does no field-by-field formatting. A Historic Park/Garden is an area, so it is written into every cell its bounding box touches. The browser removes duplicates by feature id.

## Considered options

- **One file per dataset**: simplest, but 4–8 MB per file on every lookup.
- **Vector tiles or FlatGeobuf**: smaller and faster, but they need a build toolchain or extra libraries, and they aren't GeoJSON as the project asked.
