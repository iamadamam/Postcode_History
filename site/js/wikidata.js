// Wikidata Query Service: dated things near the Search Centre (for the
// Timeline) and the nearest settlement with a Wikipedia article (for the
// Area Summary).

import { eventRows } from './timeline.js';

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

// City, big city, town, village, hamlet, suburb, neighbourhood, quarter, human settlement,
// locality, unincorporated area. ('townland' is left out: the Area Summary is about the wider place.)
const SETTLEMENT_CLASSES = ['Q515', 'Q1549591', 'Q3957', 'Q532', 'Q5084', 'Q188509', 'Q123705', 'Q2983893', 'Q486972', 'Q3257686', 'Q17350442'];

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

export function nearestPlaceQuery(centre, radiusKm = 5) {
  // Settlements with an English Wikipedia article. A fixed list of classes, and no label
  // service, keep this to 1–2 s; walking the class tree (wdt:P31/wdt:P279*) took 8–34 s.
  return `SELECT ?item ?article ?dist WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center ${point(centre)} .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  VALUES ?class { ${SETTLEMENT_CLASSES.map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P31 ?class .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
ORDER BY ?dist
LIMIT 5`;
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
 * Dated events and places near the centre. Searches 1 km, and widens to 5 km
 * when that finds fewer than 5 entries. Returns { rows, radius }.
 */
export async function timelineEvents(centre, fetchImpl = fetch, { minimum = 5 } = {}) {
  let rows = eventRows(await sparql(timelineQuery(centre, 1), fetchImpl));
  if (rows.length >= minimum) return { rows, radius: 1000 };
  rows = eventRows(await sparql(timelineQuery(centre, 5), fetchImpl));
  return { rows, radius: 5000 };
}

/**
 * The nearest settlement with an English Wikipedia article: { name, town, title, distance } or null.
 * `town` is the wider town where the title names one ("Queen's Quarter, Belfast" -> "Belfast").
 */
export async function nearestPlace(centre, fetchImpl = fetch) {
  const [first] = await sparql(nearestPlaceQuery(centre), fetchImpl);
  if (!first) return null;
  const title = decodeURIComponent(first.article.value.split('/wiki/')[1] ?? '').replace(/_/g, ' ');
  // "Queen's Quarter, Belfast" -> name "Queen's Quarter"; "Lisnaskea" -> "Lisnaskea".
  const [name, parent] = title.replace(/\s*\(.*\)$/, '').split(',').map((part) => part.trim());
  return { name, town: parent || name, title, distance: Number(first.dist.value) * 1000 };
}
