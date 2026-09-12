# Discuss-It recorder

Focused developer handoff for LibreTexts: **not an ADAPT fork and not a complete LMS**. This repo contains the reusable on-device recorder, a Vue 2 adapter, a no-login/no-upload demo, tests, and an optional ADAPT integration patch. No ADAPT history, credentials, user data, recordings, or infrastructure configuration is included.

## Try it without ADAPT

Use Node.js 22 or newer:

```sh
npm ci
npm run build
npm run demo
```

Open `http://127.0.0.1:4173`. Allow camera/microphone, choose a look, record, review and download. The demo has **no Submit/upload function**. Localhost is a secure-context exception; real phone testing requires serving the demo through your own HTTPS development setup. The server intentionally binds to loopback and is not a production server.

## What is reusable?

- `resources/js/media/recording/`: framework-independent browser ES modules. Capture, effect processing and encoding stay on-device.
- `resources/js/components/recording/VideoRecorder.vue`: optional legacy Vue 2 UI. It emits `busy` and `recorded`; it does not know about users, courses or uploads. Vue 2 is used only by this adapter/demo; a Vue 3 or other UI can call the same core.
- `resources/vendor/discuss-it/`: pinned segmentation model, license and checksum. `npm run build` copies the installed MediaPipe runtime/WASM into `public/assets/discuss-it/`.
- `integrations/adapt/`: optional discussion/question-type integration reference, separate from the recorder.

Front/rear switching, device selection, mirroring, blur, neutral color and custom-photo backgrounds are supported before each take. Effects are encoded into the saved recording. HEIC/HEIF needs native browser codec support; otherwise use JPG/PNG/WebP. Photos are limited to 20 MB/50 megapixels and normalized to at most 640 pixels per side. Video is approximately 15 fps, with five-minute and 75 MB local stop thresholds. Audio-only is supported.

## Integrate the recorder

See [the interface contract](docs/INTERFACE.md) and [ADAPT integration](integrations/adapt/README.md). Keep the runtime assets at `/assets/discuss-it/` on the app's own origin; these paths are currently fixed. The host app owns authentication, permissions, posting, storage, validation, grading and captions. Do not treat a browser-produced Blob as trusted server input.

```js
import Recorder from './resources/js/media/recording/Recorder.js'
const recorder = new Recorder(canvas, state => updateStatus(state), error => showError(error.message))
await recorder.prepare({ facingMode: 'user', mirror: true, background: 'blur' })
const completed = recorder.start()
// Later, from the Stop button:
recorder.stop()
const { blob, mimeType, extension, durationMs } = await completed
// Review locally; upload only after explicit user submission.
recorder.dispose() // Also call on navigation/unmount.
```

## Tests and device status

```sh
npx playwright install chromium webkit
npm test
npm run test:ui
npm run test:demo
```

Tests use synthetic media, not your camera or ADAPT accounts. On macOS, image tests generate a synthetic HEIC with `sips`; other systems skip that native-codec check. Browser automation is not a real iPhone hardware test.

Reported physical-device results: Android Chrome works; iPhone Chrome front camera with Blur works. Custom-photo loading received a follow-up fix and passed automated tests; final physical-iPhone confirmation remains pending. See [validation and limitations](docs/VALIDATION.md).

## Sharing and licensing

This is a private source handoff, not an npm publication. The owner can invite LT developers to this repo without giving access to ADAPT. Grant access only to the intended GitHub accounts. Source includes the inherited MIT notice; MediaPipe runtime/model use Apache-2.0. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
