# Optional ADAPT integration — reference, not a standalone app

If LT already has Discuss-It, **integrate only the recorder** into the existing response UI/upload pipeline. There is no need to replace the discussion subsystem. Copy the recorder resources, install `@mediapipe/tasks-vision@0.10.32`, stage same-origin assets, and connect the Vue adapter's `recorded` result to the existing explicit Submit action.

`feature.patch` is supplied separately for developers who also want the implemented discussion/question-type backend and UI. It contains only feature additions and narrow ADAPT edits against baseline `0345e96cc84c056dab9a6ab4efe1b322b7bcd79d`; **it is not guaranteed to apply to LT's current ADAPT**. Read/reconcile the hunks on a new integration branch. Do not overwrite current application files wholesale.

## Integration checklist

1. Keep LT's existing authentication, role, enrollment, section/group and assignment-availability rules. Review the adapter calls into ADAPT's User, Assignment, Submission and grading models.
2. Copy `resources/js/media/recording/`, `resources/js/components/recording/`, `resources/vendor/discuss-it/`, and the build-assets script into the host; merge the pinned MediaPipe dependency and asset-build command into its package setup. Do not replace its package manifest/lock wholesale.
3. In the host checkout, run `git apply --check /path/to/feature.patch`. Resolve differences before applying. The patch excludes copied recorder files, package locks, infrastructure, demo accounts/seeding and unrelated course-drag fixes.
4. Review the three feature tables/migration and backup policy. The migration deliberately refuses destructive rollback; retaining submitted media and grades is required. Use a disposable test database first.
5. Review feature API authentication/throttling, the feature-scoped streaming PUT size allowance, private storage configuration and signed playback authorization/range behavior. Do not expose the storage backend directly.
6. Provide FFmpeg/ffprobe in the host's existing deployment, verify processor binary paths, and schedule `php artisan discuss-it:process-media` with single-run/concurrency control. This handoff intentionally contains no provider-specific, container, or service-manager configuration.
7. Build the host UI and serve model/worker/WASM/module assets with correct MIME types from `/assets/discuss-it/`. Test normal View Assessments as well as the direct discussion route. The mobile layout hunks stack the Discuss-It assessment column and remove redundant gutters; they must be reconciled with LT's own responsive layout.
8. Run the provided isolated backend/media checks against the integrated app. Inspect each test's setup before running; use a disposable container with SQLite `:memory:` and no production environment. The recorder tests in the repo root do not require ADAPT.
9. Verify on real Android Chrome and iPhone Chrome/Safari: permissions, front/rear, mirror, blur, custom photo, interruptions, review, submit, playback and captions. Verify instructor/student roles, groups, deadlines, moderation and grades independently.

The patch's automatic completion grading is optional; leave it disabled unless explicitly approved. Grouping uses course sections. Editing graded responses is restricted. The discussion list currently caps at 500 comments. Native media upload and manual text/captions remain available. This is implementation material to review, not a claim of production acceptance on a different ADAPT version.
