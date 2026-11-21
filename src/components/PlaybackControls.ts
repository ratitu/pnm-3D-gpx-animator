import type { CameraMode } from '../types/track';

export class PlaybackControls {
  private container: HTMLElement;
  private onPlayToggle: (play: boolean) => void;
  private onSpeedChange: (speed: number) => void;
  private onCameraModeChange: (mode: CameraMode) => void;
  private onReset: () => void;

  private isPlaying = false;
  private playBtn!: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[] = [];
  private cameraBtns: HTMLButtonElement[] = [];

  constructor(
    container: HTMLElement,
    callbacks: {
      onPlayToggle: (play: boolean) => void;
      onSpeedChange: (speed: number) => void;
      onCameraModeChange: (mode: CameraMode) => void;
      onReset: () => void;
    }
  ) {
    this.container = container;
    this.onPlayToggle = callbacks.onPlayToggle;
    this.onSpeedChange = callbacks.onSpeedChange;
    this.onCameraModeChange = callbacks.onCameraModeChange;
    this.onReset = callbacks.onReset;

    this.render();
    this.bindKeyboard();
  }

  private render() {
    this.container.innerHTML = `
      <div class="playback-controls-bar">
        <!-- Left: Play/Pause and Reset -->
        <div class="control-group">
          <button id="btn-play-toggle" class="control-btn btn-primary-action" title="Play/Pause (Spacebar)">
            <svg id="icon-play" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <svg id="icon-pause" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          
          <button id="btn-replay" class="control-btn" title="Replay from Start">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>

        <!-- Center: Speed Multipliers (Segmented view-tabs) -->
        <div class="control-group view-tabs">
          <span class="group-label">SPEED</span>
          <button class="pill-btn speed-btn" data-speed="1">1x</button>
          <button class="pill-btn speed-btn" data-speed="2">2x</button>
          <button class="pill-btn speed-btn active" data-speed="5">5x</button>
          <button class="pill-btn speed-btn" data-speed="10">10x</button>
          <button class="pill-btn speed-btn" data-speed="20">20x</button>
        </div>

        <!-- Right: Camera Modes & Fullscreen -->
        <div class="control-group view-tabs">
          <span class="group-label">MODE</span>
          <button class="pill-btn camera-btn active" data-mode="chase" title="Relive 3D Chase Camera">Chase 3D</button>
          <button class="pill-btn camera-btn" data-mode="birds_eye" title="Bird's Eye Overhead">Top-Down</button>
          <button class="pill-btn camera-btn" data-mode="free" title="Free Roam">Free</button>
          
          <button id="btn-fullscreen" class="control-btn" title="Toggle Fullscreen" style="border:none; background:transparent;">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </div>
    `;

    this.playBtn = this.container.querySelector('#btn-play-toggle')!;
    const replayBtn = this.container.querySelector('#btn-replay')!;
    const fullscreenBtn = this.container.querySelector('#btn-fullscreen')!;

    // Play/Pause
    this.playBtn.addEventListener('click', () => {
      this.setPlaying(!this.isPlaying);
      this.onPlayToggle(this.isPlaying);
    });

    // Reset
    replayBtn.addEventListener('click', () => {
      this.onReset();
    });

    // Fullscreen
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Speed toggles
    this.speedBtns = Array.from(this.container.querySelectorAll('.speed-btn'));
    this.speedBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const spd = parseFloat(btn.getAttribute('data-speed') || '5');
        this.speedBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.onSpeedChange(spd);
      });
    });

    // Camera modes
    this.cameraBtns = Array.from(this.container.querySelectorAll('.camera-btn'));
    this.cameraBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as CameraMode;
        this.cameraBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.onCameraModeChange(mode);
      });
    });
  }

  public setPlaying(playing: boolean) {
    this.isPlaying = playing;
    const playIcon = this.playBtn.querySelector('#icon-play') as HTMLElement;
    const pauseIcon = this.playBtn.querySelector('#icon-pause') as HTMLElement;

    if (this.isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      this.playBtn.classList.add('playing');
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      this.playBtn.classList.remove('playing');
    }
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        this.setPlaying(!this.isPlaying);
        this.onPlayToggle(this.isPlaying);
      }
    });
  }
}
