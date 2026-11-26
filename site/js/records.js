// Load Heritage Records within the Search Area from the GeoJSON tiles
// written by scripts/fetch_data.py.

import { boundsAround, distanceToGeometry } from './geo.js';

export const RECORD_TYPES = {
  monument: {
    label: 'Monument',
    plural: 'Monuments',
    colour: '#b45309',
    lookup: {
      text: 'Look it up in the Sites and Monuments Record',
      url: 'https://www.communities-ni.gov.uk/services/sites-and-monuments-record',
    },
  },
  building: {
    label: 'Historic building',
    plural: 'Historic buildings',
    colour: '#1d4ed8',
    lookup: {
      text: 'Look it up in the Buildings Database',
      url: 'https://www.communities-ni.gov.uk/services/buildings-database',
    },
  },
  industrial: { label: 'Industrial heritage', plural: 'Industrial heritage', colour: '#7c3aed' },
  park: { label: 'Historic park/garden', plural: 'Historic parks/gardens', colour: '#15803d' },
};

/** Tile keys ("x_y") whose cells overlap the bounding box. */
export function cellsForBounds(bounds, cellSize) {
  const x0 = Math.floor(bounds.west / cellSize.lon);
  const x1 = Math.floor(bounds.east / cellSize.lon);
  const y0 = Math.floor(bounds.south / cellSize.lat);
  const y1 = Math.floor(bounds.north / cellSize.lat);
  const keys = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}_${y}`);
  return keys;
}

/**
 * Keep features within `radius` metres, add `distance`, remove duplicates
 * (an area can appear in several tiles) and sort nearest first.
 */
export function selectNearby(features, centre, radius) {
  const seen = new Set();
  const nearby = [];
  for (const feature of features) {
    if (seen.has(feature.id)) continue;
    seen.add(feature.id);
    const distance = distanceToGeometry(centre, feature.geometry);
    if (distance <= radius) nearby.push({ ...feature, distance });
  }
  return nearby.sort((a, b) => a.distance - b.distance);
}

let manifestPromise;

export function loadManifest(fetchImpl = fetch, base = 'data') {
  manifestPromise ??= fetchImpl(`${base}/manifest.json`).then((response) => {
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return response.json();
  });
  return manifestPromise;
}

/** Heritage Records within `radius` metres of the centre, nearest first. */
export async function recordsNear(centre, radius, fetchImpl = fetch, base = 'data') {
  const manifest = await loadManifest(fetchImpl, base);
  const available = new Set(manifest.cells);
  const keys = cellsForBounds(boundsAround(centre, radius), manifest.cellSize).filter((key) => available.has(key));
  const tiles = await Promise.all(
    keys.map(async (key) => {
      const response = await fetchImpl(`${base}/tiles/${key}.geojson`);
      if (!response.ok) throw new Error(`tile ${key} ${response.status}`);
      return response.json();
    })
  );
  return selectNearby(
    tiles.flatMap((tile) => tile.features),
    centre,
    radius
  );
}
