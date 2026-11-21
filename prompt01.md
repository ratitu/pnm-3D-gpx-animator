# Specification & Implementation Prompt: Relive-Style GPX Track Animation with MapLibre GL JS

Create a modern, responsive web application that visualizes a GPS track (GPX file) as a 3D animated journey with smooth camera choreography, dynamic statistics HUD, and elevation profile, reminiscent of the **Relive** app experience.

---

## 1. Core Architecture & Tech Stack

- **Framework / Bundler**: Vite + TypeScript (or vanilla modern TS/JS, single-page app).
- **Map & 3D Visualization**: [MapLibre GL JS](https://maplibre.org/) (v4+ or v5).
- **Terrain & Imagery**:
  - Global satellite or high-contrast outdoor raster basemap (e.g., MapTiler satellite/hybrid, Protomaps, or AWS Terrain Tiles / OpenTopography / Mapbox-RGB encoded Terrarium tiles).
  - 3D Terrain via raster-dem source (AWS Terrarium or MapTiler terrain RGB) with configurable exaggeration (1.2x – 1.6x).
  - Hillshading and atmospheric sky/fog layer for depth and cinematic horizon.
- **Geospatial Processing**:
  - `@tmcw/togeojson` or custom DOMParser for parsing GPX format.
  - `@turf/turf` (or minimal Turf sub-packages: `@turf/distance`, `@turf/bearing`, `@turf/along`, `@turf/length`, `@turf/helpers`) for spatial sampling, bearing calculation, interpolation, and smoothing.
- **Styling**: Tailwind CSS or clean modern CSS with a dark glassmorphic / athletic HUD overlay.
- **Icons**: Lucide Icons or Feather Icons (SVG).

---

## 2. Key Features & User Experience

### 2.1 File Ingestion & Track Preprocessing
- **Drag-and-Drop / File Upload**:
  - Allow uploading any valid `.gpx` file.
  - Include 1 or 2 bundled demo GPX files (e.g., an alpine cycling route / gravel ride with interesting elevation profiles).
- **Data Extraction**:
  - Coordinates `[longitude, latitude]`.
  - Elevation `ele` in meters.
  - Timestamps `<time>` for real-world speed & elapsed time.
- **Track Sanitization & Interpolation**:
  - Filter out GPS drift / duplicate coordinates.
  - Resample track points uniformly by distance or cumulative timestamps for butter-smooth animation frames (e.g., cubic spline or Catmull-Rom smoothing along coordinates and elevation).
  - Compute cumulative distance, rolling speed, cumulative ascent/descent, and bearings for every segment.

### 2.2 Relive-Style 3D Map & Camera Choreography
- **Camera Director Modes**:
  - **Third-Person Chasing Camera (Default / Relive style)**:
    - Pitch: ~60° to 75°.
    - Bearing: Dynamically matches the rider's forward travel direction with smooth rotational dampening / lerp.
    - Offset: Camera trails slightly behind and above the bicycle marker.
  - **Overhead / Bird's Eye Follow**:
    - Pitch: ~25° to 45°, dynamic zoom adjusted to terrain changes.
  - **Free Roam / Overview**:
    - Unlocks camera for manual panning, pitching, and zooming while playback continues or pauses.
- **Cinematic Pacing**:
  - Start with a route overview zoom-in transition ("Establishing shot").
  - Dynamic camera distance: pull back slightly on high-speed descents; tighten in on steep climbs.
  - Reaching the finish line triggers an orbit / fly-around showcase of the entire completed track.

### 2.3 Visual Representation of the Journey
- **The Bicycle Marker**:
  - A stylized 3D cyclist/bike model (glTF/GLB using threebox / MapLibre CustomLayerInterface) OR a high-contrast animated 2D SVG marker that rotates dynamically according to heading bearing and tilts on slopes.
  - Subtle ground shadow / pulsing elevation anchor to anchor the marker to 3D terrain.
- **Dynamic Track Ribbon**:
  - **Past (Traveled) Track**: High-visibility glowing line (e.g. bright orange `#FF5722` or electric cyan `#00E5FF`) with gradient shading colored by speed or gradient slope.
  - **Future Track**: Subtle translucent dashed/dotted path indicating the route ahead.
  - Optional: Elevation wall / extruded ribbon under the traveled line.
- **Milestones & Highlights ("Moments")**:
  - Automatically detect and place popups/pins at:
    - Peak elevation point (Highest Point).
    - Maximum speed section.
    - Steepest gradient segment.
    - Milestone distance markers (e.g. every 10 km).
  - As the rider passes a milestone, show a momentary callout animation card (just like Relive does for photos/records).

### 2.4 Athletic HUD & Telemetry Overlay
- **Real-Time Gauges**:
  - Current Speed (km/h or mph).
  - Current Elevation (m or ft) & Grade/Slope (%).
  - Distance Covered vs. Total Distance.
  - Elapsed Time / Activity Time.
- **Interactive Elevation Profile Chart (Bottom Bar)**:
  - Mini SVG/Canvas elevation graph along the bottom.
  - Progress cursor matching the cyclist's current position.
  - Hover / click on elevation chart to scrub/seek directly to that point on the route.
- **Playback Controls**:
  - Play / Pause (Spacebar support).
  - Playback Speed Toggle: `1x`, `2x`, `5x`, `10x`, `20x`.
  - Scrubber / Timeline bar to jump to any part of the ride.
  - Reset / Replay button.
  - Fullscreen toggle button.

---

## 3. Implementation Steps & Milestones

1. **Project Setup**:
   - Initialize Vite + TypeScript project.
   - Configure dependencies: `maplibre-gl`, `@turf/turf`, `@tmcw/togeojson`.
   - Setup basic responsive layout with HUD frame and map container (`#map`).

2. **GPX Engine & Route Normalization**:
   - Write a robust GPX parser extracting timestamps, lat/lng, and elevations.
   - Compute metrics: cumulative distance, moving speed, elevation deltas.
   - Implement interpolation function `getPointAtProgress(t: number)` where `t` is `[0..1]`.

3. **MapLibre 3D Terrain & Style Setup**:
   - Configure terrain DEM tiles with hillshading and custom sky layer.
   - Set up custom vector or GeoJSON sources for:
     - Full route (dimmed).
     - Traveled route (bright colored line).
     - Cyclist marker layer.

4. **Camera & Animation Loop**:
   - Use `requestAnimationFrame` driven by normalized elapsed time.
   - Calculate current position, target point ahead (for bearing calculation), and interpolate camera `center`, `bearing`, `pitch`, and `zoom` with dampening (exponential decay or lerp) to eliminate jerky camera turns.

5. **HUD & Interactive Timeline**:
   - Render the elevation profile SVG with dynamic gradient.
   - Connect timeline scrubber to the animation state (pause on drag, seek on click).
   - Display real-time telemetry metrics updated per animation frame.

6. **File Import & Demo Mode**:
   - Implement drag-and-drop file receiver with error handling for malformed GPX files.
   - Include a "Load Sample Alpine Route" button for zero-friction instant testing.

---

## 4. Acceptance Criteria

- [ ] Uploading a standard `.gpx` file parses successfully and centers the map in 3D terrain.
- [ ] Bicycle/cyclist marker smoothly traverses the track without jumping or vibrating.
- [ ] Camera dynamically turns and banks with the cyclist along curves and mountain switchbacks.
- [ ] Traveled path illuminates behind the cyclist while unvisited path remains subtle.
- [ ] Scrubbing the bottom timeline / elevation chart instantly updates cyclist position and camera.
- [ ] Speed modifier controls (`1x` to `20x`) reliably speed up / slow down playback.
- [ ] Works cleanly across modern desktop and mobile browsers.
