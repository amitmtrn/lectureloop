# Structure

```
index.html, src/main.ts      Study-pack page (notes -> summary, terms, flashcards)
gate.html,  src/gate.ts      Nano go/no-go page (second Vite rollup input)
src/ai.ts                    Study-pack generation through Firebase AI Logic hybrid inference
src/firebase.ts              App + App Check + AI init from env (readConfig)
src/config.ts, cloud.ts      Env parsing; App Check stuck-token helpers
src/parse.ts                 Tolerant JSON extraction helpers
src/routing.ts               Pure routing plan + actual-path classification
src/grade.ts                 Grading prompt, schemas, verdict parsing, grade runner
src/gate-*.ts                Gate page parts: summary maths, sample data, environment, firebase bootstrap, DOM
test/*.test.ts               vitest (node), AI mocked, no network
.kiro/steering/*.md          Product, tech and structure notes
.kiro/specs/<name>/          requirements.md, design.md, tasks.md
docs/                        Setup guides
```
