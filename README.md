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
- `sw.js` installs the complete app shell, rejects error/redirect responses, and serves cached lessons on offline launches. It only manages caches prefixed `bonjour-angers-offline-`.
- `pwa.js` shows readiness only after verifying every cached resource, repairs missing assets when online, and offers a reload when a new version takes control.
- All styles are local and use system font fallbacks. There are no external lesson or font requests.
- Progress remains in `bonjour-angers-v1` localStorage, compatible with the original prototype. Storage input is validated at startup.

Bump `CACHE` in `dist/sw.js` whenever any cached asset changes before deployment. The service worker will install the new pack fully before activation. Keep source and the deployment archive from the same Git commit.

## Verification

Serve `dist/` over localhost or HTTPS, e.g. `python3 -m http.server 8765 --directory dist`.

With Playwright and Chromium available, run `node tests/offline.cjs` and `node tests/review.cjs`. The browser executable is `/usr/bin/chromium` in the development environment. Tests verify a fresh offline window, a complete offline lesson, persisted progress, search/dialogues, cache recovery, malformed storage, and reviewed quiz/focus behavior. `tests/offline.cjs` uses an iPhone-sized Chromium viewport; it does not replace a real Safari/iOS test.

Code review addressed invalid saved-state crashes, overly strict typed answers and names, difficulty recovery after mistakes, lesson heading focus and dialog labeling, the service-worker fallback, and cache repair.
