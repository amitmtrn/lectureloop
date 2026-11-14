# nano-gate: tasks

- [x] T1 Routing module `src/routing.ts` (`planRoute`, `classifyPath`) with decision-table tests. (R8, R9)
- [x] T2 Grading core `src/grade.ts`: prompt builder, schemas, `parseVerdict`, `runGrade` with retry, `gradeAnswer` wiring, tests. (R5, R9)
- [x] T3 Go/no-go maths `src/gate-summary.ts`, labelled set `src/gate-data.ts`, JSON/Markdown report, tests. (R7, R9)
- [x] T4 Environment `src/gate-env.ts`: version parsing, fix list, probe, tests. (R2)
- [x] T5 Gate Firebase bootstrap `src/gate-firebase.ts` with placeholder app, test that no fetch happens. (R3)
- [x] T6 `gate.html` + CSS + rollup input + main-page footer link; environment panel and Prepare Nano with progress. (R1, R2, R4)
- [x] T7 Single grade UI: card, editable answer, route choice, verdict stamp, path badge, mismatch. (R6)
- [x] T8 Batch go/no-go UI: warm-up, table, summary, big verdict, copy JSON/Markdown. (R7)
- [x] T9 Docs: README "Nano go/no-go" section and `docs/SETUP-FIREBASE.md`. (R10)

Review fixes (code review of T1-T9):

- [x] T10 Environment state: separate "config present" from "cloud usable", show Firebase init errors, "checking" and "probe failed" states, App Check "still checking" reason. (R2.11-R2.13, R2.15)
- [x] T11 Page shell `src/gate-shell.ts` (testable), re-probe while downloading, App Check retry on `online`, throttled progress announcements, shell and Prepare tests. (R2.6, R2.14, R4.2-R4.5)
- [x] T12 Batch UI: update the verdict live region in place, focus on every INCONCLUSIVE, no stale "waiting…" rows, hide progress after a run. (R1.6, R7.12, R7.13)
- [x] T13 Single grade: gate-specific friendly errors, route-coloured Grade button, list semantics for fixes, tests for `gate-single`. (R1.3, R1.6, R6.4-R6.8)
- [x] T14 Grade core: strict numeric confidence, strip `"""` from the answer, drop `minimum`/`maximum` from the on-device schema. (R5.1, R5.3, R5.5)
- [x] T15 Per-call timeout with a clear error; Grade and Run recover; batch stops on timeout. (R5.10, R6.8, R7.11)

Review fixes 2 (second review):

- [x] T16 One inference at a time: shared `InferenceLock` on `GateCtx`; Grade disabled during a batch, Run disabled during a grade. (R6.9, R7.14)
- [x] T17 Neutral page background; no teal or violet outside routing. (R1.3)
- [x] T18 App Check retry when `online` fires during the wait and it ends `stuck`. (R2.14)
- [x] T19 Report: "present, init failed" and the App Check status. (R7.15)
- [x] T20 Spec drift: R4.1 wording and the module table. (R4.1)
- [x] T21 Focus the result when a grade is blocked or fails. (R6.10)
- [x] T22 `maxlength` and hint on the answer field. (R6.11)

Review fixes 3 (third review):

- [x] T23 GO requires every answer to have run on-device: failed calls give INCONCLUSIVE when thresholds pass. (R7.5, R7.6)
- [x] T24 Do not rebuild unchanged live regions (`#fixes`, `#plan`). (R2.16)
- [x] T25 Wording: "Gemini Nano is downloaded." and neutral "Warm-up failed." (R4.6, R7.16)
- [x] T26 Report `attempts` in the table, JSON and Markdown; latency stays total. (R7.3)
- [x] T27 Design drift: `probeAvailability`/`probeBrowser`, batch stop on timeout keeps rows. (design)
- [x] T28 `aria-valuemax` from `LABELLED_SET.length`. (R7.17)

Review fixes 4 (fourth review, NITs):

- [x] T29 Neutral wording when no answer produced a result: "No answer produced a result on-device". (R7.18)
- [x] T30 Hold the inference lock until a timed-out SDK call settles; show "Still waiting for the previous on-device call". (R5.11, R6.9)
- [x] T31 Routing reason says "Firebase failed to initialize" when config is present but init threw. (R8.8)
- [x] T32 Batch-neutral wording for a parse failure: "Run it again." (R6.8)
- [x] T33 Timeout stop builds the report from the graded rows, so they can be copied. (R7.19)
- [x] T34 Fix for an unreadable Chrome version: "Could not read the Chrome version". (R2.17)
- [x] T35 Use `build.rolldownOptions` instead of the deprecated `rollupOptions`.
- [x] T36 Relative links between `index.html` and `gate.html`. (R1.8)
- [x] T37 README: complete INCONCLUSIVE description. (R10.1)
- [x] T38 Requirements order: R2.16 and R2.17 under R2, R4.5/R4.6 in order under R4, R7.15 in order under R7; R1.8 numbering. (spec)

Review fixes 5 (fifth review, NITs):

- [x] T39 Design restored from git and "Review fixes 4" appended. (design)
- [x] T40 "Nothing to fix" shows when only the cloud is unconfigured; the cloud hint is a separate info line. (R2.18)
- [x] T41 `LATE_CALL_NOTE` says "previous model call". (R5.11)
- [x] T42 Prepare failures use `gateFriendlyError`. (R4.4)
- [x] T43 Lock comments no longer say "same adapter". (R6.9)

Review fixes 6 (sixth review, NITs):

- [x] T44 A row that failed for a non-parse error (`errorKind: 'call'`) makes the verdict INCONCLUSIVE, so infrastructure errors no longer read NO-GO. (R7.6, R7.8)
- [x] T45 Routing reason says the cloud is used only if Nano is not available. (R8.9)
- [x] T46 Timeout text depends on the mode: connection hint for cloud calls. (R5.12)
- [x] T47 Failed-row error is visible text in the table and listed in the Markdown report. (R7.20)
- [x] T48 Prepare gives up after a progress stall: message, button and poll recover. (R4.7)
