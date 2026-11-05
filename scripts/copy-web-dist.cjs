const fs = require('fs');
const path = require('path');

const webDist = path.resolve(__dirname, '../apps/web/dist');
const apiDistPublic = path.resolve(__dirname, '../apps/api/dist/public');
const apiPublic = path.resolve(__dirname, '../apps/api/public');

try {
  if (fs.existsSync(webDist)) {
    fs.mkdirSync(apiDistPublic, { recursive: true });
    fs.cpSync(webDist, apiDistPublic, { recursive: true });

    fs.mkdirSync(apiPublic, { recursive: true });
    fs.cpSync(webDist, apiPublic, { recursive: true });
    console.log('Successfully bundled React SPA into API public directories.');
  } else {
    console.warn('Warning: apps/web/dist not found. Build apps/web first.');
  }
} catch (err) {
  console.warn('Warning: Failed to copy web dist to API public directories:', err.message);
}

process.exit(0);
