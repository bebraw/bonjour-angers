# Bonjour Angers

A private beginner French trainer for a week in Angers. All lesson content, exercises and progress work offline once the offline pack is prepared.

## Before flying: iPhone and iPad

1. Open the deployed URL in Safari while online and sign in if asked.
2. Use Share → Add to Home Screen. Leave “Open as Web App” on if offered.
3. Launch Bonjour Angers from its Home Screen icon while still online. Wait for **Ready for offline practice**.
4. Test it in Airplane Mode: close it, reopen it, complete an exercise, and try audio.

Do this on each device. Safari and the installed app may have separate storage; progress is local to each device. Clearing website data removes the downloaded copy and progress. iOS can reclaim website storage, so check the readiness indicator before departure. The retry action repairs a partially evicted cache when online.

Audio currently uses the browser's French voice. Voice availability and offline playback depend on the device; written pronunciation hints are always local. This app does not assess spoken pronunciation.

## Implementation

- Frontend source assets remain under `dist/`. `node scripts/build-worker.mjs` embeds them into the dependency-free Worker at `dist/server/index.js`; only the Worker, hosting manifest and migrations are packaged.
- `manifest.webmanifest`, PNG icons and Apple metadata support Home Screen installation.
- `sw.js` activates first, then saves the complete offline pack on request. It validates lesson HTML, rejects login/error pages, accepts validated same-origin redirects, and serves saved lessons on offline launches. It only manages caches prefixed `bonjour-angers-offline-`.
- `pwa.js` shows file-count progress, bytes saved, active filenames, and elapsed time. Readiness requires every file to be verified in CacheStorage. Downloads use two concurrent requests, a 15-second per-request limit, and one retry for transient errors. Successful files remain saved; Retry requests only missing files. A previous pack is preserved until the update finishes.
- All styles are local and use system font fallbacks. There are no external lesson or font requests.
- Progress remains in `bonjour-angers-v1` localStorage, compatible with the original prototype. Storage input is validated at startup.

Bump `VERSION` in `dist/sw.js` whenever any cached asset changes before deployment. The new worker activates first, then reports progress while saving the pack; the previous pack is kept until the new pack is complete. Keep source and the deployment archive from the same Git commit.

## Verification

Scenarios includes nine practical situations with 36 adaptive questions and nine four-turn dialogues: directions, café orders, conference introductions, hotel check-in, tram travel, bakery orders, restaurant dietary needs, registration and post-talk networking. Each card offers Dialogue and Practice; Mixed practice selects weak skills across topics. Progress totals reflect all questions, and new scenario IDs are supported by the shared sync model. Cards use consistent page gutters, internal heading spacing and action rows; lessons keep symmetric margins on narrow screens.

Run `node tests/scenarios.cjs` for all-topic completion/sync, accepted typed answers, new dialogues/phrasebook content and mobile/desktop margin checks. `node tests/vocabulary-tips.cjs` checks opt-in tips, assisted scoring, answer-review content and narrow-screen wrapping.

Serve `dist/` over localhost or HTTPS, e.g. `python3 -m http.server 8765 --directory dist`.

With Playwright and Chromium available, run `node tests/offline.cjs` and `node tests/review.cjs`. The browser executable is `/usr/bin/chromium` in the development environment. Tests verify a fresh offline window, a complete offline lesson, persisted progress, search/dialogues, cache recovery, malformed storage, and reviewed quiz/focus behavior. `tests/offline.cjs` uses an iPhone-sized Chromium viewport; it does not replace a real Safari/iOS test.

Code review addressed invalid saved-state crashes, overly strict typed answers and names, difficulty recovery after mistakes, lesson heading focus and dialog labeling, the service-worker fallback, and cache repair.

## Download diagnostics

Expand **Download debug info** or use **Copy debug info** after a failure. The report includes the UI/worker version, worker lifecycle state, browser online/installed mode, storage estimate, per-file HTTP status/content type, attempts, elapsed time and error. No cookies, tokens, full redirect URLs or learner answers are collected. Diagnostics are generated locally and are only shared if the user copies them.

A mobile connection can report online even when an individual request fails; the UI reports that failure rather than assuming Wi-Fi is required. The download heartbeat keeps long transfers distinguishable from a stopped worker. Keep the app open while preparing the pack; background suspension can interrupt iOS downloads.

`tests/download-debug.cjs` exercises an actual failed asset and retry using a local fault-injection HTTP server.

## Vocabulary trainer

The Vocabulary trainer includes 240 original word pairs across everyday essentials, travel, dining, and conferences. Continuous practice asks for typed translations in either direction or a mix. Missing accents and optional articles are accepted; an explicitly wrong French article is checked. Each word has a usage example and pronunciation hint.

Continuous mode is the default; optional 5/10/20-word rounds are available. Default practice selects weak due words first, then new ones, and skips resting words. Strength is stored per direction on a 0–100 scale: a correct initial recall adds 20, a correct retry adds 5, and an error or Show answer subtracts 30. At 80 a word is well known. Initial successes schedule reviews after 1/3/7/14/30 days as strength grows; correct retries and words missed three times take a 10-minute rest. A rolling queue keeps continuous sessions bounded in memory, while missed-word directions and progress stay saved. Five XP are added to the main progress for each correct initial attempt; retry attempts earn no extra XP.

Personal French/English pairs (up to 100) and vocabulary progress use `bonjour-angers-vocabulary-v1` localStorage. Rounds save after each answer and can resume after reopening offline. Reset progress preserves the personal word list. The new data, script and stylesheet are part of the offline pack.

Words has a direct **Review N due words** action above the practice settings. It selects previously practiced, due words across all topics and modes, ignoring learning filters so due words cannot be stranded in another mode. Rounds include up to 20 unique words and choose one due track per word. **Review learned words** also lets you revisit practiced words before their scheduled review. The Progress vocabulary card links to the same actions, and reconnecting sync refreshes the review count/buttons. `node tests/vocabulary-review.cjs` verifies both entry points, due-only selection, early review, filter independence and saved review rounds.

Run `node tests/vocabulary.cjs` and `node tests/continuous.cjs` for vocabulary grading, review/retry, saved-round, custom-text safety and offline coverage. It uses a temporary local HTTP server on port 8792 and an iPhone-size Chromium viewport.

Design reference: an archive listing describes [Sanakysely/AskWord ’97](https://apajalista.net/id?id=51798) as a vocabulary-test program. This trainer uses an original word collection and implementation with a simple typed recall loop.

## Study-first and skill-specific practice

Words is now the default screen. Unknown words are introduced with their spelling, meaning, device audio, usage note and example before grading. Continue records exposure only (no XP or strength), and rotates the first recall after up to two other queued items. All 240 built-in entries have usage notes; personal pairs can include an optional usage note. Existing correct recall progress is preserved and treated as prior exposure.

Three modes share the continuous/due-word engine but keep separate progress: Recall (meaning/form, including both translation directions), Sentence (80 curated gap-fill cards with disambiguating English translations), and Listen & spell (play audio, then type the spelling including articles). Sentence introductions teach the full inflected example first. Listening answers and meanings stay hidden until feedback. Failed audio can be skipped without affecting strength; audio availability still depends on installed device voices. No spoken-pronunciation assessment is claimed.

The UI uses a monochrome brutalist layout with one primary prompt/action. Options, the word list, strength explanation, offline setup and diagnostics are collapsed. Errors still expose the relevant offline controls.

### Research rationale and limits

- [Barcroft (2007)](https://doi.org/10.1111/j.1467-9922.2007.00398.x) supports giving initial form/meaning exposure followed by opportunities for retrieval. This motivates study-first; the exact two-item delay is a product choice.
- [Nakata (2015)](https://doi.org/10.1017/S0272263114000825) supports spacing L2 vocabulary retrieval. The app’s numerical strength and day intervals are transparent heuristics, not validated probabilities of remembering.
- [van den Broek et al. (2018)](https://doi.org/10.1111/lang.12285) distinguish contextual comprehension from retrieval-based retention. Sentence practice supplements plain recall rather than replacing it.
- [Uchihara et al. (2022)](https://doi.org/10.1111/modl.12775) provide evidence for combining written and spoken input and auditory practice. This motivates multimodal introductions and a separate listening skill, without claiming dictation or browser TTS itself was proven superior.

Run `node tests/pedagogy.cjs` for non-scoring study-first exposure, delayed recall, mode-specific strengths, offline sentence/session resume and listening/no-audio behavior. Automated tests use Chromium; real iOS speech and Home Screen behavior require device verification.

## Finnish support and memory anchors

The built-in vocabulary has Finnish meanings, Finnish-aware sound notes and specific memory anchors. Options selects English + Finnish (default), Finnish, or English meanings. The interface remains English. Existing learning records keep their stable direction IDs, and reverse recall accepts the provided Finnish meanings/synonyms as well as English. Language and picture preferences remain device-local.

`data/finnish-everyday.json` and `data/finnish-food-academic.json` are the original content sources. `scripts/build-learning-data.mjs` validates coverage and combines them with the sound/picture mappings into `dist/learning-data.js`. The Worker build runs this generator before embedding the frontend. Memories are supported by clearly labelled word connections, spelling patterns and imagined practical scenes; a mnemonic association is not a claim about a word's historical origin.

Original vector illustrations give concrete words a visual anchor during introduction, after an answer, or when a recall Tip is explicitly requested. Pictures can be turned off. They are not shown automatically before recall or listening answers. The SVG sprite and all teaching content are included in the offline pack, with no external image requests. Personal words continue to work without invented translations or illustrations.

Articles is a separate practice mode: choose the masculine or feminine noun class, using le/un and la/une as reference forms. Introductions show the actual article, including l’, and explain useful ending tendencies, lexical exceptions, variable gender and mass-noun use. Singular forms with ambiguous gender are excluded from binary grading; plural forms are not forced into le/la. Article mistakes affect the article track rather than the separate translation track. No rule infers gender from the meaning of a thing or the sex of a person.

Hear the difference adds 11 curated listening contrasts, including rue/roue, poisson/poison and pain/paix. Each attempt can play either side of the contrast; the chosen target survives reopening, and feedback explains the word actually heard. Play the sound before choosing; unavailable audio can be skipped without a strength penalty. Its strength is separate from dictation, articles and meaning recall. Sound and article introductions, attempts and review timing synchronize through the existing authenticated backend. No database migration or progress reset is required. Device speech remains dependent on installed French voices and is not pronunciation assessment.

The collapsed French patterns guide connects French spelling, article families and verb/preposition chunks to familiar Finnish examples. Finnish y/u/ö provide useful starting points for French sounds, with differences in rounding and vowel quality explained alongside audio. English-style pronunciation spellings remain secondary reference material rather than the default guide.

These choices draw on [Kalmbach's Finnish-specific pronunciation guide](https://research.jyu.fi/phonfr/06.html) and its [rounded-vowel exercises](https://research.jyu.fi/phonfr/ex06.html). [Plass, Chun, Mayer and Leutner (1998)](https://doi.org/10.1037/0022-0663.90.1.25) found benefits for vocabulary memory when verbal and visual annotations were combined. Pictures are offered as an additional meaningful representation and a user preference; this does not assume a fixed learning-style diagnosis, for which [Pashler et al.](https://doi.org/10.1111/j.1539-6053.2009.01038.x) found insufficient supporting evidence. Spacing, retrieval and the practical strength heuristics remain as described above.

Run `node tests/finnish-support.cjs` for meaning-language preferences, article and sound workflows, separate strengths, visual hints, offline pictures/content and phone layout. The sync model/server suites also cover the new tracks and mode-specific introduction keys.

## Focused narrowing review

Words offers a prominent **Focus on 5 weak words** action after there is practiced vocabulary to review. It chooses up to five previously practiced word/skill pairs, prioritizing weak and due items across topics and modes. Resting, well-known items are skipped by default. The cohort stays fixed for the set. **Review mistakes** now uses the same focused loop; a finished round can also be practiced as a focused set. Normal continuous practice and ordinary due review remain available.

Each word needs three answers without hints in the focus set. A wrong answer, Reveal or hinted answer resets that word's in-set count. Words leave the active pool as they qualify; a completed word can return between difficult retries to keep attempts apart. With three or more cohort words, retries have at least two other graded prompts between them. Two-word cohorts alternate. A single-word cohort takes a short 30-second pause between attempts. These are practical controls for this prototype, not experimentally established optimum delays. Eight attempts per word bound the set; unfinished words take a ten-minute rest rather than trapping the learner. Unavailable audio can be skipped without changing strength.

The set counter is separate from longer-term strength. Each word can earn positive strength credit only once per focus set. Further correct rehearsal attempts are recorded but add no strength or XP. Errors still lower strength. Successful focused practice schedules another check within a day, with at least a short rest after recovery from a mistake; it does not retire a word for weeks based on rapid repeats. The client and authenticated server apply the same `focus`/`rehearsal` operation rules. The current cohort, clean-answer counts, pause and answer phase survive reopening offline on the same device. Learning attempts synchronize; active sets stay device-local.

### Evidence and product choices

| Primary research | Relevant finding | Application here |
| --- | --- | --- |
| [Nakata & Webb (2016), Does studying vocabulary in smaller sets increase learning?](https://doi.org/10.1017/S0272263115000236) | Compared 20-item whole learning with smaller subsets in L2 vocabulary. When spacing was matched, set size had little effect; spacing mattered more. | Offer a manageable small cohort while preserving gaps between repetitions. |
| [Karpicke & Roediger (2008), The critical importance of retrieval for learning](https://doi.org/10.1126/science.1152408) | In foreign-language vocabulary learning, continued testing after a first correct answer improved delayed recall; continued study alone did not. | Keep practicing a word after its first success. |
| [Rawson & Dunlosky (2011), Optimizing schedules of retrieval practice](https://doi.org/10.1037/a0023956) | Across 533 students learning conceptual material, initial successful retrieval and later relearning jointly affected durable and efficient learning. The authors recommended three initial correct recalls and three spaced relearning sessions for their conditions. | Multiple unaided answers followed by later review; the app's five-word size, consecutive-three criterion and timing are heuristics rather than a replication or universal optimum. |
| [Nakata (2017), Does repeated practice make perfect?](https://doi.org/10.1017/S0272263116000280) | More within-session retrievals improved L2 vocabulary retention, but the advantage had a time cost; one retrieval was most efficient when time was controlled. | Allow enough repetition while bounding session effort. |
| [Kornell (2009), Optimising learning using flashcards](https://doi.org/10.1002/acp.1537) | Small, separately practiced stacks reduced spacing and underperformed a larger spaced stack on delayed tests, despite learners' preferences. | Avoid immediate repeated echoes and retain later spaced checks. |

This feature honors the user's useful experience with narrowing without treating immediate fluency as proof of long-term retention. Typed translation, sentence and dictation tasks require recall; article and sound-choice tasks measure recognition. Their scores remain separate, and focus completion means the set is finished for now. Later reviews check retention.

Run `node tests/focused-review.cjs` for selection, repeated practice, narrowing, assistance, spacing, bounded effort, offline resume, deletion handling and model-consistent scoring. The focus engine's pure checks cover scheduler and restore edge cases; the sync model/server checks cover rehearsal credit and later-review timing.

## Private cross-device sync

Open the app online using the same ChatGPT account on each device. Expand **Sync** and press **Sync now**. Progress, per-mode strengths, introductions, personal words and completed scenarios synchronize automatically after learning actions and on reconnect/focus. Active rounds, filters and local preferences stay device-local. Offline changes have durable IDs and remain queued until acknowledged. The backend uses the trusted Sites visitor identity, per-account records, an expected-account guard, same-origin JSON writes, an idempotent event ledger and an atomic compare-and-swap transaction for concurrent updates. API responses are `no-store` and are excluded from the service-worker cache.

A legacy snapshot is merged on first connection: counters take maxima and the most recent strength record wins, because old local data has no event history. New practice operations merge exactly once, preserving both devices’ attempts and subsequent strength decreases. Reset advances the account’s learning generation; unsynchronized operations from older generations are acknowledged without restoring cleared progress. Reset keeps personal word pairs. Deletion tombstones prevent older backups or devices from recreating deleted personal IDs. Personal-list limit conflicts are rejected atomically, keep changes queued, and show a readable error with backup available.

A different signed-in account pauses upload until an explicit profile switch. Previous browser profiles are retained separately. If another tab switches accounts, the current app blocks practice and reloads after preserving its last action in the previous profile.

**Export backup** downloads or shares a JSON file containing the confirmed snapshot and pending operations, not authentication tokens. **Import backup** validates its size/schema and asks before merging. Event IDs make re-imports idempotent; destination generations allow an intentional restore after a reset. Backup files contain learning data and personal words.

### Server and schema

`worker/index.js` handles `/api/sync` and serves embedded assets. `.openai/hosting.json` declares the `DB` D1 binding. `drizzle/0000_sync.sql` and its journal define two tables; hosted migrations run before Worker upload. No request executes schema changes. `GET /api/health` returns only database readiness under the Site’s existing private access boundary. Per-account learning endpoints still require an authenticated visitor; a service bypass token alone is not a user identity.

Build: `node scripts/build-worker.mjs`. Package from the project root with `.openai`, `dist/server`, and `drizzle` directories (for example, `tar -czf /tmp/angers-worker.tar.gz .openai dist/server drizzle`). The hosting declaration is `"d1": "DB"`; it is a string, not an object. Generated deployment files are ignored; frontend source files remain tracked.

Sync tests: `tests/sync-model.cjs`, `tests/sync-client.cjs`, `tests/sync-server.cjs`, `tests/sync-browser.cjs`. Unit tests use Node SQLite as a D1 adapter. Browser tests simulate trusted dispatch identity, use separate phone/iPad browser profiles, merge offline attempts after reopening, transfer personal words and strengths, and test backup import/export. Actual Sites identity and database provisioning are checked at deployment; physical iPhone/iPad behavior needs device confirmation.

### Tips

Word practice has a Tip button with a partial spelling cue and letter count. A tip does not grade or penalize the word by itself. A correct hinted answer earns 5 strength points, rests for 10 minutes, and earns no XP; unaided recall still earns 20 strength points. This uses the same conservative assisted-answer event in cloud sync, so the rule stays consistent across devices. Tips open only when requested on the current screen. Reopening or resuming a prompt closes the tip while preserving assisted scoring for that attempt. Later retries start with the tip closed.

Every graded word now shows a word guide below Next: approximate pronunciation, normal/slow device audio, a French usage example with its English translation, and a usage note when provided. Spelling & accents expands to show the exact French form, letter sequence, accent names and relevant article guidance. Introductions also offer the spelling guide. These details remain hidden during recall and listening so they do not give away the answer. Personal words use their saved usage note and spelling without inventing pronunciation or examples.

### Compact phone practice

Practice hides global navigation and offline/sync settings; Back returns to them. Strength and review timing are collapsed below the action. Grading replaces the input/disabled actions with feedback and Next, so those controls do not stack. The regression test checks Next stays in a 390×740 viewport. Home groups offline/install/sync under Settings. Critical sync-storage failures still display an in-practice warning with a backup action.
