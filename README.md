# NI Postcode History

A static website with no backend. You enter a Northern Ireland postcode and it shows the history of the area around it:

- **Heritage records within 1 km**, from the Department for Communities' historic environment datasets. These are the Sites and Monuments Record, Historic Buildings, Industrial Heritage, and Historic Parks, Gardens and Demesnes. They appear as map pins (or outlines, for parks) and as a list sorted by distance.
- **Historical maps**: the OSNI six-inch County Series, Editions 1–5 (1829–1963), shown over a modern map with an opacity slider.
- **Nearby Wikipedia articles**, from the Wikipedia geosearch API.

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
  js/app.js           page behaviour: search, map, lists
  js/postcode.js      postcode validation and postcodes.io lookup
  js/records.js       loading heritage records from the tiles
  js/geo.js           distances (points and polygons)
  js/wikipedia.js     nearby Wikipedia articles
  js/historical-maps.js  OSNI County Series layers
  data/               generated heritage tiles and manifest
  vendor/leaflet/     Leaflet 1.9.4 (BSD-2-Clause)
scripts/fetch_data.py downloads and tiles the heritage data
tests/                unit tests for the modules above
docs/adr/             architecture decision records
```

## Hosting on GitHub Pages

`.github/workflows/pages.yml` runs the tests and publishes the `site/` folder on every push to `main`. To turn it on:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

### Known limitation: historical maps

The historical maps come straight from the Department for Communities' ArcGIS endpoints. When this was built, those endpoints refused requests from websites they hadn't approved. If they refuse the GitHub Pages site, the page says so and links to the [PRONI Historical Maps viewer](https://www.nidirect.gov.uk/articles/about-proni-historical-maps-viewer) instead. To get the maps working on this site, ask OSNI to allow its domain via [SpatialNI](https://www.spatialni.gov.uk/help-contact.html), quoting the service URLs in `site/js/historical-maps.js`. See [ADR 0003](docs/adr/0003-no-proxy-for-historical-maps.md).

## Data and licences

| Data | Source | Licence |
|---|---|---|
| Heritage records (Sites and Monuments Record, Historic Buildings, Industrial Heritage, Historic Parks, Gardens and Demesnes) | Department for Communities, Historic Environment Division, via its *Historic Environment Division GIS Data* service; also published on [OpenDataNI](https://www.opendatani.gov.uk/) | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). DfC notes that some uses of its historic environment data need a copyright licence from the Historic Environment Division. If you plan to reuse the data beyond this site, check with HED. |
| Historical maps (OSNI six-inch County Series) | Ordnance Survey of Northern Ireland, via DfC/SpatialNI ArcGIS services | © Crown copyright and database right. OSNI Open Data, [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Postcode locations | [postcodes.io](https://postcodes.io/), which uses ONS and Royal Mail data | Northern Ireland postcode data is licensed for **non-commercial use only**, so this site must stay non-commercial. Great Britain data is under the OGL. See [postcodes.io's data notes](https://postcodes.io/about). |
| Nearby articles | [Wikipedia](https://en.wikipedia.org/) via the MediaWiki API | Text under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Thumbnails carry their own licences on Wikimedia Commons. |
| Modern map | [OpenStreetMap](https://www.openstreetmap.org/copyright) standard tiles | Data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/). Tile use follows the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/). |
| Map library | [Leaflet](https://leafletjs.com/) 1.9.4 | BSD-2-Clause (`site/vendor/leaflet/LICENSE`) |

The map and the page footer carry the attributions these licences require.

Locations of some monuments are approximate; these are marked "Location approximate". For questions about a specific record, contact the [Historic Environment Division](https://www.communities-ni.gov.uk/topics/historic-environment).
