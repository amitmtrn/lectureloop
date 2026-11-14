# nano-gate: requirements

Goal: the developer opens `/gate.html` in desktop Chrome and within a couple of minutes knows
whether Gemini Nano runs well enough on that machine to build "Second Opinion" on it
(GO / NO-GO), and always sees which path ran (on-device teal, cloud violet).

Terms: "device" = Gemini Nano through Chrome's Prompt API, reached only via Firebase AI Logic.
"cloud" = Gemini through Firebase AI Logic. "Path" = `on_device` or `in_cloud`, taken from the
response's `inferenceSource`.

## R1 Separate gate page

- R1.1 The build shall emit `gate.html` as a second Vite rollup input in addition to `index.html`.
- R1.2 The main page footer shall link to `gate.html`.
- R1.3 The gate page shall use a dark theme with teal `#2DD4BF` for on-device and violet `#A78BFA` for cloud, and use them for nothing else (no decorative use, including backgrounds and gradients). A button shall be teal or violet only when the route it starts is on-device or cloud respectively; a button whose route is not yet decided shall be neutral.
- R1.4 The gate page shall present results in large type that is readable at 1920x1080.
- R1.5 While the user prefers reduced motion, the page shall not animate (progress, stamps, transitions).
- R1.6 When a result, status or progress value changes, the page shall announce it through an `aria-live` region that stays in the DOM and is updated in place (never replaced by a new node), and every control shall have an accessible label.
- R1.7 The page shall never encode meaning by colour alone (every colour is paired with text).
- R1.8 The links between the study-pack page and the gate page shall be relative, so the site works under a non-root `base`.

## R2 Environment panel

- R2.1 The page shall show: Chrome version, whether the `LanguageModel` global exists, the result of `LanguageModel.availability()` for text-only English input and output (`unavailable`, `downloadable`, `downloading`, `available`, or `API missing`), whether the Firebase SDK attached its on-device adapter, online/offline, whether Firebase config is present, and the App Check status.
- R2.2 The page shall call `LanguageModel.availability()` only with the same text-only English options the SDK model uses, and shall use it for diagnostics only.
- R2.3 If the browser is not Chrome 139 or newer on desktop, then the panel shall say so and tell the user to use desktop Chrome 139+.
- R2.4 If `LanguageModel` is missing, then the panel shall tell the user to enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and relaunch Chrome.
- R2.5 If availability is `unavailable`, then the panel shall list the requirements (about 22 GB free disk, 16 GB RAM and 4 CPU cores or more than 4 GB VRAM) and point to `chrome://on-device-internals`.
- R2.6 If availability is `downloadable`, then the panel shall tell the user to press "Prepare Nano"; if `downloading`, to wait for the download. While availability is `downloading`, the page shall re-probe it periodically, so the panel, the plan and the batch unblock without a reload.
- R2.7 If `LanguageModel` exists but the SDK did not attach its adapter, then the panel shall report that and suggest reloading the page.
- R2.8 If the browser is offline, then the panel shall state that the cloud path is unavailable and the device path is unaffected.
- R2.9 If Firebase config is missing, then the panel shall list the missing env vars and point to `docs/SETUP-FIREBASE.md`.
- R2.10 If App Check does not answer in time, then the panel shall say that reCAPTCHA did not load and that cloud calls are disabled.
- R2.11 When everything needed is fine, the panel shall say that no fixes are needed. It shall not say so while availability is `unknown` (the probe failed), and before the first probe has finished it shall say that it is checking instead of listing device fixes.
- R2.12 If Firebase config is present but initialization throws, then the panel shall show the "Firebase failed to initialize" fix with the error text, shall not show the "not configured" fix, and the cloud shall be unusable (the page runs on the placeholder app). The environment state shall distinguish "config present" from "cloud usable".
- R2.13 While App Check is still being checked, the routing reason shall say it is still checking, not that reCAPTCHA failed to load.
- R2.14 If the browser fires `online` while App Check is `stuck`, or fires `online` during an App Check wait that then ends `stuck`, then the page shall check App Check again.
- R2.15 If availability is `unknown` with `LanguageModel` present, then the panel shall say that the probe failed and suggest reloading.
- R2.16 The page shall not rebuild the "What to fix" and routing-plan live regions when their rendered content is unchanged, so screen readers do not re-announce them on each poll.
- R2.17 If the browser is Chrome on desktop but its major version could not be read, then the panel shall list a fix saying so and asking for desktop Chrome 139 or newer, so a red Browser row never appears next to "Nothing to fix".
- R2.18 When the device checks pass and Firebase is simply not configured (no init error), the panel shall say "Nothing to fix" and show the "Cloud is not configured" hint as a separate informational line, not as a fix.

## R3 On-device test without a Firebase project

- R3.1 If `readConfig` reports missing config, then the gate page shall initialize a separate Firebase app with clearly fake local placeholder options and obtain an AI instance, solely so the SDK can run `ONLY_ON_DEVICE`.
- R3.2 While running with placeholder options, the page shall not initialize App Check and shall not make any cloud call; any request for a mode other than `ONLY_ON_DEVICE` shall be rejected before reaching the SDK.
- R3.3 While running with placeholder options, the cloud station shall be greyed out, labelled "not configured" and show the setup hint.
- R3.4 If config is present, then the page shall use `firebaseStatus` from `src/firebase.ts` (including App Check) and cloud fallback shall be available.
- R3.5 The placeholder options shall contain no value that looks like a real key, and no real key, `.env` file or debug token shall be committed.
- R3.6 The design document shall record, from the SDK source, whether `ONLY_ON_DEVICE` with the Chrome adapter makes a network request.

## R4 Prepare Nano

- R4.1 When the user presses "Prepare Nano", the page shall call `initializeDeviceModel` (through `prepareGradeDevice`, so the download is tracked on the grade model's adapter) inside that click.
- R4.2 While the model downloads, the page shall show a progress bar with the percentage, and expose it as `role="progressbar"` with `aria-valuenow`.
- R4.3 When preparation finishes, the page shall re-probe availability and update the environment panel.
- R4.4 If preparation fails, then the page shall show the error and the relevant fix.
- R4.5 While the model downloads, the polite status text shall change at most once per 10% step, so screen readers are not flooded; the progress bar itself still updates on every event.
- R4.6 The "Prepare Nano" success text shall say "Gemini Nano is downloaded." and the help text shall not claim the model is loaded, because an already-available model creates no session.
- R4.7 If "Prepare Nano" shows no progress for 120 s, then the page shall stop waiting, say that preparing is taking too long and suggest trying again or reloading, and re-enable the button and the download poll. A result from the abandoned call shall be ignored.

## R5 Grading core

- R5.1 The `grade` module shall build a short prompt from `{question, referenceAnswer, keyPoints[], studentAnswer}` that treats the student answer as data, not instructions. The answer is delimited by `"""`; the module shall remove any run of three or more double quotes from the answer so it cannot close the delimiter.
- R5.2 The module shall request a verdict `{verdict: "correct"|"partial"|"missed", missedPoints: string[], confidence: number 0..1, reason: string}`.
- R5.3 For cloud calls the module shall pass `responseMimeType: application/json`, a `responseSchema` and a low temperature; for on-device calls it shall pass a JSON Schema as `responseConstraint` with text-only English `createOptions`. The on-device JSON Schema shall not use `minimum`/`maximum` (Chrome's constraint engine may reject them); the parser clamps instead.
- R5.4 When a response is fenced, chatty or has extra whitespace, the parser shall still return the verdict.
- R5.5 If `verdict` is missing or not one of the three values, or `confidence` is missing or not a JSON number (a numeric string such as `"0.8"` is not a number), then the parser shall throw a parse error.
- R5.6 If `confidence` is outside 0..1, then the parser shall clamp it. If `reason` or `missedPoints` is missing, the parser shall use `""` or `[]`.
- R5.7 If the first response is malformed, then the runner shall retry once; if the second is malformed it shall fail with the parse error.
- R5.8 The runner shall return the verdict, the `inferenceSource` exactly as reported (never defaulted), the total latency in ms and the number of attempts.
- R5.9 Before an `ONLY_ON_DEVICE` call, the runner shall check `hasOnDeviceAdapter`; if the response of an `ONLY_ON_DEVICE` call did not come from the device it shall fail.
- R5.10 If a single model call has not settled after a timeout (default 60 s; 180 s for the batch warm-up call), then the runner shall reject with a timeout error that names the limit. The call itself cannot be cancelled, but the page shall recover.
- R5.11 If a call timed out, then the timeout error shall expose a promise that settles when the abandoned SDK call finally settles, and the page shall keep the shared inference lock until then, because a late `createSession` on the same model's adapter would destroy the session of the next call. While the lock is held for that reason, Grade and Run shall stay disabled and the status text shall say "Still waiting for the previous model call to finish", and shall say that the call finished once it did.
- R5.12 If a call times out, then the error text shall name the check that fits the mode: `chrome://on-device-internals` for `ONLY_ON_DEVICE`, the internet connection for `ONLY_IN_CLOUD`, and both for the prefer modes.

## R6 Single grade

- R6.1 The page shall show a sample card (question, reference answer, key points) and an editable typed answer.
- R6.2 When the user presses "Grade", the page shall run the routing plan for the chosen route (Auto, Device, Cloud) and grade the answer.
- R6.3 The page shall show a verdict stamp (text plus colour), missed points, confidence, reason and latency in ms.
- R6.4 The page shall show a path badge: ON-DEVICE (teal), CLOUD (violet) or FAILED, taken from the response's `inferenceSource`.
- R6.5 If the actual path differs from the expected path, then the page shall show a visible mismatch warning.
- R6.6 If the plan is blocked, then the page shall show the blocked reason and shall not call the SDK.
- R6.7 If the student answer is empty, then the page shall ask for an answer and shall not call the SDK.
- R6.8 If grading fails (including a timeout), then the page shall show a readable error that fits the gate page (no advice about switching modes on the main page) and re-enable the Grade button. A malformed model reply shall be reported as such, not as "Something went wrong".
- R6.9 While a batch go/no-go run or another grade is in flight, the Grade button shall be disabled and no second call shall start. Grade and Run share one inference lock, because overlapping calls skew the timing and a late call can still be running inside the SDK (each model has its own adapter, so the lock is about timing, not shared sessions).
- R6.10 If a grade is blocked or fails, then focus shall move to the result, as on success.
- R6.11 The answer field shall carry `maxlength` equal to the grading limit (1200 characters) and a visible hint, so no text is cut silently.

## R7 Batch go/no-go

- R7.1 The page shall include a built-in labelled set of 12 short answers (correct, partial, clearly wrong) over 4 cards.
- R7.2 When the user presses "Run go/no-go", the page shall run one warm-up call first and report its latency separately as cold latency, then grade the set on-device one answer at a time with a progress indicator.
- R7.3 The page shall show a table with expected verdict, got verdict, latency, attempts and path for every answer. The copied JSON and Markdown report shall include attempts. Latency stays the total across attempts (R5.8).
- R7.4 The summary shall show warm median latency, agreement (got equals expected), and the share of clearly wrong answers caught (graded `partial` or `missed`, not `correct`).
- R7.5 The verdict shall be GO if warm median latency is at most 5000 ms, agreement is at least 70% and clearly wrong caught is at least 90%, with every answer run on-device.
- R7.6 If no answer completed on-device, or any answer ran off-device, then the verdict shall be INCONCLUSIVE. Otherwise a failed threshold gives NO-GO. If all thresholds pass but any answer produced no result (a failed call), then the verdict shall be INCONCLUSIVE and the explanation shall not say "all on-device". GO therefore requires every answer to have run on-device. If any answer failed because the call itself failed (not a parse error), then the verdict shall be INCONCLUSIVE even when a threshold also fails, because that failure may come from the environment and not from Nano's grading.
- R7.7 The thresholds shall live in one exported config object that callers can override.
- R7.8 A failed or unparseable item shall count as disagreement and as not caught, and shall not contribute to latency. A failure that is not a parse error (adapter missing, response not from the device, SDK or network error) is recorded as `errorKind: 'call'` and decides the verdict as in R7.6.
- R7.9 When the user presses "Copy JSON" or "Copy Markdown", the page shall copy the report to the clipboard with no network access, and the page shall keep no answers beyond its own memory.
- R7.10 If the warm-up fails, then the page shall stop, show the error and show INCONCLUSIVE.
- R7.11 If any call times out (R5.10), then the page shall stop the batch, show INCONCLUSIVE with the timeout, and re-enable "Run go/no-go".
- R7.12 When the batch stops before grading (blocked plan, failed warm-up, timeout), the page shall not leave "waiting…" rows for items that never ran. After every run the progress bar shall be hidden.
- R7.13 Every INCONCLUSIVE outcome shall move focus to the verdict, as GO and NO-GO do.
- R7.14 While a batch is running or a single grade is in flight, "Run go/no-go" shall be disabled (see R6.9).
- R7.15 The copied report's environment shall include the App Check status and shall say "present, init failed" (with the error) when config is present but initialization threw, not "not configured".
- R7.16 If the warm-up fails, then the message shall be neutral ("Warm-up failed.") and shall not claim that Nano did not run, because a malformed reply means it did.
- R7.17 The progress bar's `aria-valuemax` shall come from the size of the labelled set, not a literal.
- R7.18 If no answer produced a result on-device (for example every answer was malformed twice after a working warm-up), then the INCONCLUSIVE explanation shall say that no answer produced a result on-device and shall not claim that Nano did not run.
- R7.19 If the batch stops on a timeout after at least one answer was graded, then the page shall enable "Copy JSON" and "Copy Markdown" for a report of the graded rows whose verdict is INCONCLUSIVE. If no answer was graded, copying stays disabled.
- R7.20 If an item failed, then its error text shall be visible in the "Got" cell (not only in a tooltip) and listed under a "Failures" heading in the Markdown report; the JSON keeps it as `error`.

## R8 Routing

- R8.1 A pure function `planRoute({userChoice, deviceAvailability, adapterAttached, online, cloudConfigured, appCheckResponsive})` shall return `{mode, expectedPath, reason}`.
- R8.2 Where the device is ready (adapter attached and availability `available`), auto shall prefer it: `PREFER_ON_DEVICE` when the cloud is also usable, otherwise `ONLY_ON_DEVICE`.
- R8.3 Where the cloud is usable (configured, online, App Check responsive), auto shall fall back to `ONLY_IN_CLOUD` when the device is not ready.
- R8.4 If the device is not ready and the cloud is not usable, then auto shall return `mode: null`, `expectedPath: none` and a reason naming both blockers.
- R8.5 If the choice is `device`, then the plan shall be `ONLY_ON_DEVICE` when the device is ready and blocked otherwise, never falling back to the cloud.
- R8.6 If the choice is `cloud`, then the plan shall be `ONLY_IN_CLOUD` when the cloud is usable and blocked otherwise.
- R8.7 A pure function `classifyPath(expectedPath, inferenceSource)` shall return the actual path (`on_device`, `in_cloud` or `unknown`) and flag a mismatch against the expected path.
- R8.8 If Firebase config is present but initialization threw, then a blocked cloud reason shall say that Firebase failed to initialize, not that it is not configured.
- R8.9 The auto reason for `PREFER_ON_DEVICE` shall say it falls back to the cloud if Nano is not available, and shall not promise a retry after an on-device error, because the SDK decides on availability at call time and throws on-device errors.

## R9 Tests

- R9.1 Unit tests shall cover the routing decision table, path classification and mismatch, the prompt builder, verdict parsing (good, fenced, missing fields, bad verdict, out-of-range confidence), the retry, and the go/no-go maths (median, agreement, wrong-caught, threshold edges, inconclusive).
- R9.2 Tests shall mock the AI and make no network request.
- R9.3 Existing tests shall keep passing; typecheck, lint, test and build shall pass after every task.

## R10 Documentation

- R10.1 The README shall have a "Nano go/no-go" section: how to run `npm run dev` and open `/gate.html`, what Chrome needs, and what GO means.
- R10.2 `docs/SETUP-FIREBASE.md` shall describe the env vars and console steps for the cloud path (project, AI Logic with Gemini Developer API, web app, reCAPTCHA Enterprise key, App Check registration and enforcement, debug token for localhost) using no real values.
