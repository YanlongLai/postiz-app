'use strict';
// Build-time route checks require no database, credentials or live publisher.
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.resolve('apps/frontend/.next/routes-manifest.json'), 'utf8'));
const rewrites = Array.isArray(manifest.rewrites)
  ? manifest.rewrites : Object.values(manifest.rewrites || {}).flat();
if (!rewrites.some((r) => r.source === '/uploads/:path*' && r.destination === '/api/uploads/:path*')
    || !manifest.redirects?.some((r) => r.source === '/api/uploads/:path*' && r.destination === '/uploads/:path*')) {
  throw new Error('postiz_frontend_local_upload_routes_invalid');
}
process.stdout.write('postiz_frontend_local_upload_routes=verified\n');
