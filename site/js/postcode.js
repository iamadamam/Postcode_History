// Parse and look up Northern Ireland postcodes with postcodes.io.
// Pure apart from the injected fetch, so it can be tested in Node.

export const POSTCODES_API = 'https://api.postcodes.io';

const FULL_UK = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const DISTRICT_UK = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const FULL_BT = /^BT\d{1,2}\d[A-Z]{2}$/;
const DISTRICT_BT = /^BT\d{1,2}$/;

export class PostcodeError extends Error {}

/**
 * Turn what the person typed into a Postcode or Postcode District.
 * Returns { kind: 'postcode' | 'district', compact, display }.
 * Throws PostcodeError with a friendly message when the input is unusable.
 */
export function parsePostcode(input) {
  const compact = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!compact) {
    throw new PostcodeError('Enter a Northern Ireland postcode, for example BT7 1NN.');
  }
  if (FULL_BT.test(compact)) {
    const display = `${compact.slice(0, -3)} ${compact.slice(-3)}`;
    return { kind: 'postcode', compact, display };
  }
  if (DISTRICT_BT.test(compact)) {
    return { kind: 'district', compact, display: compact };
  }
  if (FULL_UK.test(compact) || DISTRICT_UK.test(compact)) {
    throw new PostcodeError(
      'That postcode is outside Northern Ireland. Northern Ireland postcodes start with BT.'
    );
  }
  throw new PostcodeError("That doesn't look like a postcode. Try something like BT7 1NN or BT7.");
}

async function getJson(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new PostcodeError(
      "We couldn't reach the postcode service. Check your connection and try again."
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new PostcodeError(
      'The postcode service is having problems right now. Please try again in a moment.'
    );
  }
  const body = await response.json();
  return body.result ?? null;
}

function hasLocation(result) {
  return result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude);
}

/**
 * Find the Search Centre for a parsed postcode.
 * Returns { lat, lon, label, place, note }.
 */
export async function locatePostcode(parsed, fetchImpl = fetch) {
  const code = encodeURIComponent(parsed.compact);

  if (parsed.kind === 'district') {
    const district = await getJson(fetchImpl, `${POSTCODES_API}/outcodes/${code}`);
    if (!hasLocation(district)) {
      throw new PostcodeError(`We couldn't find the ${parsed.display} district. Check it and try again.`);
    }
    return {
      lat: district.latitude,
      lon: district.longitude,
      label: parsed.display,
      place: (district.admin_district ?? []).filter(Boolean).join(', '),
      note: `Showing the centre of the ${parsed.display} district. Enter a full postcode for a more precise search.`,
    };
  }

  const live = await getJson(fetchImpl, `${POSTCODES_API}/postcodes/${code}`);
  if (live) {
    if (!hasLocation(live)) {
      throw new PostcodeError(`${parsed.display} exists, but it has no map location we can use.`);
    }
    return {
      lat: live.latitude,
      lon: live.longitude,
      label: live.postcode ?? parsed.display,
      place: [live.admin_ward, live.admin_district].filter(Boolean).join(', '),
      note: '',
    };
  }

  const terminated = await getJson(fetchImpl, `${POSTCODES_API}/terminated_postcodes/${code}`);
  if (hasLocation(terminated)) {
    const year = terminated.year_terminated ? ` in ${terminated.year_terminated}` : '';
    return {
      lat: terminated.latitude,
      lon: terminated.longitude,
      label: terminated.postcode ?? parsed.display,
      place: '',
      note: `${parsed.display} stopped being used${year}. Showing where it used to be.`,
    };
  }

  throw new PostcodeError(`We couldn't find ${parsed.display}. Check it and try again.`);
}
