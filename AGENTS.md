# AGENTS.md

## Commands
- `npm run dev` (Vite dev server), `npm run build` (`tsc && vite build`), `npm run preview` (serves `dist/` on port 4173). There are no test, lint, or format scripts; `npm run build` is the only verification gate.
- `tsconfig.json` enables `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`. Use `import type` for type-only imports or the build fails.

## Wiring
- `src/main.ts` is the sole app entrypoint. `index.html` only provides `#map`, `#hud-overlay`, `#elevation-container`, `#playback-controls-container`, and `#dropzone`; `AthleticHUD` and `PlaybackControls` inject their own markup at runtime and `main.ts` binds to those generated IDs. Do not rename the containers.
- MapLibre v6 uses named imports; its worker must be registered via `setWorkerUrl(workerUrl)` with `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`. The `Map` needs `canvasContextAttributes: { preserveDrawingBuffer: true }` for video capture.
- `createMapStyle()` uses ArcGIS World Imagery plus an AWS Terrarium DEM. Hillshade reads from its own `hillshadeSource`; `setTerrain()` uses `terrainSource`. Reusing one source for both triggers a MapLibre console warning.
- GPX loading is deliberately outside `style.load`: `loadDemoRoute()` starts immediately, while terrain/route layers are created on `style.load` and `drawCurrentTrack()` refreshes them. Keep that split so the HUD populates before remote tiles finish.
- Basemap, DEM, glyph (`demotiles.maplibre.org`), and Google Font requests are remote. Blank map or fallback fonts during offline testing are environment issues, not app bugs.

## Data behavior
- `parseGPX()` reads `<trkpt>` only (not `<rtept>`) and needs at least two valid points. Missing `<ele>` values are synthesized from cumulative distance, so elevation stats can be fabricated. Points are de-jittered below 1.5 m and resampled every ~5–15 m; speeds come from `<time>` when present, otherwise from a gradient model.
- Demos live in `public/demo/` and are loaded via `import.meta.env.BASE_URL + 'demo/...'` so the relative Vite base works on project Pages. The root `ZeppLife20261121083047.gpx` is an identical copy of the Zepp demo, not a separate route.
- Playback progress is normalized 0..1 over a fixed 45 s at 1x. Camera modes are `chase`, `birds_eye`, and `free`; only `CameraDirector` calls `map.jumpTo()` for automated shots.

## Video export
- Presets are `full_hd` 1920×1080 and `reel` 1024×1920, fixed at 22 s / 30 fps. Export draws map frames into a 2D canvas via `MediaRecorder.captureStream`, preferring WebM VP9/VP8 with MP4 as fallback.
- During export terrain is disabled, the map canvas is capped at 960 px on its long side, `body.is-exporting` hides the DOM HUD, and branded HUD is drawn from `VideoFrameState`. Original terrain, camera mode, progress, playback, and map style are restored in `finally`. Removing these steps breaks software-WebGL capture.
- Overlay colors/fonts are hardcoded in `videoExportService.ts`; keep them in sync with tokens in `src/style.css` and the font links in `index.html`.

## Verification
- For browser QA use `npm run preview` and Chrome with WebGL. Headless runs used `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; check for MapLibre console warnings and confirm DEM tile requests.
- This workspace has no `.git` directory; do not assume git history or diffs are available.
