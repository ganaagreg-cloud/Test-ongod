---
type: design
tags: [design]
---

# Principles

Decisions: [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]] · [[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] (replace [[ADR-0012-design-dark-theme-inspiration-only|ADR-0012]]) · Full v2 spec: [[DESIGN-v2-aurora]] · Mockups: `docs/design/v2-screens/*.dc.html` · Home: [[00-Index]]

Audio-first, calm, premium, Mongolian heritage without kitsch. Main color is Aurora Forest #053931; the whole app reads green, not black. Two surfaces in the app: listening screens are dark forest (Welcome, Home, Player, No-access, Profile), browsing screens are cream (Сан first). The tab bar is always the dark green glass pill. Artwork is the hero; motion is purposeful (springs, staggered entrances) and always respects reduce-motion. At most one gold element per screen region. Generous spacing, large readable text.

# Tokens (packages/tokens)

Decisions: [[ADR-0013-fonts-lora-inter|ADR-0013]] · Facts: [[R-fonts-mongolian-cyrillic]]

Colors: bg #021512; surface #041F1A; surfaceRaised #062A24; surfaceSunken #021512; skeleton #062A24; skeletonShine rgba(243,239,230,0.07); brand #053931 (hero panels, access card, "this week" card); heritage #0B4A3F (selected chip pill, active tab pill); onHeritage #F3EFE6; hairline rgba(243,239,230,0.08); hairlineStrong rgba(243,239,230,0.22); textPrimary #F3EFE6; textSecondary #A9B8B2; textTertiary #7F918B (not allowed on brand or heritage); accent #D4AF6A; accentPressed #B8934F; accentSoft rgba(212,175,106,0.1); onAccent #14110A; glow #2FA88A (ambient aurora blobs only, never text or icons); success #46A758; danger #E5484D; overlay rgba(1,10,8,0.66).

Cream colors (browsing screens, same keys as dark): bg #F1ECE1 (paper); surface #FBF8F2 (card); surfaceRaised #FBF8F2; surfaceSunken #E9E3D6; skeleton #E5DED0; skeletonShine rgba(255,255,255,0.7); brand #053931; heritage #053931; onHeritage #F1ECE1; hairline rgba(5,57,49,0.12); hairlineStrong rgba(5,57,49,0.22); textPrimary #053931 (ink, 10.9:1); textSecondary #3F5F58 (ink 2, 6.0:1); textTertiary #4D6B64; accent #D4AF6A (a FILL on cream, never text or thin icons); accentText #053931; primary #053931; onPrimary #F1ECE1; accentSoft rgba(5,57,49,0.08); glow #2FA88A; focusRing #053931; overlay rgba(5,57,49,0.45). Status colors on cream = the light-theme values.

Cover families (typographic placeholder covers and the podcaster's template): forest #0D5A4C → #053931 → #03231E, teal #155463 → #0A3540 → #041A20, bronze #4A3818 → #2A1F0D → #140E05, moss #3A5A2A → #1F3A17 → #0D1A09, plum #5A3A4A → #33202B → #170D13.

Typography: display = Lora (serif), only for screen titles, hero titles and episode titles; UI = Inter. Scale: hero 52/58, display 32/38, cardTitle 19/24, h1 24/30, h2 20/26, body 16/24, small 14/20, caption 12/16. Never below 12. Hero (Lora 600) is for the Welcome title only. VERIFY that both fonts render Mongolian Cyrillic: render the test string "Өвөг Үүл өөрөө үүрд ӨҮ" and take a screenshot; if a glyph falls back, pick another font and tell me. Web must load the cyrillic-ext subset; Mongolian Ө/Ү are not in the cyrillic subset.

Spacing (4 pt grid): 4, 8, 12, 16, 20, 24, 32, 40, 56. Screen side padding 20.

Radius: small 8, mini 10, card 12, thumb 14, cardLarge 18, category 20, hero 22, sheet 26, pill 999. Cards, tiles, the mini player: cardLarge. Hero carousel and the player picture: hero. Sheets: sheet (top corners).

Artwork: episode pictures are 16:9 (recommend 1280×720). Player, "Дараагийн" and the Home hero show 16:9; list rows show a 4:3 center crop (112×84); the lock screen / now-playing artwork is a center crop of the 16:9 picture. Category cards are 104 pt tall, full width, radius 20, 12 pt apart: the category photo (`coverPath`, about 66% of the width, cover) on the left fades to surface (transparent at 18%, 78% at 46%, solid at 64%), a 3 pt gold strip on the left edge, text from 46% of the width (serif cardTitle 19/24 + "N дугаар" caption), a chevron in a 44 pt hit area. Episodes without a picture show a typographic cover from a cover family.

Elevation: exactly two shadows. floating (tab bar, mini player: y 16, blur 40, black 45%; Android elevation 8) and goldGlow (the main play button: y 8, blur 24, gold 35%). Everything else = a surface color + a hairline.

Glass: tab bar (surfaceRaised at 78%), mini player (82%) and collapsed headers (72%) over `expo-blur` intensity 40. Android has no blur: surfaceRaised at 96%. Over a cream screen the tab bar is brand green at 94% with a paper active pill (Library.dc.html), so it stays dark green.

Motion: springs, not durations. snappy {damping 18, stiffness 260, mass 0.8} for press, toggles, icon bounce, save pop; smooth {damping 26, stiffness 180} for chip pill, segmented thumb, tab pill, carousel, cover zoom; sheet {damping 28, stiffness 220} for sheets. Enter = fade + 16 pt rise, 60 ms stagger, at most 8 staggered items. pressScale 0.96 (0.92 round buttons), iconBounce 1.12, shimmer 1200 ms, hero auto-advance 4800 ms (pauses on touch), ambient loops 12–19 s (Welcome and Player only). Animate only transform and opacity. No user-triggered animation over 700 ms. Reduce-motion: springs 0 ms, ambient and shimmer stop, enter = a plain 150 ms fade. Toasts: at most 2 at once, 8 pt apart, newest on top; the older one at 96% scale and 70% opacity. Haptics (light) on tab change, play/pause, save, chip select; success when access turns active; error on a wrong code. Touch targets >= 44 pt. Contrast: WCAG AA.

Motif: the thin mountain-line SVG, used on empty states, auth screens, the Welcome screen (draws itself in 1.8 s) and the portal header.

# Components

- Button: primary (gold bg, onAccent text, 52 pt tall, radius 999; optional sheen on Welcome only), inverse (cream bg, player only), secondary (hairlineStrong border), ghost (accentSoft bg), destructive (danger outline). Loading and disabled states. Every pressable scales on press.
- Input: 52 pt, surface bg, hairline border, focus = focusRing border (forest ring on cream), error text below in danger.
- ChipRow: pills 36 pt (40 pt in the Library mockup); the selected pill is one sliding shape (heritage on dark, brand on cream).
- Segmented: sliding thumb (textPrimary on the sunken track), 3–4 options.
- CodeInput: 6 boxes over one hidden field; caret blink, pop when filled, success wave, error shake + error haptic.
- EpisodeThumb: 16:9 or 4:3, duration badge bottom-right, progress line at the bottom when started.
- EpisodeRow: 4:3 thumb 112×84, title (2 lines), meta, save icon (pops).
- HeroCarousel: paged, 16:9 artwork, Ken Burns on the active slide, stretching dots, auto every 4.8 s.
- CategoryCard: wide photo left fading into surface, serif name + "N дугаар", chevron; photo zooms 1.08 on press.
- TabBar: always the dark glass pill, 68 pt, inset 16 from the edges and above the safe area, 4 tabs with icon + label, active = sliding heritage pill with a gold hairline and a bouncing icon.
- MiniPlayer: glass, docked 8 pt above the tab bar, cover 40, title, equalizer bars while playing, play/pause, 2 pt progress line.
- Sheet (drag to dismiss past 30% or a fast fling, backdrop fades), Toast (drops from the top, swipe up to dismiss), EmptyState (motif + text + action), Skeleton (gradient shimmer, light and dark; no spinners on lists), NumberTicker, AuroraBackground, MountainLine.

# App screens

Decisions: [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] (no payment UI) · [[ADR-0011-audio-first-media-asset|ADR-0011]] · [[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]]

Auth (dark): Welcome (aurora background, drifting cover rows, mountain line, hero title, gold "Нэвтрэх" with sheen, "Бүртгүүлэх" secondary), Login, Register, Email code (CodeInput + resend countdown), Complete profile, Forgot password, Device limit (list + remove).

Tabs: Нүүр / Сан / Хадгалсан / Профайл.

- Нүүр (dark): greeting + bell; HeroCarousel of the latest 3 episodes; "Үргэлжлүүлэх" card with animated progress; "Шинэ" horizontal list; "Сэдвээр сонсох" category cards; "Энэ 7 хоногт" next-release card with countdown; the header collapses into a glass bar after 70 pt of scroll.
- Сан (CREAM): search (forest focus ring), ChipRow, sort Segmented (Шинэ / Хуучин / Урт), 4:3 EpisodeRows, 650 ms skeleton on filter change, infinite scroll.
- Player (dark, opens as a sheet, drag down to close): replaces the old Episode detail. 16:9 artwork on top (slow Ken Burns while playing, play overlay on pause), scrubber with times, title (display) and meta, one control row (speed chip that cycles 1x/1.25x/1.5x/2x, −15, gold play/pause, +30, sleep timer sheet 15/30/45 min or end of episode), collapsible "Тайлбар" card, "Дараагийн" list. For video assets later: the picture area becomes the video.
- Хадгалсан: saved list; empty state = bookmark dropping onto the mountain line.
- Профайл (dark): name, @username, access card (gold sheen, days-left ring, "Идэвхтэй · 2027.10.08 хүртэл" or "Идэвхгүй"), NumberTicker stats (episodes finished, hours), menu: Тохиргоо, Төхөөрөмжүүд, Мэдэгдэл, Тусламж, Үйлчилгээний нөхцөл, Нууцлалын бодлого; notification switch.
- Тохиргоо: username, phone, email, password change, "Бүртгэл устгах" (destructive, double confirm), "Гарах".
- No-access state (when playing without access): sheet "Таны эрх идэвхгүй байна" + "Эрхээ шалгах" (refresh) only, then loading, then still-inactive (shake + warning) or active (ring burst + check + "Тоглуулах"). NO price, NO link, NO payment text.
- Update required, Offline/error states.

# Portal screens (web, same tokens as CSS vars)

Landing (what it is, 3 sample covers, plan card with price, CTA), Register/Login, Email code, Plans, Pay (bank details + copy buttons + large referenceCode + steps), Submitted (status timeline: Хүлээгдэж байна → Шалгаж байна → Идэвхжсэн), My account (status, end date, renew), Privacy, Terms, Delete account.

# Admin screens

Decisions: [[ADR-0014-admin-light-theme|ADR-0014]] · Facts: [[R-admin-light-contrast]]

Light, dense, functional. Dashboard counters, Payments queue (table + side panel with receipt image), Users, Episodes, Categories, Upload, Audit log. The episode picture field expects 16:9 (recommend 1280×720) and shows a 16:9 preview; the category cover upload uses `coverPath`.

Admin uses the light theme (`themes.light` in packages/tokens; `<html data-theme="light">`). It has the same token keys as the dark theme, so components work in both. The app's cream surface (`themes.cream`) is a separate set.

Light theme colors (contrast ratios against white unless noted):

- bg #F6F4EF
- surface #FFFFFF
- surfaceRaised #FFFFFF
- surfaceSunken #EEEBE4 (table header, input bg)
- hairline rgba(20,26,23,0.10)
- textPrimary #141A17 (17.6:1)
- textSecondary #4F5A54 (7.2:1)
- textTertiary #5F6862 (5.2:1 on bg, 4.8:1 on surfaceSunken)
- accent #D4AF6A (backgrounds/highlights only, never text on white)
- accentText #8A6A2B (links/gold text, 5.0:1)
- onAccent #14110A
- primary #1F3B2E (admin primary button bg = heritage)
- onPrimary #FFFFFF (12.2:1)
- success #2E7D43 (5.1:1), danger #C42B31 (5.6:1), warning #8F5B00 (5.7:1), info #2B5FA8 (6.4:1)
- Status badges: background = the same hue at 12% opacity (successBg, dangerBg, warningBg, infoBg), text in the solid color.
- Focus ring: 2px #2B5FA8.

Dark-theme values for the shared keys: primary = accent, onPrimary = onAccent, accentText = accent, warning #E0A43B, info #6EA8FE.

# Do not

- Copy any other app's logo, colors or layout (common patterns such as a floating tab bar are fine).
- Use cream anywhere except the browsing screens and keep the tab bar dark.
- Show prices, plans, bank details, "buy" or "restore purchase" in the apps.
- Use lock icons per episode.
- Put gold text or thin gold icons on cream.
- Use textTertiary on brand or heritage surfaces.
- Add NativeWind/Tailwind, Skia, Lottie or a bottom-sheet library ([[ADR-0025-ui-component-set|ADR-0025]], [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]]).
- Build the rejected mockups AltA-*, AltB-*, AltC-*.
