import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostcode, locatePostcode, PostcodeError } from '../site/js/postcode.js';

test('parses full NI postcodes with any spacing or case', () => {
  for (const input of ['BT7 1NN', 'bt71nn', '  Bt7  1nN ', 'BT7-1NN']) {
    assert.deepEqual(parsePostcode(input), { kind: 'postcode', compact: 'BT71NN', display: 'BT7 1NN' });
  }
  assert.equal(parsePostcode('bt488aa').display, 'BT48 8AA');
});

test('parses postcode districts', () => {
  assert.deepEqual(parsePostcode('bt7'), { kind: 'district', compact: 'BT7', display: 'BT7' });
  assert.equal(parsePostcode('BT48').kind, 'district');
});

test('rejects empty, non-NI and malformed input with friendly messages', () => {
  assert.throws(() => parsePostcode(''), (e) => e instanceof PostcodeError && /Enter a Northern Ireland postcode/.test(e.message));
  assert.throws(() => parsePostcode('SW1A 1AA'), /outside Northern Ireland/);
  assert.throws(() => parsePostcode('M1'), /outside Northern Ireland/);
  assert.throws(() => parsePostcode('BT7 1N'), /doesn't look like a postcode/);
  assert.throws(() => parsePostcode('hello'), /doesn't look like a postcode/);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const path = new URL(url).pathname;
    if (!(path in routes)) return { ok: false, status: 404, json: async () => ({}) };
    const route = routes[path];
    if (route instanceof Error) throw route;
    return { ok: route.status === 200, status: route.status, json: async () => route.body };
  };
  impl.calls = calls;
  return impl;
}

test('locates a live postcode', async () => {
  const fetchImpl = fakeFetch({
    '/postcodes/BT71NN': { status: 200, body: { result: { postcode: 'BT7 1NN', latitude: 54.58, longitude: -5.93, admin_ward: 'Botanic', admin_district: 'Belfast' } } },
  });
  const place = await locatePostcode(parsePostcode('BT7 1NN'), fetchImpl);
  assert.deepEqual(place, { lat: 54.58, lon: -5.93, label: 'BT7 1NN', place: 'Botanic, Belfast', note: '' });
});

test('falls back to terminated postcodes with a note', async () => {
  const fetchImpl = fakeFetch({
    '/terminated_postcodes/BT11AA': { status: 200, body: { result: { postcode: 'BT1 1AA', latitude: 54.6, longitude: -5.9, year_terminated: 2005 } } },
  });
  const place = await locatePostcode(parsePostcode('BT1 1AA'), fetchImpl);
  assert.equal(place.lat, 54.6);
  assert.match(place.note, /stopped being used in 2005/);
});

test('uses the centre of a postcode district', async () => {
  const fetchImpl = fakeFetch({
    '/outcodes/BT7': { status: 200, body: { result: { latitude: 54.58, longitude: -5.92, admin_district: ['Belfast'] } } },
  });
  const place = await locatePostcode(parsePostcode('BT7'), fetchImpl);
  assert.equal(place.place, 'Belfast');
  assert.match(place.note, /centre of the BT7 district/);
});

test('reports unknown postcodes and network failures kindly', async () => {
  await assert.rejects(locatePostcode(parsePostcode('BT7 9ZZ'), fakeFetch({})), /couldn't find BT7 9ZZ/);
  await assert.rejects(
    locatePostcode(parsePostcode('BT7 1NN'), fakeFetch({ '/postcodes/BT71NN': new TypeError('offline') })),
    /couldn't reach the postcode service/
  );
  await assert.rejects(
    locatePostcode(parsePostcode('BT7 1NN'), fakeFetch({ '/postcodes/BT71NN': { status: 500, body: {} } })),
    /having problems/
  );
});
