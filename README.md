# NI Postcode History

A static website with no backend. You enter a Northern Ireland postcode and it shows the history of the area around it, in four tabs:

- **Overview:** the nearest town or district's Wikipedia introduction, the **townland** the postcode is in with its Irish name, meaning and history (from the Northern Ireland Place-Name Project), other place names nearby, and quick counts.
- **Timeline:** everything dated near the postcode, oldest first. It combines places founded, opened or closed and events from Wikidata with the heritage records grouped by period ("Neolithic · 2 monuments", "1840–1859 · 71 historic buildings built"). It widens to 5 km when little is recorded within 1 km, and links to a newspaper archive search for the town.
- **Heritage:** records within 1 km from the Department for Communities' historic environment datasets: the Sites and Monuments Record, Historic Buildings, Industrial Heritage, and Historic Parks, Gardens and Demesnes. They appear as map pins (or outlines, for parks) and as a filterable list. Monuments and buildings link to their own DfC record pages.
- **Articles:** up to 30 nearby Wikipedia articles, each opening a short summary inside the site.

It has light and dark themes (Auto follows the device). **Historical maps** (the OSNI six-inch County Series) are built in but switched off until OSNI allows this site; see below.

You can link to a result directly: `?postcode=BT71NN`. The project's vocabulary is in [GLOSSARY.md](GLOSSARY.md), and the main design decisions are in [docs/adr](docs/adr).

## Running it locally

You need Python 3 to serve the site and Node.js 18+ to run the tests. Nothing needs installing.

```sh
python3 -m http.server 8000 --directory site    # or: npm start
```

Then open <http://localhost:8000>. The site has to be served over HTTP, not opened as a file, because it uses ES modules and loads data with `fetch`.

```sh
npm test    # unit tests (node --test)
```

### Updating the heritage data

The heritage data is stored in the repo as GeoJSON tiles under `site/data/`. DfC updates its datasets monthly. To refresh them:

```sh
python3 scripts/fetch_data.py    # or: npm run fetch-data
```

This downloads all four datasets from DfC's *Historic Environment Division GIS Data* feature service ([why this source](docs/adr/0001-heritage-data-from-dfc-feature-service.md)). It turns each record into a title, a list of facts and a reference, and rewrites `site/data/tiles/*.geojson` and `site/data/manifest.json` ([why tiles](docs/adr/0002-heritage-data-as-geojson-tiles.md)). Commit the result.

## Project layout

```
site/                 the website (this folder is what GitHub Pages publishes)
  index.html
  css/style.css
  js/app.js           page behaviour: search, tabs, theme, lists
  js/config.js        feature switches (historical maps) and the search radius
  js/map.js           MapLibre map: styles, search area, pins, popups
  js/postcode.js      postcode validation and postcodes.io lookup
  js/records.js       loading heritage records from the tiles, DfC record links
  js/timeline.js      building the timeline (eras, Wikidata dates)
  js/wikidata.js      Wikidata queries: dated things nearby, nearest settlement
  js/placenames.js    townland and place-name meanings (read live from QUB)
  js/geo.js           distances (points and polygons)
  js/format.js        small text helpers (HTML escaping, plurals)
  js/wikipedia.js     nearby Wikipedia articles and article summaries
  js/historical-maps.js  OSNI County Series layers (switched off)
  data/               generated heritage tiles and manifest
  fonts/              Inter and Fraunces (SIL Open Font License)
  vendor/maplibre-gl/ MapLibre GL JS 4.7.1 (BSD-3-Clause)
scripts/fetch_data.py downloads and tiles the heritage data
tests/                unit tests for the modules above
docs/adr/             architecture decision records
```

## Hosting on GitHub Pages

`.github/workflows/pages.yml` runs the tests and publishes the `site/` folder on every push to `main`. To turn it on:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

### Historical maps (switched off)

The historical maps come straight from the Department for Communities' ArcGIS endpoints, which refuse requests from websites they haven't approved, including this one. The code is in place but hidden: set `historicalMaps: true` in `site/js/config.js` once OSNI allows the site's domain. To ask, contact OSNI via [SpatialNI](https://www.spatialni.gov.uk/help-contact.html), quoting the service URLs in `site/js/historical-maps.js`. Until then, the [PRONI Historical Maps viewer](https://www.nidirect.gov.uk/articles/about-proni-historical-maps-viewer) shows the same maps. See [ADR 0003](docs/adr/0003-no-proxy-for-historical-maps.md).

## Data and licences

| Data | Source | Licence |
|---|---|---|
| Heritage records (Sites and Monuments Record, Historic Buildings, Industrial Heritage, Historic Parks, Gardens and Demesnes) | Department for Communities, Historic Environment Division, via its *Historic Environment Division GIS Data* service; also published on [OpenDataNI](https://www.opendatani.gov.uk/). Stored in this repo. | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). DfC notes that some uses of its historic environment data need a copyright licence from the Historic Environment Division. If you plan to reuse the data beyond this site, check with HED. |
| Record pages linked from monuments and buildings | DfC's [Sites and Monuments Record](https://apps.communities-ni.gov.uk/NISMR-public/) and [Buildings Database](https://apps.communities-ni.gov.uk/Buildings/). The monument database may show its disclaimer the first time. | Linked, not copied. |
| Townland and place-name meanings | [Northern Ireland Place-Name Project](https://www.placenamesni.org/), Queen's University Belfast, read live from its public ArcGIS layers | No licence is stated, so it is credited on every entry and not copied into this repo ([ADR 0004](docs/adr/0004-place-names-read-live.md)). |
| Timeline places and events, nearest settlement | [Wikidata](https://www.wikidata.org/) Query Service | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Nearby articles and summaries | [Wikipedia](https://en.wikipedia.org/) via the MediaWiki and REST APIs | Text under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Images carry their own licences on Wikimedia Commons. |
| Postcode locations | [postcodes.io](https://postcodes.io/), which uses ONS and Royal Mail data | Northern Ireland postcode data is licensed for **non-commercial use only**, so this site must stay non-commercial. See [postcodes.io's data notes](https://postcodes.io/about). |
| Historical maps (when switched on) | Ordnance Survey of Northern Ireland, via DfC/SpatialNI ArcGIS services | © Crown copyright and database right. OSNI Open Data, [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Map | [OpenFreeMap](https://openfreemap.org/) vector tiles and styles, built with [OpenMapTiles](https://openmaptiles.org/) | Map data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/) |
| Newspaper search link | [British Newspaper Archive](https://www.britishnewspaperarchive.co.uk/) | Linked only: free to search, subscription to read. |
| Map library | [MapLibre GL JS](https://maplibre.org/) 4.7.1 | BSD-3-Clause (`site/vendor/maplibre-gl/LICENSE.txt`) |
| Fonts | [Inter](https://rsms.me/inter/) and [Fraunces](https://github.com/undercasetype/Fraunces), via Fontsource | SIL Open Font License 1.1 (`site/fonts/*-LICENSE.txt`) |

The map and the page footer carry the attributions these licences require.

Locations of some monuments are approximate; these are marked "Location approximate". For questions about a specific record, contact the [Historic Environment Division](https://www.communities-ni.gov.uk/topics/historic-environment).
