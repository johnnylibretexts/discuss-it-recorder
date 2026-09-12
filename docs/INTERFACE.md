# Recorder interface

`new Recorder(canvas, onState?, onError?)` owns its media resources. One instance represents one recorder session. It attaches a hidden muted inline video element; only the composed canvas is shown to the user.

`await prepare(settings)` returns discovered video devices when available. Settings: `audioOnly` (false), `facingMode` (`user` or `environment`), optional `deviceId`, `mirror` (false), `background` (`none`, `blur`, `color`, `image`) and `image` (File/Blob for image mode). Call from a user action; render the preview before enabling Record. Browser support requires HTTPS/localhost, getUserMedia, MediaRecorder and canvas capture. Embedded hosts must grant camera/microphone permission to the frame.

`start()` returns a promise resolving to `{blob, mimeType, extension, durationMs}`. `stop()` returns that same promise. Preserve the actual MIME/extension: MP4/M4A when supported, otherwise WebM. `dispose()` is idempotent and must run on unmount/navigation. Completed clips are in memory; download or submit before unloading. Disposing does not save/upload a clip.

States: `idle → preparing → preview → recording → finalizing → review`; a failed preview/effect may enter `setup-error` while retaining authorized capture. Cancel/dispose and review release tracks. Changing only mirror/background reuses the live camera. Switching devices may reacquire capture and legitimately request permission. No silent raw-camera fallback is used when effects fail. Show setup errors and an explicit Retry/None choice; do not retry automatically in a loop.

Vue 2 adapter: optional Boolean prop `audioOnly`. `busy` emits a Boolean; while true, the host should block response-type changes/submission. `recorded` emits the result or null on clear. The adapter handles local review, cancellation and download. Its `beforeDestroy` hook releases resources; a Vue 3 adapter must use the equivalent unmount hook.

MediaPipe model, module, worker and WASM are fetched from the app's own `/assets/discuss-it/`. Camera pixels and the selected photo are never sent for remote inference. iPhone/iPad use the DOM-canvas processing path; other browsers use a worker with fallback. Transient full-photo decoding still consumes memory before resizing. Sustained performance, thermal behavior and interruptions vary by hardware. Mirror applies to the complete saved image, including text in a background.

Host responsibilities: sanitize displayed discussion content, authorize every operation, require explicit submission, validate size/duration/codecs server-side, normalize playback media if needed, protect stored media and expiring playback links, provide captions/text alternatives, and define retention/grade policies. This module does not provide automatic transcription or these server controls.

Mobile host layout: include `width=device-width, initial-scale=1`; give the recorder a full-width phone column, use `min-width:0` for flex/fieldset ancestors, and avoid stacking multiple padded containers around it. Keep mobile form controls at least 16px and touch controls at least 44px. Do not disable user zoom. The optional ADAPT patch includes a Discuss-It-specific assessment layout correction.
