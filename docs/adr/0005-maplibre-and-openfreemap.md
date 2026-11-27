# The map uses MapLibre GL with OpenFreeMap vector tiles

The map moved from Leaflet with raster OpenStreetMap tiles to MapLibre GL JS 4.7.1 (bundled in `site/vendor/maplibre-gl/`) with OpenFreeMap's vector styles (`positron` for light, `dark` for dark). We wanted a cleaner, more modern map with smooth zooming and a matching dark mode. The obvious light basemap, CARTO Positron, now needs an API key, and OpenFreeMap needs neither a key nor an account.

## Considered options

- **Leaflet with OSM raster tiles**: smaller (about 150 KB instead of about 800 KB) and simpler, but busier-looking tiles and no proper dark style.
- **Leaflet with a vector plugin**: still needs a GL renderer, so it ends up as large as MapLibre with an extra layer of glue.

## Consequences

- Switching theme reloads the map style, so `site/js/map.js` re-adds its own sources and layers on every `style.load`.
- Records are drawn as GeoJSON circle and fill layers, and filtered with MapLibre expressions (`setRecordFilter`) instead of adding and removing markers.
- OpenFreeMap is a free community service. If it goes away, any MapLibre-compatible style URL can replace the two in `STYLES`.
