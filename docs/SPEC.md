---
type: spec
tags: [spec]
---

# Product

Decisions: [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (replaces [[ADR-0011-audio-first-media-asset|ADR-0011]]) · Home: [[00-Index]]

Paid access to a library of episodes (monthly or yearly plans the owner sets, K), plus free items the owner marks free ([[ADR-0043-allow-free-users-and-free-content|ADR-0043]]). Each episode has one media file: audio over the episode picture, or video (max 720p). Episodes are usually 40 minutes or longer, 1 to 10 a week. The catalog is visible to logged-in users; playback of paid items requires active access, free items do not (free items need a login: [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]).

# Surfaces

Decisions: [[ADR-0001-mobile-react-native-expo|ADR-0001]] · [[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]] · [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] · [[ADR-0014-admin-light-theme|ADR-0014]]

- Mobile app (iOS + Android): sign up, log in, browse, play, save, comment on episodes (L), profile, settings, delete account, push notifications (asked once after sign-in, a switch on Профайл, [[ADR-0055-push-token-registration|ADR-0055]]). No payment UI (only a plain text telling a user without access to activate their package, [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]).
- Portal (web, mobile-first): sign up, log in, plans, pay with QPay (via Wire, [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]), gift access (J), subscription status, privacy policy, terms, account deletion page. The apps open app-only copies of privacy and terms (`/app/privacy`, `/app/terms`: no navigation, no payment section, [[ADR-0053-app-only-legal-pages|ADR-0053]]).
- Admin (web): payments (list of all requests, CSV export; [[ADR-0046-remove-bank-transfer-path|ADR-0046]]), plans (K), gifts (J), comment moderation (L), users, content (Контент), series (Цуврал), playlists (Жагсаалт), categories, tags (Шошго), uploads, dashboard, audit log ([[ADR-0042-content-organisation-and-publish-push|ADR-0042]]). Roles OWNER and ADMIN. Password login only, no second factor ([[ADR-0040-admin-password-only-no-totp|ADR-0040]]).

# Workflows

Decisions: auth [[ADR-0008-auth-primitives-two-devices|ADR-0008]] · social login [[ADR-0009-social-login-feature-flag|ADR-0009]] · payments [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0007-access-model-reference-codes|ADR-0007]], [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]], [[ADR-0046-remove-bank-transfer-path|ADR-0046]] · jobs and cron [[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]] · media [[ADR-0004-media-bunny-token-auth|ADR-0004]]

A. Register (app or portal): last name, first name, phone (not verified), email, username (optional; default = email; unique, case-insensitive, 3–30 chars [a-z0-9._] or an email), password (min 8). A 6-digit code is emailed (10 min expiry, 5 attempts, 60 s resend cooldown). Unverified users can log in but cannot apply for a subscription. A new sign-up with the email of an unverified account replaces that account ([[ADR-0037-unverified-signup-can-be-replaced]]).

B. Login: identifier (username OR email) + password + deviceId. Max 2 devices per user; the 3rd gets DEVICE_LIMIT with the device list, and the user can remove one (password required).

C. Google / Apple (optional, behind feature flag SOCIAL_LOGIN): verify the ID token. Existing identity -> log in. Email belongs to an existing password user -> LINK_REQUIRED (log in with password once, then link). New -> user status PENDING_PROFILE, email marked verified, then the mandatory "complete profile" step: username (prefilled with email), password, last name, first name, phone. Everything else returns PROFILE_INCOMPLETE until this is done. If Google sign-in is offered on iOS, Sign in with Apple must also be offered on iOS.

D. Subscribe (portal only): pick a plan -> Subscription PENDING_PAYMENT with amount and referenceCode (ONG-XXXXX, no ambiguous characters) and a Wire payment intent + hosted QPay checkout; the member is sent to the checkout and comes back to a status page that waits for the payment. A verified payment (Wire webhook, or the status poll) turns the Subscription ACTIVE at once: period as in E, Payment(QPAY), user.accessUntil, email + push, AuditLog; no admin step. Cancelled or failed payment -> CANCELLED. One open request per user. PENDING_PAYMENT expires after 7 days. Without Wire keys (development) a mock checkout stands in; it is refused in production. There is no bank transfer: the old path ("Төлсөн", receipts, admin approval) was removed. Decisions: [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]], [[ADR-0046-remove-bank-transfer-path|ADR-0046]].

E. Admin access changes: manual grant and revoke only; QPay payments activate by themselves (D). A period starts at max(now, current access end) and ends after the plan's days. Manual grant (gift, store-reviewer demo account): an ACTIVE subscription (plan days or given days), Payment(MANUAL_GRANT, 0), user.accessUntil cache updated, AuditLog; no email or push. Revoke (refund/fraud): ACTIVE -> REVOKED at once, optionally the payments REFUNDED, cache rebuilt, AuditLog. Payments list: all requests, searchable by referenceCode, username, email, phone or name, filtered by status, with history and a CSV export. Each change runs once (status precondition). Decision: [[ADR-0046-remove-bank-transfer-path|ADR-0046]].

F. Access ends: 14 days before -> push + email, once. At expiry -> playback is refused; the app shows the no-access state.

G. Content: an admin creates an episode (title, description, category, cover, one audio or video file via resumable upload; a new file replaces the old one), with an optional scheduled time. Optionally one series (with part number), any playlists and tags. Status Draft -> Scheduled -> Published. Media status Uploading -> Processing -> Ready / Failed (reason + retry). Push on publish to users with active access and a non-revoked session (logout clears that device's push token) (now, scheduled, or one combined push for a bulk publish), switchable per item with optional custom text. Admin: filters, bulk actions, preview, duplicate, calendar. An item can be marked free: a free item plays for any logged-in user without active access (login and a registered device still required); a paid item without access shows the activate text ([[ADR-0043-allow-free-users-and-free-content|ADR-0043]], [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]). Decision: [[ADR-0042-content-organisation-and-publish-push|ADR-0042]].

H. Account: change password, change email (re-verify), forgot password (email code), delete account (soft delete, revoke sessions, anonymize personal data, keep payment records).

I. App update: the app checks /v1/app-config on start; below the minimum version -> blocking "update required" screen.

Added 2026-10-28 as paid add-ons ([[changes]]); the details are settled in an ADR each before code:

J. Gift access (portal only, "Эрх бэлэглэх"): a verified member pays for a plan through QPay as a gift; the payment creates a one-time gift code, emailed to the buyer. The recipient redeems it on the portal, which grants access like D (period as in E) in one transaction with a status precondition, so a code works once. Admin sees gifts in Төлбөр. The apps show nothing about buying or redeeming gifts. Open: [[open-questions]] #29.

K. Plans: the owner adds and edits plans in the admin (name, price, days, on/off), for example monthly and yearly; changes are audited. A plan switched off is no longer offered but keeps its subscriptions. Renewal stays a manual payment (no automatic charging). The apps never show plan names or prices. Open: [[open-questions]] #30.

L. Comments: logged-in members comment on an episode in the app (text only); they can edit or delete their own comments and report others. Admin hides or deletes comments and sees reports. Rate limited; the store rules for user content (filtering, reporting, blocking, contact) are met before release. Open: [[open-questions]] #31, #32.

# Data model (Prisma)

Decisions: [[ADR-0007-access-model-reference-codes|ADR-0007]] · [[ADR-0011-audio-first-media-asset|ADR-0011]] · [[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]]

User(id, username uniq lowercase, email uniq lowercase, emailVerifiedAt?, passwordHash?, firstName, lastName, phone, status PENDING_PROFILE|ACTIVE|DISABLED|DELETED, role USER|ADMIN|OWNER, accessUntil?, createdAt, deletedAt?)
AuthIdentity(id, userId, provider GOOGLE|APPLE, providerSubject, email; uniq(provider, providerSubject))
Session(id, userId, deviceId, refreshTokenHash, familyId, expiresAt, revokedAt?, createdAt)
Device(id, userId, deviceId, platform, model?, pushToken?, lastSeenAt; uniq(userId, deviceId))
EmailCode(id, userId, purpose VERIFY|RESET|CHANGE_EMAIL, codeHash, newEmail?, expiresAt, attempts, usedAt?)
Plan(id, name, durationDays, priceMnt, active)
Subscription(id, userId, planId, status PENDING_PAYMENT|PAYMENT_SUBMITTED|ACTIVE|EXPIRED|REJECTED|CANCELLED|REVOKED, referenceCode uniq, amountMnt, payerNote?, transferAt?, proofImagePath?, submittedAt?, startsAt?, endsAt?, decidedById?, decidedAt?, rejectReason?, paymentProvider WIRE|MOCK|NONE, wirePaymentIntentId? uniq, checkoutUrl?, createdAt)
Payment(id, subscriptionId, method BANK_TRANSFER|QPAY|MANUAL_GRANT, amountMnt, providerRef?, status, createdAt)
(Unused since [[ADR-0046-remove-bank-transfer-path|ADR-0046]], kept so an old database still reads, dropped by a later migration: Subscription status PAYMENT_SUBMITTED and REJECTED, payerNote, transferAt, proofImagePath, submittedAt, rejectReason; Payment method BANK_TRANSFER.)
WebhookEvent(id, type, receivedAt) (Wire event ids, so a retried webhook is handled once)
Category(id, name, slug uniq, sortOrder, coverPath?)
Episode(id, categoryId, title, description, coverPath, status DRAFT|SCHEDULED|PUBLISHED|ARCHIVED, scheduledFor?, publishedAt?, seriesId?, seriesPart?, isFree (boolean, default false), notifyOnPublish, pushText?, createdAt)
Series(id, title, slug uniq, description, coverPath?, createdAt) (uniq(seriesId, seriesPart) on Episode)
Playlist(id, title, slug uniq, description?, coverPath?, showOnHome, homeOrder, isFeatured, createdAt) (one built-in isFeatured row, Онцлох, not deletable)
PlaylistItem(playlistId, episodeId, position; pk(playlistId, episodeId))
Tag(id, name, slug uniq)
EpisodeTag(episodeId, tagId; pk(episodeId, tagId))
MediaAsset(id, episodeId, kind AUDIO|VIDEO, provider BUNNY_STORAGE|BUNNY_STREAM, path, status UPLOADING|PROCESSING|READY|FAILED, failReason?, sizeBytes?, durationSec?)
PlaybackProgress(userId, episodeId, positionSec, completed, updatedAt; pk(userId, episodeId))
SavedEpisode(userId, episodeId, createdAt; pk(userId, episodeId))
Notification(id, userId?, title, body, data?, createdAt, readAt?) (userId null = broadcast)
Job(id, type, payload text, status QUEUED|RUNNING|DONE|FAILED, attempts, maxAttempts, runAt, lockedAt?, lastError?)
AuditLog(id, actorId, action, targetType, targetId, data, createdAt)
AppConfig(key, value)

# Out of scope (paid add-ons)

Requests: [[changes]]

Offline downloads, social feed, quizzes, live, multiple creators. (Comments moved into scope on 2026-10-28: L.)

# Acceptance tests (must pass before launch)

Tracked in: [[LAUNCH_CHECKLIST]]

- A new episode is playable within minutes and never blocks others.
- Playback starts in < 3 s on mobile data.
- 100 concurrent streams without buffering, server CPU < 70%.
- An upload interrupted at 80% resumes.
- Failed processing shows the reason + retry.
- A link without access or token is refused.
- The 3rd device is refused.
- Expired access stops playback of paid items.
- A backup has been restored once on a clean server.
- Store review: the demo account works, and there is no price, plan name, link or payment button in the apps.
