# Validation and provenance

Extracted from the focused Discuss-It work on ADAPT at `77a82e6ec`, not from ADAPT's whole source/history. This includes camera/photo implementation `eebc81d1c` and mobile-layout follow-ups `ec6280fcd`/`77a82e6ec`. The original integration baseline is `0345e96cc84c056dab9a6ab4efe1b322b7bcd79d`. These are provenance labels, not a promise that LT's current branch is patch-compatible.

Automated coverage includes all four backgrounds, audio-only, encoded playback and cleanup; WebKit synthetic capture; native JPEG/PNG/WebP resizing and macOS HEIC decoding; missing MIME, corrupt/oversized/empty photos; cancellation and object-URL release; playback/model failure recovery retaining camera permission; custom photo selection and saved pixels. Tests contain no live ADAPT authentication or writes.

The ADAPT deployment separately passed private upload, conversion, posting, signed playback, range requests and authorization tests. Those operations are not part of the standalone demo. The optional integration includes isolated SQLite backend/media tests for LT to adapt to their application; it excludes dev-site login and live-data smoke scripts.

Physical-device acceptance remains distinct: Android Chrome reported working; iPhone Chrome front-camera Blur reported working. Updated photo loading needs the tester's final confirmation. Chrome iPhone screenshots/browser version are still useful for final layout acceptance. Desktop WebKit with an iPhone user agent does not establish all iOS camera/Photos-picker behavior.

Handoff verification: `npm test`, `IMAGE=1 npm run test:ui`, and `npm run test:demo` passed in this independent repo. All five recorder source files match the referenced ADAPT release byte-for-byte. The optional integration patch passes an isolated-index apply check against its documented baseline. The deployed assessment's recorder grew from 138px to 320px on a 390px viewport; WebKit and Chromium passed both direct/assessment routes at 375/390/430px, including 16px native controls and no horizontal overflow. The physical-iPhone screenshot/retest was deferred by the owner.

Known limits: Vue adapter targets Vue 2; assets have a fixed same-origin root; edits to camera/effects happen before recording; background segmentation edges are imperfect; full-resolution photo decoding can have transient memory cost; no automatic captions; host server needed for any submission; no durable offline draft storage.

Dependency review: production dependency audit reports zero known vulnerabilities at handoff. The optional Vue 2.7.16 demo dependency is end-of-life and reports one low-severity HTML-parser ReDoS advisory (GHSA-5j4c-8p2g-v4jx). The demo compiles only its trusted checked-in template, not user templates. LT should use its maintained UI framework for new production integrations; upgrading to Vue 3 is not a drop-in change to this legacy adapter. No broad dependency upgrades were applied to ADAPT.
