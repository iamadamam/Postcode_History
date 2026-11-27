// The map: MapLibre GL with OpenFreeMap vector styles (light and dark), the
// Search Area, Heritage Records and Nearby Articles.

/* global maplibregl */

import { RECORD_TYPES } from './records.js';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const NI_CENTRE = [-6.75, 54.62];
const EMPTY = { type: 'FeatureCollection', features: [] };

const typeColour = ['match', ['get', 'type'], ...Object.entries(RECORD_TYPES).flatMap(([type, info]) => [type, info.colour]), '#666'];

/** A polygon approximating a circle of `radius` metres. */
function circlePolygon(centre, radius, steps = 96) {
  const ring = [];
  const kLat = radius / 111320;
  const kLon = kLat / Math.cos((centre.lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([centre.lon + kLon * Math.cos(a), centre.lat + kLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

function boundsOf(feature) {
  const ring = feature.geometry.coordinates[0];
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

function centreOf(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const points = (geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()).flat();
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

export function createMap(container, { theme = 'light', onRecordClick, onArticleClick } = {}) {
  const state = {
    theme,
    area: null,
    records: EMPTY,
    articles: EMPTY,
    filter: null,
    selected: null,
    historical: null,
  };

  const map = new maplibregl.Map({
    container,
    style: STYLES[theme],
    center: NI_CENTRE,
    zoom: 7,
    attributionControl: false,
    cooperativeGestures: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Heritage: <a href="https://www.communities-ni.gov.uk/topics/historic-environment">DfC HED</a> (OGL)',
    }),
    'bottom-right'
  );

  const popup = new maplibregl.Popup({ maxWidth: '300px', closeButton: true, focusAfterOpen: false });
  let marker = null;

  function strokeColour() {
    return state.theme === 'dark' ? '#0f1419' : '#ffffff';
  }

  function addOverlays() {
    if (state.historical) {
      map.addSource('historical', {
        type: 'raster',
        tiles: [state.historical.tiles],
        tileSize: 256,
        attribution: 'Historical map © Crown copyright, OSNI (OGL)',
      });
      map.addLayer({ id: 'historical', type: 'raster', source: 'historical', paint: { 'raster-opacity': state.historical.opacity } });
    }

    map.addSource('area', { type: 'geojson', data: state.area ?? EMPTY });
    map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': state.theme === 'dark' ? '#ffffff' : '#1f2933', 'fill-opacity': 0.04 } });
    map.addLayer({
      id: 'area-line',
      type: 'line',
      source: 'area',
      paint: { 'line-color': state.theme === 'dark' ? '#cbd2d9' : '#1f2933', 'line-width': 1.5, 'line-dasharray': [3, 3] },
    });

    map.addSource('records', { type: 'geojson', data: state.records });
    const polygons = ['==', ['geometry-type'], 'Polygon'];
    map.addLayer({ id: 'records-fill', type: 'fill', source: 'records', filter: polygons, paint: { 'fill-color': typeColour, 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'records-outline', type: 'line', source: 'records', filter: polygons, paint: { 'line-color': typeColour, 'line-width': 2 } });
    map.addLayer({
      id: 'records-points',
      type: 'circle',
      source: 'records',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': typeColour,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 5.5, 18, 8],
        'circle-stroke-color': strokeColour(),
        'circle-stroke-width': 1,
      },
    });
    map.addLayer({
      id: 'records-selected',
      type: 'circle',
      source: 'records',
      filter: ['==', ['get', 'rid'], ''],
      paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 11, 'circle-stroke-color': typeColour, 'circle-stroke-width': 3 },
    });

    map.addSource('articles', { type: 'geojson', data: state.articles });
    map.addLayer({
      id: 'articles-points',
      type: 'circle',
      source: 'articles',
      paint: {
        'circle-color': state.theme === 'dark' ? '#0f1419' : '#ffffff',
        'circle-radius': 6,
        'circle-stroke-color': state.theme === 'dark' ? '#f5f7fa' : '#111827',
        'circle-stroke-width': 2.5,
      },
    });
    applyFilter();
    applySelection();
  }

  const ready = new Promise((resolve) => map.once('load', resolve));
  // MapLibre opens compact attribution on load; start it collapsed so it doesn't cover the map on phones.
  ready.then(() => container && document.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
  map.on('style.load', addOverlays);

  function applyFilter() {
    if (!map.getLayer('records-points')) return;
    const conditions = [];
    if (state.filter?.hiddenTypes?.length) conditions.push(['!', ['in', ['get', 'type'], ['literal', state.filter.hiddenTypes]]]);
    if (state.filter?.onlyIds) conditions.push(['in', ['get', 'rid'], ['literal', state.filter.onlyIds]]);
    const extra = conditions.length ? ['all', ...conditions] : true;
    map.setFilter('records-points', ['all', ['==', ['geometry-type'], 'Point'], extra]);
    map.setFilter('records-fill', ['all', ['==', ['geometry-type'], 'Polygon'], extra]);
    map.setFilter('records-outline', ['all', ['==', ['geometry-type'], 'Polygon'], extra]);
  }

  function applySelection() {
    if (map.getLayer('records-selected')) {
      map.setFilter('records-selected', ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'rid'], state.selected ?? '']]);
    }
  }

  for (const layer of ['records-points', 'records-fill']) {
    map.on('click', layer, (event) => {
      const feature = event.features[0];
      onRecordClick?.(feature.properties.rid, event.lngLat);
    });
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  map.on('click', 'articles-points', (event) => onArticleClick?.(event.features[0].properties.title, event.lngLat));
  map.on('mouseenter', 'articles-points', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'articles-points', () => (map.getCanvas().style.cursor = ''));

  return {
    ready,

    setTheme(theme) {
      if (theme === state.theme) return;
      state.theme = theme;
      map.setStyle(STYLES[theme], { diff: false });
    },

    showSearchArea(centre, radius) {
      state.area = circlePolygon(centre, radius);
      map.getSource('area')?.setData(state.area);
      marker?.remove();
      marker = new maplibregl.Marker({ color: '#c2410c' }).setLngLat([centre.lon, centre.lat]).addTo(map);
      popup.remove();
      map.fitBounds(boundsOf(state.area), { padding: 24, duration: 800 });
    },

    setRecords(records) {
      state.records = {
        type: 'FeatureCollection',
        features: records.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { rid: r.id, type: r.properties.type } })),
      };
      state.selected = null;
      map.getSource('records')?.setData(state.records);
      applySelection();
    },

    setRecordFilter(filter) {
      state.filter = filter;
      applyFilter();
    },

    selectRecord(id) {
      state.selected = id;
      applySelection();
    },

    setArticles(articles) {
      state.articles = {
        type: 'FeatureCollection',
        features: articles.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] }, properties: { title: a.title } })),
      };
      map.getSource('articles')?.setData(state.articles);
    },

    /** Show a popup with trusted, already-escaped HTML. */
    openPopup(lngLat, html) {
      popup.setLngLat(lngLat).setHTML(html).addTo(map);
    },

    closePopup() {
      popup.remove();
    },

    /** Bring a point or geometry into view. With `forPopup`, centre it low enough that a popup above it fits. */
    focus(geometryOrLngLat, { forPopup = false } = {}) {
      const target = Array.isArray(geometryOrLngLat) ? geometryOrLngLat : centreOf(geometryOrLngLat);
      if (forPopup) {
        const offsetY = Math.min(120, map.getContainer().clientHeight * 0.28);
        map.easeTo({ center: target, offset: [0, offsetY], duration: 500 });
      } else if (!map.getBounds().contains(target)) {
        map.easeTo({ center: target, duration: 600 });
      }
      return target;
    },

    centreOf,

    /** Show a raster overlay ({ tiles, opacity }) or remove it (null). */
    setHistorical(overlay) {
      state.historical = overlay;
      if (map.getLayer('historical')) map.removeLayer('historical');
      if (map.getSource('historical')) map.removeSource('historical');
      if (overlay) {
        map.addSource('historical', { type: 'raster', tiles: [overlay.tiles], tileSize: 256 });
        map.addLayer({ id: 'historical', type: 'raster', source: 'historical', paint: { 'raster-opacity': overlay.opacity } }, 'area-fill');
      }
    },

    resize() {
      map.resize();
    },
  };
}
