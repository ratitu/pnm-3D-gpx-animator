import confetti from 'canvas-confetti';
import type { Milestone, ParsedTrack, TelemetryState } from '../types/track';
import { VIDEO_PRESETS, type VideoResolutionPreset } from '../services/videoExportService';

export class AthleticHUD {
  private container: HTMLElement;
  private milestoneOverlay: HTMLElement;
  private currentMilestoneId: string | null = null;
  private milestoneTimer: number | null = null;

  // Telemetry elements
  private speedEl!: HTMLElement;
  private eleEl!: HTMLElement;
  private gradeEl!: HTMLElement;
  private distEl!: HTMLElement;
  private totalDistEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private statusDotEl!: HTMLElement;
  private statusTextEl!: HTMLElement;

  // Video export UI
  private exportModal!: HTMLElement;
  private exportRenderScreen!: HTMLElement;
  private exportStartBtn!: HTMLButtonElement;
  private exportCancelBtn!: HTMLButtonElement;
  private exportProgressWrap!: HTMLElement;
  private exportProgressBar!: HTMLElement;
  private exportProgressLabel!: HTMLElement;
  private exportProgressPct!: HTMLElement;
  private renderProgressBar!: HTMLElement;
  private renderProgressLabel!: HTMLElement;
  private selectedPreset: VideoResolutionPreset = 'full_hd';

  constructor(container: HTMLElement) {
    this.container = container;

    this.container.innerHTML = `
      <!-- Top Header Bar -->
      <header class="hud-top-bar">
        <div class="hud-brand">
          <div class="brand-orbit">
            <div class="brand-ring"></div>
            <div class="brand-ring-2"></div>
            <div class="brand-core"></div>
          </div>
          <div class="brand-text">
            <h1 id="hud-track-title">Relive 3D</h1>
            <p class="hud-track-meta" id="hud-track-subtitle">Geospatial Journey</p>
          </div>
        </div>

        <!-- Center Status Pill -->
        <div class="status-pill" id="status-pill">
          <div class="status-dot" id="status-dot"></div>
          <span class="status-text" id="status-text">Standby</span>
        </div>

        <div class="hud-top-actions">
          <button id="btn-load-demo" class="hud-btn hud-btn-outline" title="Load Alpine Route">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            <span>Stelvio Pass</span>
          </button>
          <button id="btn-load-zepp" class="hud-btn hud-btn-outline" title="Load Local Track">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            <span>Zepp Track</span>
          </button>
          <label class="hud-btn hud-btn-primary file-upload-label" title="Upload custom GPX">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Import GPX</span>
            <input type="file" id="gpx-file-input" accept=".gpx" style="display:none;" />
          </label>
          <button id="btn-export-video" class="hud-btn hud-btn-primary" title="Export animated journey as video">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/></svg>
            <span>Export Video</span>
          </button>
        </div>
      </header>

      <!-- Glassmorphic Real-Time Telemetry Gauges -->
      <div class="telemetry-grid">
        <div class="telemetry-card glass-panel speed-card">
          <div class="telemetry-label">SPEED</div>
          <div class="telemetry-value-unit">
            <span class="telemetry-value" id="val-speed">0.0</span>
            <span class="telemetry-unit">km/h</span>
          </div>
          <div class="telemetry-bar-wrap">
            <div class="telemetry-bar speed-bar" id="bar-speed" style="width: 0%"></div>
          </div>
        </div>

        <div class="telemetry-card glass-panel elevation-card">
          <div class="telemetry-label">ELEVATION</div>
          <div class="telemetry-value-unit">
            <span class="telemetry-value" id="val-elevation">0</span>
            <span class="telemetry-unit">m</span>
          </div>
          <div class="telemetry-sub" id="val-grade">0.0% Grade</div>
        </div>

        <div class="telemetry-card glass-panel distance-card">
          <div class="telemetry-label">DISTANCE</div>
          <div class="telemetry-value-unit">
            <span class="telemetry-value" id="val-distance">0.0</span>
            <span class="telemetry-unit">/ <span id="val-total-dist">0.0</span> km</span>
          </div>
          <div class="telemetry-sub" id="val-time">00:00:00</div>
        </div>
      </div>

      <!-- Milestone Highlight Card (Moments Popup) -->
      <div class="milestone-moment-card glass-panel" id="milestone-moment" style="display: none;">
        <div class="moment-icon" id="moment-icon">⛰️</div>
        <div class="moment-content">
          <h3 class="moment-title" id="moment-title">Highest Peak Reached</h3>
          <p class="moment-desc" id="moment-subtitle">2,757m Stelvio Alpine Pass</p>
        </div>
      </div>
    `;

    this.renderExportUI();

    this.speedEl = this.container.querySelector('#val-speed')!;
    this.eleEl = this.container.querySelector('#val-elevation')!;
    this.gradeEl = this.container.querySelector('#val-grade')!;
    this.distEl = this.container.querySelector('#val-distance')!;
    this.totalDistEl = this.container.querySelector('#val-total-dist')!;
    this.timeEl = this.container.querySelector('#val-time')!;
    this.titleEl = this.container.querySelector('#hud-track-title')!;
    this.subtitleEl = this.container.querySelector('#hud-track-subtitle')!;
    this.statusDotEl = this.container.querySelector('#status-dot')!;
    this.statusTextEl = this.container.querySelector('#status-text')!;
    this.milestoneOverlay = this.container.querySelector('#milestone-moment')!;
  }

  public setTrackInfo(track: ParsedTrack) {
    this.titleEl.textContent = track.name;
    const distKm = (track.totalDistance / 1000).toFixed(1);
    this.subtitleEl.textContent = `${distKm} km • ${track.totalElevationGain}m Gain • Peak ${track.maxElevation}m`;
    this.totalDistEl.textContent = distKm;
    this.statusTextEl.textContent = 'Track Loaded';
    this.statusDotEl.classList.remove('active');
  }

  public updateTelemetry(state: TelemetryState) {
    this.speedEl.textContent = state.speedKmH.toFixed(1);
    this.eleEl.textContent = Math.round(state.elevationM).toString();

    // Grade styling
    const sign = state.gradePct > 0 ? '+' : '';
    this.gradeEl.textContent = `${sign}${state.gradePct.toFixed(1)}% Grade`;
    if (state.gradePct > 6) {
      this.gradeEl.className = 'telemetry-sub climb-steep';
    } else if (state.gradePct < -4) {
      this.gradeEl.className = 'telemetry-sub descent-fast';
    } else {
      this.gradeEl.className = 'telemetry-sub';
    }

    this.distEl.textContent = state.distanceKm.toFixed(2);
    this.timeEl.textContent = state.elapsedTimeStr;

    // Status pill
    if (state.isPlaying) {
      this.statusDotEl.classList.add('active');
      this.statusTextEl.textContent = `Streaming (${state.playbackSpeed}x)`;
    } else {
      this.statusDotEl.classList.remove('active');
      this.statusTextEl.textContent = state.progress >= 1 ? 'Completed' : 'Paused';
    }

    // Speed bar width
    const speedPct = Math.min(100, Math.max(0, (state.speedKmH / 65) * 100));
    const speedBar = this.container.querySelector('#bar-speed') as HTMLElement;
    if (speedBar) speedBar.style.width = `${speedPct}%`;

    // Check Milestone Moment
    if (state.activeMilestone && state.activeMilestone.id !== this.currentMilestoneId) {
      this.triggerMilestone(state.activeMilestone);
    }
  }

  public triggerMilestone(m: Milestone) {
    this.currentMilestoneId = m.id;

    const iconMap: Record<string, string> = {
      start: '🚩',
      finish: '🏆',
      peak: '⛰️',
      speed: '⚡',
      steep: '🚵‍♂️',
      distance: '⏱️'
    };

    const iconEl = this.milestoneOverlay.querySelector('#moment-icon')!;
    const titleEl = this.milestoneOverlay.querySelector('#moment-title')!;
    const subtitleEl = this.milestoneOverlay.querySelector('#moment-subtitle')!;

    iconEl.textContent = iconMap[m.type] || '✨';
    titleEl.textContent = m.title;
    subtitleEl.textContent = m.subtitle;

    this.milestoneOverlay.style.display = 'flex';
    this.milestoneOverlay.classList.remove('animate-moment-out');
    this.milestoneOverlay.classList.add('animate-moment-in');

    if (m.type === 'finish') {
      confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.6 }
      });
    }

    if (this.milestoneTimer) {
      window.clearTimeout(this.milestoneTimer);
    }

    this.milestoneTimer = window.setTimeout(() => {
      this.milestoneOverlay.classList.remove('animate-moment-in');
      this.milestoneOverlay.classList.add('animate-moment-out');
      setTimeout(() => {
        if (this.milestoneOverlay.classList.contains('animate-moment-out')) {
          this.milestoneOverlay.style.display = 'none';
        }
      }, 400);
    }, 4200);
  }

  private renderExportUI() {
    const options = Object.values(VIDEO_PRESETS)
      .map(
        (preset) => `
          <button class="export-preset-option ${preset.id === 'full_hd' ? 'active' : ''}" data-preset="${preset.id}">
            <span class="export-preset-visual ${preset.id === 'reel' ? 'is-reel' : ''}">
              <svg viewBox="0 0 120 68" preserveAspectRatio="none" aria-hidden="true">
                <path d="M8 58 C32 52 36 18 60 26 S88 54 112 12" fill="none" stroke="#e5a853" stroke-width="3" stroke-linecap="round"/>
                <circle cx="60" cy="26" r="5" fill="#d0542c"/>
              </svg>
            </span>
            <span class="export-preset-info">
              <strong>${preset.label}</strong>
              <span>${preset.width} × ${preset.height} · ${preset.aspectRatio}</span>
              <small>${preset.description}</small>
            </span>
          </button>
        `
      )
      .join('');

    this.exportModal = document.createElement('div');
    this.exportModal.className = 'export-modal-backdrop';
    this.exportModal.id = 'export-modal';
    this.exportModal.style.display = 'none';
    this.exportModal.innerHTML = `
      <div class="export-modal glass-panel" role="dialog" aria-modal="true" aria-label="Export journey video">
        <header class="export-modal-header">
          <div>
            <span class="group-label">Cinematic Render</span>
            <h2>Export Journey Video</h2>
          </div>
          <button id="btn-export-close" class="control-btn" title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="export-resolution-grid">${options}</div>

        <div class="export-meta">
          <span>~22s runtime</span><span>30 fps</span><span>HUD included</span><span>WebM / MP4</span>
        </div>

        <div class="export-progress-wrap" id="export-progress-wrap" style="display: none;">
          <div class="export-progress-head">
            <span id="export-progress-label">Rendering…</span>
            <span id="export-progress-pct">0%</span>
          </div>
          <div class="export-progress-track"><div class="export-progress-fill" id="export-progress-bar" style="width: 0%"></div></div>
        </div>

        <footer class="export-modal-footer">
          <button id="btn-export-cancel" class="hud-btn hud-btn-outline">Cancel</button>
          <button id="btn-export-start" class="hud-btn hud-btn-primary">Render &amp; Download</button>
        </footer>
      </div>
    `;
    document.body.appendChild(this.exportModal);

    this.exportRenderScreen = document.createElement('div');
    this.exportRenderScreen.className = 'export-render-screen';
    this.exportRenderScreen.id = 'export-render-screen';
    this.exportRenderScreen.style.display = 'none';
    this.exportRenderScreen.innerHTML = `
      <div class="export-render-card glass-panel">
        <div class="brand-orbit"><div class="brand-ring"></div><div class="brand-ring-2"></div><div class="brand-core"></div></div>
        <h2>Rendering cinematic journey</h2>
        <p>Recomposing the map at export resolution. Keep this tab in focus.</p>
        <div class="export-progress-track"><div class="export-progress-fill" id="render-progress-bar" style="width: 0%"></div></div>
        <div class="export-render-status" id="render-progress-label">0% · preparing scene</div>
      </div>
    `;
    document.body.appendChild(this.exportRenderScreen);

    this.exportStartBtn = this.exportModal.querySelector('#btn-export-start') as HTMLButtonElement;
    this.exportCancelBtn = this.exportModal.querySelector('#btn-export-cancel') as HTMLButtonElement;
    this.exportProgressWrap = this.exportModal.querySelector('#export-progress-wrap') as HTMLElement;
    this.exportProgressBar = this.exportModal.querySelector('#export-progress-bar') as HTMLElement;
    this.exportProgressLabel = this.exportModal.querySelector('#export-progress-label') as HTMLElement;
    this.exportProgressPct = this.exportModal.querySelector('#export-progress-pct') as HTMLElement;
    this.renderProgressBar = this.exportRenderScreen.querySelector('#render-progress-bar') as HTMLElement;
    this.renderProgressLabel = this.exportRenderScreen.querySelector('#render-progress-label') as HTMLElement;

    this.exportModal.querySelectorAll<HTMLButtonElement>('.export-preset-option').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedPreset = button.dataset.preset as VideoResolutionPreset;
        this.exportModal.querySelectorAll('.export-preset-option').forEach((el) => el.classList.remove('active'));
        button.classList.add('active');
      });
    });
  }

  public showExportModal(): void {
    this.exportModal.style.display = 'flex';
  }

  public hideExportModal(): void {
    if (this.exportStartBtn.disabled) return;
    this.exportModal.style.display = 'none';
  }

  public getSelectedPreset(): VideoResolutionPreset {
    return this.selectedPreset;
  }

  public setExportBusy(busy: boolean): void {
    this.exportStartBtn.disabled = busy;
    this.exportCancelBtn.disabled = busy;
    this.exportModal.style.display = busy ? 'none' : 'flex';
    this.exportRenderScreen.style.display = busy ? 'flex' : 'none';
    this.exportProgressWrap.style.display = busy ? 'flex' : 'none';
    if (!busy) {
      this.exportProgressBar.style.width = '0%';
      this.renderProgressBar.style.width = '0%';
      this.exportProgressLabel.textContent = 'Rendering…';
      this.exportProgressPct.textContent = '0%';
      this.renderProgressLabel.textContent = '0% · preparing scene';
    }
  }

  public setExportProgress(progress: number): void {
    const pct = Math.round(progress * 100);
    this.exportProgressBar.style.width = `${pct}%`;
    this.renderProgressBar.style.width = `${pct}%`;
    this.exportProgressLabel.textContent = `Rendering ${pct}%`;
    this.exportProgressPct.textContent = `${pct}%`;
    this.renderProgressLabel.textContent = `${pct}% · composing frame`;
  }
}
