// Wikidata Query Service: dated things near the Search Centre (for the
// Timeline) and the nearest settlement with a Wikipedia article (for the
// Area Summary).

import { eventRows } from './timeline.js';

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

import { titleFromUrl } from './wikipedia.js';

// Towns and cities: city, big city, town, "city status in the United Kingdom" (Bangor, Lisburn…).
const TOWN_CLASSES = ['Q515', 'Q1549591', 'Q3957', 'Q1867820'];
// Smaller named places: village, suburb, neighbourhood, quarter.
const NAMED_LOCAL_CLASSES = ['Q532', 'Q188509', 'Q123705', 'Q2983893'];
// Generic ones, used only when no named place is about as close: hamlet, human settlement, locality.
// ('townland' is left out: the Area Summary is about the wider place.)
const GENERIC_LOCAL_CLASSES = ['Q5084', 'Q486972', 'Q3257686'];
const LOCAL_CLASSES = [...NAMED_LOCAL_CLASSES, ...GENERIC_LOCAL_CLASSES];
const NAMED_PLACE_SLACK_M = 1000; // a named place this much further away still beats a generic one
const TOWN_FOR_SUMMARY_KM = 3; // within this distance of a town's centre, the summary is about the town

const point = (centre) => `"Point(${centre.lon.toFixed(5)} ${centre.lat.toFixed(5)})"^^geo:wktLiteral`;

export function timelineQuery(centre, radiusKm) {
  // Kept lean on purpose: adding instance-of labels made this time out (60 s+) in central Belfast.
  return `SELECT ?item ?itemLabel ?p ?time ?precision ?dist ?article ?coord WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center ${point(centre)} .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  VALUES (?p ?ps ?psv) {
    ("P585" p:P585 psv:P585) ("P580" p:P580 psv:P580) ("P571" p:P571 psv:P571)
    ("P1619" p:P1619 psv:P1619) ("P576" p:P576 psv:P576)
  }
  ?item ?ps ?statement .
  ?statement ?psv ?timeValue .
  ?timeValue wikibase:timeValue ?time ; wikibase:timePrecision ?precision .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  FILTER(BOUND(?article) || ?p IN ("P585", "P580"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1500`;
}

export function nearestPlaceQuery(centre, radiusKm = 10) {
  // A fixed list of classes and no label service keep this to 1–2 s; walking the class tree
  // (wdt:P31/wdt:P279*) took 8–34 s. P17 = United Kingdom keeps out towns across the border.
  return `SELECT ?item ?article ?class ?dist WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center ${point(centre)} .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  VALUES ?class { ${[...TOWN_CLASSES, ...LOCAL_CLASSES].map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P31 ?class .
  ?item wdt:P17 wd:Q145 .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
ORDER BY ?dist
LIMIT 80`;
}

async function sparql(query, fetchImpl) {
  const response = await fetchImpl(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const body = await response.json();
  return body.results.bindings;
}

/**
 * Dated events and places near the centre. Searches 1 km, and widens to 5 km when the
 * Timeline would have fewer than `minimum` entries, counting the `alreadyShown` heritage rows.
 * If the wider search fails, the 1 km results are kept. Returns { rows, radius }.
 */
export async function timelineEvents(centre, fetchImpl = fetch, { minimum = 5, alreadyShown = 0 } = {}) {
  const near = eventRows(await sparql(timelineQuery(centre, 1), fetchImpl));
  if (near.length + alreadyShown >= minimum) return { rows: near, radius: 1000 };
  try {
    return { rows: eventRows(await sparql(timelineQuery(centre, 5), fetchImpl)), radius: 5000 };
  } catch {
    return { rows: near, radius: 1000 };
  }
}

/**
 * Short name for a place from its Wikipedia title:
 * 'Sailortown (Belfast)' -> 'Sailortown', 'Billy, County Antrim' -> 'Billy', "Queen's Quarter, Belfast" -> "Queen's Quarter".
 */
function placeName(title) {
  return title.replace(/\s*\(.*\)$/, '').split(',')[0].trim();
}

/**
 * The places to describe the Search Centre by, from settlements with an English Wikipedia article:
 * - `town`: the nearest town or city within 10 km (used for the newspaper search), or null;
 * - `place`: the town when you're within 3 km of it, otherwise the nearest village or district,
 *   otherwise the town. Each is { name, title, distance } (metres). Returns null if nothing is found.
 */
export async function nearestPlace(centre, fetchImpl = fetch) {
  const rows = await sparql(nearestPlaceQuery(centre), fetchImpl);
  const byArticle = new Map();
  for (const row of rows) {
    const title = titleFromUrl(row.article.value);
    const entry = byArticle.get(title) ?? { title, name: placeName(title), distance: Number(row.dist.value) * 1000, town: false, named: false };
    const cls = row.class?.value.split('/').pop();
    if (TOWN_CLASSES.includes(cls)) entry.town = true;
    if (NAMED_LOCAL_CLASSES.includes(cls)) entry.named = true;
    byArticle.set(title, entry);
  }
  const places = [...byArticle.values()].sort((a, b) => a.distance - b.distance);
  if (!places.length) return null;
  const strip = ({ name, title, distance }) => ({ name, title, distance });
  const town = places.find((p) => p.town) ?? null;
  const nearestLocal = places.find((p) => !p.town) ?? null;
  const named = places.find((p) => !p.town && p.named);
  const local = named && nearestLocal && named.distance <= nearestLocal.distance + NAMED_PLACE_SLACK_M ? named : nearestLocal;
  const place = town && (town.distance <= TOWN_FOR_SUMMARY_KM * 1000 || !local) ? town : local;
  return { place: strip(place), town: town && strip(town) };
}
