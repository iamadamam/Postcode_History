// Place Names from the Northern Ireland Place-Name Project (Queen's University
// Belfast), read live from its public ArcGIS layers. Not copied into this repo:
// the layers don't state a licence. See docs/adr/0004-place-names-read-live.md.

export const PLACENAMES_CREDIT = {
  text: 'Northern Ireland Place-Name Project, Queen’s University Belfast',
  url: 'https://www.placenamesni.org/',
};

const SERVICE = 'https://services3.arcgis.com/HRuPlEcokYlz4mdz/arcgis/rest/services';
const TOWNLANDS = `${SERVICE}/PlaceNamesNI_Townlands/FeatureServer/9`;
const GAZETTEER = `${SERVICE}/PlaceNames_Gazetteer_(Read-Only)/FeatureServer/0`;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
};

/** The Place-Name Project stores rich text as HTML. Turn it into plain text (never inserted as HTML). */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code] ?? whole;
    })
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Split the Place-Name Project's "historic name" text into the Irish form and its meaning.
 * 'Ir. Baile na Faiche ‘townland of the lawn or green’' -> { irish: 'Baile na Faiche', meaning: 'townland of the lawn or green' }
 */
export function splitMeaning(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const match = /^(?:(?:Ir|Ire|Irish|Eng|Sc)\.?\s+)?(.*?)\s*[‘'"“](.+?)[’'"”]\.?$/.exec(clean);
  if (match) return { irish: match[1].trim().replace(/[,;:]$/, ''), meaning: match[2].trim() };
  // No quoted meaning: usually just the Irish form of a street name ('An Ollscoil').
  return { irish: clean, meaning: '' };
}

async function query(layer, params, fetchImpl) {
  const url = `${layer}/query?${new URLSearchParams({ f: 'json', ...params })}`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Place names ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`Place names: ${body.error.message}`);
  return body.features ?? [];
}

const pointParams = (centre) => ({
  geometry: `${centre.lon},${centre.lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: '4326',
});

function toPlaceName(attributes, centre, geometry) {
  const meaning = splitMeaning(htmlToText(attributes.HISTORIC_NAME));
  const place = {
    id: attributes.PNAME_ID,
    name: attributes.PLACE_NAME ?? attributes.NAME ?? '',
    irish: meaning.irish,
    meaning: meaning.meaning,
    history: htmlToText(attributes.PARAGRAPH),
    note: htmlToText(attributes.MORE_DETAILS),
    townland: attributes.TOWNLAND ?? '',
    parish: attributes.PARISH_1961 ?? attributes.PARISH_1851 ?? '',
    county: attributes.COUNTY ?? '',
    distance: null,
  };
  if (geometry && centre) {
    const kx = 111320 * Math.cos((centre.lat * Math.PI) / 180);
    place.distance = Math.hypot((geometry.x - centre.lon) * kx, (geometry.y - centre.lat) * 111320);
  }
  return place;
}

/**
 * The townland the Search Centre is in, with its Place-Name Project entry:
 * { name, irish, meaning, history, parish, county, ... } or null.
 */
export async function townlandAt(centre, fetchImpl = fetch) {
  const [townland] = await query(
    TOWNLANDS,
    { ...pointParams(centre), spatialRel: 'esriSpatialRelIntersects', outFields: 'NAME,PNAME_ID,COUNTY,PARISH_196,BAR_NAME', returnGeometry: 'false' },
    fetchImpl
  );
  if (!townland) return null;
  const a = townland.attributes;
  const entries = a.PNAME_ID
    ? await query(GAZETTEER, { where: `PNAME_ID = ${Number(a.PNAME_ID)}`, outFields: '*', returnGeometry: 'false' }, fetchImpl)
    : [];
  const entry = entries.find((e) => e.attributes.HISTORIC_NAME) ?? entries[0];
  const place = toPlaceName(entry?.attributes ?? { PNAME_ID: a.PNAME_ID }, null, null);
  return {
    ...place,
    name: place.name || a.NAME,
    parish: place.parish || a.PARISH_196 || '',
    county: place.county || a.COUNTY || '',
    barony: a.BAR_NAME ?? '',
  };
}

/** Other named places within `radius` metres that have a recorded meaning, nearest first. */
export async function placeNamesNear(centre, radius = 1000, { exclude = null, limit = 10 } = {}, fetchImpl = fetch) {
  const features = await query(
    GAZETTEER,
    {
      ...pointParams(centre),
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radius),
      units: 'esriSRUnit_Meter',
      where: "HISTORIC_NAME IS NOT NULL AND HISTORIC_NAME <> ''",
      outFields: 'PNAME_ID,PLACE_NAME,HISTORIC_NAME,TOWNLAND,PARISH_1961,COUNTY',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '200',
    },
    fetchImpl
  );
  const seen = new Set(exclude ? [exclude] : []);
  return features
    .map((f) => toPlaceName(f.attributes, centre, f.geometry))
    .filter((p) => p.name && p.meaning && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
