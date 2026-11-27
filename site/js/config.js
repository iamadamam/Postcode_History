// Site-wide switches.

export const FEATURES = {
  // OSNI's historical map services refuse this site until OSNI allows its domain.
  // Set to true once they do: see docs/adr/0003-no-proxy-for-historical-maps.md.
  historicalMaps: false,
};

export const SEARCH_RADIUS = 1000; // metres: the Search Area
