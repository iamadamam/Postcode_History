// Nearby Articles from the Wikipedia geosearch API.

export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

export function nearbyArticlesUrl(centre, radius, limit) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${centre.lat}|${centre.lon}`,
    ggsradius: String(Math.min(10000, Math.round(radius))),
    ggslimit: String(limit),
    prop: 'coordinates|pageimages|extracts|info',
    codistancefrompoint: `${centre.lat}|${centre.lon}`,
    piprop: 'thumbnail',
    pithumbsize: '160',
    pilimit: String(limit),
    exintro: '1',
    explaintext: '1',
    exsentences: '2',
    exlimit: String(limit),
    inprop: 'url',
  });
  return `${WIKIPEDIA_API}?${params}`;
}

/** Turn an API response into [{ title, url, extract, thumbnail, lat, lon, distance }], nearest first. */
export function parseNearbyArticles(body) {
  const pages = body?.query?.pages ?? [];
  return pages
    .filter((page) => page.coordinates?.length)
    .map((page) => {
      const [coord] = page.coordinates;
      return {
        title: page.title,
        url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
        extract: page.extract ?? '',
        thumbnail: page.thumbnail?.source ?? '',
        lat: coord.lat,
        lon: coord.lon,
        distance: coord.dist ?? 0,
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

export async function nearbyArticles(centre, radius = 1000, limit = 10, fetchImpl = fetch) {
  // Wikimedia asks browser clients to identify themselves with Api-User-Agent.
  const response = await fetchImpl(nearbyArticlesUrl(centre, radius, limit), {
    headers: { 'Api-User-Agent': 'NI-Postcode-History/1.0' },
  });
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  return parseNearbyArticles(await response.json());
}
