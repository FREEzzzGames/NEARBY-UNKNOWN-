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
  mapReady: false
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
  loadData();
});

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
  return 1;
}

async function loadOsmPlaces() {
  const center = map.getCenter();
  const query = '[out:json][timeout:10];(node(around:5000,' + center.lat + ',' + center.lng + ')["historic"];way(around:5000,' + center.lat + ',' + center.lng + ')["historic"];node(around:5000,' + center.lat + ',' + center.lng + ')["tourism"~"museum|attraction"];);out center tags 40;';
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: query
  });
  if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
  const data = await response.json();
  const features = (data.elements || []).map((item) => {
    const lon = item.lon ?? item.center?.lon, lat = item.lat ?? item.center?.lat;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const tags = item.tags || {};
    return { id: 'osm-' + item.type + '-' + item.id, type: 'osm', title: tags.name || tags.historic || tags.tourism || 'Исторический объект', detail: tags.description || tags.historic || tags.tourism || 'Объект из OpenStreetMap', coords: [lon, lat], source: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' + item.type + '/' + item.id, updated: Date.now() };
  }).filter(Boolean);
  state.features = state.features.filter((f) => f.type !== 'osm').concat(features);
  return features.length;
}

async function loadData() {
  $('#refresh-button').classList.add('spinning');
  $('#map-status-text').textContent = 'Обновление открытых источников…';
  const tasks = [];
  if (state.layers.earthquakes) tasks.push(loadEarthquakes().then((n) => ({ name: 'USGS', count: n })).catch((e) => ({ name: 'USGS', error: e.message })));
  if (state.layers.weather) tasks.push(loadWeather().then((n) => ({ name: 'Open-Meteo', count: n })).catch((e) => ({ name: 'Open-Meteo', error: e.message })));
  if (state.layers.osm) tasks.push(loadOsmPlaces().then((n) => ({ name: 'OpenStreetMap', count: n })).catch((e) => ({ name: 'OpenStreetMap', error: e.message })));
  const results = await Promise.all(tasks);
  state.lastUpdated = new Date();
  $('#last-updated').textContent = 'Проверено в ' + formatTime(state.lastUpdated);
  const failed = results.filter((r) => r.error);
  $('#map-status-text').textContent = failed.length ? 'Часть источников недоступна' : 'Источники проверены';
  $('#result-summary').textContent = results.map((r) => r.error ? r.name + ': ошибка' : r.name + ': ' + r.count).join(' · ') || 'Все слои выключены';
  $('#refresh-button').classList.remove('spinning');
  renderResults();
}

function renderResults() {
  const center = map.getCenter();
  const list = state.features
    .filter((f) => state.layers[f.type === 'earthquake' ? 'earthquakes' : f.type === 'weather' ? 'weather' : 'osm'])
    .filter((f) => state.filter === 'all' || f.type === state.filter)
    .map((f) => ({ ...f, distance: distanceKm([center.lng, center.lat], f.coords) }))
    .sort((a, b) => {
      if (a.type === 'earthquake' && b.type === 'earthquake') return b.mag - a.mag;
      return a.distance - b.distance;
    });
  $('#layer-count').textContent = String(Object.values(state.layers).filter(Boolean).length).padStart(2, '0');
  if (!list.length) {
    $('#results').innerHTML = '<div class="empty-state"><span>⌁</span><p>Нет загруженных объектов в этом слое. Включи слой или обнови данные.</p></div>';
    return;
  }
  $('#results').innerHTML = list.slice(0, 35).map((f) => {
    const icon = f.type === 'earthquake' ? '⌁' : f.type === 'weather' ? '☼' : '⌂';
    const label = f.type === 'earthquake' ? 'НАУЧНЫЕ ДАННЫЕ' : f.type === 'weather' ? 'ТЕКУЩИЕ УСЛОВИЯ' : 'ИСТОРИЯ И МЕСТА';
    const distance = f.distance < 1 ? Math.round(f.distance * 1000) + ' м' : f.distance.toFixed(1) + ' км';
    return '<article class="result-card" tabindex="0" data-id="' + escapeHtml(f.id) + '"><div class="result-icon ' + f.type + '">' + icon + '</div><div class="result-copy"><div class="result-meta"><span>' + label + '</span><span>' + distance + '</span></div><h3>' + escapeHtml(f.title) + '</h3><p>' + escapeHtml(f.detail) + '</p><div class="result-source">↗ ' + escapeHtml(f.source) + '</div></div><button class="save-button" data-save="' + escapeHtml(f.id) + '" aria-label="Сохранить в избранное">＋</button></article>';
  }).join('');
  $('#results').querySelectorAll('.result-card').forEach((card) => {
    const activate = () => { const f = state.features.find((item) => item.id === card.dataset.id); if (f) { map.flyTo({ center: f.coords, zoom: Math.max(map.getZoom(), 11), speed: 0.8 }); showToast('Источник: ' + f.source); } };
    card.addEventListener('click', (event) => { if (!event.target.closest('[data-save]')) activate(); });
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter') activate(); });
  });
  $('#results').querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = button.dataset.save;
    const saved = new Set(JSON.parse(localStorage.getItem('nu-saved') || '[]'));
    if (saved.has(id)) { saved.delete(id); button.textContent = '+'; showToast('Удалено из избранного'); }
    else { saved.add(id); button.textContent = '✓'; showToast('Сохранено на этом устройстве'); }
    localStorage.setItem('nu-saved', JSON.stringify([...saved]));
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
  state.layers[input.dataset.layer] = input.checked;
  if (input.dataset.layer === 'osm' && input.checked) loadData();
  else if (input.dataset.layer === 'earthquakes' && map.getLayer('earthquakes-points')) map.setLayoutProperty('earthquakes-points', 'visibility', input.checked ? 'visible' : 'none');
  if (input.dataset.layer === 'earthquakes' && map.getLayer('earthquakes-glow')) map.setLayoutProperty('earthquakes-glow', 'visibility', input.checked ? 'visible' : 'none');
  if (!input.checked) { state.features = state.features.filter((f) => f.type !== (input.dataset.layer === 'earthquakes' ? 'earthquake' : input.dataset.layer === 'weather' ? 'weather' : 'osm')); renderResults(); }
  else loadData();
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
  if (tab === 'map') { $('#discover-panel').classList.remove('panel-expanded'); $('#layers-panel').classList.add('hidden'); }
  if (tab === 'radar' || tab === 'discover') { $('#discover-panel').classList.add('panel-expanded'); if (tab === 'discover') { state.filter = 'all'; document.querySelector('[data-filter="all"]').click(); } }
  if (tab === 'world') showToast('Избранное хранится локально на этом устройстве');
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
