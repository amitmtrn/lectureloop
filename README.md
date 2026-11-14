# LectureLoop

Paste in your lecture notes (or a transcript) and LectureLoop hands you back a short summary, the key terms, and a stack of flashcards you can drop straight into Anki. It tries to do all of that right inside your browser with Chrome's built-in Gemini Nano, so your notes never have to leave your laptop, and quietly falls back to a cloud Gemini model when on-device isn't available. Built for the #BuildHybridAI hackathon.

## How the hybrid design works

- **One SDK, two models.** All AI calls go through [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) (`firebase/ai`) using [hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference). The on-device side is Gemini Nano via Chrome's Prompt API (driven by the SDK, not called directly). The cloud side is `gemini-3.5-flash-lite` (the SDK's hybrid default) on the Gemini Developer API.
- **Mode selector.** You pick the `InferenceMode`:
  | Mode                       | Behaviour                                               |
  | -------------------------- | ------------------------------------------------------- |
  | Prefer on-device (default) | Gemini Nano if it's ready, otherwise cloud              |
  | Only on-device             | Gemini Nano or an error. Nothing leaves the browser     |
  | Prefer cloud               | Cloud, falling back to Nano if the cloud is unreachable |
  | Only cloud                 | Always cloud                                            |
- **"Only on-device" is enforced by the app.** In a browser without the built-in model the SDK (firebase 13.2.0) creates no on-device adapter and would send every mode, including `ONLY_ON_DEVICE`, to the cloud. `src/ai.ts` therefore refuses to call the model in that mode when the adapter is missing, and rejects any response whose `inferenceSource` isn't `on_device`.
- **Model download.** Clicking _Generate_ calls `initializeDeviceModel()` (it needs a user gesture), which starts the Nano download if needed and shows progress. In _Prefer on-device_ the app doesn't wait: chunks run in the cloud until Nano is ready.
- **Where did it run?** Every response carries `inferenceSource`. The app logs it per call (`console.info`) and shows a badge: **On-device**, **In-cloud**, or **Mixed** when chunks ran in different places.
- **Structured output.** Cloud calls use `responseMimeType: 'application/json'` + `responseSchema`. On-device calls use `onDeviceParams.promptOptions.responseConstraint` (JSON Schema). On-device sessions are requested as text-only English (`onDeviceParams.createOptions`), since the app sends no images. The prompt also asks for JSON only, and `src/parse.ts` defensively strips fences, extracts the first JSON object that parses and has the right shape. A malformed answer is retried once.
- **Chunking for the ~9k context.** Nano has a 9,216-token window that has to hold instructions, the schema, input and output. `src/chunk.ts` splits text into chunks of about 4,000 estimated tokens (4 ASCII chars per token, 1 per non-ASCII char, so non-English text gets smaller chunks) on paragraph, then sentence, then word boundaries. Chunks are processed in order ("Chunk 2/3") and merged deterministically: summaries are joined, key terms are de-duplicated case-insensitively, and cards are de-duplicated by normalized front.
- **Anki export.** _Download Anki .txt_ writes a tab-separated file with `#separator:tab`, `#html:false` and `#columns:Front<TAB>Back` headers. Fields containing `"` (or starting with `#`) are quoted so Anki imports them verbatim. In Anki, use **File → Import**.
- **App Check.** Firebase App Check with reCAPTCHA Enterprise is initialized before AI Logic. In dev, the App Check debug provider is used instead. If the reCAPTCHA script is blocked (offline, ad blocker), App Check never answers and cloud calls would hang, so the app waits up to 8 seconds for a token, then runs hybrid modes on-device only or shows an error for _Only cloud_.

## Setup

### 1. Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. **Register a Web app** (Project settings → Your apps → Add app → Web). Keep the config values handy.
3. **Enable Firebase AI Logic**: open _AI Logic_ in the console, click _Get started_ and choose the **Gemini Developer API**.
4. **App Check with reCAPTCHA Enterprise**:
   1. In Google Cloud console → reCAPTCHA, create a **website key** for your domains (e.g. your hosting domain). Don't add `localhost`; use a debug token for that instead (below).
   2. In Firebase console → _App Check_ → _Apps_, register your web app with the **reCAPTCHA Enterprise** provider and paste the site key.
   3. In _App Check_ → _APIs_, **enforce** App Check for **Firebase AI Logic** once you've confirmed requests are verified.

### 2. Local config

```bash
cp .env.example .env.local
```

Fill in the `VITE_FIREBASE_*` values from your Web app config and `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. `.env.local` is git-ignored. Never commit it. If anything required is missing, the app shows a _Configure Firebase_ panel listing the missing variables instead of crashing.

### 3. App Check debug token (localhost)

1. Leave `VITE_APPCHECK_DEBUG_TOKEN` empty and run `npm run dev`.
2. Open the app; the browser console prints `Firebase App Check debug token: <token>`.
3. In Firebase console → _App Check_ → _Apps_ → your web app → ⋮ → **Manage debug tokens**, add that token.
4. Put it in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN=<token>` so it stays stable across browsers and restarts.

The debug token is only applied when `import.meta.env.DEV` is true, so it's stripped from production builds. Treat it like a password.

### 4. Chrome on-device setup

- Desktop **Chrome 139+**.
- Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.
- About **22 GB free disk space** for the model download (Chrome removes the model if space runs low).
- Check model status at `chrome://on-device-internals`. The first _Generate_ click starts the download, which can take several minutes.

Other browsers (and mobile) still work in the cloud modes.

## Nano go/no-go

`/gate.html` is a test page that tells you whether Gemini Nano runs on your machine well enough to build on. It works **without a Firebase project**: with no config it runs in a local, on-device-only mode (no App Check, no cloud calls), and the cloud station is greyed out.

```bash
npm install
npm run dev
# open http://localhost:5173/gate.html in desktop Chrome
```

1. **Environment** shows the Chrome version, the `LanguageModel` API, its availability for text-only English, whether the Firebase SDK attached its on-device adapter, network, Firebase config and App Check, with the exact fix for anything missing.
2. **Prepare Nano** starts the model download from a click and shows progress.
3. **Grade one answer** grades an editable answer on a sample card and shows the verdict, missed points, confidence, latency and a path badge (**ON-DEVICE** teal, **CLOUD** violet, **FAILED**) taken from the response's `inferenceSource`.
4. **Run go/no-go** makes one warm-up call (reported as cold latency), then grades 12 labelled answers on-device. **Copy JSON** and **Copy Markdown** put the report on the clipboard; nothing is stored.

What Chrome needs: desktop Chrome 139+, `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled and Chrome relaunched, about 22 GB free disk, and 16 GB RAM with 4+ cores or more than 4 GB VRAM. Check `chrome://on-device-internals`.

**GO** means all of these held with every answer run on-device: warm median latency at most 5000 ms, agreement with the labels at least 70%, and at least 90% of the clearly wrong answers not passed as correct. **NO-GO** means Nano ran but missed a threshold. **INCONCLUSIVE** means the run cannot be judged: the warm-up failed, a call timed out, no answer produced a result on-device, an answer ran off-device, or a failed call kept a passing run from being fully on-device. The thresholds live in `GO_THRESHOLDS` in `src/gate-summary.ts`. The on-device SDK exposes no temperature setting, so the low grading temperature applies to cloud calls only.

To enable the cloud route on the page, see [docs/SETUP-FIREBASE.md](docs/SETUP-FIREBASE.md).

## Limitations

- On-device Gemini Nano is **English only**. The app shows a note when your text looks non-English; use a cloud mode for other languages.
- **Text only** for now (on-device also accepts images, which the app doesn't use yet).
- Very long lectures mean many chunks, and each chunk is a separate model call.
- Merged summaries are just the per-chunk summaries joined together, without a second summarization pass.

## Scripts

| Script              | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Vite dev server                          |
| `npm run build`     | Typecheck + production build to `dist/`  |
| `npm run preview`   | Serve the production build locally       |
| `npm test`          | Unit tests (Vitest, AI mocked)           |
| `npm run lint`      | ESLint (flat config + typescript-eslint) |
| `npm run typecheck` | `tsc --noEmit`                           |
| `npm run format`    | Prettier                                 |

## Project layout

```
src/
  firebase.ts  Firebase + App Check + AI Logic init, config status
  config.ts    env parsing / missing-var detection (pure)
  ai.ts        hybrid model, prompt, chunk orchestration, inferenceSource
  cloud.ts     App Check hang detection / on-device fallback helpers
  chunk.ts     token-budgeted text splitting
  parse.ts     defensive JSON parsing / validation
  merge.ts     merging per-chunk study packs
  anki.ts      Anki .txt export
  errors.ts    user-friendly error messages
  lang.ts      non-English heuristic
  main.ts      UI wiring
  routing.ts   pure route planning and actual-path classification
  grade.ts     grading prompt, schemas, verdict parsing
  gate*.ts     Nano go/no-go page (gate.html)
test/          Vitest suites
```

## License

Apache-2.0. See [LICENSE](LICENSE).
