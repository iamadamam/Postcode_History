import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraStart, heritageRows, wikidataDate, eventRows, buildTimeline } from '../site/js/timeline.js';
import { htmlToText, splitMeaning } from '../site/js/placenames.js';
import { recordUrl } from '../site/js/records.js';
import { parseSummary } from '../site/js/wikipedia.js';
import { timelineEvents, nearestPlace } from '../site/js/wikidata.js';

const record = (id, properties) => ({ id, properties, geometry: { type: 'Point', coordinates: [0, 0] } });

test('eraStart orders named periods and centuries', () => {
  assert.ok(eraStart('Neolithic') < eraStart('Bronze Age'));
  assert.ok(eraStart('Early Christian') < eraStart('Medieval'));
  assert.equal(eraStart('17th century'), 1600);
  assert.equal(eraStart('Something else'), null);
});

test('heritageRows groups monuments by era and buildings by build date', () => {
  const rows = heritageRows([
    record('monument:1', { type: 'monument', eras: ['Neolithic'] }),
    record('monument:2', { type: 'monument', eras: ['Neolithic', 'Bronze Age'] }),
    record('monument:3', { type: 'monument', eras: [] }),
    record('building:1', { type: 'building', built: [1820, 1839] }),
    record('building:2', { type: 'building', built: [1820, 1839] }),
    record('building:3', { type: 'building', built: [null, 1600] }),
    record('park:1', { type: 'park' }),
  ]);
  const byWhen = Object.fromEntries(rows.map((r) => [r.when, r]));
  assert.equal(byWhen.Neolithic.title, '2 monuments');
  assert.deepEqual(byWhen.Neolithic.ids, ['monument:1', 'monument:2']);
  assert.equal(byWhen['Bronze Age'].title, '1 monument');
  assert.equal(byWhen['1820–1839'].title, '2 historic buildings built');
  assert.equal(byWhen['Before 1600'].sortYear, 1599);
  assert.equal(rows.length, 4);
});

test('wikidataDate respects precision and BC years', () => {
  assert.deepEqual(wikidataDate('1971-11-02T00:00:00Z', 11).label, '2 November 1971');
  assert.equal(wikidataDate('1971-11-01T00:00:00Z', 10).label, 'November 1971');
  assert.equal(wikidataDate('1845-01-01T00:00:00Z', 9).label, '1845');
  assert.equal(wikidataDate('1840-01-01T00:00:00Z', 8).label, '1840s');
  assert.equal(wikidataDate('1801-01-01T00:00:00Z', 7).label, '19th century');
  assert.equal(wikidataDate('-0500-01-01T00:00:00Z', 9).label, '501 BC');
  assert.equal(wikidataDate('nonsense', 9), null);
});

const binding = (item, label, p, time, { article = true, precision = 9, dist = 0.2 } = {}) => ({
  item: { value: `http://www.wikidata.org/entity/${item}` },
  itemLabel: { value: label },
  p: { value: p },
  time: { value: time },
  precision: { value: String(precision) },
  dist: { value: String(dist) },
  coord: { value: 'Point(-5.93 54.58)' },
  ...(article ? { article: { value: `https://en.wikipedia.org/wiki/${label.replace(/ /g, '_')}` } } : {}),
});

test('eventRows keeps articles and dated events, and drops the rest', () => {
  const rows = eventRows([
    binding('Q1', 'Queen’s University Belfast', 'P571', '1845-01-01T00:00:00Z'),
    binding('Q1', 'Queen’s University Belfast', 'P571', '1845-01-01T00:00:00Z'), // duplicate
    binding('Q2', '9 Chichester Street', 'P571', '1819-01-01T00:00:00Z', { article: false }), // no article, not an event
    binding('Q3', 'Red Lion Pub bombing', 'P585', '1971-11-02T00:00:00Z', { article: false, precision: 11 }),
    binding('Q4', 'Q4', 'P585', '1990-01-01T00:00:00Z', { article: false }), // no English label
  ]);
  assert.deepEqual(rows.map((r) => r.title), ['Queen’s University Belfast', 'Red Lion Pub bombing']);
  const bombing = rows[1];
  assert.equal(bombing.when, '2 November 1971');
  assert.equal(bombing.event, true);
  assert.equal(bombing.article, null);
  assert.equal(bombing.lat, 54.58);
  assert.equal(Math.round(bombing.distance), 200);
  assert.equal(rows[0].verb, 'founded or built');
});

test('buildTimeline sorts oldest first', () => {
  const timeline = buildTimeline(
    [{ kind: 'event', sortYear: 1845, when: '1845' }],
    [{ kind: 'heritage', sortYear: -4000, when: 'Neolithic' }, { kind: 'heritage', sortYear: 1820, when: '1820–1839' }]
  );
  assert.deepEqual(timeline.map((r) => r.when), ['Neolithic', '1820–1839', '1845']);
});

test('timelineEvents widens to 5 km when 1 km finds fewer than 5 entries', async () => {
  const queries = [];
  const fetchImpl = async (url) => {
    const query = decodeURIComponent(new URL(url).searchParams.get('query'));
    queries.push(query.match(/radius "(\d+)"/)[1]);
    const n = query.includes('radius "1"') ? 2 : 6;
    const bindings = Array.from({ length: n }, (_, i) => binding(`Q${i}`, `Place ${i}`, 'P571', `${1800 + i}-01-01T00:00:00Z`));
    return { ok: true, json: async () => ({ results: { bindings } }) };
  };
  const result = await timelineEvents({ lat: 54.6, lon: -6 }, fetchImpl);
  assert.deepEqual(queries, ['1', '5']);
  assert.equal(result.radius, 5000);
  assert.equal(result.rows.length, 6);
});

test('nearestPlace takes the name from the article title', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ results: { bindings: [{ item: { value: 'x' }, article: { value: "https://en.wikipedia.org/wiki/Queen%27s_Quarter,_Belfast" }, dist: { value: '0.14' } }] } }),
  });
  assert.deepEqual(await nearestPlace({ lat: 54.6, lon: -6 }, fetchImpl), { name: "Queen's Quarter", town: 'Belfast', title: "Queen's Quarter, Belfast", distance: 140 });
});

test('htmlToText strips tags and decodes entities, never keeping markup', () => {
  assert.equal(htmlToText('<p>\r\n\tIr. <em>Baile na Faiche </em>&lsquo;townland of the lawn&rsquo;</p>\r\n'), 'Ir. Baile na Faiche ‘townland of the lawn’');
  assert.equal(htmlToText('<script>alert(1)</script>Safe &amp; sound &#233;'), 'alert(1)Safe & sound é');
  assert.equal(htmlToText('<p>One</p><p>Two</p>'), 'One\nTwo');
  assert.equal(htmlToText(null), '');
});

test('splitMeaning separates the Irish form from the meaning', () => {
  assert.deepEqual(splitMeaning('Ir. Baile na Faiche ‘townland of the lawn or green’'), { irish: 'Baile na Faiche', meaning: 'townland of the lawn or green' });
  assert.deepEqual(splitMeaning('Maigh Luain [my looin] ‘Luan’s plain’'), { irish: 'Maigh Luain [my looin]', meaning: 'Luan’s plain' });
  assert.deepEqual(splitMeaning('An Ollscoil'), { irish: 'An Ollscoil', meaning: '' });
  assert.equal(splitMeaning('An Sruthán Milis, ‘the sweet stream’').irish, 'An Sruthán Milis');
});

test('recordUrl links monuments and buildings to their DfC pages', () => {
  assert.equal(recordUrl({ type: 'monument', recordId: 2 }), 'https://apps.communities-ni.gov.uk/NISMR-public/Details.aspx?MonID=2');
  assert.equal(recordUrl({ type: 'building', recordId: 4281 }), 'https://apps.communities-ni.gov.uk/Buildings/buildview.aspx?id=4281&js=false');
  assert.equal(recordUrl({ type: 'monument' }), null);
  assert.equal(recordUrl({ type: 'industrial', recordId: 5 }), null);
});

test('parseSummary reads a Wikipedia REST summary', () => {
  const summary = parseSummary({
    title: 'Botanic_Gardens',
    titles: { normalized: 'Botanic Gardens' },
    description: 'Park in Belfast',
    extract: 'A park.',
    thumbnail: { source: 'https://x/t.jpg' },
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Botanic_Gardens' } },
  });
  assert.deepEqual(summary, {
    title: 'Botanic Gardens',
    description: 'Park in Belfast',
    extract: 'A park.',
    image: 'https://x/t.jpg',
    thumbnail: 'https://x/t.jpg',
    url: 'https://en.wikipedia.org/wiki/Botanic_Gardens',
  });
});
