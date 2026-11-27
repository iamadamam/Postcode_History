// OSNI six-inch County Series (Historical Maps), served by the Department for
// Communities' ArcGIS endpoints. The services are cached in Irish Grid, so we
// ask each MapServer's `export` operation to reproject tiles to Web Mercator.
// Switched off in config.js until OSNI allows this site: see
// docs/adr/0003-no-proxy-for-historical-maps.md.

const SERVER = 'https://utility.arcgis.com/usrsvcs/servers';

export const EDITIONS = [
  { id: 'ed1', label: 'Edition 1 (1829–1835)', url: `${SERVER}/6fd5693fcaac43bfa08fc4faec5836ab/rest/services/Historical/OSNIHistorical_CS_OS_6_x_x_1/MapServer` },
  { id: 'ed2', label: 'Edition 2 (1838–1862)', url: `${SERVER}/7d239b54e1b649f58a31c2574d5c873e/rest/services/Historical/OSNIHistorical_CS_OS_6_x_x_2/MapServer` },
  { id: 'ed3', label: 'Edition 3 (1900–1932)', url: `${SERVER}/c45ff9ddab5a4fd1848936f8d38d5b67/rest/services/Historical/OSNIHistorical_CS_OS_6_x_x_3/MapServer` },
  { id: 'ed4', label: 'Edition 4 (1916–1957)', url: `${SERVER}/7efd6a87a19e42689b880d2f2a7a74e1/rest/services/Historical/OSNIHistorical_CS_OS_6_x_x_4/MapServer` },
  { id: 'ed5', label: 'Edition 5 (1919–1963)', url: `${SERVER}/1bd5fe9c4cc14ab1be6635d124019d84/rest/services/Historical/OSNIHistorical_CS_OS_6_x_x_5/MapServer` },
];

export const PRONI_VIEWER = 'https://www.nidirect.gov.uk/articles/about-proni-historical-maps-viewer';

/** MapLibre raster tile template that fills each tile from the MapServer's `export` operation. */
export function exportTiles(serviceUrl) {
  return `${serviceUrl}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
}

const availability = new Map();

/**
 * Whether the service answers anonymous requests from this website.
 * The DfC endpoints refuse requests from sites they haven't approved.
 */
export function isAvailable(serviceUrl, fetchImpl = fetch) {
  if (!availability.has(serviceUrl)) {
    availability.set(
      serviceUrl,
      fetchImpl(`${serviceUrl}?f=json`)
        .then((response) => (response.ok ? response.json() : { error: response.status }))
        .then((body) => !body.error)
        .catch(() => false)
    );
  }
  return availability.get(serviceUrl);
}
