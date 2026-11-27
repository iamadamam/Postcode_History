import { parsePostcode, locatePostcode, PostcodeError } from './postcode.js';
import { recordsNear, loadManifest, RECORD_TYPES, recordUrl, countByType } from './records.js';
import { nearbyArticles, articleSummary, articleUrl, titleFromUrl } from './wikipedia.js';
import { escapeHtml } from './format.js';
import { timelineEvents, nearestPlace } from './wikidata.js';
import { heritageRows, buildTimeline } from './timeline.js';
import { townlandAt, placeNamesNear, PLACENAMES_CREDIT } from './placenames.js';
import { formatDistance } from './geo.js';
import { createMap } from './map.js';
import { FEATURES, SEARCH_RADIUS } from './config.js';
import { EDITIONS, PRONI_VIEWER, exportTiles, isAvailable } from './historical-maps.js';

const RECORDS_PAGE = 25;
const ARTICLES_PAGE = 10;

const $ = (id) => document.getElementById(id);
const skeleton = '<div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>';
const wideLayout = window.matchMedia('(min-width: 960px)');

// ------------------------------------------------------------------ theme

const THEMES = ['auto', 'light', 'dark'];
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const themeButton = $('theme-toggle');

function readThemePref() {
  try {
    const saved = localStorage.getItem('theme');
    return THEMES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}
let themePref = readThemePref();
const effectiveTheme = () => (themePref === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : themePref);

function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePref = themePref;
  const label = themePref[0].toUpperCase() + themePref.slice(1);
  themeButton.querySelector('.theme-label').textContent = label;
  themeButton.setAttribute('aria-label', `Theme: ${label}. Change theme`);
  map?.setTheme(theme);
}

themeButton.addEventListener('click', () => {
  themePref = THEMES[(THEMES.indexOf(themePref) + 1) % THEMES.length];
  try {
    localStorage.setItem('theme', themePref);
  } catch {
    // Private mode or storage blocked: the choice lasts for this visit only.
  }
  applyTheme();
});
darkQuery.addEventListener('change', () => themePref === 'auto' && applyTheme());

// Keep sticky tabs just below the (variable-height) top bar.
const topbar = document.querySelector('.topbar');
new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`)).observe(topbar);

// ------------------------------------------------------------------ map

let map = null;
map = createMap('map', {
  theme: effectiveTheme(),
  onRecordClick: (id) => selectRecord(id, { fromMap: true }),
  onArticleClick: (title) => openArticle(title),
});
applyTheme();

// ------------------------------------------------------------------ tabs

const tabs = [...document.querySelectorAll('[role="tab"]')];

function showTab(name, { focus = false } = {}) {
  for (const tab of tabs) {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(tab);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showTab(tabs[(next + tabs.length) % tabs.length].id.replace('tab-', ''), { focus: true });
  });
}

function goToTab(name) {
  showTab(name);
  const nav = document.querySelector('.tabs');
  if (nav.getBoundingClientRect().top < 0 || !wideLayout.matches) nav.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ------------------------------------------------------------------ heritage records

const heritage = {
  records: [],
  byId: new Map(),
  shown: RECORDS_PAGE,
  hiddenTypes: new Set(),
  onlyIds: null,
  onlyLabel: '',
  selectedId: null,
  failed: false,
};

/**
 * Change which Heritage Records are shown: only some records (from a Timeline row),
 * only one Record Type (from a quick fact), or everything.
 */
function setHeritageFilter({ onlyIds = null, label = '', onlyType = null } = {}) {
  heritage.onlyIds = onlyIds;
  heritage.onlyLabel = label;
  heritage.hiddenTypes = new Set(onlyType ? Object.keys(RECORD_TYPES).filter((t) => t !== onlyType) : []);
  heritage.shown = RECORDS_PAGE;
  refreshHeritage();
}

function factsText(record) {
  return record.properties.facts.join(' · ');
}

function recordLinkHtml(record) {
  const url = recordUrl(record.properties);
  return url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">View DfC record ↗</a>` : '';
}

function recordPopupHtml(record) {
  const { type, title, ref } = record.properties;
  const facts = factsText(record);
  return `<div class="popup">
    <h3>${escapeHtml(title)}</h3>
    <div class="meta">${escapeHtml(RECORD_TYPES[type].label)} · ${formatDistance(record.distance)}</div>
    ${facts ? `<p>${escapeHtml(facts)}</p>` : ''}
    <p class="ref">${escapeHtml(ref)}${recordLinkHtml(record)}</p>
  </div>`;
}

function visibleRecords() {
  const only = heritage.onlyIds ? new Set(heritage.onlyIds) : null;
  return heritage.records.filter((r) => !heritage.hiddenTypes.has(r.properties.type) && (!only || only.has(r.id)));
}

function renderFilters() {
  const counts = countByType(heritage.records);
  $('filters').innerHTML = Object.entries(RECORD_TYPES)
    .map(([type, info]) => {
      const count = counts[type] ?? 0;
      const pressed = !heritage.hiddenTypes.has(type);
      return `<button type="button" class="chip" data-type="${type}" aria-pressed="${pressed}" ${count ? '' : 'disabled'}>
        <span class="dot" style="--dot:${info.colour}"></span>${escapeHtml(info.plural)} <span class="count">${count}</span></button>`;
    })
    .join('');
}

function renderRecordList() {
  const records = visibleRecords();
  const empty = $('heritage-empty');
  empty.hidden = records.length > 0;
  if (heritage.failed) empty.textContent = "We couldn't load the heritage records. Please try again.";
  else if (!heritage.records.length) empty.textContent = 'No heritage records within 1 km.';
  else if (!records.length) empty.textContent = 'Nothing matches. Use the buttons above to show more record types.';

  $('record-list').innerHTML = records
    .slice(0, heritage.shown)
    .map((record) => {
      const { type, title, ref } = record.properties;
      const info = RECORD_TYPES[type];
      const facts = factsText(record);
      const selected = record.id === heritage.selectedId ? ' selected' : '';
      return `<li class="record${selected}" data-id="${escapeHtml(record.id)}" tabindex="0">
        <span class="dot" style="--dot:${info.colour}"></span>
        <h3>${escapeHtml(title)}</h3>
        <div class="meta">${escapeHtml(info.label)} · ${formatDistance(record.distance)}</div>
        ${facts ? `<p class="facts-line">${escapeHtml(facts)}</p>` : ''}
        <div class="ref">${escapeHtml(ref)}${recordLinkHtml(record)}</div>
      </li>`;
    })
    .join('');
  const remaining = records.length - heritage.shown;
  $('show-more').hidden = remaining <= 0;
  $('show-more').textContent = `Show ${Math.min(RECORDS_PAGE, remaining)} more (${remaining} left)`;

  $('filter-banner').hidden = !heritage.onlyIds;
  $('filter-text').textContent = heritage.onlyLabel;
}

function refreshHeritage() {
  renderFilters();
  renderRecordList();
  map.setRecordFilter({ hiddenTypes: [...heritage.hiddenTypes], onlyIds: heritage.onlyIds });
}

function selectRecord(id, { fromMap = false } = {}) {
  const record = heritage.byId.get(id);
  if (!record) return;
  heritage.selectedId = id;
  const index = visibleRecords().findIndex((r) => r.id === id);
  if (index >= heritage.shown) heritage.shown = Math.ceil((index + 1) / RECORDS_PAGE) * RECORDS_PAGE;
  renderRecordList();
  map.selectRecord(id);
  const target = map.focus(record.geometry, { forPopup: true });
  map.openPopup(target, recordPopupHtml(record));

  if (fromMap) {
    if (wideLayout.matches) {
      showTab('heritage');
      $('record-list').querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (!wideLayout.matches) {
    $('map').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

$('filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.disabled) return;
  const { type } = chip.dataset;
  if (heritage.hiddenTypes.has(type)) heritage.hiddenTypes.delete(type);
  else heritage.hiddenTypes.add(type);
  heritage.shown = RECORDS_PAGE;
  refreshHeritage();
});
$('record-list').addEventListener('click', (event) => {
  if (event.target.closest('a')) return;
  const item = event.target.closest('.record');
  if (item) selectRecord(item.dataset.id);
});
$('record-list').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('record')) {
    event.preventDefault();
    selectRecord(event.target.dataset.id);
  }
});
$('show-more').addEventListener('click', () => {
  heritage.shown += RECORDS_PAGE;
  renderRecordList();
});
$('filter-clear').addEventListener('click', () => setHeritageFilter());

function showRecords(records) {
  heritage.records = records;
  heritage.byId = new Map(records.map((r) => [r.id, r]));
  heritage.shown = RECORDS_PAGE;
  heritage.onlyIds = null;
  heritage.selectedId = null;
  $('count-heritage').textContent = records.length.toLocaleString('en-GB');
  map.setRecords(records);
  refreshHeritage();
}

// ------------------------------------------------------------------ articles

const articles = { list: [], shown: ARTICLES_PAGE, byTitle: new Map() };

function renderArticles() {
  const { list } = articles;
  $('articles-empty').hidden = list.length > 0;
  $('articles-empty').textContent = 'No Wikipedia articles within 1 km.';
  $('article-list').innerHTML = list
    .slice(0, articles.shown)
    .map((a) => {
      const thumb = a.thumbnail
        ? `<img class="thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy">`
        : '<span class="thumb" aria-hidden="true">W</span>';
      return `<li><button type="button" class="article-item" data-title="${escapeHtml(a.title)}">
        ${thumb}
        <span>
          <h3>${escapeHtml(a.title)}</h3>
          <span class="meta">${formatDistance(a.distance)} away</span>
          ${a.extract ? `<p>${escapeHtml(a.extract)}</p>` : ''}
        </span>
      </button></li>`;
    })
    .join('');
  const remaining = list.length - articles.shown;
  $('articles-more').hidden = remaining <= 0;
  $('articles-more').textContent = `Show ${Math.min(ARTICLES_PAGE, remaining)} more`;
}

$('article-list').addEventListener('click', (event) => {
  const item = event.target.closest('.article-item');
  if (item) openArticle(item.dataset.title);
});
$('articles-more').addEventListener('click', () => {
  articles.shown += ARTICLES_PAGE;
  renderArticles();
});

// ------------------------------------------------------------------ article dialog

const dialog = $('article-dialog');
let dialogTarget = null;

async function openArticle(title, { lngLat = null } = {}) {
  const known = articles.byTitle.get(title);
  dialogTarget = lngLat ?? (known ? [known.lon, known.lat] : null);
  $('dialog-title').textContent = title;
  $('dialog-description').textContent = '';
  $('dialog-extract').innerHTML = skeleton;
  $('dialog-image').hidden = true;
  $('dialog-link').href = articleUrl(title);
  $('dialog-map').hidden = !dialogTarget;
  if (!dialog.open) dialog.showModal();
  try {
    const summary = await articleSummary(title);
    if ($('dialog-title').textContent !== title) return;
    $('dialog-title').textContent = summary.title || title;
    $('dialog-description').textContent = summary.description;
    $('dialog-extract').textContent = summary.extract || known?.extract || '';
    $('dialog-link').href = summary.url;
    if (summary.image) {
      $('dialog-image').src = summary.image;
      $('dialog-image').hidden = false;
    }
  } catch {
    if ($('dialog-title').textContent !== title) return; // another article was opened meanwhile
    $('dialog-extract').textContent = known?.extract || "We couldn't load a summary. You can still read the full article on Wikipedia.";
  }
}

$('dialog-map').addEventListener('click', () => {
  dialog.close();
  if (!dialogTarget) return;
  map.focus(dialogTarget);
  if (!wideLayout.matches) $('map').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close(); // click on the backdrop
});

// ------------------------------------------------------------------ timeline

const timeline = { events: null, heritage: null, radius: SEARCH_RADIUS, rows: [], newspaperTown: null, failed: false };

function renderTimeline() {
  if (timeline.events === null && !timeline.failed) {
    $('timeline').innerHTML = `<li>${skeleton}</li>`;
    return;
  }
  const rows = buildTimeline(timeline.events ?? [], timeline.heritage ?? []);
  timeline.rows = rows;
  $('count-timeline').textContent = rows.length ? String(rows.length) : '';

  const wide = timeline.radius > SEARCH_RADIUS;
  $('timeline-intro').textContent = timeline.failed
    ? "We couldn't load events from Wikidata just now, so this shows the heritage records only."
    : wide
      ? 'Few dated places or events were recorded within 1 km, so this timeline looks up to 5 km away. Heritage rows still cover 1 km.'
      : 'Places and events within 1 km, oldest first, with the heritage records grouped by period.';

  $('timeline-empty').hidden = rows.length > 0;
  $('timeline-empty').textContent = 'Nothing dated has been recorded near here yet.';

  $('timeline').innerHTML = rows
    .map((row, index) => {
      if (row.kind === 'heritage') {
        const colour = RECORD_TYPES[row.recordType].colour;
        return `<li style="--dot:${colour}">
          <div class="when">${escapeHtml(row.when)}</div>
          <button type="button" class="entry" data-index="${index}">
            <div class="title">${escapeHtml(row.title)}</div>
            <div class="hint">${escapeHtml(row.hint ? `${row.hint} · ` : '')}See these records</div>
          </button>
        </li>`;
      }
      const meta = [row.verb ? row.verb[0].toUpperCase() + row.verb.slice(1) : 'Event', formatDistance(row.distance)].join(' · ');
      const clickable = row.article || (row.lat !== null && row.lon !== null);
      return `<li class="${row.event ? 'event' : ''}">
        <div class="when">${escapeHtml(row.when)}</div>
        <${clickable ? `button type="button" class="entry" data-index="${index}"` : 'div class="entry static"'}>
          <div class="title">${escapeHtml(row.title)}</div>
          <div class="meta">${escapeHtml(meta)}${row.article ? ' · Wikipedia' : ''}</div>
        </${clickable ? 'button' : 'div'}>
      </li>`;
    })
    .join('');

  const newspapers = $('newspapers');
  if (timeline.newspaperTown) {
    newspapers.hidden = false;
    newspapers.href = `https://www.britishnewspaperarchive.co.uk/search/results?basicsearch=${encodeURIComponent(timeline.newspaperTown)}`;
    newspapers.innerHTML = `<strong>Search old newspapers for ${escapeHtml(timeline.newspaperTown)} ↗</strong>
      <span>British Newspaper Archive: free to search, subscription to read.</span>`;
  } else {
    newspapers.hidden = true;
  }
  renderFacts();
}

$('timeline').addEventListener('click', (event) => {
  const entry = event.target.closest('button.entry');
  if (!entry) return;
  const row = timeline.rows[Number(entry.dataset.index)];
  if (!row) return;
  if (row.kind === 'heritage') {
    setHeritageFilter({ onlyIds: row.ids, label: `Showing ${row.title} from ${row.when}.` });
    goToTab('heritage');
    return;
  }
  const lngLat = row.lat !== null ? [row.lon, row.lat] : null;
  if (lngLat) map.focus(lngLat, { forPopup: !row.article });
  if (row.article) {
    openArticle(titleFromUrl(row.article), { lngLat });
  } else if (lngLat) {
    map.openPopup(lngLat, `<div class="popup"><h3>${escapeHtml(row.title)}</h3><div class="meta">${escapeHtml(row.when)}</div></div>`);
    if (!wideLayout.matches) $('map').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
});

// ------------------------------------------------------------------ area summary (the Overview tab)

const areaSummary = { recordsLoaded: false };

function renderFacts() {
  const facts = [];
  const records = heritage.records;
  if (areaSummary.recordsLoaded && !heritage.failed) {
    const counts = countByType(records);
    facts.push({ value: records.length, label: 'heritage records within 1 km', tab: 'heritage' });
    const oldest = timeline.rows[0];
    if (oldest) facts.push({ value: oldest.when, label: 'the oldest thing on the timeline', tab: 'timeline', small: true });
    for (const [type, info] of Object.entries(RECORD_TYPES)) {
      if (counts[type]) facts.push({ value: counts[type], label: info.plural.toLowerCase(), tab: 'heritage', type, colour: info.colour });
    }
  }
  if (timeline.rows.length) facts.push({ value: timeline.rows.length, label: 'entries on the timeline', tab: 'timeline' });
  if (articles.list.length) facts.push({ value: articles.list.length, label: 'Wikipedia articles nearby', tab: 'articles' });

  $('facts').innerHTML = facts
    .map(
      (f, i) => `<button type="button" class="fact" data-index="${i}">
        <strong${f.small ? ' style="font-size:1.15rem"' : ''}>${escapeHtml(typeof f.value === 'number' ? f.value.toLocaleString('en-GB') : f.value)}</strong>
        <span>${f.colour ? `<span class="dot" style="--dot:${f.colour}"></span>` : ''}${escapeHtml(f.label)}</span>
      </button>`
    )
    .join('');
  $('facts').onclick = (event) => {
    const button = event.target.closest('.fact');
    if (!button) return;
    const fact = facts[Number(button.dataset.index)];
    if (fact.type) setHeritageFilter({ onlyType: fact.type });
    goToTab(fact.tab);
  };
}

async function renderTownCard(centre, token) {
  const card = $('town-card');
  card.hidden = false;
  card.innerHTML = `<div class="card-body">${skeleton}</div>`;
  try {
    const found = await nearestPlace(centre);
    if (token !== searchToken) return;
    if (!found) {
      card.hidden = true;
      return;
    }
    const { place, town } = found;
    timeline.newspaperTown = (town ?? place).name;
    renderTimeline();
    let summary = null;
    try {
      summary = await articleSummary(place.title);
    } catch {
      // Show the card without the summary.
    }
    if (token !== searchToken) return;
    const image = summary?.thumbnail ? `<img src="${escapeHtml(summary.image || summary.thumbnail)}" alt="" loading="lazy">` : '';
    card.innerHTML = `${image}
      <div class="card-body">
        <p class="card-eyebrow">About the area</p>
        <h2>${escapeHtml(summary?.title || place.title)}</h2>
        ${summary?.description ? `<p class="meta">${escapeHtml(summary.description)}</p>` : ''}
        <p class="extract">${escapeHtml(summary?.extract || '')}</p>
        <a class="card-link" href="${escapeHtml(summary?.url || articleUrl(place.title))}" target="_blank" rel="noopener">Read more on Wikipedia ↗</a>
      </div>`;
  } catch {
    if (token === searchToken) card.hidden = true;
  }
}

async function renderPlaceNames(centre, token) {
  const card = $('townland-card');
  const namesCard = $('names-card');
  card.hidden = false;
  card.innerHTML = skeleton;
  namesCard.hidden = true;
  const credit = `From the <a href="${PLACENAMES_CREDIT.url}" target="_blank" rel="noopener">${escapeHtml(PLACENAMES_CREDIT.text)}</a>.`;
  let townlandId = null;
  try {
    const townland = await townlandAt(centre);
    if (token !== searchToken) return;
    townlandId = townland?.id ?? null;
    if (!townland) {
      card.hidden = true;
    } else {
      const where = [townland.parish && `${townland.parish} parish`, townland.county && `Co. ${townland.county}`].filter(Boolean).join(' · ');
      card.innerHTML = `<p class="card-eyebrow">Your townland</p>
        <h2>${escapeHtml(townland.name)}</h2>
        ${townland.irish ? `<p class="irish">${escapeHtml(townland.irish)}</p>` : ''}
        ${townland.meaning ? `<p class="meaning">“${escapeHtml(townland.meaning)}”</p>` : ''}
        ${townland.origin ? `<p class="meaning">${escapeHtml(townland.origin)}</p>` : ''}
        ${!townland.meaning && !townland.origin ? '<p class="meta">No meaning has been recorded for this name yet.</p>' : ''}
        ${where ? `<p class="meta">${escapeHtml(where)}</p>` : ''}
        ${townland.history ? `<details><summary>The story of the name</summary><p>${escapeHtml(townland.history)}</p></details>` : ''}
        <p class="credit">${credit}</p>`;
    }
  } catch {
    if (token !== searchToken) return;
    card.innerHTML = `<p class="card-eyebrow">Your townland</p><p class="empty">We couldn't load place names just now.</p>`;
    return;
  }
  try {
    const names = await placeNamesNear(centre, SEARCH_RADIUS, { exclude: townlandId }, fetch);
    if (token !== searchToken) return;
    if (names.length) {
      namesCard.hidden = false;
      $('names-list').innerHTML = names
        .map(
          (n) => `<li>
            <span class="name">${escapeHtml(n.name)}</span>
            <span class="distance">${formatDistance(n.distance)}</span>
            <span class="meaning">${n.irish ? `<em>${escapeHtml(n.irish)}</em> · ` : ''}“${escapeHtml(n.meaning)}”</span>
          </li>`
        )
        .join('');
      $('names-credit').innerHTML = credit;
    }
  } catch {
    // Nearby names are extra: leave the townland card as it is and show nothing more.
  }
}

// ------------------------------------------------------------------ search

let searchToken = 0;

function setMessage(html, { error = false } = {}) {
  const message = $('search-message');
  message.innerHTML = html;
  message.classList.toggle('error', error);
  $('postcode').setAttribute('aria-invalid', String(error));
}

function resetResults() {
  showTab('overview');
  heritage.records = [];
  heritage.byId = new Map();
  heritage.hiddenTypes.clear();
  heritage.onlyIds = null;
  articles.list = [];
  articles.byTitle = new Map();
  articles.shown = ARTICLES_PAGE;
  Object.assign(timeline, { events: null, heritage: null, radius: SEARCH_RADIUS, rows: [], newspaperTown: null, failed: false });
  Object.assign(areaSummary, { recordsLoaded: false });
  heritage.failed = false;
  for (const id of ['count-timeline', 'count-heritage', 'count-articles']) $(id).textContent = '';
  $('facts').innerHTML = skeleton;
  $('record-list').innerHTML = `<li>${skeleton}</li>`;
  $('filters').innerHTML = '';
  $('show-more').hidden = true;
  $('heritage-empty').hidden = true;
  $('article-list').innerHTML = `<li>${skeleton}</li>`;
  $('articles-empty').hidden = true;
  $('articles-more').hidden = true;
  $('newspapers').hidden = true;
  $('timeline-intro').textContent = '';
  $('timeline-empty').hidden = true;
  renderTimeline();
  map.setRecords([]);
  map.setArticles([]);
  map.closePopup();
}

async function search(input, { updateUrl = true } = {}) {
  const token = ++searchToken;
  let parsed;
  try {
    parsed = parsePostcode(input);
  } catch (error) {
    // This search replaces any lookup still running, so make sure the button works again.
    document.querySelector('#search button').disabled = false;
    setMessage(escapeHtml(error.message), { error: true });
    $('postcode').focus();
    return;
  }

  $('postcode').value = parsed.display;
  setMessage(`Looking up <strong>${escapeHtml(parsed.display)}</strong>…`);
  const button = document.querySelector('#search button');
  button.disabled = true;

  let place;
  try {
    place = await locatePostcode(parsed);
  } catch (error) {
    if (token !== searchToken) return;
    button.disabled = false;
    setMessage(escapeHtml(error instanceof PostcodeError ? error.message : 'Something went wrong. Please try again.'), { error: true });
    return;
  }
  if (token !== searchToken) return;
  button.disabled = false;
  setMessage('');
  // Only now that the postcode was found does the address bar change, so it always matches the results.
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('postcode', parsed.compact);
    if (url.href !== window.location.href) history.pushState({ postcode: parsed.compact }, '', url);
  }

  const centre = { lat: place.lat, lon: place.lon };
  document.title = `${place.label} · NI Postcode History`;
  $('intro').hidden = true;
  $('results').hidden = false;
  $('place-eyebrow').textContent = place.place || 'Northern Ireland';
  $('place-title').textContent = place.label;
  $('place-note').hidden = !place.note;
  $('place-note').textContent = place.note;
  resetResults();
  map.showSearchArea(centre, SEARCH_RADIUS);
  if (!wideLayout.matches) $('panel').focus({ preventScroll: true });

  // Heritage records come from local tiles (fast); the Timeline waits for them so it knows how
  // many heritage rows it already has before deciding whether to widen its search to 5 km.
  const heritageLoaded = recordsNear(centre, SEARCH_RADIUS)
    .then((records) => {
      if (token !== searchToken) return;
      areaSummary.recordsLoaded = true;
      showRecords(records);
      timeline.heritage = heritageRows(records);
      renderTimeline();
    })
    .catch(() => {
      if (token !== searchToken) return;
      areaSummary.recordsLoaded = true;
      heritage.failed = true;
      $('record-list').innerHTML = '';
      renderRecordList();
      timeline.heritage = [];
      renderTimeline();
    });

  heritageLoaded
    .then(() => timelineEvents(centre, fetch, { alreadyShown: timeline.heritage?.length ?? 0 }))
    .then(({ rows, radius }) => {
      if (token !== searchToken) return;
      timeline.events = rows;
      timeline.radius = radius;
      renderTimeline();
    })
    .catch(() => {
      if (token !== searchToken) return;
      timeline.events = [];
      timeline.failed = true;
      renderTimeline();
    });

  nearbyArticles(centre, SEARCH_RADIUS)
    .then((list) => {
      if (token !== searchToken) return;
      articles.list = list;
      articles.byTitle = new Map(list.map((a) => [a.title, a]));
      $('count-articles').textContent = list.length ? String(list.length) : '';
      map.setArticles(list);
      renderArticles();
      renderFacts();
    })
    .catch(() => {
      if (token !== searchToken) return;
      $('article-list').innerHTML = '';
      $('articles-empty').hidden = false;
      $('articles-empty').textContent = "We couldn't load Wikipedia articles right now.";
    });

  renderTownCard(centre, token);
  renderPlaceNames(centre, token);
}

$('search').addEventListener('submit', (event) => {
  event.preventDefault();
  search($('postcode').value);
});

function searchFromUrl() {
  const postcode = new URLSearchParams(window.location.search).get('postcode');
  if (postcode) {
    $('postcode').value = postcode;
    search(postcode, { updateUrl: false });
  }
}
window.addEventListener('popstate', searchFromUrl);
searchFromUrl();

loadManifest()
  .then((manifest) => {
    const date = new Date(`${manifest.generated}T00:00:00`);
    $('data-date').textContent = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  })
  .catch(() => {});

// ------------------------------------------------------------------ historical maps (switched off in config.js)

if (FEATURES.historicalMaps) {
  $('historical').hidden = false;
  const select = $('edition');
  const opacity = $('opacity');
  const message = $('historical-message');
  for (const edition of EDITIONS) select.add(new Option(edition.label, edition.id));
  select.addEventListener('change', async () => {
    const edition = EDITIONS.find((e) => e.id === select.value);
    opacity.disabled = !edition;
    message.hidden = true;
    map.setHistoricalMap(null);
    if (!edition) return;
    if (!(await isAvailable(edition.url))) {
      message.hidden = false;
      message.innerHTML = `The historical maps aren't available on this website right now. See them in the <a href="${PRONI_VIEWER}" target="_blank" rel="noopener">PRONI Historical Maps viewer</a>.`;
      return;
    }
    map.setHistoricalMap({ tiles: exportTiles(edition.url), opacity: opacity.value / 100 });
  });
  opacity.addEventListener('input', () => {
    $('opacity-value').value = `${opacity.value}%`;
    const edition = EDITIONS.find((e) => e.id === select.value);
    if (edition) map.setHistoricalMap({ tiles: exportTiles(edition.url), opacity: opacity.value / 100 });
  });
}
