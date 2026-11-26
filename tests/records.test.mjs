import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, distanceToGeometry, boundsAround, formatDistance } from '../site/js/geo.js';
import { cellsForBounds, selectNearby, recordsNear } from '../site/js/records.js';
import { parseNearbyArticles } from '../site/js/wikipedia.js';

const centre = { lat: 54.5844, lon: -5.9342 }; // Queen's University, Belfast

test('distanceMetres matches a known distance', () => {
  // About 1 km north.
  const d = distanceMetres(centre, { lat: centre.lat + 0.008993, lon: centre.lon });
  assert.ok(Math.abs(d - 1000) < 2, `got ${d}`);
});

test('point and polygon distances', () => {
  const point = { type: 'Point', coordinates: [centre.lon, centre.lat + 0.0045] };
  assert.ok(Math.abs(distanceToGeometry(centre, point) - 500) < 2);

  const square = (half) => [[
    [centre.lon - half, centre.lat - half], [centre.lon + half, centre.lat - half],
    [centre.lon + half, centre.lat + half], [centre.lon - half, centre.lat + half],
    [centre.lon - half, centre.lat - half],
  ]];
  assert.equal(distanceToGeometry(centre, { type: 'Polygon', coordinates: square(0.001) }), 0, 'inside counts as 0');

  // Square east of the centre, west edge ~640 m away (0.01 deg lon at 54.58N).
  const east = [[[centre.lon + 0.01, centre.lat - 0.001], [centre.lon + 0.02, centre.lat - 0.001], [centre.lon + 0.02, centre.lat + 0.001], [centre.lon + 0.01, centre.lat + 0.001], [centre.lon + 0.01, centre.lat - 0.001]]];
  const d = distanceToGeometry(centre, { type: 'MultiPolygon', coordinates: [east] });
  assert.ok(Math.abs(d - 645) < 10, `got ${d}`);

  // A hole around the centre means it is outside the area.
  const withHole = [...square(0.01), ...square(0.001)];
  assert.ok(distanceToGeometry(centre, { type: 'Polygon', coordinates: withHole }) > 50);
});

test('cellsForBounds covers every overlapping cell', () => {
  const cells = cellsForBounds(boundsAround(centre, 1000), { lat: 0.05, lon: 0.08 });
  // -5.9342 is in cell -75, but 1 km east (-5.919) crosses into cell -74.
  assert.deepEqual(cells, ['-75_1091', '-74_1091']);
  const edge = cellsForBounds(boundsAround({ lat: 54.6, lon: -6.0 }, 1000), { lat: 0.05, lon: 0.08 });
  assert.equal(edge.length, 4);
});

test('selectNearby filters by radius, de-duplicates and sorts', () => {
  const near = { id: 'a', geometry: { type: 'Point', coordinates: [centre.lon, centre.lat + 0.002] } };
  const nearer = { id: 'b', geometry: { type: 'Point', coordinates: [centre.lon, centre.lat + 0.001] } };
  const far = { id: 'c', geometry: { type: 'Point', coordinates: [centre.lon, centre.lat + 0.02] } };
  const result = selectNearby([near, far, nearer, near], centre, 1000);
  assert.deepEqual(result.map((r) => r.id), ['b', 'a']);
  assert.ok(result[0].distance < result[1].distance);
});

test('recordsNear only fetches tiles listed in the manifest', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => ({ cellSize: { lat: 0.05, lon: 0.08 }, cells: ['-75_1091'] }) };
    return { ok: true, json: async () => ({ features: [{ id: 'x', geometry: { type: 'Point', coordinates: [centre.lon, centre.lat] }, properties: {} }] }) };
  };
  const records = await recordsNear(centre, 1000, fetchImpl, 'test-data');
  assert.deepEqual(requested, ['test-data/manifest.json', 'test-data/tiles/-75_1091.geojson']);
  assert.equal(records.length, 1);
});

test('formatDistance', () => {
  assert.equal(formatDistance(0), 'Here');
  assert.equal(formatDistance(4), '4 m');
  assert.equal(formatDistance(347), '350 m');
  assert.equal(formatDistance(1234), '1.2 km');
});

test('parseNearbyArticles sorts by distance and skips pages without coordinates', () => {
  const articles = parseNearbyArticles({
    query: {
      pages: [
        { title: 'Far', fullurl: 'https://en.wikipedia.org/wiki/Far', coordinates: [{ lat: 1, lon: 2, dist: 900 }] },
        { title: 'No coords' },
        { title: 'Near Place', coordinates: [{ lat: 3, lon: 4, dist: 120 }], extract: 'Hi.', thumbnail: { source: 'https://x/y.jpg' } },
      ],
    },
  });
  assert.deepEqual(articles.map((a) => a.title), ['Near Place', 'Far']);
  assert.equal(articles[0].url, 'https://en.wikipedia.org/wiki/Near_Place');
  assert.equal(articles[0].thumbnail, 'https://x/y.jpg');
});
