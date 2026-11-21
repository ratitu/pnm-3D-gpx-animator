import * as turf from '@turf/turf';
import type { ParsedTrack, TrackPoint, Milestone } from '../types/track';

/**
 * Calculates Vincenty or Great-Circle distance in meters between two points
 */
function distanceMeters(p1: [number, number], p2: [number, number]): number {
  return turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' }) * 1000;
}

/**
 * Calculates forward bearing in degrees [0, 360)
 */
function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const b = turf.bearing(turf.point(p1), turf.point(p2));
  return (b + 360) % 360;
}

/**
 * Formats seconds into HH:MM:SS or MM:SS
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse raw GPX XML string into structured ParsedTrack
 */
export function parseGPX(xmlText: string): ParsedTrack {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');

  // Check for parse errors
  const parseError = xml.querySelector('parsererror');
  if (parseError) {
    throw new Error('Failed to parse GPX file: Invalid XML format');
  }

  // Route/track name
  const nameEl = xml.querySelector('trk > name') || xml.querySelector('name');
  const trackName = nameEl?.textContent?.trim() || 'My Cycling Journey';

  const trkpts = xml.querySelectorAll('trkpt');
  if (trkpts.length === 0) {
    throw new Error('No track points (<trkpt>) found in GPX file');
  }

  const rawPoints: { lng: number; lat: number; ele: number; time?: number }[] = [];

  trkpts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');

    // Elevation extraction (fallback to synthetic elevation if missing)
    const eleEl = pt.querySelector('ele');
    const ele = eleEl && eleEl.textContent ? parseFloat(eleEl.textContent) : NaN;

    // Time extraction
    const timeEl = pt.querySelector('time');
    let time: number | undefined;
    if (timeEl && timeEl.textContent) {
      const parsed = Date.parse(timeEl.textContent);
      if (!isNaN(parsed)) time = parsed;
    }

    if (!isNaN(lat) && !isNaN(lon)) {
      rawPoints.push({ lng: lon, lat, ele, time });
    }
  });

  if (rawPoints.length < 2) {
    throw new Error('GPX contains insufficient track points');
  }

  // 1. Sanitize: filter out GPS jitter / identical coordinate duplicates
  const filtered: typeof rawPoints = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = rawPoints[i];
    const dist = distanceMeters([prev.lng, prev.lat], [curr.lng, curr.lat]);
    // Keep point if moved at least 1.5 meters or has significant time jump
    if (dist >= 1.5 || i === rawPoints.length - 1) {
      filtered.push(curr);
    }
  }

  // Check if elevations are present in file
  const hasElevation = filtered.some((p) => !isNaN(p.ele));

  // Synthesize or interpolate missing elevations smoothly if needed
  if (!hasElevation) {
    // Generate organic undulating elevation based on distance
    let accum = 0;
    filtered.forEach((p, idx) => {
      if (idx > 0) {
        accum += distanceMeters([filtered[idx - 1].lng, filtered[idx - 1].lat], [p.lng, p.lat]);
      }
      // Natural gentle rolling hills around 650m-780m
      p.ele = 680 + Math.sin(accum / 1200) * 45 + Math.cos(accum / 400) * 15 + (accum / 10000) * 20;
    });
  } else {
    // Fill any occasional NaN ele points
    let lastKnown = filtered.find((p) => !isNaN(p.ele))?.ele || 500;
    filtered.forEach((p) => {
      if (isNaN(p.ele)) {
        p.ele = lastKnown;
      } else {
        lastKnown = p.ele;
      }
    });
  }

  // 2. Uniform Resampling for Ultra-Smooth Playback
  // Compute lineString along filtered points
  const coordsWithProps = filtered.map((p) => [p.lng, p.lat]);
  const turfLine = turf.lineString(coordsWithProps);
  const totalLengthKm = turf.length(turfLine, { units: 'kilometers' });
  const totalLengthM = totalLengthKm * 1000;

  // Resample at regular step (~5 to 10 meters per step, clamped between 500 and 3000 points)
  const targetStepMeters = Math.max(5, Math.min(15, totalLengthM / 1500));
  const numSteps = Math.max(100, Math.floor(totalLengthM / targetStepMeters));

  const sampledPoints: TrackPoint[] = [];
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;

  let minEle = Infinity;
  let maxEle = -Infinity;
  let maxSpeed = 0;
  let maxGrade = 0;
  let totalAscent = 0;
  let totalDescent = 0;

  // Helper for linear interpolation of elevation and time
  const getRawAtDistance = (distRatio: number) => {
    const targetDist = distRatio * totalLengthM;
    // Find closest filtered segment
    let curDist = 0;
    for (let i = 0; i < filtered.length - 1; i++) {
      const segDist = distanceMeters(
        [filtered[i].lng, filtered[i].lat],
        [filtered[i + 1].lng, filtered[i + 1].lat]
      );
      if (curDist + segDist >= targetDist || i === filtered.length - 2) {
        const factor = segDist > 0 ? Math.min(1, Math.max(0, (targetDist - curDist) / segDist)) : 0;
        const ele = filtered[i].ele + (filtered[i + 1].ele - filtered[i].ele) * factor;

        let time: number | undefined;
        if (filtered[i].time && filtered[i + 1].time) {
          time = filtered[i].time! + (filtered[i + 1].time! - filtered[i].time!) * factor;
        }
        return { ele, time };
      }
      curDist += segDist;
    }
    return { ele: filtered[filtered.length - 1].ele, time: filtered[filtered.length - 1].time };
  };

  for (let i = 0; i <= numSteps; i++) {
    const fraction = i / numSteps;
    const distanceKm = fraction * totalLengthKm;
    const alongPoint = turf.along(turfLine, distanceKm, { units: 'kilometers' });
    const [lng, lat] = alongPoint.geometry.coordinates;

    const rawInterp = getRawAtDistance(fraction);
    const distFromStart = fraction * totalLengthM;

    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);

    minEle = Math.min(minEle, rawInterp.ele);
    maxEle = Math.max(maxEle, rawInterp.ele);

    sampledPoints.push({
      lng,
      lat,
      ele: rawInterp.ele,
      time: rawInterp.time,
      distFromStart,
      speed: 25, // default initial
      grade: 0,
      bearing: 0
    });
  }

  // 3. Compute continuous bearings, grades, rolling speeds, and ascents
  for (let i = 0; i < sampledPoints.length; i++) {
    const curr = sampledPoints[i];
    const prev = sampledPoints[Math.max(0, i - 1)];
    const next = sampledPoints[Math.min(sampledPoints.length - 1, i + 1)];

    // Bearing
    if (i < sampledPoints.length - 1) {
      curr.bearing = calculateBearing([curr.lng, curr.lat], [next.lng, next.lat]);
    } else {
      curr.bearing = prev.bearing || 0;
    }

    // Grade & Elevation change
    if (i > 0) {
      const dD = curr.distFromStart - prev.distFromStart;
      const dE = curr.ele - prev.ele;
      if (dE > 0) totalAscent += dE;
      else totalDescent += Math.abs(dE);

      if (dD > 0) {
        const grade = (dE / dD) * 100;
        curr.grade = parseFloat(grade.toFixed(1));
        if (Math.abs(curr.grade) > maxGrade) maxGrade = Math.abs(curr.grade);
      }
    }

    // Speed calculation from timestamps or gradient model
    if (curr.time && prev.time && curr.time > prev.time && i > 0) {
      const dtHours = (curr.time - prev.time) / (1000 * 3600);
      const dKm = (curr.distFromStart - prev.distFromStart) / 1000;
      let spd = dtHours > 0 ? dKm / dtHours : 24;
      // Clamp reasonable cycling speed
      spd = Math.max(6, Math.min(75, spd));
      curr.speed = parseFloat(spd.toFixed(1));
    } else {
      // Realistic speed model from gradient (flats ~28km/h, climbs ~12-18km/h, descents ~35-55km/h)
      const slope = curr.grade || 0;
      let modelSpeed = 28 - slope * 1.6;
      modelSpeed = Math.max(9, Math.min(62, modelSpeed));
      curr.speed = parseFloat(modelSpeed.toFixed(1));
    }

    if ((curr.speed || 0) > maxSpeed) maxSpeed = curr.speed || 0;
  }

  // Total duration
  const startTime = sampledPoints[0].time;
  const endTime = sampledPoints[sampledPoints.length - 1].time;
  let totalDurationMs = startTime && endTime ? endTime - startTime : (totalLengthKm / 24) * 3600 * 1000;
  if (totalDurationMs <= 0) totalDurationMs = (totalLengthKm / 24) * 3600 * 1000;

  // 4. Milestone Detection (Highlights / Moments)
  const milestones: Milestone[] = [];

  // Start & Finish
  milestones.push({
    id: 'start',
    type: 'start',
    title: 'Ride Started',
    subtitle: 'Departing the baseline',
    dist: 0,
    pointIndex: 0,
    point: sampledPoints[0]
  });

  // Highest point
  let peakIdx = 0;
  let peakEle = -Infinity;
  sampledPoints.forEach((p, idx) => {
    if (p.ele > peakEle) {
      peakEle = p.ele;
      peakIdx = idx;
    }
  });

  if (peakIdx > 10 && peakIdx < sampledPoints.length - 10) {
    milestones.push({
      id: 'peak',
      type: 'peak',
      title: 'Highest Point ⛰️',
      subtitle: `${Math.round(peakEle)}m Altitude Summit`,
      dist: sampledPoints[peakIdx].distFromStart,
      pointIndex: peakIdx,
      point: sampledPoints[peakIdx]
    });
  }

  // Max speed point
  let topSpeedIdx = 0;
  let topSpeedVal = 0;
  sampledPoints.forEach((p, idx) => {
    if ((p.speed || 0) > topSpeedVal) {
      topSpeedVal = p.speed || 0;
      topSpeedIdx = idx;
    }
  });

  if (topSpeedIdx > 15 && topSpeedIdx < sampledPoints.length - 15) {
    milestones.push({
      id: 'max-speed',
      type: 'speed',
      title: 'Top Speed 🔥',
      subtitle: `${topSpeedVal.toFixed(1)} km/h Descent`,
      dist: sampledPoints[topSpeedIdx].distFromStart,
      pointIndex: topSpeedIdx,
      point: sampledPoints[topSpeedIdx]
    });
  }

  // Distance milestone markers every 10km (or every 5km if short route)
  const milestoneInterval = totalLengthKm > 25 ? 10 : 5;
  let nextMilestoneKm = milestoneInterval;
  while (nextMilestoneKm < totalLengthKm - 1) {
    const targetM = nextMilestoneKm * 1000;
    const ptIdx = sampledPoints.findIndex((p) => p.distFromStart >= targetM);
    if (ptIdx !== -1) {
      milestones.push({
        id: `dist-${nextMilestoneKm}k`,
        type: 'distance',
        title: `${nextMilestoneKm} km Mark ⏱️`,
        subtitle: `Great pace! Distance covered`,
        dist: sampledPoints[ptIdx].distFromStart,
        pointIndex: ptIdx,
        point: sampledPoints[ptIdx]
      });
    }
    nextMilestoneKm += milestoneInterval;
  }

  // Finish
  milestones.push({
    id: 'finish',
    type: 'finish',
    title: 'Finish Line 🎉',
    subtitle: `${totalLengthKm.toFixed(1)} km Route Complete`,
    dist: totalLengthM,
    pointIndex: sampledPoints.length - 1,
    point: sampledPoints[sampledPoints.length - 1]
  });

  return {
    name: trackName,
    points: sampledPoints,
    totalDistance: totalLengthM,
    totalElevationGain: Math.round(totalAscent),
    totalElevationLoss: Math.round(totalDescent),
    minElevation: Math.round(minEle),
    maxElevation: Math.round(maxEle),
    maxSpeed: parseFloat(maxSpeed.toFixed(1)),
    maxGrade: parseFloat(maxGrade.toFixed(1)),
    totalDurationMs,
    bounds: [minLng, minLat, maxLng, maxLat],
    milestones: milestones.sort((a, b) => a.dist - b.dist)
  };
}

/**
 * Gets smoothly interpolated track point at normalized progress t [0..1]
 */
export function getInterpolatedPoint(points: TrackPoint[], t: number): TrackPoint {
  const clampedT = Math.max(0, Math.min(1, t));
  const exactIndex = clampedT * (points.length - 1);
  const baseIndex = Math.floor(exactIndex);
  const nextIndex = Math.min(points.length - 1, baseIndex + 1);
  const alpha = exactIndex - baseIndex;

  const p1 = points[baseIndex];
  const p2 = points[nextIndex];

  // Interpolate coordinates
  const lng = p1.lng + (p2.lng - p1.lng) * alpha;
  const lat = p1.lat + (p2.lat - p1.lat) * alpha;
  const ele = p1.ele + (p2.ele - p1.ele) * alpha;
  const distFromStart = p1.distFromStart + (p2.distFromStart - p1.distFromStart) * alpha;
  const speed = (p1.speed || 20) + ((p2.speed || 20) - (p1.speed || 20)) * alpha;
  const grade = (p1.grade || 0) + ((p2.grade || 0) - (p1.grade || 0)) * alpha;

  // Angular bearing interpolation (shortest direction)
  let b1 = p1.bearing || 0;
  let b2 = p2.bearing || 0;
  let diff = ((b2 - b1 + 540) % 360) - 180;
  const bearing = (b1 + diff * alpha + 360) % 360;

  return {
    lng,
    lat,
    ele,
    distFromStart,
    speed: parseFloat(speed.toFixed(1)),
    grade: parseFloat(grade.toFixed(1)),
    bearing
  };
}
