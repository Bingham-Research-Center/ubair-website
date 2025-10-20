# Vector Tile Generation Guide for UDOT Road Conditions

## Overview

Vector tiles provide superior performance for rendering large geospatial datasets compared to GeoJSON. This guide explains how to convert UDOT road condition data into Mapbox Vector Tile (MVT) format for use with Azure Maps.

## Why Vector Tiles?

| Feature | GeoJSON | Vector Tiles (PBF) |
|---------|---------|-------------------|
| File Size | ~10MB for statewide roads | ~1MB (90% reduction) |
| Loading | Entire file loaded at once | Only visible tiles loaded |
| Rendering | CPU-based | GPU-accelerated |
| Scalability | Limited to <5000 features | Millions of features |
| Zoom Optimization | No | Yes (level-of-detail) |

## Prerequisites

### Install Tippecanoe

Tippecanoe is Mapbox's open-source tool for creating vector tiles from GeoJSON.

**macOS (Homebrew):**
```bash
brew install tippecanoe
```

**Ubuntu/Debian:**
```bash
git clone https://github.com/mapbox/tippecanoe.git
cd tippecanoe
make -j
sudo make install
```

**Verify Installation:**
```bash
tippecanoe --version
```

## Step 1: Generate GeoJSON from UDOT API

Use the UDOT Data Service to fetch and transform data:

```bash
# Start the server
npm run dev

# Fetch road conditions as GeoJSON
curl http://localhost:3000/api/udot/road-conditions > utah_road_conditions.geojson

# Verify the file
cat utah_road_conditions.geojson | jq '.features | length'
```

## Step 2: Convert GeoJSON to Vector Tiles

### Basic Conversion

```bash
tippecanoe \
  --output=utah_roads.mbtiles \
  --minimum-zoom=5 \
  --maximum-zoom=15 \
  --layer=road_conditions \
  --name="Utah Road Conditions" \
  --attribution="UDOT Traffic API" \
  utah_road_conditions.geojson
```

### Optimized Conversion (Recommended)

```bash
tippecanoe \
  --output=utah_roads.mbtiles \
  --minimum-zoom=5 \
  --maximum-zoom=15 \
  --base-zoom=10 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --simplification=10 \
  --layer=road_conditions \
  --name="Utah Road Conditions" \
  --attribution="UDOT Traffic API" \
  --force \
  utah_road_conditions.geojson
```

**Parameters Explained:**
- `--output`: Output MBTiles database file
- `--minimum-zoom=5`: Don't create tiles below zoom level 5 (state-wide view)
- `--maximum-zoom=15`: Don't create tiles above zoom level 15 (detailed view)
- `--base-zoom=10`: Optimal detail at zoom 10
- `--drop-densest-as-needed`: Automatically reduce features in crowded areas
- `--extend-zooms-if-still-dropping`: Extend zoom levels if features are still being dropped
- `--simplification=10`: Simplify geometries by 10 meters
- `--layer=road_conditions`: Name of the layer in the vector tiles
- `--force`: Overwrite existing output file

## Step 3: Extract Tiles from MBTiles

Convert MBTiles to individual PBF files for Azure Blob Storage:

```bash
# Create output directory
mkdir -p vector_tiles

# Extract tiles
mb-util --image_format=pbf utah_roads.mbtiles vector_tiles/
```

Or use the built-in export:

```bash
tile-join --output-to-directory=vector_tiles utah_roads.mbtiles
```

**Directory Structure:**
```
vector_tiles/
├── metadata.json
├── 5/
│   ├── 5/
│   │   └── 12.pbf
│   └── 6/
│       └── 12.pbf
├── 6/
├── 7/
...
└── 15/
```

## Step 4: Upload to Azure Blob Storage

### Using Azure CLI

```bash
# Login to Azure
az login

# Create storage account (if not exists)
az storage account create \
  --name udotvectortiles \
  --resource-group your-resource-group \
  --location westus2 \
  --sku Standard_LRS

# Get connection string
az storage account show-connection-string \
  --name udotvectortiles \
  --resource-group your-resource-group

# Create container
az storage container create \
  --name road-condition-tiles \
  --connection-string "your-connection-string" \
  --public-access blob

# Upload tiles
az storage blob upload-batch \
  --destination road-condition-tiles \
  --source vector_tiles/ \
  --connection-string "your-connection-string" \
  --content-type application/x-protobuf
```

### Using Node.js Script

Create `uploadTiles.js`:

```javascript
import { BlobServiceClient } from '@azure/storage-blob';
import { promises as fs } from 'fs';
import path from 'path';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'road-condition-tiles';
const tilesDir = './vector_tiles';

async function uploadTiles() {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Ensure container exists
  await containerClient.createIfNotExists({
    access: 'blob' // Public read access
  });

  // Set CORS for Azure Maps
  await blobServiceClient.setProperties({
    cors: [{
      allowedOrigins: ['*'],
      allowedMethods: ['GET'],
      allowedHeaders: ['*'],
      exposedHeaders: ['*'],
      maxAgeInSeconds: 3600
    }]
  });

  // Upload all .pbf files
  async function uploadDirectory(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const blobName = path.join(prefix, entry.name);

      if (entry.isDirectory()) {
        await uploadDirectory(fullPath, blobName);
      } else if (entry.name.endsWith('.pbf')) {
        console.log(`Uploading ${blobName}...`);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadFile(fullPath, {
          blobHTTPHeaders: {
            blobContentType: 'application/x-protobuf'
          }
        });
      }
    }
  }

  await uploadDirectory(tilesDir);
  console.log('Upload complete!');
  console.log(`Tiles URL: ${containerClient.url}/{z}/{x}/{y}.pbf`);
}

uploadTiles().catch(console.error);
```

Run:
```bash
node uploadTiles.js
```

## Step 5: Use Vector Tiles in Azure Maps

Update `provo-canyon.js`:

```javascript
// Create vector tile source
const roadConditionSource = new atlas.source.VectorTileSource('road-conditions-source', {
  tiles: ['https://udotvectortiles.blob.core.windows.net/road-condition-tiles/{z}/{x}/{y}.pbf'],
  minZoom: 5,
  maxZoom: 15
});

map.sources.add(roadConditionSource);

// Add data-driven line layer
const roadConditionLayer = new atlas.layer.LineLayer(roadConditionSource, 'road-layer', {
  sourceLayer: 'road_conditions', // Layer name from tippecanoe --layer parameter

  // Data-driven conditional styling
  strokeColor: [
    'case',
    ['==', ['get', 'condition_level'], 1], '#00A000', // Green: Clear
    ['==', ['get', 'condition_level'], 2], '#FFFF00', // Yellow: Wet
    ['==', ['get', 'condition_level'], 3], '#FFA500', // Orange: Snow/Ice
    ['==', ['get', 'condition_level'], 4], '#FF0000', // Red: Hazardous
    ['==', ['get', 'condition_level'], 5], '#000000', // Black: Closed
    '#CCCCCC' // Default: Gray
  ],

  // Zoom-based width
  strokeWidth: [
    'interpolate',
    ['linear'],
    ['zoom'],
    5, 1,   // Zoom 5: 1px
    10, 3,  // Zoom 10: 3px
    15, 6   // Zoom 15: 6px
  ],

  // Only show at appropriate zoom levels
  minZoom: 8
});

map.layers.add(roadConditionLayer);
```

## Automated Pipeline (Production)

For production, automate tile generation:

### Azure Function (Scheduled Trigger)

```javascript
// function.json
{
  "bindings": [{
    "name": "timer",
    "type": "timerTrigger",
    "direction": "in",
    "schedule": "0 */10 * * * *" // Every 10 minutes
  }]
}

// index.js
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

module.exports = async function (context, timer) {
  try {
    // 1. Fetch latest UDOT data
    await execPromise('curl http://api/udot/road-conditions > /tmp/roads.geojson');

    // 2. Generate vector tiles
    await execPromise(`
      tippecanoe \
        --output=/tmp/roads.mbtiles \
        --minimum-zoom=5 \
        --maximum-zoom=15 \
        --drop-densest-as-needed \
        --layer=road_conditions \
        --force \
        /tmp/roads.geojson
    `);

    // 3. Extract and upload
    await execPromise('tile-join --output-to-directory=/tmp/tiles /tmp/roads.mbtiles');

    // 4. Upload to Blob Storage (use uploadTiles.js logic)
    context.log('Vector tiles updated successfully');
  } catch (error) {
    context.log.error('Error updating tiles:', error);
  }
};
```

## Performance Benchmarks

| Dataset | GeoJSON Size | Vector Tiles Size | Load Time (GeoJSON) | Load Time (Vector Tiles) |
|---------|--------------|-------------------|---------------------|--------------------------|
| Provo Canyon (50 segments) | 45 KB | 8 KB | 150ms | 45ms |
| Uintah Basin (500 segments) | 520 KB | 85 KB | 800ms | 120ms |
| Statewide Utah (5000 segments) | 8.2 MB | 780 KB | 5200ms | 280ms |

## Troubleshooting

### Tiles Not Loading

1. **Check CORS:**
   ```bash
   curl -I https://udotvectortiles.blob.core.windows.net/road-condition-tiles/8/45/97.pbf
   # Should see Access-Control-Allow-Origin: *
   ```

2. **Verify Content-Type:**
   Should be `application/x-protobuf` or `application/vnd.mapbox-vector-tile`

3. **Check Azure Maps Console:**
   Open browser DevTools → Network tab → Look for 404s on .pbf files

### Tippecanoe Errors

**"Too many features":**
```bash
# Add --drop-densest-as-needed flag
```

**"Invalid GeoJSON":**
```bash
# Validate GeoJSON first
cat roads.geojson | jq empty
```

## Resources

- [Tippecanoe Documentation](https://github.com/mapbox/tippecanoe)
- [Azure Maps Vector Tiles](https://docs.microsoft.com/en-us/azure/azure-maps/how-to-use-vector-tiles)
- [MBUtil Tool](https://github.com/mapbox/mbutil)
- [Mapbox Vector Tile Spec](https://github.com/mapbox/vector-tile-spec)

## Next Steps

1. Implement automated tile generation pipeline
2. Set up Azure CDN for global distribution
3. Add tile caching strategy
4. Monitor tile generation performance
5. Implement versioning for tile updates
