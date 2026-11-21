import type { StyleSpecification } from 'maplibre-gl';

/**
 * Warm espresso + ivory + rust styled terrain basemap
 */
export function createMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      // Sentinel-2 cloudless / ArcGIS World Imagery satellite basemap
      satellite: {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; Esri, Earthstar Geographics'
      },
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
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-opacity': 0.95,
          'raster-saturation': -0.1, // subtle warm desaturation
          'raster-contrast': 0.18,
          'raster-brightness-min': 0.05
        }
      },
      {
        id: 'hillshade-layer',
        type: 'hillshade',
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
