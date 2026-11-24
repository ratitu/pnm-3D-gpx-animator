import type { Map } from 'maplibre-gl';
import type { CameraMode, TrackPoint } from '../types/track';

/**
 * Shortest path angular difference in degrees [-180, 180]
 */
function angularDifference(target: number, current: number): number {
  return ((((target - current) % 360) + 540) % 360) - 180;
}

/**
 * Smooth scalar lerp
 */
function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

  public update(point: TrackPoint, dt: number, lookAheadBearing?: number) {
    if (this.mode === 'free') {
      // User has manual camera control
      return;
    }

    // Attitude changes stay slow; position follows the rider more closely.
    const stepDt = Math.max(0, dt);
    const factor = Math.min(1, Math.max(0.02, stepDt * 4.5));
    const positionFactor = Math.min(1, Math.max(0.02, stepDt * 10));
    const headingBearing = lookAheadBearing ?? point.bearing ?? 0;
    const turnSeverity =
      lookAheadBearing === undefined
        ? 0
        : Math.min(1, Math.abs(angularDifference(headingBearing, point.bearing || 0)) / 90);

    if (this.isOrbiting) {
      // Cinematic 360 showcase fly-around at the finish line
      this.orbitAngle = (this.orbitAngle + stepDt * 22) % 360;
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
      const speed = point.speed || 25;
      const grade = point.grade || 0;

      // On twisty sections pull back and flatten the view so switchbacks stay readable.
      const targetPitch = clamp(66 - grade * 0.4 - turnSeverity * 8, 50, 75);
      const targetZoom = clamp(15.8 - (speed - 20) * 0.02 - turnSeverity * 0.7, 13.8, 16.5);

      this.currentLng = lerp(this.currentLng, point.lng, positionFactor);
      this.currentLat = lerp(this.currentLat, point.lat, positionFactor);

      // Anticipate the next bend, but cap yaw so tight hairpins cannot whip the view.
      const requestedYaw = angularDifference(headingBearing, this.currentBearing) * factor * 0.85;
      const maxYaw = 40 * stepDt;
      this.currentBearing = (this.currentBearing + clamp(requestedYaw, -maxYaw, maxYaw) + 360) % 360;
      this.currentPitch = lerp(this.currentPitch, targetPitch, factor);
      this.currentZoom = lerp(this.currentZoom, targetZoom, factor);

      this.map.jumpTo({
        center: [this.currentLng, this.currentLat],
        bearing: this.currentBearing,
        pitch: this.currentPitch,
        zoom: this.currentZoom
      });
    } else if (this.mode === 'birds_eye') {
      // High-angle bird's eye follow: rotate only halfway into the upcoming heading,
      // using signed differences so the 0/360 wrap cannot flip the camera.
      const targetBearing = ((angularDifference(headingBearing, 0) * 0.5) + 360) % 360;
      const targetPitch = 35 - turnSeverity * 8;
      const targetZoom = 14.8 - turnSeverity * 0.6;

      this.currentLng = lerp(this.currentLng, point.lng, positionFactor);
      this.currentLat = lerp(this.currentLat, point.lat, positionFactor);
      const requestedYaw = angularDifference(targetBearing, this.currentBearing) * factor * 0.5;
      const maxYaw = 25 * stepDt;
      this.currentBearing = (this.currentBearing + clamp(requestedYaw, -maxYaw, maxYaw) + 360) % 360;
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
