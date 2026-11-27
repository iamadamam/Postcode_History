# Historical maps come straight from DfC, with no proxy

The OSNI six-inch County Series (Editions 1–5) is loaded straight from the Department for Communities' ArcGIS endpoints (`utility.arcgis.com/usrsvcs/servers/...`). The site asks each MapServer's `export` operation for Web Mercator images, because the services are cached in Irish Grid (EPSG:29902) and the web map uses Web Mercator.

When this was built, those endpoints refused anonymous requests from sites they hadn't approved. A static site has no backend to proxy around that, and other people's public proxies of the same services would bill their ArcGIS accounts. So we don't use any proxy. Before showing an edition, the site checks whether the service answers. If it doesn't, the page says so and links to the PRONI Historical Maps viewer instead of showing a broken map.

## Consequences

- The endpoints did refuse the GitHub Pages site, and so do the separate links SpatialNI's own PRONI viewer uses. The feature is therefore switched off (`FEATURES.historicalMaps` in `site/js/config.js`) rather than showing a control that always says "unavailable".
- Historical maps won't appear on the GitHub Pages site until OSNI/DfC allow its domain. To ask, contact OSNI via [SpatialNI](https://www.spatialni.gov.uk/help-contact.html) and quote the service URLs in `site/js/historical-maps.js`.
- OSNI's open-data release has only Editions 1 and 2, as scanned TIF sheets (about 15 GB). Turning those into self-hosted tiles is the fallback if OSNI says no.
- If OSNI publishes open, cached Web Mercator tiles, point `exportTiles` at them instead.
