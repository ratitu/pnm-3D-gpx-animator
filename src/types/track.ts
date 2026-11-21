export interface TrackPoint {
  lng: number;
  lat: number;
  ele: number;
  time?: number; // timestamp in ms
  distFromStart: number; // in meters
  speed?: number; // km/h
  grade?: number; // percentage
  bearing?: number; // degrees [0, 360)
}

export interface Milestone {
  id: string;
  type: 'start' | 'finish' | 'peak' | 'speed' | 'steep' | 'distance';
  title: string;
  subtitle: string;
  dist: number;
  pointIndex: number;
  point: TrackPoint;
  triggered?: boolean;
}

export interface ParsedTrack {
  name: string;
  points: TrackPoint[];
  totalDistance: number; // meters
  totalElevationGain: number; // meters
  totalElevationLoss: number; // meters
  minElevation: number; // meters
  maxElevation: number; // meters
  maxSpeed: number; // km/h
  maxGrade: number; // percentage
  totalDurationMs: number; // ms
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  milestones: Milestone[];
}

export type CameraMode = 'chase' | 'birds_eye' | 'free';

export interface TelemetryState {
  progress: number; // 0..1
  currentPoint: TrackPoint;
  speedKmH: number;
  elevationM: number;
  gradePct: number;
  distanceKm: number;
  elapsedTimeStr: string;
  isPlaying: boolean;
  playbackSpeed: number;
  cameraMode: CameraMode;
  activeMilestone: Milestone | null;
}
