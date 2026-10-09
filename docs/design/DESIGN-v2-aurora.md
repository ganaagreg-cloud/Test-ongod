---
type: design
status: accepted
date: 2026-10-09
tags: [design, area/mobile, area/web]
---

# Design v2 — Aurora Forest + motion

Decision: [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]] (accepted) + [[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] (accepted; overrides §1 "square covers", §7 Episode/Library/Home hero notes and §7b) · [[DESIGN]] now mirrors this file · Visual target: `docs/design/v2-screens/*.dc.html` (open any file in a browser to read exact values; they are HTML mockups, not app code).

Why v2: v1 told the UI to "stay quiet", had one motion rule (200 ms ease-out) and no motion libraries, so the result looked like a dev gallery. v2 keeps every v1 rule about access, stores and accessibility, and changes the look and motion only.

## 1. What stays from v1 (do not change)

- One dark theme in the app. Admin stays light ([[ADR-0014-admin-light-theme|ADR-0014]]).
- No prices, plans, bank details, "buy" or "restore purchase" text in the app ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]). The client concept's "Үзэх эрх 100,000 ₮ / Эрх авах" screen is NOT built. The no-access sheet only offers "Эрхээ шалгах".
- No lock icon per episode (everything is members-only).
- Square 1:1 episode covers.
- Fonts Lora (display) + Inter (UI) ([[ADR-0013-fonts-lora-inter|ADR-0013]]).
- Touch targets ≥ 44 pt, text never below 12, WCAG AA, reduce-motion respected.
- All values come from `packages/tokens`; the guard tests stay.
- Not a copy of the "Философи" app: we reuse common patterns (floating pill tab bar, segmented control), not its logo, colors, icons or layout.

## 2. Color tokens (dark theme)

Main color from the client: **Aurora Forest #053931**. The background is a darker step of the same hue, so the whole app reads green, not black.

| Token | v1 | v2 | Use |
|---|---|---|---|
| bg | #0A0E0C | **#021512** | screen background (forest 950) |
| surface | #121815 | **#041F1A** | inputs, list groups (forest 900) |
| surfaceRaised | #1A221E | **#062A24** | cards, sheets, glass base (forest 850) |
| surfaceSunken | #0A0E0C | **#021512** | = bg |
| brand (new) | – | **#053931** | Aurora Forest: hero panels, access card, "this week" card |
| heritage | #1F3B2E | **#0B4A3F** | selected chip pill, active tab pill (forest 700) |
| hairline | rgba(243,239,230,0.08) | same | borders |
| textPrimary | #F3EFE6 | same | 13.4:1 on surfaceRaised |
| textSecondary | #A7AFA9 | **#A9B8B2** | 7.5:1 on surfaceRaised, 6.2:1 on brand |
| textTertiary | #6E7771 | **#7F918B** | 4.6:1 on surfaceRaised. NOT allowed on brand or heritage (3.9:1 / 3.1:1); use textSecondary there |
| accent | #D4AF6A | same | gold. One gold element per screen region |
| accentPressed | #B8934F | same | |
| onAccent | #14110A | same | 9.1:1 on gold |
| glow (new) | – | **#2FA88A** | ambient aurora blobs only, never text or icons |
| overlay | rgba(10,14,12,0.72) | **rgba(1,10,8,0.66)** | sheet backdrop |
| success / danger / warning / info | same | same | |

Cover families (for the podcaster's cover template, and for typographic placeholder covers): forest `#0D5A4C → #03231E`, teal `#155463 → #041A20`, bronze `#4A3818 → #140E05`, moss `#3A5A2A → #0D1A09`, plum `#5A3A4A → #170D13`.

Light theme (admin): optional change `primary #1F3B2E → #053931` (white on it 12.8:1). Everything else in the light theme stays.

## 3. Type, radius, elevation

- Type scale unchanged, plus `hero` 52/58 Lora 600 (welcome title only; matches Main.dc.html), `cardTitle` 19/24 Lora 600 (category cards).
- Radius: small 8, card 12 (row covers), **cardLarge 18** (cards, tiles, mini player), **hero 22** (hero carousel, large covers), **sheet 26**, pill 999.
- Elevation: v1 said "no shadows". v2 allows exactly two: `floating` (tab bar, mini player: y 16, blur 40, black 45%) and `goldGlow` (the main play button: y 8, blur 24, gold 35%). Android: `elevation` 8 for floating only.
- Glass: tab bar, mini player, collapsed headers = `expo-blur` intensity ~40 + surfaceRaised at 78–82%. Android fallback: no blur, surfaceRaised at 96%.
- Tab bar height 64 → **68**.

## 4. Motion tokens (new `motion` keys)

| Token | Reanimated | CSS equivalent in mockups | Used for |
|---|---|---|---|
| spring.snappy | `withSpring(v, { damping: 18, stiffness: 260, mass: 0.8 })` | 220 ms cubic-bezier(.3,1.4,.5,1) | press scale, toggles, switch knob, icon bounce, save pop |
| spring.smooth | `withSpring(v, { damping: 26, stiffness: 180 })` | 450 ms cubic-bezier(.22,1,.36,1) | chip pill, segmented thumb, tab pill, carousel, cover scale |
| spring.sheet | `withSpring(v, { damping: 28, stiffness: 220 })` | 550 ms cubic-bezier(.22,1,.36,1) | player, sleep timer, no-access sheets |
| enter | `FadeInDown.springify().damping(20)` + 16 pt rise | 600 ms, stagger 60 ms | section mount; max 8 staggered items, rest appear at once |
| pressScale | 0.96 (0.92 for round icon buttons) | | every Pressable |
| iconBounce | 1 → 1.12 → 1 | | active tab icon, save icon |
| shimmer | 1200 ms linear loop | | skeletons; primary CTA sheen every 3.2 s (welcome only) |
| carouselAutoMs | 4800 | | home hero; pauses while touched |
| ambient | 12–19 s loops | | aurora blobs on Welcome and Player only |

Rules: animate only `transform` and `opacity` (UI thread). No animation longer than 700 ms on a user action. When reduce-motion is on: springs become 0 ms, ambient and shimmer stop, enter becomes a plain 150 ms fade. Pause ambient loops when the app is in the background.

Haptics (`expo-haptics`): light impact on tab change, play/pause, save, chip select; success notification when access becomes active; error notification on OTP failure.

## 5. Libraries to add (mobile)

Install with `npx expo install` so versions match the Expo SDK; write the versions into a research note (TO-VERIFY until installed and built).

- `react-native-reanimated` (+ its babel/worklets plugin as the Expo docs say) — springs, layout and entering animations, scroll-linked headers.
- `react-native-gesture-handler` — drag-to-dismiss sheets, swipe carousel, scrubber.
- `expo-blur` — glass tab bar, mini player, headers.
- `expo-linear-gradient` — covers, hero scrims, cards.
- `expo-haptics` — feedback.
- `expo-image` — cached covers with blurhash/fade-in.

Not added: NativeWind/Tailwind, shadcn, Skia, Lottie, @gorhom/bottom-sheet (ADR-0025 rejected a second styling system; Reanimated + gesture-handler cover sheets).

## 6. Pattern sources (web libraries → our native components)

shadcn/ui, 21st.dev and Shuffle are web libraries (React DOM + Tailwind). They do not run in Expo. We use them only as visual references and rebuild the pattern natively:

| Pattern seen on | Our component | Native build |
|---|---|---|
| shadcn Drawer (vaul) | `Sheet` v2 | Reanimated translateY + Pan gesture, snap, backdrop fade |
| shadcn Input OTP | `CodeInput` | 6 boxes over one hidden TextInput, caret blink, filled pop, success wave, error shake |
| shadcn Tabs / Toggle Group | `Segmented` | sliding thumb (smooth spring) |
| shadcn Skeleton | `Skeleton` v2 | LinearGradient sweep (shimmer) |
| shadcn Toast (Sonner) | `Toast` v2 | top drop with snappy spring, swipe up to dismiss |
| shadcn Carousel (Embla) | `HeroCarousel` | paged FlatList + Reanimated scroll handler, Ken Burns on active, stretching dots |
| 21st.dev Shimmer Button | `Button` primary `shimmer` prop | gradient sweep, Welcome screen only |
| 21st.dev Number Ticker | `NumberTicker` | Reanimated derived value → text |
| 21st.dev animated gradient / aurora backgrounds | `AuroraBackground` | 2–3 blurred circles (react-native-svg radial gradient), slow drift |
| 21st.dev animated tabs / dock | `TabBar` | glass pill, sliding forest-700 pill, icon bounce |
| Shuffle.dev | – | Website blocks only. Could serve the portal landing page later; nothing for the app |

## 7. Screens (see mockups for exact layout)

1. **Welcome** — aurora background, three rows of cover tiles drifting sideways (marquee, faded top/bottom), mountain line draws itself (1.8 s), title + text + buttons enter staggered, gold "Нэвтрэх" with sheen.
2. **Email code** — `CodeInput`, resend countdown, button enables with a fade when 6 digits are in.
3. **Нүүр** — greeting + bell; `HeroCarousel` (latest 3 episodes; uses each episode's own cover on a blurred cover backdrop — wide banner art would need a new admin field = paid change); "Үргэлжлүүлэх" card with animated progress; "Шинэ" horizontal cards; "Сэдвээр сонсох" = full-width photo category cards (category `coverPath` image on the left fading into forest 900, serif name + "N дугаар", chevron; image zooms 1.08 and chevron nudges on press); "Энэ 7 хоногт" next-release card with live countdown; header collapses into a glass bar after 70 pt scroll.
4. **Сан** — CREAM screen (paper #F1ECE1, ink #053931, text 2 #3F5F58; needs a new ADR, see "Light browsing screens"), 4:3 thumbnails with duration badge, search with forest focus ring, chips with sliding pill, sort `Segmented`, skeleton for 650 ms on filter change, rows enter staggered, save icon pops.
5. **Episode** — breathing cover-color glow, cover rises in, parallax + shrink on scroll, glass back button, collapsed title bar, expandable description, "Дараагийн" list.
6. **Player** — client-concept layout: opens as sheet, drag down to close; full-width 16:9 picture on top (slow Ken Burns while playing, play overlay fades in on pause), scrubber + times under it, title, meta, one control row (speed chip that cycles, −15 spin, gold play/pause morph, +30 spin, sleep-timer sheet), collapsible "Тайлбар" card, "Дараагийн" list with 16:9 thumbnails. Replaces the separate Episode screen if the client confirms 16:9 art.
7. **No access** — sheet with floating hourglass, "Эрхээ шалгах" → loading → "still inactive" (shake + warning text) or success (ring burst + check draw + "Тоглуулах"). No price, link or payment text.
8. **Профайл** — access card with gold sheen and remaining-days ring, `NumberTicker` stats, menu, notification switch.
9. **Хадгалсан empty** — bookmark drops onto the mountain line, then floats.

## 7b. Open decisions from the client concept (2026-10-09)

- **Light browsing screens:** Library in cream, listening screens dark. Breaks "one dark theme" ([[ADR-0012-design-dark-theme-inspiration-only|ADR-0012]]): needs a new ADR before build. Risk: bright flash at night; option = follow the phone's light/dark setting.
- **16:9 artwork:** the podcaster probably has YouTube 16:9 thumbnails. If yes, switch covers from 1:1 to 16:9 (rows 4:3 crop, player 16:9) and drop the square-cover rule. ASK the client first.

## 8. Placeholder content

Episode titles, counts and the name "Бат" in the mockups are samples. Photos in the hero come from the client's concept image. Real covers come from the podcaster.
