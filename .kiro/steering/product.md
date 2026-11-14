# Product

LectureLoop is a study tool for the Google #BuildHybridAI hackathon (Web category).
It runs model inference on-device with Gemini Nano in Chrome when it can, and in the
cloud (Gemini via Firebase AI Logic) when it can't. The student's work stays on the laptop by default.

## Direction: "Second Opinion"

A recall trainer. The student types an answer from memory. Gemini Nano grades it on-device
(free, offline). If they disagree with the grade they appeal to cloud Gemini with Google Search
grounding. Later specs add an offline appeal queue, Remote Config thresholds and a "routing lane"
visual.

## Routing colours (shared across every screen)

- Everything that ran on the laptop: TEAL `#2DD4BF`.
- Everything that ran in the cloud: VIOLET `#A78BFA`.
- These two colours mean routing and nothing else. Verdicts and status use other hues.
- Visuals must read clearly at 1080p in a demo video.

## Specs

- `nano-gate`: Session-1 "Nano go/no-go" page (`/gate.html`) and the grading core. It tells us
  whether Gemini Nano on the developer's machine is good enough to build the product on.
