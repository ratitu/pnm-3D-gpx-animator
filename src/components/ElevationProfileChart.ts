import type { ParsedTrack } from '../types/track';

export class ElevationProfileChart {
  private container: HTMLElement;
  private track: ParsedTrack | null = null;
  private onSeek: (progress: number) => void;
  private isDragging = false;

  private progressLine: SVGLineElement | null = null;
  private progressCircle: SVGCircleElement | null = null;
  private tooltip: HTMLElement;

  constructor(container: HTMLElement, onSeek: (progress: number) => void) {
    this.container = container;
    this.onSeek = onSeek;

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'elevation-scrub-tooltip';
    this.tooltip.style.display = 'none';
    this.container.appendChild(this.tooltip);

    this.bindEvents();
  }

  public setTrack(track: ParsedTrack) {
    this.track = track;
    this.render();
  }

  private render() {
    if (!this.track || this.track.points.length < 2) return;

    // Clear existing SVG
    const oldSvg = this.container.querySelector('svg');
    if (oldSvg) oldSvg.remove();

    const width = 1000;
    const height = 120;
    const padding = { top: 18, bottom: 20, left: 10, right: 10 };

    const minEle = this.track.minElevation;
    const maxEle = Math.max(minEle + 50, this.track.maxElevation);
    const totalDist = this.track.totalDistance;

    const points = this.track.points;

    // Build SVG path data
    const getX = (dist: number) => padding.left + (dist / totalDist) * (width - padding.left - padding.right);
    const getY = (ele: number) => {
      const norm = (ele - minEle) / (maxEle - minEle);
      return height - padding.bottom - norm * (height - padding.top - padding.bottom);
    };

    let pathD = `M ${getX(points[0].distFromStart)} ${getY(points[0].ele)}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${getX(points[i].distFromStart)} ${getY(points[i].ele)}`;
    }

    const areaD = `${pathD} L ${getX(points[points.length - 1].distFromStart)} ${height - padding.bottom} L ${getX(points[0].distFromStart)} ${height - padding.bottom} Z`;

    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('class', 'elevation-chart-svg');

    svgEl.innerHTML = `
      <defs>
        <!-- Warm espresso + rust elevation gradient -->
        <linearGradient id="elevationGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#d0542c" stop-opacity="0.55"/>
          <stop offset="50%" stop-color="#e5a853" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#1a1612" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e5a853"/>
          <stop offset="50%" stop-color="#d0542c"/>
          <stop offset="100%" stop-color="#e37148"/>
        </linearGradient>
      </defs>
      
      <!-- Baseline grid -->
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      
      <!-- Filled elevation profile -->
      <path d="${areaD}" fill="url(#elevationGrad)"/>
      <!-- Glowing profile line -->
      <path d="${pathD}" fill="none" stroke="url(#strokeGrad)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      
      <!-- Progress indicator needle -->
      <line id="scrub-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#e5a853" stroke-width="2.5" stroke-dasharray="3 3"/>
      <circle id="scrub-circle" cx="${padding.left}" cy="${getY(points[0].ele)}" r="5.5" fill="#d0542c" stroke="#f3ecd8" stroke-width="2"/>
    `;

    this.container.appendChild(svgEl);
    this.progressLine = svgEl.querySelector('#scrub-line');
    this.progressCircle = svgEl.querySelector('#scrub-circle');
  }

  public updateProgress(progress: number) {
    if (!this.track || !this.progressLine || !this.progressCircle) return;

    const width = 1000;
    const height = 120;
    const padding = { top: 18, bottom: 20, left: 10, right: 10 };
    const clamped = Math.max(0, Math.min(1, progress));

    const curX = padding.left + clamped * (width - padding.left - padding.right);

    // Approximate current elevation
    const ptIdx = Math.min(this.track.points.length - 1, Math.floor(clamped * (this.track.points.length - 1)));
    const curEle = this.track.points[ptIdx]?.ele || this.track.minElevation;
    const minEle = this.track.minElevation;
    const maxEle = Math.max(minEle + 50, this.track.maxElevation);
    const norm = (curEle - minEle) / (maxEle - minEle);
    const curY = height - padding.bottom - norm * (height - padding.top - padding.bottom);

    this.progressLine.setAttribute('x1', `${curX}`);
    this.progressLine.setAttribute('x2', `${curX}`);
    this.progressCircle.setAttribute('cx', `${curX}`);
    this.progressCircle.setAttribute('cy', `${curY}`);
  }

  private bindEvents() {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!this.track) return;
      const rect = this.container.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      // Tooltip updates
      const ptIdx = Math.min(this.track.points.length - 1, Math.floor(ratio * (this.track.points.length - 1)));
      const pt = this.track.points[ptIdx];
      if (pt) {
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${clientX - rect.left}px`;
        this.tooltip.innerHTML = `
          <strong>${(pt.distFromStart / 1000).toFixed(1)} km</strong> &bull; ${Math.round(pt.ele)}m ele &bull; ${pt.grade || 0}%
        `;
      }

      if (this.isDragging) {
        this.onSeek(ratio);
        this.updateProgress(ratio);
      }
    };

    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      handleMove(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        handleMove(e);
      }
    });

    this.container.addEventListener('mousemove', (e) => {
      if (!this.isDragging) {
        handleMove(e);
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (!this.isDragging) {
        this.tooltip.style.display = 'none';
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.tooltip.style.display = 'none';
      }
    });

    // Touch support
    this.container.addEventListener(
      'touchstart',
      (e) => {
        this.isDragging = true;
        handleMove(e);
      },
      { passive: true }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this.isDragging) handleMove(e);
      },
      { passive: true }
    );

    window.addEventListener('touchend', () => {
      this.isDragging = false;
      this.tooltip.style.display = 'none';
    });
  }
}
