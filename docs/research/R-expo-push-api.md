---
topic: Expo Push Service HTTP API (send endpoint, limits, dead tokens)
status: VERIFIED
checked: '2026-10-08'
recheck_after: '2026-12-07'
source: 'https://docs.expo.dev/push-notifications/sending-notifications/'
tags: [research, area/backend, area/mobile]
---

## Fact

- Send: `POST https://exp.host/--/api/v2/push/send`, JSON body = one message or an array. Fields we use: `to` (Expo push token), `title`, `body`, `data` (JSON, about 4 KiB at most).
- **At most 100 messages per request.** Rate limit: 600 notifications per second per project.
- Optional access token: `Authorization: Bearer <token>`. It becomes mandatory only if "enhanced push security" is enabled for the Expo project (requests without it then fail with `UNAUTHORIZED`). Our env: `EXPO_ACCESS_TOKEN`, optional.
- Response = one ticket per message: `status` `ok` (with a receipt id) or `error`. `ok` only means Expo received it, not that the phone did.
- Error `DeviceNotRegistered` (in `details.error`): the token is dead, stop sending to it. We clear `Device.pushToken` for those.
- Receipts: `POST https://exp.host/--/api/v2/push/getReceipts` with up to 1000 ticket ids. **We do not read receipts yet** (only ticket errors), so a token that dies later shows up on the next send.

## How it was checked

- WebFetch of the page above, 2026-10-08. Page text quoted for the endpoint, the 100-message batch, the 600/s limit, the bearer header, `DeviceNotRegistered` and the receipts endpoint.
- Not checked against the live service (no Expo project or device yet): the first real push needs a dev build with a token ([[ADR-0015-local-first-android-smoke-test|ADR-0015]]).

## Used by

- [[ADR-0023-subscription-workflows-implementation|ADR-0023]]
