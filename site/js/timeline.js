// The Timeline ("Through the years"): dated Wikidata items near the Search
// Centre, plus Heritage Records grouped by era or build date. Pure functions.

import { plural } from './format.js';

// Rough start years so eras sort sensibly among dated events.
const ERA_START = {
  Prehistoric: -10000,
  Mesolithic: -8000,
  Neolithic: -4000,
  'Early Neolithic': -4000,
  'Late Neolithic': -3000,
  'Bronze Age': -2500,
  'Early Bronze Age': -2500,
  'Middle Bronze Age': -1600,
  'Late Bronze Age': -1200,
  'Iron Age': -600,
  'Early Christian': 400,
  'Early medieval': 400,
  Medieval: 1100,
  'Late medieval': 1400,
  'Post-medieval': 1550,
  Modern: 1900,
};

const ERA_HINT = {
  Prehistoric: 'before 400 AD',
  Mesolithic: 'about 8000–4000 BC',
  Neolithic: 'about 4000–2500 BC',
  'Bronze Age': 'about 2500–600 BC',
  'Iron Age': 'about 600 BC–400 AD',
  'Early Christian': 'about 400–1177',
  Medieval: 'about 1177–1400',
  'Late medieval': 'about 1400–1550',
  'Post-medieval': 'about 1550–1900',
};

/** Sort year for an era label such as 'Neolithic' or '17th century'; null if unknown. */
export function eraStart(label) {
  if (label in ERA_START) return ERA_START[label];
  const century = /^(\d{1,2})th century$/i.exec(label);
  if (century) return (Number(century[1]) - 1) * 100;
  return null;
}

/**
 * Group Heritage Records into Timeline rows:
 * monuments by era ('Neolithic · 2 monuments'), buildings by build date ('1820–1839 · 31 buildings built').
 */
export function heritageRows(records) {
  const groups = new Map();
  const add = (key, row, id) => {
    if (!groups.has(key)) groups.set(key, { ...row, ids: [] });
    groups.get(key).ids.push(id);
  };

  for (const record of records) {
    const p = record.properties;
    if (p.type === 'monument') {
      for (const era of p.eras ?? []) {
        const year = eraStart(era);
        if (year === null) continue;
        add(`era:${era}`, { kind: 'heritage', recordType: 'monument', sortYear: year, when: era, hint: ERA_HINT[era] ?? '' }, record.id);
      }
    } else if (p.type === 'building' && p.built) {
      const [start, end] = p.built;
      const when = start === null ? `Before ${end}` : `${start}–${end}`;
      add(`built:${when}`, { kind: 'heritage', recordType: 'building', sortYear: start ?? end - 1, when, hint: '' }, record.id);
    }
  }

  return [...groups.values()].map((row) => ({
    ...row,
    title:
      row.recordType === 'monument'
        ? plural(row.ids.length, 'monument', 'monuments')
        : `${plural(row.ids.length, 'historic building', 'historic buildings')} built`,
  }));
}

// Wikidata date properties and how to describe them.
export const DATE_PROPERTIES = {
  P585: { verb: '', event: true }, // point in time
  P580: { verb: 'began', event: true }, // start time
  P571: { verb: 'founded or built', event: false }, // inception
  P1619: { verb: 'opened', event: false }, // date of official opening
  P576: { verb: 'closed or demolished', event: false }, // dissolved, abolished or demolished
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Turn a Wikidata time value and precision into { year, label }. */
export function wikidataDate(time, precision) {
  const match = /^([+-]?)(\d+)-(\d\d)-(\d\d)/.exec(time);
  if (!match) return null;
  const year = Number(match[2]) * (match[1] === '-' ? -1 : 1);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const yearText = year <= 0 ? `${1 - year} BC` : String(year);
  let label = yearText;
  if (precision >= 11 && day) label = `${day} ${MONTHS[month - 1]} ${yearText}`;
  else if (precision === 10 && month) label = `${MONTHS[month - 1]} ${yearText}`;
  else if (precision === 8 && year > 0) label = `${Math.floor(year / 10) * 10}s`;
  else if (precision === 7 && year > 0) label = `${Math.floor((year - 1) / 100) + 1}th century`;
  return { year: year + (month - 1) / 12, label };
}

/**
 * Turn SPARQL bindings into Timeline event rows, one per item and date property,
 * keeping only items with an English Wikipedia article or that are dated events.
 */
export function eventRows(bindings) {
  const rows = new Map();
  for (const b of bindings) {
    const property = b.p?.value;
    const info = DATE_PROPERTIES[property];
    if (!info) continue;
    const article = b.article?.value ?? null;
    if (!article && !info.event) continue;
    const date = wikidataDate(b.time?.value ?? '', Number(b.precision?.value ?? 9));
    if (!date) continue;
    const item = b.item.value;
    const title = b.itemLabel?.value ?? '';
    if (!title || /^Q\d+$/.test(title)) continue; // no English label
    const key = `${item}|${property}|${date.label}`;
    if (rows.has(key)) continue;
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '');
    rows.set(key, {
      kind: 'event',
      sortYear: date.year,
      when: date.label,
      title,
      verb: info.verb,
      event: info.event,
      article,
      wikidata: item,
      lon: point ? Number(point[1]) : null,
      lat: point ? Number(point[2]) : null,
      distance: Number(b.dist?.value ?? 0) * 1000,
    });
  }
  return [...rows.values()];
}

/** Merge and sort Timeline rows, oldest first. */
export function buildTimeline(events, heritage) {
  return [...events, ...heritage].sort((a, b) => a.sortYear - b.sortYear || (a.kind === 'heritage' ? -1 : 1));
}
