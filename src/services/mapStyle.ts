import type { Map, StyleSpecification } from 'maplibre-gl';

export const BASEMAPS = [
  { id: 'satellite-v4', label: 'Satellite', extension: 'jpg' },
  { id: 'landscape-v4', label: 'Landscape', extension: 'png' },
  { id: 'backdrop-v4', label: 'Backdrop', extension: 'png' }
] as const;

export type BasemapId = (typeof BASEMAPS)[number]['id'];
export const DEFAULT_BASEMAP: BasemapId = 'satellite-v4';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY ?? '';

const sourceId = (id: BasemapId) => `basemap-source-${id}`;
const layerId = (id: BasemapId) => `basemap-layer-${id}`;

const attribution =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

/** Switch the visible raster layer without touching terrain, hillshade or route layers. */
export function applyBasemap(map: Map, basemap: BasemapId) {
  for (const option of BASEMAPS) {
    if (!map.getLayer(layerId(option.id))) continue;
    map.setLayoutProperty(
      layerId(option.id),
      'visibility',
      option.id === basemap ? 'visible' : 'none'
    );
  }
}

/**
 * Warm espresso + ivory + rust styled terrain with three selectable MapTiler raster basemaps.
 */
export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      ...Object.fromEntries(
        BASEMAPS.map((basemap) => [
          sourceId(basemap.id),
          {
            type: 'raster' as const,
            tiles: [
              `https://api.maptiler.com/maps/${basemap.id}/{z}/{x}/{y}.${basemap.extension}?key=${mapTilerKey}`
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution
          }
        ])
      ),
      // Global AWS Terrarium 3D Terrain DEM source (3D mesh)
      terrainSource: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14,
        attribution: '&copy; Mapzen Terrain'
      },
      // Hillshade samples the DEM differently from the terrain mesh, so it gets
      // its own source. Identical URLs still dedupe through the browser cache.
      hillshadeSource: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14,
        attribution: '&copy; Mapzen Terrain'
      }
    },
    layers: [
      ...BASEMAPS.map((basemap) => ({
        id: layerId(basemap.id),
        type: 'raster' as const,
        source: sourceId(basemap.id),
        layout: {
          visibility: (basemap.id === DEFAULT_BASEMAP ? 'visible' : 'none') as 'visible' | 'none'
        },
        paint: {
          'raster-opacity': 0.95,
          'raster-saturation': basemap.id === 'satellite-v4' ? -0.1 : 0,
          'raster-contrast': basemap.id === 'satellite-v4' ? 0.18 : 0.08
        }
      })),
      {
        id: 'hillshade-layer',
        type: 'hillshade' as const,
        source: 'hillshadeSource',
        paint: {
          'hillshade-exaggeration': 0.65,
          'hillshade-shadow-color': 'rgba(14, 11, 8, 0.75)', // deepest espresso ink shadow
          'hillshade-highlight-color': 'rgba(243, 236, 216, 0.35)', // warm ivory highlight
          'hillshade-accent-color': 'rgba(208, 84, 44, 0.25)' // rust accent lighting
        }
      }
    ]
  };
}
