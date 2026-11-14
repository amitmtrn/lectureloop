# Firebase setup for the cloud path

The on-device test at `/gate.html` needs none of this. Do these steps later to enable the cloud route and the Appeal flow. Every value below is a placeholder.

## 1. Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in:

| Variable                             | Where it comes from                                              |
| ------------------------------------ | ---------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`              | Firebase console > Project settings > Your apps > Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN`          | same, e.g. `<project-id>.firebaseapp.com`                        |
| `VITE_FIREBASE_PROJECT_ID`           | same                                                             |
| `VITE_FIREBASE_STORAGE_BUCKET`       | same                                                             |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | same                                                             |
| `VITE_FIREBASE_APP_ID`               | same                                                             |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Google Cloud console > reCAPTCHA Enterprise key (step 5)         |
| `VITE_APPCHECK_DEBUG_TOKEN`          | optional, dev only (step 7)                                      |

If any required variable is missing or still a `your-...` placeholder, the app treats the cloud as not configured and the gate page stays on-device only.

## 2. Create a Firebase project

Firebase console > Add project. Use a project you own; billing is only needed if you outgrow the free tier of the Gemini Developer API.

## 3. Enable Firebase AI Logic

Firebase console > AI Logic > Get started > choose the **Gemini Developer API**. Wait a minute for the API to activate.

## 4. Register a web app

Project settings > Your apps > Add app > Web. Copy the config values into `.env.local`.

## 5. Create a reCAPTCHA Enterprise key

Google Cloud console > reCAPTCHA Enterprise > Create key > type **Website**, and add your hosting domains. Do not add `localhost`; use a debug token for local work. Put the site key in `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.

## 6. Register App Check and enforce it

1. Firebase console > App Check > Apps > your web app > register with **reCAPTCHA Enterprise** and the key from step 5.
2. App Check > APIs > **Firebase AI Logic** > Enforce, once requests show as verified.

## 7. Debug token for localhost

1. Leave `VITE_APPCHECK_DEBUG_TOKEN` empty and run `npm run dev`.
2. Open the app; the console prints `Firebase App Check debug token: <token>`.
3. Firebase console > App Check > Apps > your web app > Manage debug tokens > add it.
4. Optionally store it as `VITE_APPCHECK_DEBUG_TOKEN` in `.env.local`. It is used only in dev builds. Treat it like a password and never commit it.

## 8. Check it

Restart `npm run dev`, open `/gate.html`. The Cloud station should show config present and App Check responding, and "Cloud only" in the grading section should run with a violet CLOUD badge.
