# nano-gate: design

## SDK verification (R3.6)

Read from `node_modules/@firebase/ai` 3.0.0 (the version `firebase` 13.2.0 pins), `dist/esm/index.esm.js`:

- `chromeAdapterFactory` returns an adapter only if `globalThis.LanguageModel` exists. Without it
  `chromeAdapter` is undefined and `callCloudOrDevice` sends every mode, including `ONLY_ON_DEVICE`,
  to the cloud. This is why `hasOnDeviceAdapter` is checked before every on-device call.
- With an adapter in `ONLY_ON_DEVICE`, `callCloudOrDevice` runs `chromeAdapter.isAvailable()` and then
  only `chromeAdapter.generateContent()`, which calls `LanguageModel.create()` and `session.prompt()`.
  If the model is unavailable it throws `AIError`; it never calls the in-cloud function.
- `fetch(` appears twice in the package. One is the cloud `makeRequest` (not reached in this mode). The
  other turns an image part into bytes from a `data:` URL, which is local, and text-only prompts never reach it.
- `getGenerativeModel` builds `GenerativeModel`, whose constructor calls `initApiSettings`. That only
  needs `apiKey`, `projectId` and `appId` to be present (it throws otherwise) and makes no request.
  App Check is optional (`getImmediate({optional: true})`), so a placeholder app without App Check is valid.
- Conclusion: `ONLY_ON_DEVICE` with the Chrome adapter makes no network request from the SDK. Chrome itself may
  download the model on `create()` (that is the Prepare step). The test `gate-firebase.test.ts` checks that
  `fetch` is never called with the placeholder app.
- The SDK has no on-device temperature option (`LanguageModelCreateOptions` has none), so "low
  temperature" applies to the cloud (`generationConfig.temperature = 0.1`). Nano runs at Chrome's default.
  The JSON Schema `responseConstraint` is what keeps its output well-formed.

## Modules

| File                                                          | Role                                                                                 | Pure         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| `src/routing.ts`                                              | `planRoute`, `classifyPath` (R8)                                                     | yes          |
| `src/grade.ts`                                                | prompt, schemas, `parseVerdict`, `runGrade`, `gradeAnswer`, grade model cache (R5)   | mostly       |
| `src/gate-summary.ts`                                         | `GO_THRESHOLDS`, `median`, `summarizeBatch`, `toMarkdown`/`toJson` (R7)              | yes          |
| `src/gate-data.ts`                                            | sample card, labelled 12-answer set                                                  | data         |
| `src/gate-env.ts`                                             | Chrome version parsing, `environmentFixes`, `probeAvailability`, `probeBrowser` (R2) | pure + probe |
| `src/gate-firebase.ts`                                        | `initGateFirebase`: configured vs local placeholder (R3)                             | no           |
| `src/gate.ts`, `src/gate-dom.ts`, `src/gate.css`, `gate.html` | page wiring, DOM helpers, styles, markup (R1, R4, R6, R7)                            | no           |
| `src/gate-shell.ts`                                           | `initGateShell(deps)`: environment panel, Prepare Nano, App Check wait (R2, R4)      | injectable   |
| `src/gate-ctx.ts`                                             | `GateCtx` shared by the sections, `createInferenceLock` (R6.9)                       | yes          |
| `src/gate-single.ts`                                          | single grade section (R6)                                                            | no           |
| `src/gate-batch.ts`                                           | batch go/no-go section and report (R7)                                               | no           |
| `src/gate-errors.ts`                                          | gate-specific friendly error text (R6.8)                                             | yes          |

### Routing

```
deviceReady = adapterAttached && deviceAvailability === 'available'
cloudReady  = cloudConfigured && online && appCheckResponsive
```

| choice | deviceReady | cloudReady | mode             | expectedPath |
| ------ | ----------- | ---------- | ---------------- | ------------ |
| auto   | yes         | yes        | PREFER_ON_DEVICE | on_device    |
| auto   | yes         | no         | ONLY_ON_DEVICE   | on_device    |
| auto   | no          | yes        | ONLY_IN_CLOUD    | in_cloud     |
| auto   | no          | no         | null             | none         |
| device | yes         | any        | ONLY_ON_DEVICE   | on_device    |
| device | no          | any        | null             | none         |
| cloud  | any         | yes        | ONLY_IN_CLOUD    | in_cloud     |
| cloud  | any         | no         | null             | none         |

The `reason` string names the blocker in plain English (offline, not configured, App Check not
responding, API missing, not downloaded yet, adapter missing). `classifyPath(expected, source)` maps
`'on_device'|'in_cloud'` to itself and anything else (including undefined) to `unknown`; mismatch is
`actual !== expected` (for expected `none` any run is a mismatch). `unknown` is never turned into a guess.

### Grading

`GradeInput -> buildGradePrompt -> generate(prompt) -> parseVerdict`. The injectable
`GradeGenerateFn` returns `{text, source}` where `source` may be undefined. `runGrade` times the whole
call with an injected clock, retries once on `GradeParseError`, and returns
`{verdict, source, latencyMs, attempts}`. `gradeAnswer(ai, mode, input, {allowCloud})` wires a
cached `GenerativeModel` (per AI and mode) built with `inCloudParams` (responseSchema, temperature 0.1) and
`onDeviceParams` (text-only English `createOptions`, `responseConstraint`). It refuses any mode other than
`ONLY_ON_DEVICE` when `allowCloud` is false (placeholder app), checks the adapter, and rejects an
`ONLY_ON_DEVICE` response whose source is not `on_device`.

`parseVerdict` tries the fenced block, then the raw text, and each `{` in turn (same strategy as
`parseStudyPack`, built on `stripCodeFences` and `extractFirstJsonObject`).

### Go/no-go maths

Item: `{expected, got|null, latencyMs|null, path: on_device|in_cloud|unknown|failed}`.
`ranOnDevice` = items with path `on_device` and a verdict.

- `warmMedianMs` = median of `latencyMs` of `ranOnDevice` items (even count: mean of the middle two); null if none.
- `agreement` = items with `got === expected` / all items.
- `wrongCaught` = clearly wrong items (expected `missed`) with `got` in `partial|missed` / clearly wrong items.
- Verdict: INCONCLUSIVE if no item ran on-device, or any item is `in_cloud` or `unknown`. If thresholds pass but any item failed, INCONCLUSIVE too (GO needs `ranOnDevice === total`). A failed item still counts against agreement and wrong-caught, so failures that sink a threshold stay NO-GO.
- `BatchItem.attempts` comes from `GradeResult.attempts`; `latencyMs` stays the total over attempts and the table and report show both.
  Else GO if `warmMedianMs <= maxWarmMedianMs && agreement >= minAgreement && wrongCaught >= minWrongCaught`, else NO-GO.
- Ratios compare with a 1e-9 tolerance so 7/10 passes a 0.7 threshold.
- `GO_THRESHOLDS = {maxWarmMedianMs: 5000, minAgreement: 0.7, minWrongCaught: 0.9}`; `summarizeBatch(items, thresholds = GO_THRESHOLDS)`.

### Gate Firebase bootstrap

```
readConfig missing -> initializeApp(LOCAL_PLACEHOLDER_OPTIONS, 'lectureloop-gate-local') + getAI
                      => {kind: 'local', ai, missing}   (no App Check, allowCloud=false)
firebaseStatus.ready -> {kind: 'configured', ai, appCheck} (allowCloud=true)
firebaseStatus error -> same as local, with the error shown
```

`src/firebase.ts` is imported for `firebaseStatus` and is unchanged, so App Check stays initialized
before any cloud call. Placeholder values are plainly fake (`local-placeholder-not-a-real-key`).

### Page

Sections: header with route legend, environment panel (device station teal, cloud station violet/grey, fixes list),
Prepare Nano with progress bar, route selector + single grade, batch go/no-go. The route choice only
affects the single grade; the batch always uses `ONLY_ON_DEVICE`. Before cloud routes, `appCheckResponds`
(8 s first probe) feeds `appCheckResponsive`. Verdict hues: correct lime `#A3E635`, partial amber `#FBBF24`,
missed rose `#FB7185`; GO lime, NO-GO rose, INCONCLUSIVE amber. Motion is declared only inside
`@media (prefers-reduced-motion: no-preference)`.

Privacy: the report contains only the built-in labelled set. Copy uses `navigator.clipboard`; nothing is stored.

### Verified by test

`test/gate-firebase.test.ts` loads the SDK's browser build (vitest would otherwise pick the Node build,
which has no on-device adapter), stubs a fake `LanguageModel` and a throwing `fetch`, and grades through the
placeholder app in `ONLY_ON_DEVICE`: the fake session is prompted and `fetch` is never called. With availability
`unavailable` the call rejects and `fetch` is still not called.

## Review fixes

- **Env state.** `EnvSnapshot.configured` now means "cloud usable" (real Firebase app was built). New fields: `initError?: string` (config present, `initializeApp`/App Check threw; the page runs on the placeholder app) and `probed: boolean` (first availability probe finished). `environmentFixes` shows `appcheck-init` with the error text when `initError` is set and skips the `config` fix then. Before the first probe the panel shows "Checking this machine…" and no device fixes. `unknown` availability with `LanguageModel` present gives a `probe-failed` fix, so "Nothing to fix" never shows then.
- **Routing reason.** `RouteInput.appCheckChecking?: boolean` makes `cloudBlocker` say "App Check is still being checked" instead of "not responding".
- **Shell.** The page shell moves from `gate.ts` to `gate-shell.ts` as `initGateShell(deps)` with injectable probe, adapter check, prepare, App Check check and timings, so jsdom tests can drive it. `gate.ts` only wires real dependencies. While availability is `downloading` (and no Prepare is running) the shell re-probes every `pollMs` (3 s). An `online` event re-runs the App Check wait if the state is `stuck`. Prepare status text changes once per 10% bucket.
- **Live regions.** `setChildren` (`gate-dom.ts`) skips the update when the rendered markup is identical; `#fixes` and `#plan` use it.
- **Verdict region.** `#verdict` stays in the DOM; `renderVerdict` sets its class and children. Every outcome, including INCONCLUSIVE, focuses it.
- **Batch stop.** A blocked plan or failed warm-up clears the rows and hides the table; a timeout keeps the already-graded rows (`trimRows(graded)`); every run hides the progress bar in `finally`.
- **Errors.** `src/gate-errors.ts` wraps `toFriendlyError`: parse errors and timeouts get their own text; the main-page "switch to Prefer on-device" advice is replaced by a pointer to the "What to fix" list.
- **Grade button.** Neutral until the plan resolves; teal for an on-device plan, violet for cloud. The fixes list is a plain `<ul>` inside a `role="status"` wrapper.
- **Parser and prompt.** Confidence must be a JSON number. Runs of `"""` are removed from the student answer. The on-device schema has no `minimum`/`maximum`.
- **Timeout.** `withTimeout(promise, ms)` rejects with `GradeTimeoutError`. `gradeAnswer` takes `timeoutMs` (default 60 000); the batch passes 180 000 for the warm-up. The underlying SDK call cannot be aborted, so a late reply is ignored. A timeout in the batch stops it.

## Review fixes 2

- **One inference at a time.** `GateCtx.inference` is an `InferenceLock` (`tryAcquire`, `busy`, `onChange`) created by the shell. Grade and Run take it for the whole call or batch and release it in `finally`; each disables its button on `onChange`. The SDK's `createSession()` destroys the previous session on an adapter, so overlapping calls would abort each other (a failed row counts as disagreement) and inflate the warm median.
- **Colour.** The page background uses a neutral tint; teal and violet appear only for on-device and cloud.
- **App Check retry.** The shell remembers an `online` event that arrives during a wait. When the wait ends `stuck`, it checks again once per such event.
- **Report.** `environmentRecord` writes `Firebase config` as `present`, `present, init failed: <error>` or `not configured`, and adds `App Check`.
- **Failure focus.** `showBlocked` focuses the result, as the success path does; the result is un-hidden first.
- **Answer length.** The textarea has `maxlength=1200` (same value as `MAX_STUDENT_CHARS`, now exported) and a hint line.

## Review fixes 4

- **All items failed (T29).** `summarizeBatch` explains an empty on-device set as "No answer produced a result on-device", because the warm-up may have run fine (R7.18).
- **Late call after a timeout (T30).** `GradeTimeoutError.settled` resolves when the abandoned promise settles (either way). `InferenceLock.holdUntil(release, settled)` keeps the lock until then and `waitingForLate()` tells the UI why it is busy; Grade and Run show `LATE_CALL_NOTE` in their status and `LATE_CALL_DONE` afterwards. Both the batch (warm-up or answer timeout) and the single grade use it. If the call never settles, the note tells the user to reload.
- **Init-failed reason (T31).** `RouteInput.cloudInitFailed?: boolean` (set by the shell from `initError`) makes `cloudBlocker` say "Firebase failed to initialize" (R8.8).
- **Parse wording (T32).** `gateFriendlyError` ends a parse failure with "Run it again.", which fits Grade and the batch warm-up (R6.8).
- **Partial report (T33).** `buildReport(summary, cold, items)` is shared by the normal path and the timeout stop; on a timeout the summary is `summarizeBatch(items)` with verdict INCONCLUSIVE and the stop message as explanation (R7.19).
- **Unreadable version (T34).** `environmentFixes` adds `version-unknown` when `browser.major === null` for desktop Chrome (R2.17).
- **Vite config (T35).** `build.rolldownOptions.input` replaces the deprecated `rollupOptions` alias (Vite 8).
- **Links (T36).** `index.html` links to `gate.html` and `gate.html` links to `./` (R1.8).
- **README (T37).** INCONCLUSIVE lists warm-up failure, timeout, no on-device result, off-device answers and failed calls (R10.1).
- **Spec order (T38).** Requirements R2.16/R2.17, R4.5/R4.6, R7.15 and R1.8 sit under their own sections, in order.

## Review fixes 5

- **Cloud hint (T40).** `environmentFixes` no longer reports "Cloud is not configured". `cloudHint(env)` returns that text (or null when configured or when init failed, which has its own fix). The shell renders it as a separate `li.fix-info` after "Nothing to fix", so the device verdict stays clear without a Firebase project (R2.18).
