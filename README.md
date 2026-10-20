# NEARBY UNKNOWN

Personal research map for discovering unusual places, historical traces, scientific events, and public geospatial data.

## MVP foundation in progress

- MapLibre GL JS interactive map and selectable visual themes.
- Layer controls with independent source loading.
- Live earthquake feed from the USGS public GeoJSON feed.
- Current weather from Open-Meteo.
- Optional historical/tourism objects from OpenStreetMap via Overpass.
- Search by place name or coordinates.
- Explicit user-triggered geolocation.
- Local interests and favorites stored on the device.
- Responsive mobile layout and reduced-motion support.

This is an early implementation and has not yet been built or verified in a published browser session. The historical layer depends on the public Overpass service. CARTO basemaps and public data providers may have availability, attribution, licensing, and usage limits.

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

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys the `main` branch. In repository settings, configure Pages to use **GitHub Actions**. The first successful deployment still needs to be checked in the published browser URL.

## Data sources

- Basemap styles: CARTO; map data attribution is shown by MapLibre's attribution control.
- Earthquakes: USGS Earthquake Hazards Program, all-day GeoJSON feed.
- Weather: Open-Meteo API.
- Historical/tourism features: OpenStreetMap via Overpass API.
- Place search: OpenStreetMap Nominatim.

Respect each provider's attribution, license, and usage policy. Public demo endpoints are not unlimited production backends.
