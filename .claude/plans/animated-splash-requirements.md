---
title: parkDaddy Animated Splash — Requirements
status: ready-for-design
created: 2026-05-21
source: /sc:brainstorm
next: /sc:design
---

# parkDaddy Animated Splash — Requirements Specification

## 1. Goal
Replace the current static `splash-icon.png` with a two-stage animated splash that mirrors the Figma Make design (`Design_splash_screen/src/app/App.tsx`): an "App Daddy Studios" studio brand stage that contracts into the parkDaddy product brand, gated on app readiness.

## 2. User Stories

- **US-1** — As a launching user, I see a polished animated splash that establishes brand identity (studio + product) before the home screen mounts.
- **US-2** — As a returning user on a warm boot, the splash does not feel artificially long; it dismisses as soon as the app is ready (after the Stage A minimum animation window completes).
- **US-3** — As a user on a cold start with a slow network, I see the animation play to completion rather than a frozen frame while Convex auth resolves.
- **US-4** — As a user, the transition from the native (OS-level) splash to the JS splash is seamless — no flash of white/empty screen.

## 3. Functional Requirements

### FR-1: Two-stage brand sequence (every launch)
1. **Stage A — Studio brand** (~1.2s): Render `App`, `Daddy`, `Studios` SVG wordmarks (ported from `Design_splash_screen/src/imports/`) with staggered fade-in (0.2s / 0.4s / 0.6s delays per source design) and the tagline **"Effortless Automation"** rendered verbatim.
2. **Stage B — Product brand** (~0.8s): "Contract" transition — studio wordmarks scale/translate inward and crossfade into the centered parkDaddy logo sourced from `assets/parkDaddyIcon-nobackground.png`. Final composition shows parkDaddy logo alone on the same dark gradient background.
3. Stage A plays on **every** launch (not gated by AsyncStorage / first-launch-only).

### FR-2: Animation fidelity (parity with web design)
- Animated dark gradient background (`slate-950` → `slate-900` equivalent).
- Two pulsing gradient orbs (emerald→teal, cyan→blue) with `scale: [1, 1.2, 1]` and `opacity: [0.3, 0.5, 0.3]`, 4s loop.
- Three pulsing dots (emerald-400, cyan-400, blue-400) with staggered opacity 1.5s loops.
- Subtle grid overlay at low opacity.
- Studio logo SVGs filled via vector linear gradients (translated from web `<linearGradient>` to `react-native-svg` `<LinearGradient>`).

### FR-3: Ready-gated dismissal
- Native (OS) splash held via `SplashScreen.preventAutoHideAsync()` (already in place at `app/_layout.tsx:53`).
- Native splash hands off to JS splash at the same dark background to prevent visual jump.
- JS splash remains visible until: (a) fonts loaded, (b) Convex client initialized, (c) auth state resolved (signed-in OR confirmed signed-out).
- On ready AND Stage A minimum duration elapsed, splash plays Stage B then fades out (200–300ms); root navigator becomes interactive.

### FR-4: Asset migration
- Port `App-1-26.tsx`, `Daddy.tsx`, `Studios.tsx` and their paired `svg-*.ts` path data to React Native equivalents using `react-native-svg`.
- Replace native `assets/splash-icon.png` with a still frame matching Stage A's first paint (dark gradient + faintly visible logos) so the native→JS handoff is invisible.
- Update `app.json` `splash.backgroundColor` from `#f9f9fb` to a slate-equivalent hex.

### FR-5: parkDaddy brand asset for Stage B
- Use `assets/parkDaddyIcon-nobackground.png` (transparent PNG, 1.6 MB) as the Stage B target asset.
- Verify it renders cleanly on the dark gradient background; if anti-aliasing artifacts appear, fallback is to request an SVG version (deferred to design phase).

### FR-6: Android splash strategy
- Android 12+ uses the system Splash Screen API (icon-on-background composition). Expo abstracts this.
- Android `splash.backgroundColor` and Android-specific `android.adaptiveIcon.backgroundColor` set to a flat slate-900-equivalent hex (e.g. `#0f172a`) — the gradient cannot be expressed in the Android system splash.
- The full animated gradient runs only in the JS splash component once React mounts.

## 4. Non-Functional Requirements

- **NFR-1 (performance)**: Splash must render the first animated frame within 50ms of JS startup. No layout thrash, no synchronous heavy work on mount.
- **NFR-2 (animation perf)**: All animations run on the UI thread via Reanimated worklets — no `setState` loops driving animation.
- **NFR-3 (no flash)**: Native splash background color, dimensions, and starting visual must align with JS splash first frame.
- **NFR-4 (minimum duration)**: Stage A runs to at least 1.2s before Stage B can start, even if app-ready fires immediately. Stage B is not artificially extended once Stage A completes and app is ready.
- **NFR-5 (cancellable)**: If user backgrounds the app during splash, animation pauses; on foreground, splash dismisses immediately if ready.
- **NFR-6 (accessibility)**: Honor `AccessibilityInfo.isReduceMotionEnabled()` — fall back to a static rendering (Stage A frame → crossfade → Stage B frame → dismiss) with no orb pulses, no scale animations.
- **NFR-7 (no nativewind dep)**: Use Reanimated + `StyleSheet` / inline styles since project does not currently use NativeWind. No new dependencies beyond what `package.json` already declares (`react-native-reanimated` 4.1.1, `react-native-svg` 15.12.1, `expo-splash-screen` 31.0.13).

## 5. Acceptance Criteria

- [ ] AC-1: On cold start, native splash transitions to JS splash with no visible color flash on iOS and Android.
- [ ] AC-2: Stage A logos animate in with the same stagger (0.2s / 0.4s / 0.6s) as the web design.
- [ ] AC-3: Stage A → Stage B contract transition occurs no earlier than 1.2s from JS mount.
- [ ] AC-4: Splash dismisses within 100ms of (last gating async resolved AND Stage B complete).
- [ ] AC-5: On a device with reduce-motion enabled, splash shows static frames (Stage A → Stage B) and dismisses on ready without orb/dot/scale motion.
- [ ] AC-6: No regression in `app/_layout.tsx` auth/Convex flow — existing `SplashScreen.hideAsync()` call at `app/_layout.tsx:168` is replaced by JS-splash dismissal logic, not removed outright.
- [ ] AC-7: Verified on iOS simulator + at least one physical iOS device, and Android emulator.
- [ ] AC-8: Stage B renders `parkDaddyIcon-nobackground.png` centered on the dark gradient with no visible edge artifacts.
- [ ] AC-9: Tagline "Effortless Automation" appears verbatim during Stage A.

## 6. Resolved Decisions (closed)

| # | Question | Decision |
|---|---|---|
| 1 | parkDaddy Stage B asset | Use `assets/parkDaddyIcon-nobackground.png` |
| 2 | Stage A → Stage B transition | Studio wordmark contracts into parkDaddy logo (scale + crossfade) |
| 3 | Studio splash frequency | Every launch (not first-launch-only) |
| 4 | Tagline copy | Keep "Effortless Automation" verbatim during Stage A |
| 5 | Android splash strategy | Flat slate-900 hex for system splash; gradient runs only in JS splash |

## 7. Out of Scope (explicit)

- Onboarding/welcome flow changes.
- App icon redesign.
- Lottie-based splash (using SVG + Reanimated instead).
- Marketing screenshots / App Store assets.
- Replacing `parkDaddyIcon-nobackground.png` with an SVG version (only escalate if PNG rendering proves unacceptable on dark gradient).

---

**Next step**: `/sc:design` to produce architecture (component structure, animation timing, asset porting plan, native splash config), then `/sc:workflow` or `/sc:implement` for execution.
