import type { Map } from 'maplibre-gl';
import type { CameraMode, TrackPoint } from '../types/track';

/**
 * Shortest path angular difference in degrees [-180, 180]
 */
function angularDifference(target: number, current: number): number {
  return ((((target - current) % 360) + 540) % 360) - 180;
}

/**
 * Smooth exponential dampening for angles
 */
function lerpAngle(current: number, target: number, factor: number): number {
  const diff = angularDifference(target, current);
  return (current + diff * factor + 360) % 360;
}

/**
 * Smooth scalar lerp
 */
function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export class CameraDirector {
  private map: Map;
  private mode: CameraMode = 'chase';
  
  // Internal smoothed state
  private currentLng = 0;
  private currentLat = 0;
  private currentBearing = 0;
  private currentPitch = 65;
  private currentZoom = 15.5;

  private isOrbiting = false;
  private orbitAngle = 0;

  constructor(map: Map) {
    this.map = map;
  }

  public setMode(mode: CameraMode) {
    this.mode = mode;
    this.isOrbiting = false;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public resetTo(point: TrackPoint) {
    this.currentLng = point.lng;
    this.currentLat = point.lat;
    this.currentBearing = point.bearing || 0;
    this.currentPitch = this.mode === 'birds_eye' ? 38 : 68;
    this.currentZoom = this.mode === 'birds_eye' ? 14.5 : 15.5;
    this.isOrbiting = false;
  }

  public startFinishOrbit(finalPoint: TrackPoint) {
    this.isOrbiting = true;
    this.currentLng = finalPoint.lng;
    this.currentLat = finalPoint.lat;
  }

  public update(point: TrackPoint, dt: number) {
    if (this.mode === 'free') {
      // User has manual camera control
      return;
    }

    // Normalized frame dampening factor (~0.05 - 0.12)
    const factor = Math.min(1, Math.max(0.02, dt * 4.5));

    if (this.isOrbiting) {
      // Cinematic 360 showcase fly-around at the finish line
      this.orbitAngle = (this.orbitAngle + dt * 22) % 360;
      this.currentPitch = lerp(this.currentPitch, 55, factor);
      this.currentZoom = lerp(this.currentZoom, 14.8, factor);

      this.map.jumpTo({
        center: [this.currentLng, this.currentLat],
        bearing: this.orbitAngle,
        pitch: this.currentPitch,
        zoom: this.currentZoom
      });
      return;
    }

    if (this.mode === 'chase') {
      // Relive 3D trailing chase camera
      const targetBearing = point.bearing || 0;
      const speed = point.speed || 25;
      const grade = point.grade || 0;

      // Dynamic cinematic camera behavior based on speed and slope:
      // Pull back & pitch down slightly on fast descents for epic horizon view
      // Tighten zoom and pitch up slightly on steep mountain switchbacks
      const targetPitch = Math.min(75, Math.max(55, 66 - grade * 0.4));
      const targetZoom = Math.max(14.2, Math.min(16.5, 15.8 - (speed - 20) * 0.02));

      // Interpolate camera coordinates with slight forward offset
      this.currentLng = lerp(this.currentLng, point.lng, factor);
      this.currentLat = lerp(this.currentLat, point.lat, factor);
      this.currentBearing = lerpAngle(this.currentBearing, targetBearing, factor * 0.85);
      this.currentPitch = lerp(this.currentPitch, targetPitch, factor);
      this.currentZoom = lerp(this.currentZoom, targetZoom, factor);

      this.map.jumpTo({
        center: [this.currentLng, this.currentLat],
        bearing: this.currentBearing,
        pitch: this.currentPitch,
        zoom: this.currentZoom
      });
    } else if (this.mode === 'birds_eye') {
      // High-angle bird's eye follow
      const targetPitch = 35;
      const targetZoom = 14.8;
      const targetBearing = (point.bearing || 0) * 0.5; // gentler angle turns

      this.currentLng = lerp(this.currentLng, point.lng, factor);
      this.currentLat = lerp(this.currentLat, point.lat, factor);
      this.currentBearing = lerpAngle(this.currentBearing, targetBearing, factor * 0.5);
      this.currentPitch = lerp(this.currentPitch, targetPitch, factor);
      this.currentZoom = lerp(this.currentZoom, targetZoom, factor);

      this.map.jumpTo({
        center: [this.currentLng, this.currentLat],
        bearing: this.currentBearing,
        pitch: this.currentPitch,
        zoom: this.currentZoom
      });
    }
  }
}
