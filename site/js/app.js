/* global L */
import { parsePostcode, locatePostcode, PostcodeError } from './postcode.js';
import { recordsNear, loadManifest, RECORD_TYPES } from './records.js';
import { nearbyArticles } from './wikipedia.js';
import { formatDistance } from './geo.js';
import { EDITIONS, PRONI_VIEWER, exportTileLayer, isAvailable } from './historical-maps.js';

const SEARCH_RADIUS = 1000; // metres: the Search Area
const PAGE_SIZE = 25;
const NI_CENTRE = [54.65, -6.75];

const $ = (id) => document.getElementById(id);
const els = {
  form: $('search'),
  input: $('postcode'),
  button: document.querySelector('#search button'),
  message: $('search-message'),
  intro: $('intro'),
  heritage: $('heritage'),
  heritageCount: $('heritage-count'),
  heritageEmpty: $('heritage-empty'),
  filters: $('filters'),
  recordList: $('record-list'),
  showMore: $('show-more'),
  articles: $('articles'),
  articlesCount: $('articles-count'),
  articlesEmpty: $('articles-empty'),
  articleList: $('article-list'),
  edition: $('edition'),
  opacity: $('opacity'),
  opacityValue: $('opacity-value'),
  historicalMessage: $('historical-message'),
  dataDate: $('data-date'),
};

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const wideLayout = window.matchMedia('(min-width: 900px)');

// ------------------------------------------------------------------ map

const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(NI_CENTRE, 8);
map.attributionControl.setPrefix(false);

// Keyless modern basemap. (CARTO's basemaps now need an API key.)
const modernMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

map.createPane('historical');
map.getPane('historical').style.zIndex = 350; // above basemap tiles, below pins

const searchLayer = L.layerGroup().addTo(map);
const heritageLayer = L.layerGroup().addTo(map);
const articleLayer = L.layerGroup().addTo(map);
heritageLayer.getAttribution = () => 'DfC HED (OGL)';
articleLayer.getAttribution = () => '<a href="https://en.wikipedia.org/">Wikipedia</a>';

L.control
  .layers(
    { 'Modern map': modernMap },
    { 'Heritage records': heritageLayer, 'Nearby articles': articleLayer },
    { collapsed: true, position: 'topright' }
  )
  .addTo(map);

// ------------------------------------------------------------------ historical maps

let historicalLayer = null;

for (const edition of EDITIONS) {
  els.edition.add(new Option(edition.label, edition.id));
}

function showHistoricalMessage(html) {
  els.historicalMessage.innerHTML = html;
  els.historicalMessage.hidden = !html;
}

async function selectEdition(id) {
  if (historicalLayer) {
    map.removeLayer(historicalLayer);
    historicalLayer = null;
  }
  showHistoricalMessage('');
  const edition = EDITIONS.find((e) => e.id === id);
  els.opacity.disabled = !edition;
  if (!edition) return;

  showHistoricalMessage('Loading historical map…');
  const available = await isAvailable(edition.url);
  if (els.edition.value !== id) return; // changed while we waited
  if (!available) {
    showHistoricalMessage(
      `The historical maps aren't available on this website right now. You can still see them in the ` +
        `<a href="${PRONI_VIEWER}" target="_blank" rel="noopener">PRONI Historical Maps viewer</a>.`
    );
    return;
  }
  historicalLayer = exportTileLayer(edition.url, {
    pane: 'historical',
    opacity: els.opacity.value / 100,
  }).addTo(map);
  let failures = 0;
  historicalLayer.on('tileerror', () => {
    failures += 1;
    if (failures === 3) {
      showHistoricalMessage(
        `Some parts of this map didn't load. Try zooming in or out, or use the ` +
          `<a href="${PRONI_VIEWER}" target="_blank" rel="noopener">PRONI Historical Maps viewer</a>.`
      );
    }
  });
  showHistoricalMessage(map.getZoom() < 12 ? 'Zoom in to see the detail of the historical map.' : '');
}

els.edition.addEventListener('change', () => selectEdition(els.edition.value));
els.opacity.addEventListener('input', () => {
  els.opacityValue.value = `${els.opacity.value}%`;
  historicalLayer?.setOpacity(els.opacity.value / 100);
});
map.on('zoomend', () => {
  if (historicalLayer && els.historicalMessage.textContent.startsWith('Zoom in') && map.getZoom() >= 12) {
    showHistoricalMessage('');
  }
});

// ------------------------------------------------------------------ heritage records

const state = {
  records: [],
  shown: PAGE_SIZE,
  hiddenTypes: new Set(),
  selectedId: null,
  markers: new Map(), // record id -> Leaflet layer
};

function factsText(record) {
  return record.properties.facts.join(' · ');
}

function lookupHtml(type) {
  const lookup = RECORD_TYPES[type].lookup;
  return lookup ? ` · <a href="${lookup.url}" target="_blank" rel="noopener">${escapeHtml(lookup.text)}</a>` : '';
}

function popupHtml(record) {
  const { type, title, ref } = record.properties;
  const facts = factsText(record);
  return `<div class="popup">
    <h3>${escapeHtml(title)}</h3>
    <div class="meta">${escapeHtml(RECORD_TYPES[type].label)} · ${formatDistance(record.distance)}</div>
    ${facts ? `<p>${escapeHtml(facts)}</p>` : ''}
    <p class="ref">${escapeHtml(ref)}${lookupHtml(type)}</p>
  </div>`;
}

function visibleRecords() {
  return state.records.filter((r) => !state.hiddenTypes.has(r.properties.type));
}

function drawRecordsOnMap() {
  heritageLayer.clearLayers();
  state.markers.clear();
  for (const record of visibleRecords()) {
    const { type } = record.properties;
    const colour = RECORD_TYPES[type].colour;
    let layer;
    if (record.geometry.type === 'Point') {
      const [lon, lat] = record.geometry.coordinates;
      layer = L.circleMarker([lat, lon], { radius: 5, color: '#fff', weight: 1, fillColor: colour, fillOpacity: 0.9 });
    } else {
      layer = L.geoJSON(record.geometry, { style: { color: colour, weight: 2, fillColor: colour, fillOpacity: 0.12 } });
    }
    layer.bindPopup(() => popupHtml(record), { maxWidth: 280 });
    layer.on('click', () => selectRecord(record.id, { fromMap: true }));
    layer.addTo(heritageLayer);
    state.markers.set(record.id, layer);
  }
}

function renderFilters() {
  const counts = {};
  for (const r of state.records) counts[r.properties.type] = (counts[r.properties.type] ?? 0) + 1;
  els.filters.innerHTML = Object.entries(RECORD_TYPES)
    .map(([type, info]) => {
      const count = counts[type] ?? 0;
      const pressed = !state.hiddenTypes.has(type);
      return `<button type="button" class="chip" data-type="${type}" aria-pressed="${pressed}" ${count ? '' : 'disabled'}>
        <span class="dot" style="--dot:${info.colour}"></span>${escapeHtml(info.plural)} <span class="count">${count}</span></button>`;
    })
    .join('');
}

function renderRecordList() {
  const records = visibleRecords();
  els.heritageCount.textContent = `(${state.records.length})`;
  els.heritageEmpty.hidden = records.length > 0;
  if (!state.records.length) {
    els.heritageEmpty.textContent = 'No heritage records within 1 km. Try a historical map to see how the area has changed.';
  } else if (!records.length) {
    els.heritageEmpty.textContent = 'All record types are hidden. Use the buttons above to show them.';
  }
  els.recordList.innerHTML = records
    .slice(0, state.shown)
    .map((record) => {
      const { type, title, ref } = record.properties;
      const info = RECORD_TYPES[type];
      const facts = factsText(record);
      const selected = record.id === state.selectedId ? ' selected' : '';
      return `<li class="record${selected}" data-id="${escapeHtml(record.id)}" tabindex="0">
        <span class="dot" style="--dot:${info.colour}"></span>
        <h3>${escapeHtml(title)}</h3>
        <div class="meta">${escapeHtml(info.label)} · ${formatDistance(record.distance)}</div>
        ${facts ? `<p class="facts">${escapeHtml(facts)}</p>` : ''}
        <div class="ref">${escapeHtml(ref)}${lookupHtml(type)}</div>
      </li>`;
    })
    .join('');
  const remaining = records.length - state.shown;
  els.showMore.hidden = remaining <= 0;
  els.showMore.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} left)`;
}

function selectRecord(id, { fromMap = false } = {}) {
  state.selectedId = id;
  const records = visibleRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index >= state.shown) state.shown = Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE;
  renderRecordList();

  const item = els.recordList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const layer = state.markers.get(id);
  if (fromMap) {
    // Side-by-side layout: bring the entry into view. On phones, leave the page where it is.
    if (wideLayout.matches) item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else if (layer) {
    const target = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
    if (!map.getBounds().contains(target)) map.panTo(target);
    if (!wideLayout.matches) map.getContainer().scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (layer.getBounds) layer.openPopup(target);
    else layer.openPopup();
  }
}

els.filters.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.disabled) return;
  const { type } = chip.dataset;
  if (state.hiddenTypes.has(type)) state.hiddenTypes.delete(type);
  else state.hiddenTypes.add(type);
  state.shown = PAGE_SIZE;
  renderFilters();
  renderRecordList();
  drawRecordsOnMap();
});

els.recordList.addEventListener('click', (event) => {
  if (event.target.closest('a')) return;
  const item = event.target.closest('.record');
  if (item) selectRecord(item.dataset.id);
});
els.recordList.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('record')) {
    event.preventDefault();
    selectRecord(event.target.dataset.id);
  }
});

els.showMore.addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderRecordList();
});

function showRecords(records) {
  state.records = records;
  state.shown = PAGE_SIZE;
  state.selectedId = null;
  els.heritage.hidden = false;
  renderFilters();
  renderRecordList();
  drawRecordsOnMap();
}

function showRecordsError() {
  state.records = [];
  heritageLayer.clearLayers();
  els.heritage.hidden = false;
  els.filters.innerHTML = '';
  els.recordList.innerHTML = '';
  els.showMore.hidden = true;
  els.heritageCount.textContent = '';
  els.heritageEmpty.hidden = false;
  els.heritageEmpty.textContent = "We couldn't load the heritage records. Please try again.";
}

// ------------------------------------------------------------------ nearby articles

function showArticles(articles) {
  articleLayer.clearLayers();
  els.articles.hidden = false;
  els.articlesCount.textContent = `(${articles.length})`;
  els.articlesEmpty.hidden = articles.length > 0;
  els.articlesEmpty.textContent = 'No Wikipedia articles within 1 km.';
  els.articleList.innerHTML = articles
    .map((a) => {
      const thumb = a.thumbnail
        ? `<img class="thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy">`
        : '<span class="thumb" aria-hidden="true">W</span>';
      return `<li class="article">
        ${thumb}
        <div>
          <h3><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></h3>
          <div class="meta">${formatDistance(a.distance)} away</div>
          ${a.extract ? `<p>${escapeHtml(a.extract)}</p>` : ''}
        </div>
      </li>`;
    })
    .join('');
  for (const a of articles) {
    L.circleMarker([a.lat, a.lon], { radius: 6, color: '#111827', weight: 2.5, fillColor: '#ffffff', fillOpacity: 1 })
      .bindPopup(
        `<div class="popup"><h3><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></h3>
         <div class="meta">Wikipedia · ${formatDistance(a.distance)}</div>
         ${a.extract ? `<p>${escapeHtml(a.extract)}</p>` : ''}</div>`,
        { maxWidth: 280 }
      )
      .addTo(articleLayer);
  }
}

function showArticlesError() {
  articleLayer.clearLayers();
  els.articles.hidden = false;
  els.articlesCount.textContent = '';
  els.articleList.innerHTML = '';
  els.articlesEmpty.hidden = false;
  els.articlesEmpty.textContent = "We couldn't load Wikipedia articles right now.";
}

// ------------------------------------------------------------------ search

let searchToken = 0;

function setMessage(html, { error = false } = {}) {
  els.message.innerHTML = html;
  els.message.classList.toggle('error', error);
  els.input.setAttribute('aria-invalid', String(error));
}

async function search(input, { updateUrl = true } = {}) {
  const token = ++searchToken;
  let parsed;
  try {
    parsed = parsePostcode(input);
  } catch (error) {
    setMessage(escapeHtml(error.message), { error: true });
    els.input.focus();
    return;
  }

  els.input.value = parsed.display;
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('postcode', parsed.compact);
    if (url.href !== window.location.href) history.pushState({ postcode: parsed.compact }, '', url);
  }
  setMessage(`Looking up <strong>${escapeHtml(parsed.display)}</strong>…`);
  els.button.disabled = true;

  let place;
  try {
    place = await locatePostcode(parsed);
  } catch (error) {
    if (token !== searchToken) return;
    els.button.disabled = false;
    const message = error instanceof PostcodeError ? error.message : 'Something went wrong. Please try again.';
    setMessage(escapeHtml(message), { error: true });
    return;
  }
  if (token !== searchToken) return;
  els.button.disabled = false;

  const centre = { lat: place.lat, lon: place.lon };
  const where = place.place ? ` · ${escapeHtml(place.place)}` : '';
  setMessage(`<strong>${escapeHtml(place.label)}</strong>${where}${place.note ? `<br>${escapeHtml(place.note)}` : ''}`);
  document.title = `${place.label} · NI Postcode History`;

  els.intro.hidden = true;
  searchLayer.clearLayers();
  const circle = L.circle([centre.lat, centre.lon], {
    radius: SEARCH_RADIUS,
    color: '#1f2933',
    weight: 1.5,
    dashArray: '6 6',
    fill: true,
    fillOpacity: 0.03,
    interactive: false,
  }).addTo(searchLayer);
  L.marker([centre.lat, centre.lon], { title: place.label, keyboard: false })
    .bindTooltip(escapeHtml(place.label))
    .addTo(searchLayer);
  map.fitBounds(circle.getBounds(), { padding: [12, 12] });

  els.recordList.innerHTML = '';
  els.heritageEmpty.hidden = false;
  els.heritageEmpty.textContent = 'Loading heritage records…';
  els.heritage.hidden = false;
  els.articleList.innerHTML = '';
  els.articlesEmpty.hidden = false;
  els.articlesEmpty.textContent = 'Loading articles…';
  els.articles.hidden = false;

  recordsNear(centre, SEARCH_RADIUS)
    .then((records) => token === searchToken && showRecords(records))
    .catch(() => token === searchToken && showRecordsError());
  nearbyArticles(centre, SEARCH_RADIUS)
    .then((articles) => token === searchToken && showArticles(articles))
    .catch(() => token === searchToken && showArticlesError());
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(els.input.value);
});

function searchFromUrl() {
  const postcode = new URLSearchParams(window.location.search).get('postcode');
  if (postcode) {
    els.input.value = postcode;
    search(postcode, { updateUrl: false });
  }
}

window.addEventListener('popstate', searchFromUrl);
searchFromUrl();

loadManifest()
  .then((manifest) => {
    const date = new Date(`${manifest.generated}T00:00:00`);
    els.dataDate.textContent = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  })
  .catch(() => {});
