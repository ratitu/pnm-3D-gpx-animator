export type VideoResolutionPreset = 'full_hd' | 'reel';

export interface VideoResolutionConfig {
  id: VideoResolutionPreset;
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
  description: string;
}

export const VIDEO_PRESETS: Record<VideoResolutionPreset, VideoResolutionConfig> = {
  full_hd: {
    id: 'full_hd',
    label: 'Full HD 1080p',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    description: 'Landscape · YouTube, Desktop, TV'
  },
  reel: {
    id: 'reel',
    label: 'Instagram Reel',
    width: 1024,
    height: 1920,
    aspectRatio: '9:16',
    description: 'Vertical · Reels, Shorts, Stories'
  }
};

/** Everything needed to paint one branded frame of the exported journey. */
export interface VideoFrameState {
  title: string;
  subtitle: string;
  speedKmH: number;
  elevationM: number;
  gradePct: number;
  distanceKm: number;
  totalDistanceKm: number;
  elapsedTimeStr: string;
  progress: number;
  profile: number[];
  marker: { x: number; y: number; bearing: number } | null;
  isReel: boolean;
}

export interface VideoExportResult {
  blob: Blob;
  url: string;
  ext: 'webm' | 'mp4';
}

export interface VideoExportConfig {
  preset: VideoResolutionPreset;
  durationSeconds: number;
  fps: number;
  mapCanvas: HTMLCanvasElement;
  resizeMap: () => void | Promise<void>;
  restoreMap: () => void | Promise<void>;
  onFrame: (progress: number, dt: number) => void;
  getFrameState: () => VideoFrameState;
  onProgress: (progress: number) => void;
}

const IVORY = '#f3ecd8';
const MUTED = '#9a8f7a';
const RUST = '#d0542c';
const OCHRE = '#e5a853';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SERIF = '"Fraunces", Georgia, serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(text.toUpperCase(), x, y);
}

function drawValue(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = IVORY;
  ctx.fillText(text, x, y);
}

function drawStatCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  unit: string,
  valueSize: number
): void {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(32, 26, 21, 0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(243, 236, 216, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = RUST;
  ctx.fillRect(x, y + 18, 3, h - 36);

  drawLabel(ctx, label, x + 20, y + 34, 15);
  drawValue(ctx, value, x + 20, y + h - 30, valueSize);
  ctx.font = `500 16px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(unit, x + 20 + ctx.measureText(value).width + 12, y + h - 30);
}

function drawMarker(ctx: CanvasRenderingContext2D, marker: NonNullable<VideoFrameState['marker']>): void {
  ctx.save();
  ctx.translate(marker.x, marker.y);

  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
  glow.addColorStop(0, 'rgba(208, 84, 44, 0.5)');
  glow.addColorStop(1, 'rgba(208, 84, 44, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate((marker.bearing * Math.PI) / 180);

  ctx.fillStyle = '#1a1612';
  ctx.strokeStyle = RUST;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = OCHRE;
  ctx.beginPath();
  ctx.moveTo(0, -39);
  ctx.lineTo(8, -26);
  ctx.lineTo(-8, -26);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(-9, 9, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(9, 9, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, 9);
  ctx.lineTo(-2, 9);
  ctx.lineTo(3, -3);
  ctx.lineTo(-3, -3);
  ctx.closePath();
  ctx.moveTo(3, -3);
  ctx.lineTo(9, 9);
  ctx.moveTo(-2, 9);
  ctx.lineTo(-4, -7);
  ctx.stroke();

  ctx.restore();
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  state: VideoFrameState,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const samples = state.profile;
  if (samples.length < 2) return;

  const min = Math.min(...samples);
  const max = Math.max(min + 50, Math.max(...samples));
  const toY = (v: number) => y + h - 6 - ((v - min) / (max - min)) * (h - 16);
  const toX = (i: number) => x + (i / (samples.length - 1)) * w;

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  samples.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, 'rgba(208, 84, 44, 0.6)');
  fill.addColorStop(1, 'rgba(26, 22, 18, 0)');
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  samples.forEach((v, i) => (i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))));
  ctx.strokeStyle = OCHRE;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const idx = Math.min(samples.length - 1, Math.floor(state.progress * (samples.length - 1)));
  const nx = x + state.progress * w;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(243, 236, 216, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx, y);
  ctx.lineTo(nx, y + h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = RUST;
  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(nx, toY(samples[idx]), 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Paint the espresso/ivory/rust HUD on top of the captured map frame. */
export function drawVideoOverlay(
  ctx: CanvasRenderingContext2D,
  state: VideoFrameState,
  width: number,
  height: number
): void {
  const reel = state.isReel;
  const pad = reel ? 64 : 72;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const topH = reel ? 420 : 300;
  const top = ctx.createLinearGradient(0, 0, 0, topH);
  top.addColorStop(0, 'rgba(14, 11, 8, 0.85)');
  top.addColorStop(1, 'rgba(14, 11, 8, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, topH);

  const bottomH = reel ? 680 : 360;
  const bottom = ctx.createLinearGradient(0, height - bottomH, 0, height);
  bottom.addColorStop(0, 'rgba(14, 11, 8, 0)');
  bottom.addColorStop(1, 'rgba(14, 11, 8, 0.96)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height - bottomH, width, bottomH);

  // Brand orbital mark
  const cx = pad + 24;
  const cy = reel ? 96 : 72;
  ctx.strokeStyle = RUST;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = OCHRE;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0.3, 4.2);
  ctx.stroke();
  ctx.fillStyle = RUST;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `500 ${reel ? 44 : 36}px ${SERIF}`;
  ctx.fillStyle = IVORY;
  ctx.fillText('Relive 3D', pad + 66, reel ? 112 : 88);
  drawLabel(ctx, state.subtitle, pad + 66, reel ? 146 : 116, reel ? 19 : 16);

  ctx.textAlign = 'right';
  drawLabel(ctx, reel ? '1024 × 1920 · 9:16' : '1920 × 1080 · 16:9', width - pad, reel ? 104 : 78, reel ? 18 : 16);
  ctx.textAlign = 'left';

  if (state.marker) drawMarker(ctx, state.marker);

  const speed = state.speedKmH.toFixed(1);
  const elevation = Math.round(state.elevationM).toString();
  const grade = `${state.gradePct > 0 ? '+' : ''}${state.gradePct.toFixed(1)}`;

  if (reel) {
    const cardW = (width - pad * 2 - 36) / 3;
    const cardY = height - 720;
    drawStatCard(ctx, pad, cardY, cardW, 160, 'Speed', speed, 'km/h', 46);
    drawStatCard(ctx, pad + cardW + 18, cardY, cardW, 160, 'Elevation', elevation, 'm', 46);
    drawStatCard(ctx, pad + (cardW + 18) * 2, cardY, cardW, 160, 'Grade', grade, '%', 42);

    ctx.font = `700 92px ${MONO}`;
    ctx.fillStyle = IVORY;
    ctx.fillText(state.distanceKm.toFixed(2), pad, height - 780);
    ctx.font = `500 28px ${MONO}`;
    ctx.fillStyle = OCHRE;
    ctx.fillText(` / ${state.totalDistanceKm.toFixed(1)} km`, pad + ctx.measureText(state.distanceKm.toFixed(2)).width + 150, height - 780);

    drawLabel(ctx, 'Elapsed', pad, height - 730, 20);
    drawValue(ctx, state.elapsedTimeStr, pad + 130, height - 730, 30);

    drawProfile(ctx, state, pad, height - 500, width - pad * 2, 190);
    drawLabel(ctx, state.title, pad, height - 270, 20);
  } else {
    const cardW = 240;
    const cardX = width - pad - cardW;
    drawStatCard(ctx, cardX, 190, cardW, 108, 'Speed', speed, 'km/h', 42);
    drawStatCard(ctx, cardX, 314, cardW, 108, 'Elevation', elevation, 'm', 42);
    drawStatCard(ctx, cardX, 438, cardW, 108, 'Grade', grade, '%', 38);

    ctx.font = `700 66px ${MONO}`;
    ctx.fillStyle = IVORY;
    ctx.fillText(state.distanceKm.toFixed(2), pad, height - 218);
    ctx.font = `500 24px ${MONO}`;
    ctx.fillStyle = OCHRE;
    ctx.fillText(` / ${state.totalDistanceKm.toFixed(1)} km`, pad + ctx.measureText(state.distanceKm.toFixed(2)).width + 100, height - 218);

    ctx.font = `600 38px ${MONO}`;
    ctx.fillStyle = IVORY;
    ctx.fillText(state.elapsedTimeStr, pad + 400, height - 218);

    drawLabel(ctx, state.title, pad + 760, height - 218, 17);

    drawProfile(ctx, state, pad, height - 185, width - pad * 2, 96);
  }

  // Global progress rail
  const py = reel ? height - 130 : height - 52;
  ctx.fillStyle = 'rgba(243, 236, 216, 0.12)';
  ctx.fillRect(pad, py, width - pad * 2, 4);
  ctx.fillStyle = RUST;
  ctx.fillRect(pad, py, (width - pad * 2) * state.progress, 4);
  ctx.fillStyle = OCHRE;
  ctx.beginPath();
  ctx.arc(pad + (width - pad * 2) * state.progress, py + 2, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `600 ${reel ? 20 : 16}px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(state.progress * 100)}%`, width - pad, py + (reel ? 48 : 38));
  ctx.textAlign = 'left';
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VideoExporter {
  private cancelled = false;

  public static isSupported(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
    );
  }

  /** Prefer WebM VP9/VP8; fall back to MP4 where that is what the browser offers. */
  public static getSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1'
    ];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return 'video/webm';
  }

  public cancel(): void {
    this.cancelled = true;
  }

  public async exportVideo(config: VideoExportConfig): Promise<VideoExportResult | null> {
    if (!VideoExporter.isSupported()) {
      throw new Error('Video recording is not supported in this browser. Try Chrome, Edge or Firefox.');
    }

    this.cancelled = false;
    const { width, height } = VIDEO_PRESETS[config.preset];

    await config.resizeMap();
    await waitFrames(3);

    if (this.cancelled) {
      await config.restoreMap();
      return null;
    }

    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = width;
    renderCanvas.height = height;
    const ctx = renderCanvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create the video render canvas.');

    const stream = renderCanvas.captureStream(config.fps);
    const mimeType = VideoExporter.getSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9_000_000 });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const recordingDone = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('The browser failed to encode the video.'));
    });
    recorder.start(250);

    try {
      await new Promise<void>((resolve) => {
        let startTs = 0;
        let lastTs = 0;

        const step = (ts: number) => {
          if (this.cancelled) {
            resolve();
            return;
          }
          if (!startTs) {
            startTs = ts;
            lastTs = ts;
          }
          const progress = Math.min(1, (ts - startTs) / (config.durationSeconds * 1000));
          const dt = Math.min(0.1, (ts - lastTs) / 1000 || 1 / 60);
          lastTs = ts;

          config.onFrame(progress, dt);

          // MapLibre repaints on its own animation frame — paint the HUD only after that.
          requestAnimationFrame(() => {
            if (this.cancelled) {
              resolve();
              return;
            }
            ctx.drawImage(config.mapCanvas, 0, 0, width, height);
            drawVideoOverlay(ctx, config.getFrameState(), width, height);
            config.onProgress(progress);
            if (progress >= 1) resolve();
            else requestAnimationFrame(step);
          });
        };

        requestAnimationFrame(step);
      });

      if (!this.cancelled) await delay(600); // hold the finish frame
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
      try {
        await recordingDone;
      } finally {
        stream.getTracks().forEach((track) => track.stop());
        await config.restoreMap();
      }
    }

    if (this.cancelled) return null;

    const finalMimeType = recorder.mimeType || 'video/webm';
    if (chunks.length === 0) throw new Error('No video frames were captured. Please try the export again.');
    const blob = new Blob(chunks, { type: finalMimeType });
    return {
      blob,
      url: URL.createObjectURL(blob),
      ext: finalMimeType.includes('mp4') ? 'mp4' : 'webm'
    };
  }

  public static download(result: VideoExportResult, filename: string): void {
    const link = document.createElement('a');
    link.href = result.url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
  }
}
