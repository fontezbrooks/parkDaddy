---
title: parkDaddy Animated Splash — Design
status: ready-for-implementation
created: 2026-05-21
source: /sc:design
requires: animated-splash-requirements.md
next: /sc:implement or /sc:workflow
---

# parkDaddy Animated Splash — Design

## 1. Architectural decision: overlay over swap

**Chosen:** Splash is an **absolutely-positioned overlay** above the navigator inside `RootLayout`.

**Alternative considered:** Render splash *or* navigator (swap). Rejected because Clerk/Convex initialization would block on splash dismissal, killing perceived perf. With overlay, providers can resolve auth *while* the animation plays.

```
RootLayout (Sentry.wrap)
├─ useFonts() ──────────────────────┐
└─ ClerkProvider                    │
   └─ ConvexProviderWithClerk       │  All three feed into
      └─ RootLayoutInner            │  useAppReady()
         ├─ <Stack>...</Stack>      │
         ├─ <WhatsNewSheet />       │
         └─ <AnimatedSplash />  ◄───┘  Overlay, position:absolute, zIndex:9999
                                       Unmounts itself when ready + min duration met
```

## 2. Component graph

```
AnimatedSplash (state machine + overlay container, fades out on dismiss)
├─ BackgroundLayer
│  ├─ Linear gradient (slate-950 → slate-900 → slate-950, diagonal)
│  ├─ Orb A (emerald→teal, top-left quadrant, pulsing 4s)
│  ├─ Orb B (cyan→blue, bottom-right quadrant, pulsing 4s offset)
│  └─ GridOverlay (50px grid at ~2% opacity)
├─ StageALayer (visible during stages 'A' and 'B-transition')
│  ├─ AppWordmark (SVG, gradient fill, fade+scale in @ 0.2s)
│  ├─ DaddyWordmark (SVG, gradient fill, fade+scale in @ 0.4s)
│  ├─ StudiosWordmark (SVG, gradient fill, fade+scale in @ 0.6s)
│  ├─ Tagline "EFFORTLESS AUTOMATION" (slate-400, tracking-widest, @ 1.0s)
│  └─ PulsingDots (3× dots, staggered 1.5s opacity loop, @ 1.2s)
└─ StageBLayer (visible during stages 'B-transition' and 'B-hold')
   └─ ParkDaddyLogo (Image from parkDaddyIcon-nobackground.png, scale 0.6→1.0, fade in)
```

Stage A and Stage B layers overlap centered. Stage A scales 1.0 → 0.3 while fading out as Stage B scales 0.6 → 1.0 fading in.

## 3. State machine

```
States: 'idle' → 'stageA' → 'stageA-hold' → 'stageB' → 'stageB-hold' → 'dismissing' → 'gone'

Inputs:
  appReady: boolean (fonts && clerk.isLoaded && convex client ready)
  elapsed: ms since mount

Transitions:
  mount                                      → 'stageA'        (entering anims start)
  elapsed >= 1200ms && !appReady             → 'stageA-hold'   (logos stay, dots keep pulsing)
  elapsed >= 1200ms && appReady              → 'stageB'        (contract transition starts)
  'stageA-hold' && appReady                  → 'stageB'        (contract transition starts)
  'stageB' && transitionElapsed >= 800ms     → 'stageB-hold'   (parkDaddy logo settled)
  'stageB-hold' && holdElapsed >= 150ms      → 'dismissing'    (overlay opacity 1→0 over 250ms)
  'dismissing' && fadeComplete               → 'gone'          (unmount overlay)
```

**Minimum total visible time:** 1200 + 800 + 150 + 250 = **2400ms** worst-case-fast-boot.
**Maximum visible time:** unbounded if `appReady` never fires (acceptable — same failure mode as current splash).

## 4. Boot integration (`app/_layout.tsx` changes)

### 4.1 Native splash handoff

- Keep existing `SplashScreen.preventAutoHideAsync()` at line 53.
- **Move** `SplashScreen.hideAsync()` from `useEffect` at line 168 → into `AnimatedSplash`'s first `onLayout` callback (after first JS frame paints). This guarantees zero gap between native splash and JS splash.
- Remove the `if (!fontsLoaded && !fontError) return null;` early return at line 172 — replace with always-render-children so the overlay can mount immediately and providers can start initializing in parallel.

### 4.2 New `useAppReady()` hook

```
Location: src/hooks/useAppReady.ts

Inputs (composed from):
  - fontsLoaded || fontError       (from useFonts in _layout)
  - useAuth().isLoaded             (Clerk)
  - useConvexAuth().isLoading === false  (Convex auth bridge)

Output: { ready: boolean }
```

Hook is consumed by `AnimatedSplash` via a context provider so it can be placed below `ConvexProviderWithClerk` (where Clerk/Convex hooks are legal to call) while the splash overlay itself is rendered at the same tree depth as `<Stack>`.

### 4.3 Provider tree (no structural changes to ClerkProvider/ConvexProvider)

```tsx
// Pseudostructure (NOT code — see /sc:implement)
<ClerkProvider>
  <ConvexProviderWithClerk>
    <AppReadyProvider>       // computes useAppReady, exposes via context
      <RootLayoutInner />    // <Stack>, <WhatsNewSheet>, <AnimatedSplash />
    </AppReadyProvider>
  </ConvexProviderWithClerk>
</ClerkProvider>
```

## 5. SVG porting plan

The Figma export is already pure SVG paths + linearGradient defs — direct 1:1 port to `react-native-svg`.

### 5.1 Mapping table

| Web (`Design_splash_screen`)                | React Native (`src/components/splash/logos/`) |
|---------------------------------------------|------------------------------------------------|
| `<svg viewBox="...">`                       | `<Svg viewBox="..." preserveAspectRatio="none">` |
| `<g clipPath="url(#clip0_*)">`              | **Drop** — Figma export artifact, no `<clipPath>` def present in source. |
| `<path d={svgPaths.pXXX} fill="url(#X)" />` | `<Path d={svgPaths.pXXX} fill="url(#X)" />` |
| `<linearGradient><stop style={{stopColor}}>`| `<Defs><LinearGradient><Stop stopColor="..."/></LinearGradient></Defs>` |
| Tailwind sizing via parent `<div>`          | `width`/`height` props on `<Svg>`, set by parent `<View>` |

### 5.2 Path-data preservation

Copy `Design_splash_screen/src/imports/{App,Daddy,Studios}/svg-*.ts` verbatim into a single consolidated `src/components/splash/logos/svg-paths.ts`. No string transformation needed — react-native-svg accepts the same `d` attribute syntax as web SVG.

### 5.3 viewBox + aspect

| Wordmark | viewBox          | RN container @ small | @ medium (md) |
|----------|------------------|----------------------|---------------|
| App      | `0 0 589 208`    | 288×101              | 384×135       |
| Daddy    | `0 0 1555 785`   | 288×145              | 450×227       |
| Studios  | `0 0 1011 140`   | 288×37               | 384×54        |

Use `Dimensions.get('window').width >= 768` as the small/md breakpoint.

### 5.4 Gradient strategy

- `appGradient` (diagonal emerald→teal→blue) used by `AppWordmark` only.
- `textGradient` (horizontal slate-200→white→slate-300) used by `DaddyWordmark` and `StudiosWordmark`.
- Each wordmark `<Svg>` includes its own `<Defs>` with both gradients (matches source). No cross-component gradient sharing — react-native-svg gradient IDs are scoped per-Svg.

## 6. Animation timing graph (Reanimated 4)

All values driven by `useSharedValue` + `withTiming`/`withDelay`/`withRepeat`. UI thread, no JS bridge crossings during animation.

### 6.1 Stage A entering (logos)

| Target               | from     | to       | start  | duration | easing      |
|----------------------|----------|----------|--------|----------|-------------|
| AppWordmark opacity  | 0        | 1        | 200ms  | 600ms    | out-cubic   |
| AppWordmark scale    | 0.9      | 1.0      | 200ms  | 600ms    | out-cubic   |
| DaddyWordmark opacity| 0        | 1        | 400ms  | 600ms    | out-cubic   |
| DaddyWordmark scale  | 0.9      | 1.0      | 400ms  | 600ms    | out-cubic   |
| StudiosWordmark op.  | 0        | 1        | 600ms  | 600ms    | out-cubic   |
| StudiosWordmark sc.  | 0.9      | 1.0      | 600ms  | 600ms    | out-cubic   |
| Tagline opacity      | 0        | 1        | 1000ms | 800ms    | linear      |
| Dots opacity (group) | 0        | 1        | 1200ms | 600ms    | linear      |

### 6.2 Background loops (start at mount, run continuously through stages A and B)

| Target                    | sequence                       | period | repeat |
|---------------------------|--------------------------------|--------|--------|
| Orb A scale               | 1 → 1.2 → 1                    | 4s     | ∞      |
| Orb A opacity             | 0.3 → 0.5 → 0.3                | 4s     | ∞      |
| Orb B scale               | 1.2 → 1 → 1.2                  | 4s     | ∞      |
| Orb B opacity             | 0.5 → 0.3 → 0.5                | 4s     | ∞      |
| Dot 1 opacity             | 1 → 0.3 → 1                    | 1.5s   | ∞      |
| Dot 2 opacity (delay 0.2s)| 1 → 0.3 → 1                    | 1.5s   | ∞      |
| Dot 3 opacity (delay 0.4s)| 1 → 0.3 → 1                    | 1.5s   | ∞      |

### 6.3 Stage B contract transition (triggered on entering stageB)

| Target                       | from | to   | duration | easing       |
|------------------------------|------|------|----------|--------------|
| StageA group opacity         | 1    | 0    | 600ms    | in-cubic     |
| StageA group scale           | 1.0  | 0.3  | 800ms    | in-out-cubic |
| ParkDaddy logo opacity       | 0    | 1    | 600ms    | out-cubic    |
| ParkDaddy logo scale         | 0.6  | 1.0  | 800ms    | out-back(1.2)|

### 6.4 Dismissal

| Target              | from | to | duration | easing  |
|---------------------|------|----|----------|---------|
| Overlay opacity     | 1    | 0  | 250ms    | in-cubic|

On dismissal complete, `setMounted(false)` → component returns `null` → overlay removed from tree.

## 7. Reduce-motion fallback

On mount, await `AccessibilityInfo.isReduceMotionEnabled()`. If true:

- Skip Stage A entering anims — logos render at final opacity/scale immediately.
- Skip orb pulsing — orbs render at midpoint values, static.
- Skip dot pulsing — dots render at full opacity, static.
- Stage B contract becomes instant crossfade (200ms opacity, no scale).
- Total min duration drops to 1200ms (kept for brand cohesion).

Stored as a single `reducedMotion` boolean passed via props to all animated children.

## 8. Native splash assets

### 8.1 `app.json` patches

```
// CURRENT (lines from project_status memory + grep):
"splash": {
  "image": "./assets/splash-icon.png",
  "resizeMode": "contain",
  "backgroundColor": "#f9f9fb"
}
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#f9f9fb"
  }
}

// TARGET:
"splash": {
  "image": "./assets/splash-dark.png",     // NEW asset, see 8.2
  "resizeMode": "contain",
  "backgroundColor": "#0f172a"             // slate-900
}
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",  // unchanged
    "backgroundColor": "#0f172a"           // match splash
  }
}
```

Keep `./assets/splash-icon.png` and `splash-icon1.png` in place (they may be referenced elsewhere); add `splash-dark.png` as a new asset rather than overwriting.

### 8.2 `splash-dark.png` content

Static PNG matching the JS splash's **t=0** background only — solid slate-900 with the two orbs rendered at their starting positions/opacities (no logos, no dots, no grid). Reasoning: at t=0 the JS splash has opacity-0 logos, so the cleanest handoff is for the native splash to also show no logos. The orbs at their starting state are subtle enough that any sub-frame timing mismatch is invisible.

If producing the orb-rendered PNG is too much friction for this iteration, **fallback**: solid `#0f172a` flat color, no image. The first JS frame paints the gradient + orbs in <16ms; the brief flat-color → gradient transition is barely perceptible.

### 8.3 iOS LaunchScreen

Expo manages LaunchScreen.storyboard from `splash.image` + `splash.backgroundColor`. No manual Xcode changes needed. EAS build regenerates the storyboard.

### 8.4 Android Splash Screen API (Android 12+)

Per spec FR-6: gradient cannot be expressed in Android's system splash. `splash.backgroundColor: "#0f172a"` flat. The OS shows app icon on flat slate-900 → JS mounts → animated gradient takes over. Acceptable per resolved decision #5.

## 9. File-level plan

### 9.1 New files

| Path                                                    | Purpose                                      |
|---------------------------------------------------------|----------------------------------------------|
| `src/components/splash/AnimatedSplash.tsx`              | Overlay container + state machine            |
| `src/components/splash/BackgroundLayer.tsx`             | Gradient bg, orbs, grid                      |
| `src/components/splash/PulsingDots.tsx`                 | Three dot indicator                          |
| `src/components/splash/StageA.tsx`                      | Wordmark stack + tagline                     |
| `src/components/splash/StageB.tsx`                      | parkDaddy logo target                        |
| `src/components/splash/logos/AppWordmark.tsx`           | Ported `App` SVG                             |
| `src/components/splash/logos/DaddyWordmark.tsx`         | Ported `Daddy` SVG                           |
| `src/components/splash/logos/StudiosWordmark.tsx`       | Ported `Studios` SVG                         |
| `src/components/splash/logos/svgPaths.ts`               | Consolidated path data (3 files merged)      |
| `src/hooks/useAppReady.ts`                              | Compose fonts + Clerk + Convex readiness     |
| `src/contexts/AppReadyContext.tsx`                      | Provide readiness below Clerk/Convex         |
| `assets/splash-dark.png`                                | New native splash image                      |

### 9.2 Modified files

| Path             | Change                                                      |
|------------------|-------------------------------------------------------------|
| `app/_layout.tsx`| Restructure mount order, wire AppReadyProvider + AnimatedSplash overlay, move `SplashScreen.hideAsync()` to overlay's onLayout |
| `app.json`       | `splash.image`, `splash.backgroundColor`, `android.adaptiveIcon.backgroundColor` |

### 9.3 Untouched

Everything else, including `Design_splash_screen/` (kept as design reference, not imported).

## 10. Risks & mitigations

| Risk                                                   | Severity | Mitigation                                                                                          |
|--------------------------------------------------------|----------|-----------------------------------------------------------------------------------------------------|
| `useFonts` returning null while overlay renders        | Med      | Render overlay's text with `Text` style fallback (system font) until fonts load; tagline uses preloaded fonts already in `useFonts` list |
| Native→JS splash gap if `hideAsync` fires too early    | High     | Tie `hideAsync()` to overlay's first `onLayout` callback, not to `useFonts` resolution               |
| `react-native-svg` gradient quirks (Android elevation) | Low      | Test on Android emulator; fallback is solid emerald fill if gradient renders incorrectly             |
| parkDaddyIcon-nobackground.png is 1.6 MB               | Med      | Resize to ~512×512 for splash use; full-res isn't needed at logo size. New asset `assets/parkDaddy-splash.png` |
| Reanimated worklet errors at module-eval time          | Med      | Confirm `react-native-reanimated/plugin` is in `babel.config.js` (already required for project)      |
| Splash never dismisses if `useConvexAuth` hangs        | High     | Hard timeout: force `appReady=true` after 5000ms regardless. Log to Sentry if hit.                   |
| `<Image>` artifacts on dark bg for transparent PNG     | Low      | If visible, swap to SVG version (deferred per spec out-of-scope) or apply `tintColor` cleanup        |
| TestFlight reviewer sees unfamiliar splash             | Low      | Include splash walkthrough in submission notes (already in submission checklist)                     |

## 11. Validation against requirements

| Req     | Where addressed                                                                  |
|---------|----------------------------------------------------------------------------------|
| FR-1    | §3 state machine, §2 component graph (StageA, StageB)                            |
| FR-2    | §6 animation timing graph (orbs, dots, grid in §2)                               |
| FR-3    | §3 state machine, §4 boot integration, §4.2 useAppReady                          |
| FR-4    | §5 SVG porting, §8 native assets                                                 |
| FR-5    | §2 StageB component, §10 risk row (resize to 512×512)                            |
| FR-6    | §8.4 Android system splash strategy                                              |
| NFR-1   | §1 overlay-not-swap (parallel init); §10 reanimated plugin verified              |
| NFR-2   | §6 all anims run on UI thread via shared values                                  |
| NFR-3   | §8.2 splash-dark.png matches JS t=0; §4.1 hideAsync gated on first JS layout     |
| NFR-4   | §3 state machine min 1200ms enforced                                             |
| NFR-5   | (not designed — out of scope; default RN AppState behavior pauses worklets)      |
| NFR-6   | §7 reduce-motion fallback                                                        |
| NFR-7   | §2 graph uses only already-installed deps                                        |
| AC-1..9 | All addressed across §3/§5/§6/§8                                                 |

## 12. Implementation phases (input for `/sc:workflow` or `/sc:implement`)

1. **Phase 1 — SVG ports.** Create `logos/` files + `svgPaths.ts`. Render in a throwaway test screen to verify visual parity with the web design.
2. **Phase 2 — Background + dots.** `BackgroundLayer`, `PulsingDots`, looping animations. Render standalone.
3. **Phase 3 — StageA + StageB layers.** Wire wordmarks into StageA with entering anims. StageB scale-from-0.6 anim with parkDaddy logo.
4. **Phase 4 — State machine.** `AnimatedSplash` orchestrator. Mock `appReady` with a 3s timer to validate state transitions in isolation.
5. **Phase 5 — `useAppReady` + context.** Wire real Clerk/Convex/fonts readiness.
6. **Phase 6 — `_layout.tsx` integration.** Restructure mount order, move `hideAsync()`, add hard timeout.
7. **Phase 7 — Native assets.** Generate `splash-dark.png`, resize `parkDaddyIcon-nobackground.png` → `parkDaddy-splash.png`, update `app.json`.
8. **Phase 8 — Reduce-motion + device testing.** iOS sim, iOS device, Android emulator. Verify AC-1..9.
9. **Phase 9 — Cleanup.** Delete `Design_splash_screen/` if user confirms it's no longer needed as reference (optional).

---

**Next step:** `/sc:implement` (or `/sc:workflow` if you want phased task breakdown first).
