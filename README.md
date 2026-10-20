# NEARBY UNKNOWN

Personal research map for discovering unusual places, historical traces, scientific events, and public geospatial data.

## MVP foundation in progress

- MapLibre GL JS interactive map and selectable visual themes.
- Layer controls with independent source loading.
- Live earthquake feed from the USGS public GeoJSON feed.
- Current weather from Open-Meteo.
- Google Places (New) discovery on Google Maps when `VITE_GOOGLE_MAPS_API_KEY` is configured: landmarks, museums, culture, science, parks, nature and architecture. Results are searched for the current map area and are not persisted. Without the key, the legacy MapLibre/OpenStreetMap implementation remains active.
- Search by place name or coordinates.
- Explicit user-triggered geolocation.
- Local interests and favorites stored on the device.
- Responsive mobile layout and reduced-motion support.

This is an early implementation. Google Places mode requires a restricted browser key, billing, Maps JavaScript API and Places API (New). Google Places results are never displayed on the legacy MapLibre map. A published-browser verification is still required. The historical layer depends on the public Overpass service. CARTO basemaps and public data providers may have availability, attribution, licensing, and usage limits.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Google Maps Platform setup

1. Enable billing, Maps JavaScript API, Places API, and Places API (New) in Google Cloud.
2. Create a browser key restricted to the production origin `https://freezzzgames.github.io/*` and local development `http://localhost:5173/*`; restrict allowed APIs to the Maps APIs required by the app.
3. Add repository Actions secret `VITE_GOOGLE_MAPS_API_KEY` in GitHub Settings → Secrets and variables → Actions.
4. Vite embeds browser keys into the public bundle. The key is not secret after deployment: security depends on strict HTTP-referrer and API restrictions. Never use an unrestricted key.
5. Google Places results are displayed on Google Maps and are not persisted, consistent with Google's attribution and storage policies.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys the `main` branch. In repository settings, configure Pages to use **GitHub Actions**. The first successful deployment still needs to be checked in the published browser URL.

## Data sources

- Basemap styles: CARTO; map data attribution is shown by MapLibre's attribution control.
- Earthquakes: USGS Earthquake Hazards Program, all-day GeoJSON feed.
- Weather: Open-Meteo API.
- Historical/tourism features: OpenStreetMap via Overpass API.
- Place search: OpenStreetMap Nominatim.

Respect each provider's attribution, license, and usage policy. Public demo endpoints are not unlimited production backends.
