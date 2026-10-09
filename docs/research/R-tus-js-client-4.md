---
topic: tus-js-client 4.3.1 browser behaviour (hooks, retries, resume fingerprint)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'computed locally: read node_modules/tus-js-client/lib/index.d.ts (4.3.1); apps/admin/e2e/admin.spec.ts uploads 26 MB, refreshes the page mid-upload and resumes against the real tus server'
tags: [research, area/admin, area/media]
---

## Fact

- Hooks: `onBeforeRequest(req)` and `onAfterResponse(req, res)` may return a Promise (so a token can be refreshed before the retry); `req.setHeader(name, value)`; `res.getStatus()`.
- `onShouldRetry(error, retryAttempt, options)` is synchronous and returns a boolean; `error.originalResponse?.getStatus()` gives the HTTP status. The default does not retry 4xx except 409/423, so a 401 needs a custom rule.
- `chunkSize` sends the file in separate PATCH requests; `retryDelays` is an array of ms. `onProgress` reports bytes **sent**, not bytes the server acknowledged.
- Resume: `findPreviousUploads()` looks up localStorage by a fingerprint of **file name, type, size, lastModified and the endpoint**; `resumeFromPreviousUpload(previous)` then `start()`. A file with a different `lastModified` (for example a buffer handed to the file input by a test tool) counts as a different file. The server's `Upload-Offset` (from a `HEAD`) says how much it already has; the library does not report it before the first PATCH.
- `abort()` pauses (keeps the stored URL); `abort(true)` also sends DELETE to terminate the server-side upload.

## How we use it

[[ADR-0029-admin-app-implementation]]; server side [[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]].
