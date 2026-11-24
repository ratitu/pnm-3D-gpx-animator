import { Map, NavigationControl, GeoJSONSource, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import './style.css';

// Ensure MapLibre Web Worker is loaded correctly in Vite bundler
setWorkerUrl(workerUrl);
import { parseGPX, getInterpolatedPoint, formatDuration } from './services/gpxEngine';
import {
  applyBasemap,
  createMapStyle,
  DEFAULT_BASEMAP,
  type BasemapId
} from './services/mapStyle';
import { CameraDirector } from './services/cameraDirector';
import { CyclistMarker } from './components/CyclistMarker';
import { AthleticHUD } from './components/AthleticHUD';
import { ElevationProfileChart } from './components/ElevationProfileChart';
import { PlaybackControls } from './components/PlaybackControls';
import {
  VideoExporter,
  VIDEO_PRESETS,
  type VideoFrameState,
  type VideoResolutionConfig
} from './services/videoExportService';
import type { ParsedTrack, CameraMode } from './types/track';

class ReliveApp {
  private map!: Map;
  private cameraDirector!: CameraDirector;
  private cyclistMarker!: CyclistMarker;
  private hud!: AthleticHUD;
  private elevationChart!: ElevationProfileChart;
  private playbackControls!: PlaybackControls;
  private videoExporter = new VideoExporter();
  private videoProfile: number[] = [];
  private isExporting = false;

  private currentTrack: ParsedTrack | null = null;
  private currentBasemap: BasemapId = DEFAULT_BASEMAP;
  private progress = 0; // 0..1
  private isPlaying = false;
  private playbackSpeed = 5; // default 5x
  private lastTimestamp = 0;

  // Track GeoJSON Sources
  private fullRouteSourceId = 'full-route-source';
  private traveledRouteSourceId = 'traveled-route-source';

  constructor() {
    this.initHUD();
    this.initMap();
    this.bindFileDrop();
  }

  private initHUD() {
    const hudTop = document.querySelector('#hud-top') as HTMLElement;
    this.hud = new AthleticHUD(hudTop);

    const elevContainer = document.querySelector('#elevation-container') as HTMLElement;
    this.elevationChart = new ElevationProfileChart(elevContainer, (seekProgress) => {
      this.seekTo(seekProgress);
    });

    const controlsContainer = document.querySelector('#playback-controls-container') as HTMLElement;
    this.playbackControls = new PlaybackControls(controlsContainer, {
      onPlayToggle: (play) => {
        this.isPlaying = play;
        if (this.isPlaying) {
          this.lastTimestamp = performance.now();
          requestAnimationFrame(this.animationLoop.bind(this));
        }
      },
      onSpeedChange: (speed) => {
        this.playbackSpeed = speed;
      },
      onCameraModeChange: (mode: CameraMode) => {
        this.cameraDirector.setMode(mode);
        if (this.currentTrack && mode !== 'free') {
          const pt = getInterpolatedPoint(this.currentTrack.points, this.progress);
          this.cameraDirector.resetTo(pt);
        }
      },
      onReset: () => {
        this.seekTo(0);
      }
    });

    // Top action triggers
    document.querySelector('#btn-load-demo')?.addEventListener('click', () => {
      this.loadDemoRoute(`${import.meta.env.BASE_URL}demo/stelvio_pass.gpx`);
    });

    document.querySelector('#btn-load-zepp')?.addEventListener('click', () => {
      this.loadDemoRoute(`${import.meta.env.BASE_URL}demo/zepp_ride.gpx`);
    });

    const basemapSelect = document.querySelector('#basemap-select') as HTMLSelectElement | null;
    basemapSelect?.addEventListener('change', (e) => {
      this.currentBasemap = (e.target as HTMLSelectElement).value as BasemapId;
      applyBasemap(this.map, this.currentBasemap);
    });

    const fileInput = document.querySelector('#gpx-file-input') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.readAndLoadFile(file);
    });

    document.querySelector('#btn-export-video')?.addEventListener('click', () => {
      if (!VideoExporter.isSupported()) {
        alert('Video recording is not supported in this browser. Try Chrome, Edge or Firefox.');
        return;
      }
      if (!this.currentTrack) {
        alert('Load a GPX route before exporting a video.');
        return;
      }
      this.hud.showExportModal();
    });
    document.querySelector('#btn-export-close')?.addEventListener('click', () => this.hud.hideExportModal());
    document.querySelector('#btn-export-cancel')?.addEventListener('click', () => this.hud.hideExportModal());
    document.querySelector('#btn-export-start')?.addEventListener('click', () => {
      void this.startVideoExport();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.isExporting) this.videoExporter.cancel();
      else this.hud.hideExportModal();
    });
  }

  private initMap() {
    this.map = new Map({
      container: 'map',
      style: createMapStyle(),
      center: [10.4532, 46.5286], // Default near Alps Stelvio
      zoom: 13,
      pitch: 65,
      bearing: -20,
      maxPitch: 85,
      // Required so WebGL frames can be composited into the video renderer.
      canvasContextAttributes: { preserveDrawingBuffer: true }
    });

    this.cameraDirector = new CameraDirector(this.map);
    this.cyclistMarker = new CyclistMarker(this.map);

    // Map layer setup only needs the style document; load the GPX separately so
    // the HUD is populated even while remote tiles are still downloading.
    this.map.once('style.load', () => {
      // Enable 3D terrain mesh
      this.map.setTerrain({
        source: 'terrainSource',
        exaggeration: 1.35
      });

      // Reapply in case the user switched basemaps before the style finished loading.
      applyBasemap(this.map, this.currentBasemap);

      // Add navigation controls (compass + pitch) in bottom-right
      this.map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');

      // Initialize route GeoJSON sources
      this.initRouteLayers();
      if (this.currentTrack) this.drawCurrentTrack();
    });

    void this.loadDemoRoute(`${import.meta.env.BASE_URL}demo/stelvio_pass.gpx`);
  }

  private initRouteLayers() {
    const emptyFeatureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };

    // Full unvisited route (subtle translucent path)
    this.map.addSource(this.fullRouteSourceId, {
      type: 'geojson',
      data: emptyFeatureCollection
    });

    // Traveled path (bright high-visibility glowing ribbon)
    this.map.addSource(this.traveledRouteSourceId, {
      type: 'geojson',
      data: emptyFeatureCollection
    });

    // Layer: Future unvisited route
    this.map.addLayer({
      id: 'full-route-layer',
      type: 'line',
      source: this.fullRouteSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#f3ecd8', // warm ivory dashed route
        'line-opacity': 0.35,
        'line-width': 4.0,
        'line-dasharray': [2, 2]
      }
    });

    // Layer: Traveled path outer halo glow (warm ochre/rust glow)
    this.map.addLayer({
      id: 'traveled-route-glow',
      type: 'line',
      source: this.traveledRouteSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#d0542c', // rust-red primary
        'line-opacity': 0.65,
        'line-width': 10,
        'line-blur': 4
      }
    });

    // Layer: Traveled path main core (warm ochre/rust-amber)
    this.map.addLayer({
      id: 'traveled-route-core',
      type: 'line',
      source: this.traveledRouteSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#e5a853', // ochre accent
        'line-opacity': 0.95,
        'line-width': 5.0
      }
    });
  }

  public async loadDemoRoute(url: string) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      const text = await resp.text();
      this.applyGPXData(text);
    } catch (err) {
      console.error('Failed to load demo GPX:', err);
      alert('Could not load sample GPX. Try uploading your own.');
    }
  }

  private readAndLoadFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        try {
          this.applyGPXData(content);
        } catch (err: any) {
          alert(`Error reading GPX: ${err.message}`);
        }
      }
    };
    reader.readAsText(file);
  }

  private applyGPXData(xmlContent: string) {
    const parsed = parseGPX(xmlContent);
    this.currentTrack = parsed;
    this.progress = 0;
    this.isPlaying = false;
    this.playbackControls.setPlaying(false);

    // Update HUD & elevation graph
    this.hud.setTrackInfo(parsed);
    this.elevationChart.setTrack(parsed);

    // Downsample the elevation profile once for video frame compositing
    const stride = Math.max(1, Math.ceil(parsed.points.length / 160));
    this.videoProfile = parsed.points.filter((_, i) => i % stride === 0).map((p) => p.ele);
    this.videoProfile.push(parsed.points[parsed.points.length - 1].ele);

    this.drawCurrentTrack();

    // Establish shot: Center and fly to track overview
    const [minLng, minLat, maxLng, maxLat] = parsed.bounds;
    this.map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      {
        padding: { top: 90, bottom: 120, left: 60, right: 60 },
        pitch: 58,
        bearing: -15,
        duration: 2200
      }
    );

    // Position marker at starting point
    const startPoint = parsed.points[0];
    this.cyclistMarker.init(startPoint);
    this.cameraDirector.resetTo(startPoint);

    // Update initial telemetry state
    this.hud.updateTelemetry({
      progress: 0,
      currentPoint: startPoint,
      speedKmH: startPoint.speed || 0,
      elevationM: startPoint.ele,
      gradePct: startPoint.grade || 0,
      distanceKm: 0,
      elapsedTimeStr: '00:00:00',
      isPlaying: false,
      playbackSpeed: this.playbackSpeed,
      cameraMode: this.cameraDirector.getMode(),
      activeMilestone: parsed.milestones[0]
    });

    this.elevationChart.updateProgress(0);
  }

  private drawCurrentTrack() {
    if (!this.currentTrack) return;

    const fullLineCoordinates = this.currentTrack.points.map((p) => [p.lng, p.lat]);
    const fullGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: fullLineCoordinates
      }
    };

    const fullSrc = this.map.getSource(this.fullRouteSourceId) as GeoJSONSource;
    if (fullSrc) fullSrc.setData(fullGeoJson);

    this.updateTraveledRoute(this.progress);
  }

  private updateTraveledRoute(progress: number) {
    if (!this.currentTrack) return;
    const count = Math.max(1, Math.floor(progress * (this.currentTrack.points.length - 1)) + 1);
    const coords = this.currentTrack.points.slice(0, count).map((p) => [p.lng, p.lat]);

    // Add exact interpolated head point
    const headPt = getInterpolatedPoint(this.currentTrack.points, progress);
    coords.push([headPt.lng, headPt.lat]);

    const traveledGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords
      }
    };

    const travSrc = this.map.getSource(this.traveledRouteSourceId) as GeoJSONSource;
    if (travSrc) {
      travSrc.setData(traveledGeoJson);
    }
  }

  private seekTo(progress: number) {
    if (!this.currentTrack) return;
    this.progress = Math.max(0, Math.min(1, progress));

    const curPoint = getInterpolatedPoint(this.currentTrack.points, this.progress);
    this.cyclistMarker.update(curPoint);
    this.cameraDirector.resetTo(curPoint);
    this.cameraDirector.update(curPoint, 0.05);
    this.updateTraveledRoute(this.progress);
    this.elevationChart.updateProgress(this.progress);

    // Current distance and elapsed duration
    const currentDistM = this.progress * this.currentTrack.totalDistance;
    const elapsedSecs = (this.progress * this.currentTrack.totalDurationMs) / 1000;

    // Check closest milestone within proximity
    const milestone = this.currentTrack.milestones.find(
      (m) => Math.abs(m.dist - currentDistM) < Math.max(150, this.currentTrack!.totalDistance * 0.02)
    ) || null;

    this.hud.updateTelemetry({
      progress: this.progress,
      currentPoint: curPoint,
      speedKmH: curPoint.speed || 0,
      elevationM: curPoint.ele,
      gradePct: curPoint.grade || 0,
      distanceKm: currentDistM / 1000,
      elapsedTimeStr: formatDuration(elapsedSecs),
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed,
      cameraMode: this.cameraDirector.getMode(),
      activeMilestone: milestone
    });
  }

  private animationLoop(timestamp: number) {
    if (!this.isPlaying || !this.currentTrack) return;

    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const dtSeconds = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    // Base journey target duration ~45s at 1x speed
    const baseJourneyDuration = 45;
    const progressDelta = (dtSeconds / baseJourneyDuration) * this.playbackSpeed;

    this.progress += progressDelta;

    if (this.progress >= 1) {
      this.progress = 1;
      this.isPlaying = false;
      this.playbackControls.setPlaying(false);

      const finalPoint = this.currentTrack.points[this.currentTrack.points.length - 1];
      this.cameraDirector.startFinishOrbit(finalPoint);

      // Trigger finish milestone celebration
      const finishMilestone = this.currentTrack.milestones.find((m) => m.type === 'finish');
      if (finishMilestone) {
        this.hud.triggerMilestone(finishMilestone);
      }
    }

    const curPoint = getInterpolatedPoint(this.currentTrack.points, this.progress);

    // Update marker, camera, route line, HUD
    this.cyclistMarker.update(curPoint);
    this.cameraDirector.update(curPoint, dtSeconds);
    this.updateTraveledRoute(this.progress);
    this.elevationChart.updateProgress(this.progress);

    const currentDistM = this.progress * this.currentTrack.totalDistance;
    const elapsedSecs = (this.progress * this.currentTrack.totalDurationMs) / 1000;

    const milestone = this.currentTrack.milestones.find(
      (m) => Math.abs(m.dist - currentDistM) < Math.max(120, this.currentTrack!.totalDistance * 0.015)
    ) || null;

    this.hud.updateTelemetry({
      progress: this.progress,
      currentPoint: curPoint,
      speedKmH: curPoint.speed || 0,
      elevationM: curPoint.ele,
      gradePct: curPoint.grade || 0,
      distanceKm: currentDistM / 1000,
      elapsedTimeStr: formatDuration(elapsedSecs),
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed,
      cameraMode: this.cameraDirector.getMode(),
      activeMilestone: milestone
    });

    if (this.isPlaying) {
      requestAnimationFrame(this.animationLoop.bind(this));
    }
  }

  private async startVideoExport() {
    const track = this.currentTrack;
    if (this.isExporting || !track) return;

    const preset = this.hud.getSelectedPreset();
    const presetConfig = VIDEO_PRESETS[preset];
    const savedProgress = this.progress;
    const savedPlaying = this.isPlaying;
    const savedMode = this.cameraDirector.getMode();
    const mapEl = document.querySelector('#map') as HTMLElement;
    const originalStyle = mapEl.getAttribute('style') ?? '';
    const savedTerrain = this.map.getTerrain();

    this.isExporting = true;
    this.isPlaying = false;
    this.playbackControls.setPlaying(false);
    this.cameraDirector.setMode('chase');
    this.hud.setExportBusy(true);
    document.body.classList.add('is-exporting');
    // A full terrain mesh at export size is too expensive for software WebGL;
    // the raster basemap preserves the route while keeping frame capture smooth.
    this.map.setTerrain(null);
    this.seekTo(0);

    try {
      const result = await this.videoExporter.exportVideo({
        preset,
        durationSeconds: 22,
        fps: 30,
        mapCanvas: this.map.getCanvas(),
        resizeMap: () => {
          // Keep the WebGL surface modest; the 2D export canvas still renders
          // at the exact preset resolution and scales this frame up.
          const maxRenderSide = 960;
          const scale = Math.min(1, maxRenderSide / Math.max(presetConfig.width, presetConfig.height));
          const renderWidth = Math.round(presetConfig.width * scale);
          const renderHeight = Math.round(presetConfig.height * scale);
          mapEl.style.position = 'fixed';
          mapEl.style.left = '0px';
          mapEl.style.top = '0px';
          mapEl.style.width = `${renderWidth}px`;
          mapEl.style.height = `${renderHeight}px`;
          mapEl.style.zIndex = '1';
          this.map.resize();
        },
        restoreMap: () => {
          mapEl.setAttribute('style', originalStyle);
          this.map.resize();
        },
        onFrame: (progress, dt) => this.exportFrame(progress, dt),
        getFrameState: () => this.getVideoFrameState(presetConfig),
        onProgress: (progress) => this.hud.setExportProgress(progress)
      });

      if (result) {
        const slug =
          track.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'ride';
        VideoExporter.download(result, `relive-${slug}-${presetConfig.width}x${presetConfig.height}.${result.ext}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      alert(`Video export failed: ${message}`);
    } finally {
      mapEl.setAttribute('style', originalStyle);
      this.map.resize();
      if (savedTerrain) this.map.setTerrain(savedTerrain);
      this.cameraDirector.setMode(savedMode);
      this.progress = savedProgress;
      this.seekTo(savedProgress);
      this.isPlaying = savedPlaying;
      this.playbackControls.setPlaying(savedPlaying);
      if (savedPlaying) {
        this.lastTimestamp = performance.now();
        requestAnimationFrame(this.animationLoop.bind(this));
      }
      document.body.classList.remove('is-exporting');
      this.hud.setExportBusy(false);
      this.isExporting = false;
    }
  }

  private exportFrame(progress: number, dt: number) {
    const track = this.currentTrack;
    if (!track) return;

    this.progress = progress;
    const point = getInterpolatedPoint(track.points, progress);
    this.cyclistMarker.update(point);
    if (progress <= 0.001) this.cameraDirector.resetTo(point);
    this.cameraDirector.update(point, Math.max(dt, 1 / 30));

    if (progress > 0.9) {
      const finalPoint = track.points[track.points.length - 1];
      this.cameraDirector.startFinishOrbit(finalPoint);
      this.cameraDirector.update(finalPoint, Math.max(dt, 1 / 30));
    }

    this.updateTraveledRoute(progress);
    this.elevationChart.updateProgress(progress);

    const distanceM = progress * track.totalDistance;
    this.hud.updateTelemetry({
      progress,
      currentPoint: point,
      speedKmH: point.speed || 0,
      elevationM: point.ele,
      gradePct: point.grade || 0,
      distanceKm: distanceM / 1000,
      elapsedTimeStr: formatDuration((progress * track.totalDurationMs) / 1000),
      isPlaying: false,
      playbackSpeed: this.playbackSpeed,
      cameraMode: this.cameraDirector.getMode(),
      activeMilestone: null
    });
  }

  private getVideoFrameState(preset: VideoResolutionConfig): VideoFrameState {
    const track = this.currentTrack!;
    const point = getInterpolatedPoint(track.points, this.progress);
    const screen = this.map.project([point.lng, point.lat]);
    const mapCanvas = this.map.getCanvas();
    const scaleX = preset.width / mapCanvas.width;
    const scaleY = preset.height / mapCanvas.height;

    return {
      title: track.name,
      subtitle: `${(track.totalDistance / 1000).toFixed(1)} km · ${track.totalElevationGain} m gain · peak ${track.maxElevation} m`,
      speedKmH: point.speed || 0,
      elevationM: point.ele,
      gradePct: point.grade || 0,
      distanceKm: (this.progress * track.totalDistance) / 1000,
      totalDistanceKm: track.totalDistance / 1000,
      elapsedTimeStr: formatDuration((this.progress * track.totalDurationMs) / 1000),
      progress: this.progress,
      profile: this.videoProfile,
      marker: { x: screen.x * scaleX, y: screen.y * scaleY, bearing: point.bearing || 0 },
      isReel: preset.id === 'reel'
    };
  }

  private bindFileDrop() {
    const dropzone = document.querySelector('#dropzone') as HTMLElement;
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropzone.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropzone.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropzone.classList.remove('active');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.gpx')) {
          this.readAndLoadFile(file);
        } else {
          alert('Please upload a valid .GPX file.');
        }
      }
    });
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new ReliveApp();
});
