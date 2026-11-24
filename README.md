# Relive 3D

A Relive-style GPX journey visualizer built with Vite, TypeScript, and MapLibre GL JS. It animates a cyclist across 3D terrain with cinematic camera moves, live telemetry, an interactive elevation profile, milestone callouts, and branded video export.

## Features

- 3D terrain with hillshade and exaggeration, plus three switchable MapTiler raster basemaps: **Satellite**, **Landscape**, and **Backdrop**.
- Animated cyclist marker, traveled-route ribbon, and dashed route preview.
- Camera modes: **Chase 3D**, **Top-Down**, and **Free** roam, with an automatic finish orbit.
- Live speed, elevation, grade, distance, and elapsed-time HUD.
- Clickable/draggable elevation profile for scrubbing.
- GPX import via file picker or drag-and-drop; two bundled demo rides.
- Automatic start, summit, top-speed, distance, and finish milestones.
- Video export at **Full HD 1920×1080** or **Instagram Reel 1024×1920**.

## Requirements

- Node.js with npm.
- A modern browser with WebGL. Video export also needs `MediaRecorder` and canvas `captureStream`; Chrome, Edge, and Firefox are supported by the code, with Chrome used for verification.
- Internet access: basemap tiles, elevation tiles, glyphs, and fonts are fetched from public services at runtime.
- A MapTiler API key for the basemaps. Vite inlines it into the client bundle, so use a key restricted to your deployment domain.

## Quick start

```bash
npm install
cp .env.example .env.local   # then set VITE_MAPTILER_KEY to your MapTiler key
npm run dev
```

Open the URL printed by Vite. The Stelvio Pass demo route loads automatically.

For GitHub Pages, add a repository secret named `MAPTILER_KEY` with the same key; the deploy workflow passes it to Vite as `VITE_MAPTILER_KEY`. The `.env.local` file and the raw key file are gitignored.

To build and serve the production bundle:

```bash
npm run build
npm run preview   # serves dist/ at http://127.0.0.1:4173
```

## Using the app

- Choose **Stelvio Pass** or **Zepp Track** to load a bundled demo, or use **Import GPX** / drop a `.gpx` file anywhere on the page.
- Use the basemap dropdown in the top bar to switch between **Satellite**, **Landscape**, and **Backdrop**. Terrain, hillshade, and the route overlay stay in place.
- Press **Space** to play or pause. Speed options are 1x, 2x, 5x (default), 10x, and 20x.
- Click or drag on the elevation chart to jump to any point in the ride.
- Switch camera modes with the **MODE** buttons; **Free** leaves the camera under manual control.
- Click **Export Video**, pick a preset, then start. Export renders about 22 seconds at 30 fps from the beginning of the route and downloads a WebM file (MP4 where the browser provides it). Playback position, camera mode, and terrain are restored afterward.
- Press **Escape** to close the export dialog or cancel an in-progress render.

## GPX notes

- The parser reads `<trkpt>` elements (not `<rtept>`) and needs at least two valid points.
- `<ele>` is optional. If elevation is missing, it is synthesized from cumulative distance, so elevation stats and the profile should be treated as illustrative.
- `<time>` is used when present; otherwise speed is modeled from gradient.
- Tracks are de-jittered and uniformly resampled before animation, so very large files may take a moment to load.

## Project layout

- `src/main.ts` — app bootstrap, map setup, playback loop, and export orchestration.
- `src/services/gpxEngine.ts` — GPX parsing, resampling, telemetry, and milestones.
- `src/services/mapStyle.ts` — MapLibre style, three MapTiler raster basemaps, DEM, hillshade, and the visibility-toggle helper.
- `src/services/cameraDirector.ts` — chase, top-down, orbit, and free camera behavior.
- `src/services/videoExportService.ts` — export presets, canvas compositing, overlay drawing, and recording.
- `src/components/` — HUD, cyclist marker, elevation chart, and playback controls.
- `public/demo/` — bundled GPX routes.
- `vite.config.ts` — relative Vite base for GitHub Pages project URLs.
- `.env.example` — documents the required `VITE_MAPTILER_KEY` build variable.
- `.github/workflows/deploy-pages.yml` — builds and deploys `dist/` to GitHub Pages on pushes to `main`.
- `index.html` — static map/HUD containers and font links.

## Development notes

- `npm run build` runs `tsc && vite build`; there are no test, lint, or format scripts.
- MapLibre v6 is registered through `setWorkerUrl()` with a Vite `?worker&url` import. The map uses `preserveDrawingBuffer: true` so frames can be captured for export.
- Hillshade and 3D terrain use separate DEM sources; sharing one source causes a MapLibre warning.
- Basemaps are separate raster layers toggled with `setLayoutProperty('visibility', ...)`, not `map.setStyle()`, so terrain and route layers survive a switch.
- Export temporarily disables terrain and caps the internal map canvas at 960 px to keep software-WebGL recording reliable.
