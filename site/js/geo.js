// Small geometry helpers: distances in metres from a Search Centre.

const EARTH_RADIUS = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two { lat, lon } points. */
export function distanceMetres(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box { south, west, north, east } covering `radius` metres around a centre. */
export function boundsAround(centre, radius) {
  const dLat = (radius / EARTH_RADIUS) * (180 / Math.PI);
  const dLon = dLat / Math.cos(toRad(centre.lat));
  return { south: centre.lat - dLat, north: centre.lat + dLat, west: centre.lon - dLon, east: centre.lon + dLon };
}

// Project [lon, lat] to local metres around the centre. Accurate enough over a few km.
function projector(centre) {
  const kx = toRad(1) * EARTH_RADIUS * Math.cos(toRad(centre.lat));
  const ky = toRad(1) * EARTH_RADIUS;
  return ([lon, lat]) => [(lon - centre.lon) * kx, (lat - centre.lat) * ky];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToPolygon(rings) {
  const origin = [0, 0];
  const [outer, ...holes] = rings;
  if (pointInRing(origin, outer) && !holes.some((hole) => pointInRing(origin, hole))) return 0;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) best = Math.min(best, distanceToSegment(origin, ring[i - 1], ring[i]));
  }
  return best;
}

/**
 * Distance in metres from the centre to a GeoJSON geometry.
 * Points: straight-line distance. Polygons: 0 inside, otherwise distance to the nearest edge.
 */
export function distanceToGeometry(centre, geometry) {
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return distanceMetres(centre, { lat, lon });
  }
  const project = projector(centre);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  let best = Infinity;
  for (const polygon of polygons) {
    best = Math.min(best, distanceToPolygon(polygon.map((ring) => ring.map(project))));
  }
  return best;
}

/** "350 m", "1.2 km". */
export function formatDistance(metres) {
  if (metres < 1) return 'Here';
  if (metres < 1000) return `${Math.round(metres / 10) * 10 || Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
