import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const state = {
  theme: localStorage.getItem('nu-theme') || 'Dark Science',
  filter: 'all',
  features: [],
  layers: { earthquakes: true, weather: true, osm: false },
  lastUpdated: null,
  mapReady: false,
  activeTab: 'map',
  placesController: null,
  placesRequestId: 0,
  placesMoveTimer: null
};

const themes = [
  { name: 'Dark Science', style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { name: 'Tactical', style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { name: 'Retro Atlas', style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { name: 'Neon Night', style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' }
];

const map = new maplibregl.Map({
  container: 'map',
  style: themes.find((t) => t.name === state.theme)?.style || themes[0].style,
  center: [8.703, 48.892],
  zoom: 10,
  attributionControl: false,
  maxZoom: 18
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

map.on('load', () => {
  state.mapReady = true;
  $('#map-status-text').textContent = 'Карта готова';
  map.addSource('earthquakes', { type: 'geojson', data: emptyCollection() });
  map.addLayer({
    id: 'earthquakes-glow', type: 'circle', source: 'earthquakes',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 4, 3, 8, 6, 15], 'circle-color': '#ffb454', 'circle-opacity': 0.16, 'circle-blur': 1 }
  });
  map.addLayer({
    id: 'earthquakes-points', type: 'circle', source: 'earthquakes',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 3, 3, 5, 6, 9],
      'circle-color': ['case', ['>=', ['get', 'mag'], 5], '#ff5d66', ['>=', ['get', 'mag'], 3], '#ffb454', '#66fcf1'],
      'circle-stroke-color': '#101820', 'circle-stroke-width': 1.5, 'circle-opacity': 0.92
    }
  });
  installSecondaryLayers();
  map.on('mousemove', (event) => {
    $('#coordinates').textContent = event.lngLat.lat.toFixed(4) + '°, ' + event.lngLat.lng.toFixed(4) + '°';
  });
  map.on('click', 'earthquakes-points', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
      .setLngLat(event.lngLat)
      .setHTML('<div class="popup-card"><span class="eyebrow">USGS · ЗЕМЛЕТРЯСЕНИЕ</span><strong>' + escapeHtml(p.place || 'Место не указано') + '</strong><p>Магнитуда: ' + Number(p.mag || 0).toFixed(1) + '</p><small>' + new Date(Number(p.time)).toLocaleString('ru-RU') + '</small><p><a href="' + safeUrl(p.url) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a></p></div>')
      .addTo(map);
  });
  map.on('mouseenter', 'earthquakes-points', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'earthquakes-points', () => { map.getCanvas().style.cursor = ''; });
  map.on('click', 'osm-places-points', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const p = feature.properties || {};
    const link = safeUrl(p.url);
    const details = [p.category, p.detail].filter(Boolean).map(escapeHtml).join(' · ');
    new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
      .setLngLat(event.lngLat)
      .setHTML('<div class="popup-card"><span class="eyebrow">OPENSTREETMAP · МЕСТО</span><strong>' + escapeHtml(p.title || 'Без названия') + '</strong><p>' + (details || 'Категория не указана') + '</p>' + (link !== '#' ? '<p><a href="' + link + '" target="_blank" rel="noopener noreferrer">Открыть объект в OpenStreetMap ↗</a></p>' : '') + '<small>Координаты: ' + event.lngLat.lat.toFixed(5) + ', ' + event.lngLat.lng.toFixed(5) + '</small></div>')
      .addTo(map);
  });
  ['osm-places-points', 'osm-places-polygons', 'osm-places-outlines'].forEach((layerId) => {
    map.on('click', layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const p = feature.properties || {};
      const link = safeUrl(p.url);
      const details = [p.category, p.detail].filter(Boolean).map(escapeHtml).join(' · ');
      new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(event.lngLat)
        .setHTML('<div class="popup-card"><span class="eyebrow">OPENSTREETMAP · МЕСТО</span><strong>' + escapeHtml(p.title || 'Без названия') + '</strong><p>' + (details || 'Категория не указана') + '</p>' + (link !== '#' ? '<p><a href="' + link + '" target="_blank" rel="noopener noreferrer">Открыть объект в OpenStreetMap ↗</a></p>' : '') + '<small>Координаты: ' + event.lngLat.lat.toFixed(5) + ', ' + event.lngLat.lng.toFixed(5) + '</small></div>')
        .addTo(map);
    });
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
  map.on('moveend', () => {
    if (!state.layers.osm || !state.mapReady) return;
    clearTimeout(state.placesMoveTimer);
    state.placesMoveTimer = setTimeout(() => loadOsmPlaces().catch(() => {}), 450);
  });
  loadData();
});

function installSecondaryLayers() {
  if (!map.getSource('osm-places')) map.addSource('osm-places', { type: 'geojson', data: emptyCollection() });
  if (!map.getLayer('osm-places-polygons')) map.addLayer({
    id: 'osm-places-polygons', type: 'fill', source: 'osm-places',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#66fcf1', 'fill-opacity': 0.18 }
  });
  if (!map.getLayer('osm-places-outlines')) map.addLayer({
    id: 'osm-places-outlines', type: 'line', source: 'osm-places',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'line-color': '#66fcf1', 'line-width': 1.8, 'line-opacity': 0.9 }
  });
  if (!map.getLayer('osm-places-points')) map.addLayer({
    id: 'osm-places-points', type: 'circle', source: 'osm-places',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#66fcf1', 'circle-stroke-color': '#0b0c10', 'circle-stroke-width': 2 }
  });
  ['osm-places-polygons', 'osm-places-outlines', 'osm-places-points'].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.layers.osm ? 'visible' : 'none');
  });
  if (!map.getSource('weather-point')) map.addSource('weather-point', { type: 'geojson', data: emptyCollection() });
  if (!map.getLayer('weather-point-marker')) map.addLayer({
    id: 'weather-point-marker', type: 'circle', source: 'weather-point',
    paint: { 'circle-radius': 8, 'circle-color': '#ffb454', 'circle-stroke-color': '#fff1cf', 'circle-stroke-width': 2 },
    layout: { visibility: state.layers.weather ? 'visible' : 'none' }
  });
  syncSecondaryLayerData();
}
function syncSecondaryLayerData() {
  const osm = state.features.filter((f) => f.type === 'osm').map((f) => ({
    type: 'Feature',
    geometry: f.geometry || { type: 'Point', coordinates: f.coords },
    properties: { id: f.id, title: f.title, detail: f.detail, category: f.category || '', source: f.source, url: f.url }
  }));
  const weather = state.features.filter((f) => f.type === 'weather').map((f) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: f.coords },
    properties: { id: f.id, title: f.title, detail: f.detail, source: f.source, url: f.url }
  }));
  if (map.getSource('osm-places')) map.getSource('osm-places').setData({ type: 'FeatureCollection', features: osm });
  if (map.getSource('weather-point')) map.getSource('weather-point').setData({ type: 'FeatureCollection', features: weather });
}

function emptyCollection() { return { type: 'FeatureCollection', features: [] }; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; } }
function formatTime(value) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function distanceKm(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/geo+json, application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function loadEarthquakes() {
  const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
  const features = (data.features || []).filter((f) => Array.isArray(f.geometry?.coordinates) && Number.isFinite(f.properties?.mag));
  if (map.getSource('earthquakes')) map.getSource('earthquakes').setData({ type: 'FeatureCollection', features });
  const mapped = features.map((f) => ({
    id: 'eq-' + f.id, type: 'earthquake', title: f.properties.place || 'Землетрясение',
    detail: 'Магнитуда ' + Number(f.properties.mag).toFixed(1) + ' · ' + new Date(f.properties.time).toLocaleString('ru-RU'),
    coords: f.geometry.coordinates.slice(0, 2), time: f.properties.time, source: 'USGS', url: f.properties.url,
    mag: Number(f.properties.mag), updated: Date.now()
  }));
  state.features = state.features.filter((f) => f.type !== 'earthquake').concat(mapped);
  return mapped.length;
}

async function loadWeather() {
  const center = map.getCenter();
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + center.lat.toFixed(3) + '&longitude=' + center.lng.toFixed(3) + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto';
  const data = await fetchJson(url);
  const current = data.current;
  if (!current) throw new Error('Источник не вернул текущие условия');
  const feature = {
    id: 'weather-current', type: 'weather', title: 'Погода в центре карты',
    detail: Math.round(current.temperature_2m) + '°C · ощущается как ' + Math.round(current.apparent_temperature) + '°C · ветер ' + Math.round(current.wind_speed_10m) + ' км/ч',
    coords: [center.lng, center.lat], time: new Date(current.time).getTime(), source: 'Open-Meteo',
    url: 'https://open-meteo.com/', updated: Date.now(), humidity: current.relative_humidity_2m
  };
  state.features = state.features.filter((f) => f.type !== 'weather').concat([feature]);
  syncSecondaryLayerData();
  return 1;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return area / 2;
}
function sameCoord(a, b) { return a && b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7; }
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const crosses = ((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-12) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}
function joinMemberRings(members, role) {
  const chains = (members || []).filter((member) => (member.role || 'outer') === role)
    .map((member) => (member.geometry || []).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat)).map((p) => [p.lon, p.lat]))
    .filter((ring) => ring.length >= 2);
  const rings = [];
  while (chains.length) {
    const ring = chains.shift();
    let changed = true;
    while (changed && !sameCoord(ring[0], ring[ring.length - 1])) {
      changed = false;
      for (let i = 0; i < chains.length; i++) {
        const next = chains[i];
        if (sameCoord(ring[ring.length - 1], next[0])) ring.push(...next.slice(1));
        else if (sameCoord(ring[ring.length - 1], next[next.length - 1])) ring.push(...next.slice(0, -1).reverse());
        else if (sameCoord(ring[0], next[next.length - 1])) ring.unshift(...next.slice(0, -1));
        else if (sameCoord(ring[0], next[0])) ring.unshift(...next.slice(1).reverse());
        else continue;
        chains.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring.length >= 4 && sameCoord(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}
function osmGeometry(item, tags) {
  if (item.type === 'relation' && Array.isArray(item.members)) {
    const outers = joinMemberRings(item.members, 'outer');
    const inners = joinMemberRings(item.members, 'inner');
    if (outers.length) {
      const polygons = outers.map((outer) => [outer]);
      inners.forEach((inner) => {
        const index = outers.findIndex((outer) => pointInRing(inner[0], outer));
        if (index >= 0) polygons[index].push(inner);
      });
      return { type: polygons.length === 1 ? 'Polygon' : 'MultiPolygon', coordinates: polygons.length === 1 ? polygons[0] : polygons };
    }
  }
  const points = Array.isArray(item.geometry) ? item.geometry
    .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
    .map((point) => [point.lon, point.lat]) : [];
  if (points.length >= 4 && sameCoord(points[0], points[points.length - 1])) {
    const areaKeys = tags.area === 'yes' || tags.building || tags.historic || tags.leisure || tags.landuse ||
      tags.natural === 'water' || tags.natural === 'wood' || tags.natural === 'heath' ||
      ['attraction', 'museum', 'gallery'].includes(tags.tourism) ||
      ['museum', 'arts_centre'].includes(tags.amenity);
    if (areaKeys) return { type: 'Polygon', coordinates: [points] };
  }
  return null;
}
async function loadOsmPlaces() {
  if (!state.layers.osm) return 0;
  if (state.placesController) state.placesController.abort();
  const controller = new AbortController();
  state.placesController = controller;
  const requestId = ++state.placesRequestId;
  const bounds = map.getBounds();
  const south = Math.max(-85, bounds.getSouth()).toFixed(5);
  const west = Math.max(-180, bounds.getWest()).toFixed(5);
  const north = Math.min(85, bounds.getNorth()).toFixed(5);
  const east = Math.min(180, bounds.getEast()).toFixed(5);
  const bbox = south + ',' + west + ',' + north + ',' + east;
  const query = '[out:json][timeout:15];(' +
    'nwr[' + '"name"' + '][' + '"historic"' + '](' + bbox + ');' +
    'nwr[' + '"name"' + '][' + '"tourism"~"museum|attraction|artwork|viewpoint|gallery"' + '](' + bbox + ');' +
    'nwr[' + '"name"' + '][' + '"amenity"~"museum|arts_centre|theatre|planetarium"' + '](' + bbox + ');' +
    'nwr[' + '"name"' + '][' + '"leisure"~"park|nature_reserve|garden"' + '](' + bbox + ');' +
    'nwr[' + '"name"' + '][' + '"natural"~"cave_entrance|peak|volcano|spring"' + '](' + bbox + ');' +
    'nwr[' + '"name"' + '][' + '"man_made"~"lighthouse|observatory|water_tower"' + '](' + bbox + ');' +
    ' );out geom tags 250;';
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/json' },
    body: query
  });
  if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
  const data = await response.json();
  if (requestId !== state.placesRequestId || controller.signal.aborted) return 0;
  const features = (data.elements || []).map((item) => {
    const tags = item.tags || {};
    const points = Array.isArray(item.geometry) ? item.geometry
      .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
      .map((point) => [point.lon, point.lat]) : [];
    const geometry = osmGeometry(item, tags);
    const lon = item.lon ?? item.center?.lon ?? (points.length ? points.reduce((sum, point) => sum + point[0], 0) / points.length : undefined);
    const lat = item.lat ?? item.center?.lat ?? (points.length ? points.reduce((sum, point) => sum + point[1], 0) / points.length : undefined);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const category = tags.historic ? 'Историческое место'
      : tags.tourism === 'museum' || tags.amenity === 'museum' ? 'Музей'
      : tags.amenity === 'theatre' ? 'Театр'
      : tags.tourism === 'viewpoint' ? 'Смотровая площадка'
      : tags.tourism === 'gallery' || tags.amenity === 'arts_centre' ? 'Искусство и культура'
      : tags.leisure === 'park' || tags.leisure === 'garden' ? 'Парк или сад'
      : tags.leisure === 'nature_reserve' ? 'Природная территория'
      : tags.natural ? 'Природный объект'
      : tags.man_made ? 'Инфраструктурный объект'
      : tags.tourism === 'attraction' ? 'Достопримечательность'
      : tags.tourism === 'artwork' ? 'Объект искусства'
      : 'Интересное место';
    const detail = tags.description || tags['description:ru'] || tags.historic || tags.tourism || tags.amenity || tags.leisure || tags.natural || tags.man_made || 'Открытые геоданные OpenStreetMap';
    return {
      id: 'osm-' + item.type + '-' + item.id,
      type: 'osm',
      title: tags.name || tags['name:ru'] || category,
      category,
      detail: String(detail),
      coords: [lon, lat],
      geometry,
      source: 'OpenStreetMap',
      url: 'https://www.openstreetmap.org/' + item.type + '/' + item.id,
      updated: Date.now()
    };
  }).filter(Boolean);
  if (requestId !== state.placesRequestId) return 0;
  state.features = state.features.filter((f) => f.type !== 'osm').concat(features);
  syncSecondaryLayerData();
  renderResults();
  $('#map-status-text').textContent = 'Места на видимой области: ' + features.length;
  return features.length;
}

async function loadData() {
  $('#refresh-button').classList.add('spinning');
  $('#map-status-text').textContent = 'Обновление открытых источников…';
  const tasks = [];
  if (state.layers.earthquakes) tasks.push(loadEarthquakes().then((n) => ({ name: 'USGS', count: n })).catch((e) => ({ name: 'USGS', error: e.message })));
  if (state.layers.weather) tasks.push(loadWeather().then((n) => ({ name: 'Open-Meteo', count: n })).catch((e) => ({ name: 'Open-Meteo', error: e.message })));
  if (state.layers.osm) tasks.push(loadOsmPlaces().then((n) => ({ name: 'OpenStreetMap', count: n })).catch((e) => e.name === 'AbortError' ? ({ name: 'OpenStreetMap', cancelled: true }) : ({ name: 'OpenStreetMap', error: e.message })));
  const results = await Promise.all(tasks);
  state.lastUpdated = new Date();
  $('#last-updated').textContent = 'Проверено в ' + formatTime(state.lastUpdated);
  const failed = results.filter((r) => r.error);
  $('#map-status-text').textContent = failed.length ? 'Часть источников недоступна' : 'Источники проверены';
  $('#result-summary').textContent = results.map((r) => r.error ? r.name + ': ошибка' : r.name + ': ' + r.count).join(' · ') || 'Все слои выключены';
  $('#refresh-button').classList.remove('spinning');
  renderResults();
}

function readSavedItems() {
  try {
    const value = JSON.parse(localStorage.getItem('nu-saved-items') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function renderResults() {
  const center = map.getCenter();
  const savedItems = readSavedItems();
  const sourceItems = state.activeTab === 'world'
    ? Object.values(savedItems)
    : state.features.filter((f) => state.layers[f.type === 'earthquake' ? 'earthquakes' : f.type === 'weather' ? 'weather' : 'osm']);
  const list = sourceItems
    .filter((f) => state.activeTab === 'world' || state.filter === 'all' || f.type === state.filter)
    .map((f) => ({ ...f, distance: Array.isArray(f.coords) ? distanceKm([center.lng, center.lat], f.coords) : Infinity }))
    .sort((a, b) => {
      if (a.type === 'earthquake' && b.type === 'earthquake') return b.mag - a.mag;
      return a.distance - b.distance;
    });
  $('#layer-count').textContent = String(Object.values(state.layers).filter(Boolean).length).padStart(2, '0');
  if (state.activeTab === 'world') {
    $('#result-summary').textContent = list.length ? list.length + ' сохранённых объектов на этом устройстве' : 'Твои личные находки — только на этом устройстве';
  }
  if (!list.length) {
    $('#results').innerHTML = '<div class="empty-state"><span>⌁</span><p>' + (state.activeTab === 'world' ? 'Пока нет сохранённых находок. Открой DISCOVER и нажми ＋ у интересного объекта.' : 'Нет загруженных объектов в этом слое. Включи слой или обнови данные.') + '</p></div>';
    return;
  }
  $('#results').innerHTML = list.slice(0, 35).map((f) => {
    const icon = f.type === 'earthquake' ? '⌁' : f.type === 'weather' ? '☼' : '⌂';
    const label = f.type === 'earthquake' ? 'НАУЧНЫЕ ДАННЫЕ' : f.type === 'weather' ? 'ТЕКУЩИЕ УСЛОВИЯ' : (f.category || 'ИСТОРИЯ И МЕСТА').toLocaleUpperCase('ru-RU');
    const distance = f.distance < 1 ? Math.round(f.distance * 1000) + ' м' : f.distance.toFixed(1) + ' км';
    const saved = new Set(JSON.parse(localStorage.getItem('nu-saved') || '[]'));
    const isSaved = saved.has(f.id);
    return '<article class="result-card" tabindex="0" data-id="' + escapeHtml(f.id) + '"><div class="result-icon ' + f.type + '">' + icon + '</div><div class="result-copy"><div class="result-meta"><span>' + label + '</span><span>' + (Number.isFinite(f.distance) ? distance : 'Сохранено') + '</span></div><h3>' + escapeHtml(f.title) + '</h3><p>' + escapeHtml(f.detail) + '</p><div class="result-source">↗ ' + escapeHtml(f.source) + '</div></div><button class="save-button ' + (isSaved ? 'saved' : '') + '" data-save="' + escapeHtml(f.id) + '" aria-label="' + (isSaved ? 'Удалить из избранного' : 'Сохранить в избранное') + '">' + (isSaved ? '✓' : '＋') + '</button></article>';
  }).join('');
  $('#results').querySelectorAll('.result-card').forEach((card) => {
    const activate = () => { const f = state.features.find((item) => item.id === card.dataset.id) || readSavedItems()[card.dataset.id]; if (f && Array.isArray(f.coords)) { map.flyTo({ center: f.coords, zoom: Math.max(map.getZoom(), 11), speed: 0.8 }); showToast('Источник: ' + f.source); } };
    card.addEventListener('click', (event) => { if (!event.target.closest('[data-save]')) activate(); });
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter') activate(); });
  });
  $('#results').querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = button.dataset.save;
    const saved = new Set(JSON.parse(localStorage.getItem('nu-saved') || '[]'));
    const items = readSavedItems();
    if (saved.has(id)) { saved.delete(id); delete items[id]; button.textContent = '+'; showToast('Удалено из избранного'); }
    else {
      const feature = state.features.find((item) => item.id === id) || items[id];
      if (feature) items[id] = { id: feature.id, type: feature.type, title: feature.title, detail: feature.detail, coords: feature.coords, source: feature.source, url: feature.url, time: feature.time, mag: feature.mag };
      saved.add(id); button.textContent = '✓'; showToast('Сохранено на этом устройстве');
    }
    localStorage.setItem('nu-saved', JSON.stringify([...saved]));
    localStorage.setItem('nu-saved-items', JSON.stringify(items));
    button.classList.toggle('saved', saved.has(id));
  }));
  const saved = new Set(JSON.parse(localStorage.getItem('nu-saved') || '[]'));
  $('#results').querySelectorAll('[data-save]').forEach((b) => { if (saved.has(b.dataset.save)) { b.textContent = '✓'; b.classList.add('saved'); } });
}

let toastTimer;
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

$('#layers-button').addEventListener('click', () => $('#layers-panel').classList.toggle('hidden'));
$('#close-layers').addEventListener('click', () => $('#layers-panel').classList.add('hidden'));
$('#refresh-button').addEventListener('click', loadData);
$('#layers-panel').querySelectorAll('[data-layer]').forEach((input) => input.addEventListener('change', () => {
  const key = input.dataset.layer;
  state.layers[key] = input.checked;
  const layerIds = key === 'earthquakes' ? ['earthquakes-points', 'earthquakes-glow']
    : key === 'weather' ? ['weather-point-marker']
    : ['osm-places-points', 'osm-places-polygons', 'osm-places-outlines'];
  layerIds.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', input.checked ? 'visible' : 'none');
  });
  if (!input.checked) {
    if (key === 'osm' && state.placesController) state.placesController.abort();
    const type = key === 'earthquakes' ? 'earthquake' : key === 'weather' ? 'weather' : 'osm';
    state.features = state.features.filter((f) => f.type !== type);
    if (key === 'osm' && map.getSource('osm-places')) map.getSource('osm-places').setData(emptyCollection());
    renderResults();
  } else {
    loadData();
  }
}));
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('selected', b === button));
  renderResults();
}));
$('#theme-button').addEventListener('click', () => {
  const index = themes.findIndex((t) => t.name === state.theme);
  state.theme = themes[(index + 1) % themes.length].name;
  localStorage.setItem('nu-theme', state.theme);
  $('#theme-button small').textContent = state.theme.toUpperCase();
  const center = map.getCenter(), zoom = map.getZoom();
  document.body.dataset.theme = state.theme;
  map.setStyle(themes.find((t) => t.name === state.theme).style);
  map.once('style.load', () => {
    if (!map.getSource('earthquakes')) {
      map.addSource('earthquakes', { type: 'geojson', data: { type: 'FeatureCollection', features: state.features.filter((f) => f.type === 'earthquake').map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.coords }, properties: { mag: f.mag, place: f.title, time: f.time, url: f.url } })) } });
      map.addLayer({ id: 'earthquakes-glow', type: 'circle', source: 'earthquakes', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 4, 3, 8, 6, 15], 'circle-color': '#ffb454', 'circle-opacity': 0.16, 'circle-blur': 1 }, layout: { visibility: state.layers.earthquakes ? 'visible' : 'none' } });
      map.addLayer({ id: 'earthquakes-points', type: 'circle', source: 'earthquakes', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 3, 3, 5, 6, 9], 'circle-color': ['case', ['>=', ['get', 'mag'], 5], '#ff5d66', ['>=', ['get', 'mag'], 3], '#ffb454', '#66fcf1'], 'circle-stroke-color': '#101820', 'circle-stroke-width': 1.5, 'circle-opacity': 0.92 }, layout: { visibility: state.layers.earthquakes ? 'visible' : 'none' } });
      map.on('click', 'earthquakes-points', (event) => {
        const feature = event.features?.[0]; if (!feature) return;
        const p = feature.properties;
        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(event.lngLat).setHTML('<div class="popup-card"><span class="eyebrow">USGS · ЗЕМЛЕТРЯСЕНИЕ</span><strong>' + escapeHtml(p.place || 'Место не указано') + '</strong><p>Магнитуда: ' + Number(p.mag || 0).toFixed(1) + '</p><small>' + new Date(Number(p.time)).toLocaleString('ru-RU') + '</small><p><a href="' + safeUrl(p.url) + '" target="_blank" rel="noopener noreferrer">Открыть первоисточник ↗</a></p></div>').addTo(map);
      });
      map.on('mouseenter', 'earthquakes-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'earthquakes-points', () => { map.getCanvas().style.cursor = ''; });
    }
    installSecondaryLayers();
    map.jumpTo({ center, zoom });
    loadData();
  });
  $('#theme-button small').textContent = state.theme.toUpperCase();
  showToast('Тема: ' + state.theme);
});
$('#theme-button small').textContent = state.theme.toUpperCase();
$('#locate-button').addEventListener('click', () => {
  if (!navigator.geolocation) return showToast('Геолокация не поддерживается этим браузером');
  navigator.geolocation.getCurrentPosition((position) => {
    map.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 12 });
    loadData();
  }, () => showToast('Нет разрешения на геолокацию. Можно продолжать без неё.'), { enableHighAccuracy: false, timeout: 8000 });
});
function searchLocation() {
  const value = $('#search-input').value.trim();
  if (!value) return;
  const coords = value.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    const lat = Number(coords[1]), lon = Number(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { map.flyTo({ center: [lon, lat], zoom: 12 }); return; }
  }
  fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(value))
    .then((data) => {
      if (!data.length) return showToast('Место не найдено');
      map.flyTo({ center: [Number(data[0].lon), Number(data[0].lat)], zoom: 12 });
      showToast(data[0].display_name);
    }).catch(() => showToast('Поиск временно недоступен'));
}
$('#search-button').addEventListener('click', searchLocation);
$('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchLocation(); });
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === button));
  const tab = button.dataset.tab;
  state.activeTab = tab;
  $('#discover-panel').classList.toggle('panel-expanded', tab === 'radar' || tab === 'discover' || tab === 'world');
  $('#layers-panel').classList.add('hidden');
  $('#discover-panel').querySelector('.eyebrow').textContent = tab === 'world' ? 'ЛИЧНЫЙ АРХИВ' : 'ИССЛЕДОВАТЕЛЬСКИЙ РАДАР';
  $('#discover-panel h1').textContent = tab === 'world' ? 'Мой мир' : 'Неизвестное рядом';
  document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('hidden', tab === 'world'));
  $('#refresh-button').classList.toggle('hidden', tab === 'world');
  if (tab === 'world') { renderResults(); return; }
  if (tab === 'map') { $('#discover-panel').classList.remove('panel-expanded'); }
  if (tab === 'radar' || tab === 'discover') { if (tab === 'discover') { state.filter = 'all'; document.querySelector('[data-filter="all"]').click(); } renderResults(); }
}));
const interestsKey = 'nu-interests';
function finishWelcome(save) {
  if (save) localStorage.setItem(interestsKey, JSON.stringify([...document.querySelectorAll('.interest-grid input:checked')].map((el) => el.value)));
  localStorage.setItem('nu-onboarded', '1');
  $('#welcome').classList.add('hidden');
}
$('#save-interests').addEventListener('click', () => finishWelcome(true));
$('#skip-interests').addEventListener('click', () => finishWelcome(false));
if (!localStorage.getItem('nu-onboarded')) $('#welcome').classList.remove('hidden');
window.addEventListener('online', () => { showToast('Подключение восстановлено'); loadData(); });
window.addEventListener('offline', () => showToast('Нет подключения. Доступны только уже загруженные данные.'));
