import { Marker } from 'maplibre-gl';
import type { Map } from 'maplibre-gl';
import type { TrackPoint } from '../types/track';

export class CyclistMarker {
  private map: Map;
  private marker: Marker | null = null;
  private el: HTMLElement;
  private iconEl: HTMLElement;
  private shadowEl: HTMLElement;

  constructor(map: Map) {
    this.map = map;

    // Create marker container
    this.el = document.createElement('div');
    this.el.className = 'relive-cyclist-marker';

    // Stylized warm espresso + rust cycling icon and pulsating ground anchor
    this.el.innerHTML = `
      <div class="marker-pulse-ring"></div>
      <div class="marker-shadow"></div>
      <div class="marker-bike-icon">
        <svg viewBox="0 0 48 48" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Outer dynamic glow -->
          <circle cx="24" cy="24" r="20" fill="url(#bikeGlow)" opacity="0.45"/>
          <!-- Inner circle badge -->
          <circle cx="24" cy="24" r="16" fill="#1a1612" stroke="#d0542c" stroke-width="2.5" />
          <!-- Bicycle silhouette in ivory & ochre -->
          <g transform="translate(11, 12) scale(0.55)" stroke="#f3ecd8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <!-- Rear wheel -->
            <circle cx="9" cy="28" r="8" fill="rgba(229, 168, 83, 0.2)" stroke="#e5a853"/>
            <!-- Front wheel -->
            <circle cx="39" cy="28" r="8" fill="rgba(229, 168, 83, 0.2)" stroke="#e5a853"/>
            <!-- Frame geometry -->
            <polyline points="9 28, 22 28, 30 14, 17 14, 9 28" stroke="#f3ecd8"/>
            <polyline points="22 28, 18 10" stroke="#d0542c"/>
            <polyline points="30 14, 39 28" stroke="#f3ecd8"/>
            <!-- Handlebars & Seat -->
            <line x1="36" y1="10" x2="40" y2="10" stroke="#e5a853" stroke-width="3"/>
            <line x1="39" y1="28" x2="37" y2="10" stroke="#f3ecd8"/>
            <line x1="15" y1="10" x2="20" y2="10" stroke="#d0542c" stroke-width="3"/>
            <!-- Rider head / helmet -->
            <circle cx="26" cy="6" r="3.2" fill="#d0542c" stroke="none"/>
            <line x1="26" y1="9" x2="21" y2="18" stroke="#f3ecd8" stroke-width="2.4"/>
            <line x1="21" y1="18" x2="25" y2="24" stroke="#f3ecd8" stroke-width="2.4"/>
          </g>
          <!-- Forward directional arrow notch -->
          <polygon points="24,3 27,8 21,8" fill="#d0542c" />
          <defs>
            <radialGradient id="bikeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#d0542c" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="#d0542c" stop-opacity="0"/>
            </radialGradient>
          </defs>
        </svg>
      </div>
    `;

    this.iconEl = this.el.querySelector('.marker-bike-icon') as HTMLElement;
    this.shadowEl = this.el.querySelector('.marker-shadow') as HTMLElement;
  }

  public init(point: TrackPoint) {
    if (this.marker) {
      this.marker.remove();
    }

    this.marker = new Marker({
      element: this.el,
      anchor: 'center'
    })
      .setLngLat([point.lng, point.lat])
      .addTo(this.map);

    this.update(point);
  }

  public update(point: TrackPoint) {
    if (!this.marker) return;

    this.marker.setLngLat([point.lng, point.lat]);

    // Align rotation with rider's traveling bearing relative to map
    const bearing = point.bearing || 0;
    const grade = point.grade || 0;

    // Subtle pitch tilt based on slope (+climb leans forward, -descent leans back)
    const tilt = Math.max(-15, Math.min(15, grade * 1.2));

    if (this.iconEl) {
      this.iconEl.style.transform = `rotate(${bearing}deg) rotateX(${tilt}deg)`;
    }

    // Shadow squashes slightly on high speed
    if (this.shadowEl) {
      const speed = point.speed || 25;
      const stretch = 1 + Math.min(0.4, (speed - 20) * 0.015);
      this.shadowEl.style.transform = `scale(${stretch}, ${1 / stretch})`;
    }
  }

  public remove() {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }
}
