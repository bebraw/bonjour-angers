# Bonjour Angers

A buildless, private beginner French trainer for a week in Angers. All lesson content, exercises and progress work offline once the offline pack is prepared.

## Before flying: iPhone and iPad

1. Open the deployed URL in Safari while online and sign in if asked.
2. Use Share → Add to Home Screen. Leave “Open as Web App” on if offered.
3. Launch Bonjour Angers from its Home Screen icon while still online. Wait for **Ready for offline practice**.
4. Test it in Airplane Mode: close it, reopen it, complete an exercise, and try audio.

Do this on each device. Safari and the installed app may have separate storage; progress is local to each device. Clearing website data removes the downloaded copy and progress. iOS can reclaim website storage, so check the readiness indicator before departure. The retry action repairs a partially evicted cache when online.

Audio currently uses the browser's French voice. Voice availability and offline playback depend on the device; written pronunciation hints are always local. This app does not assess spoken pronunciation.

## Implementation

- `dist/` is deployed directly; no build or runtime server is required.
- `manifest.webmanifest`, PNG icons and Apple metadata support Home Screen installation.
- `sw.js` activates first, then saves the complete offline pack on request. It validates lesson HTML, rejects login/error pages, accepts validated same-origin redirects, and serves saved lessons on offline launches. It only manages caches prefixed `bonjour-angers-offline-`.
- `pwa.js` shows file-count progress, bytes saved, active filenames, and elapsed time. Readiness requires every file to be verified in CacheStorage. Downloads use two concurrent requests, a 15-second per-request limit, and one retry for transient errors. Successful files remain saved; Retry requests only missing files. A previous pack is preserved until the update finishes.
- All styles are local and use system font fallbacks. There are no external lesson or font requests.
- Progress remains in `bonjour-angers-v1` localStorage, compatible with the original prototype. Storage input is validated at startup.

Bump `VERSION` in `dist/sw.js` whenever any cached asset changes before deployment. The service worker will install the new pack fully before activation. Keep source and the deployment archive from the same Git commit.

## Verification

Serve `dist/` over localhost or HTTPS, e.g. `python3 -m http.server 8765 --directory dist`.

With Playwright and Chromium available, run `node tests/offline.cjs` and `node tests/review.cjs`. The browser executable is `/usr/bin/chromium` in the development environment. Tests verify a fresh offline window, a complete offline lesson, persisted progress, search/dialogues, cache recovery, malformed storage, and reviewed quiz/focus behavior. `tests/offline.cjs` uses an iPhone-sized Chromium viewport; it does not replace a real Safari/iOS test.

Code review addressed invalid saved-state crashes, overly strict typed answers and names, difficulty recovery after mistakes, lesson heading focus and dialog labeling, the service-worker fallback, and cache repair.

## Download diagnostics

Expand **Download debug info** or use **Copy debug info** after a failure. The report includes the UI/worker version, worker lifecycle state, browser online/installed mode, storage estimate, per-file HTTP status/content type, attempts, elapsed time and error. No cookies, tokens, full redirect URLs or learner answers are collected. Diagnostics are generated locally and are only shared if the user copies them.

A mobile connection can report online even when an individual request fails; the UI reports that failure rather than assuming Wi-Fi is required. The download heartbeat keeps long transfers distinguishable from a stopped worker. Keep the app open while preparing the pack; background suspension can interrupt iOS downloads.

`tests/download-debug.cjs` exercises an actual failed asset and retry using a local fault-injection HTTP server.
