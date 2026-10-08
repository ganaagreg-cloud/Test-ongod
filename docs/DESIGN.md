# Principles

Audio-first, calm, premium, Mongolian heritage without kitsch. One dark theme only. Cover art is the hero; the UI stays quiet. At most one gold element per screen region. Generous spacing, large readable text.

# Tokens (packages/tokens)

Colors: bg #0A0E0C; surface #121815; surfaceRaised #1A221E; hairline rgba(243,239,230,0.08); textPrimary #F3EFE6; textSecondary #A7AFA9; textTertiary #6E7771; accent #D4AF6A; accentPressed #B8934F; onAccent #14110A; heritage #1F3B2E (selected chips, active-access badge); success #46A758; danger #E5484D; overlay rgba(10,14,12,0.72).

Typography: display = Lora (serif), only for screen titles and for episode titles on the player; UI = Inter. Scale: display 32/38, h1 24/30, h2 20/26, body 16/24, small 14/20, caption 12/16. Never below 12. VERIFY that both fonts render Mongolian Cyrillic: render the test string "Өвөг Үүл өөрөө үүрд ӨҮ" and take a screenshot; if a glyph falls back, pick another font and tell me. Web must load the cyrillic-ext subset; Mongolian Ө/Ү are not in the cyrillic subset.

Spacing (4 pt grid): 4, 8, 12, 16, 20, 24, 32, 40, 56. Screen side padding 20.

Radius: 8 small, 12 card, 20 sheet/hero, 999 pill. Covers: square 1:1, radius 12.

Elevation: no drop shadows on dark; use surfaceRaised + a hairline border.

Motion: 200 ms ease-out; respect reduce-motion. Touch targets >= 44 pt. Contrast: WCAG AA.

Motif: a single thin mountain-line SVG, used only on empty states, auth screens and the portal header.

# Components

- Button: primary (accent bg, onAccent text, 52 pt tall, radius 999), secondary (hairline border, textPrimary), ghost, destructive. Loading and disabled states.
- Input: 52 pt, surface bg, hairline border, focus = accent border, error text below in danger.
- Chip: pill, 36 pt; selected = heritage bg + textPrimary.
- EpisodeRow: cover 64, title (2 lines), meta "category · duration", progress bar if started, saved icon.
- EpisodeCard (large): square cover, title, duration badge.
- TabBar: floating pill, 64 pt, inset 16 from the edges and above the safe area, surfaceRaised at 92% + blur, 4 tabs with icon + label, active = textPrimary + accent dot.
- MiniPlayer: docked 8 pt above the tab bar, cover 40, title, play/pause, thin progress line.
- Sheet, Toast, EmptyState (motif + text + action), Skeleton loaders (no spinners on lists).

# App screens

Auth: Welcome (motif, app name in the display font, "Нэвтрэх" primary, "Бүртгүүлэх" secondary), Login, Register, Email code (6 boxes), Complete profile, Forgot password, Device limit (list + remove).

Tabs: Нүүр / Сан / Хадгалсан / Профайл.

- Нүүр: greeting + bell; "Үргэлжлүүлэх" (continue listening) row; "Шинэ" (latest 10) large cards; categories grid (2 columns) with counts; "Энэ 7 хоногт" release strip.
- Сан: search, category chips, sort (newest/oldest/longest), EpisodeRow list, infinite scroll.
- Episode detail: large cover, title (display), category · date · duration, description (expandable), play button, save, "Дараагийн" list.
- Player (full-screen sheet): large cover, title, scrubber with times, play/pause, -15 / +30, speed 1x/1.25x/1.5x/2x, sleep timer (15/30/45 min, end of episode). For video assets later: same screen, the cover area becomes the video.
- Хадгалсан: saved list, empty state.
- Профайл: name, @username, access badge ("Идэвхтэй · 2027.10.08 хүртэл" or "Идэвхгүй"), listening stats (episodes finished, hours), menu: Тохиргоо, Төхөөрөмжүүд, Мэдэгдэл, Тусламж, Үйлчилгээний нөхцөл, Нууцлалын бодлого.
- Тохиргоо: username, phone, email, password change, "Бүртгэл устгах" (destructive, double confirm), "Гарах".
- No-access state (when playing without access): sheet "Таны эрх идэвхгүй байна" + "Эрхээ шалгах" (refresh) only. NO price, NO link, NO payment text.
- Update required, Offline/error states.

# Portal screens (web, same tokens as CSS vars)

Landing (what it is, 3 sample covers, plan card with price, CTA), Register/Login, Email code, Plans, Pay (bank details + copy buttons + large referenceCode + steps), Submitted (status timeline: Хүлээгдэж байна → Шалгаж байна → Идэвхжсэн), My account (status, end date, renew), Privacy, Terms, Delete account.

# Admin screens

Light, dense, functional. Dashboard counters, Payments queue (table + side panel with receipt image), Users, Episodes, Categories, Upload, Audit log.

# Do not

- Copy any other app's logo, colors or layout.
- Use a light theme in the app.
- Show prices in the apps.
- Use lock icons per episode.
- Use 16:9 covers for audio.
