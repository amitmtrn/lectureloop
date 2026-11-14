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

- [ ] T16 One inference at a time: shared `InferenceLock` on `GateCtx`; Grade disabled during a batch, Run disabled during a grade. (R6.9, R7.14)
- [ ] T17 Neutral page background; no teal or violet outside routing. (R1.3)
- [ ] T18 App Check retry when `online` fires during the wait and it ends `stuck`. (R2.14)
- [ ] T19 Report: "present, init failed" and the App Check status. (R7.15)
- [ ] T20 Spec drift: R4.1 wording and the module table. (R4.1)
- [ ] T21 Focus the result when a grade is blocked or fails. (R6.10)
- [ ] T22 `maxlength` and hint on the answer field. (R6.11)
