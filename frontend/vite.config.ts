import { defineConfig } from 'vite';

// GitHub Pages serves this repository at /Dispute-Autopilot/, so every asset
// URL has to carry that prefix. It applies in dev too, which means the dev
// server's page lives at http://localhost:5173/Dispute-Autopilot/ and a bare
// http://localhost:5173/ redirects there. Read the prefix through
// import.meta.env.BASE_URL rather than hardcoding it anywhere.
export default defineConfig({
  base: '/Dispute-Autopilot/',

  // scripts/export_site_data.py writes frontend/data/. Pointing publicDir at
  // that directory serves those files from the site root in dev and copies
  // them into dist on build, so the deployed site needs no Python at all.
  publicDir: 'data',

  build: {
    target: 'es2022',
    // points.bin is 1.6 MB of Float32. Warning at 500 kB would fire on every
    // build and train everyone to ignore the warning that matters.
    chunkSizeWarningLimit: 900,
  },

  server: {
    port: 5173,
    strictPort: true,
  },
});
