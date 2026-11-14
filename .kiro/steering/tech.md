# Tech

- Vite + TypeScript (strict) + vitest. `firebase` 13.2.0 (`@firebase/ai` 3.0.0). No other runtime dependency.
- Scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. All four must pass before a commit.
- Prettier: single quotes, trailing commas, width 100.

## Hard rules

- ALL model inference goes through Firebase AI Logic (`getGenerativeModel` with `InferenceMode`).
  Never call `LanguageModel.prompt/promptStreaming/create` or any other model API directly, and
  never add other AI SDKs or HTTP calls to model endpoints.
  Read-only diagnostics such as `LanguageModel.availability(...)` with the SDK's text-only English
  options are allowed, never for generating text.
- App Check (reCAPTCHA Enterprise; debug provider only when `import.meta.env.DEV`) is initialized
  before any cloud AI call. Do not remove or weaken it.
- Config only from `VITE_*` env through `readConfig`. Never commit keys, `.env*` files or App Check
  debug tokens. No cloud resources are created from this repo; no `firebase deploy`.
- Never gitignore `.kiro`.

## Patterns to reuse

- `inferenceSource` from the response decides the path badge. Never guess it.
- `hasOnDeviceAdapter(model)`: the SDK silently sends ONLY_ON_DEVICE to the cloud when no adapter
  is attached, so check it before every on-device call.
- `initializeDeviceModel` (via `prepareOnDevice`) runs inside a user gesture.
- `appCheckResponds` (stuck-token wait) before any cloud call.
- Pure logic lives in small modules under `src/` with tests in `test/`; the AI is mocked in tests.
