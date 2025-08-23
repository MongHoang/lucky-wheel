// scripts/fetch-vendor.mjs
// Download Admin UI vendor assets into public/vendor (no CDN needed)
//
// Usage:  node scripts/fetch-vendor.mjs
// or add to package.json:  "vendor:fetch": "node scripts/fetch-vendor.mjs"

import https from 'https';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

const FILES = [
    // jQuery
    { dest: 'vendor/jquery/jquery.min.js',
        url:  'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js' },

    // Bootstrap 4 bundle (JS + Popper)
    { dest: 'vendor/bootstrap/bootstrap.bundle.min.js',
        url:  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js' },

    // AdminLTE 3.2
    { dest: 'vendor/admin-lte/css/adminlte.min.css',
        url:  'https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css' },
    { dest: 'vendor/admin-lte/js/adminlte.min.js',
        url:  'https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js' },

    // Font Awesome 5.15.4 (CSS + webfonts)
    { dest: 'vendor/fontawesome/css/all.min.css',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css' },

    // WOFF2 (modern browsers)
    { dest: 'vendor/fontawesome/webfonts/fa-solid-900.woff2',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-solid-900.woff2' },
    { dest: 'vendor/fontawesome/webfonts/fa-regular-400.woff2',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-regular-400.woff2' },
    { dest: 'vendor/fontawesome/webfonts/fa-brands-400.woff2',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-brands-400.woff2' },

    // Optional WOFF fallback (older browsers)
    { dest: 'vendor/fontawesome/webfonts/fa-solid-900.woff',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-solid-900.woff' },
    { dest: 'vendor/fontawesome/webfonts/fa-regular-400.woff',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-regular-400.woff' },
    { dest: 'vendor/fontawesome/webfonts/fa-brands-400.woff',
        url:  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/webfonts/fa-brands-400.woff' },
];

// Simple HTTPS GET with redirect follow (jsDelivr may redirect)
function fetchBuffer(url, redirectsLeft = 5) {
    return new Promise((resolveBuf, reject) => {
        https.get(url, (res) => {
            const { statusCode, headers } = res;

            // Handle redirects
            if (statusCode >= 300 && statusCode < 400 && headers.location) {
                if (redirectsLeft <= 0) return reject(new Error(`Too many redirects for ${url}`));
                const nextUrl = headers.location.startsWith('http')
                    ? headers.location
                    : new URL(headers.location, url).toString();
                res.resume(); // discard
                return resolveBuf(fetchBuffer(nextUrl, redirectsLeft - 1));
            }

            if (statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${statusCode} for ${url}`));
            }

            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolveBuf(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

async function save(url, destRel) {
    const destAbs = resolve('public', destRel);
    await mkdir(dirname(destAbs), { recursive: true });
    const buf = await fetchBuffer(url);
    await writeFile(destAbs, buf);
    console.log('✓', destRel);
}

(async () => {
    console.log('Downloading vendor assets to public/vendor ...\n');
    for (const f of FILES) {
        // eslint-disable-next-line no-await-in-loop
        await save(f.url, f.dest);
    }
    console.log('\n🎉 Done. All vendor files are in public/vendor/');
    console.log('   Make sure your views/layout.ejs references these local files.');
})().catch((err) => {
    console.error('❌ Download failed:', err.message);
    process.exit(1);
});
