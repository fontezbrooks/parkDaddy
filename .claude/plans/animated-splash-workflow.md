---
title: parkDaddy Animated Splash — Implementation Workflow
status: ready-for-implementation
created: 2026-05-21
source: /sc:workflow
requires:
  - animated-splash-requirements.md
  - animated-splash-design.md
next: /sc:implement
---

# parkDaddy Animated Splash — Implementation Workflow

## Quick reference

- **9 phases**, ~14 atomic tasks
- **Effort:** ~1 dev-day (6-8 focused hours) for someone fluent with Reanimated 4
- **No new deps** — all of `react-native-reanimated@4.1.1`, `react-native-svg@15.12.1`, `expo-splash-screen@31.0.13` already in `package.json`
- **Critical path:** Phase 1 → 2 → 3 → 4 → 6 → 8. Phases 5, 7, 9 can be parallelized.
- **Definition of done:** all 9 acceptance criteria from `animated-splash-requirements.md` §5 pass on iOS device + Android emulator.

## Dependency graph

```
P1 (SVG ports)
 └─ P3 (StageA + StageB)
     └─ P4 (state machine)
         └─ P6 (_layout integration) ── needs P5
         
P2 (background + dots) ─┘ (feeds into P3 visually)

P5 (useAppReady)  ── independent, can start any time after P0
P7 (native assets) ── independent, can be done in parallel with P1-P5
P8 (reduce-motion + device test) ── final gate after P6
P9 (cleanup) ── post-merge, optional
```

## Phase 0 — Pre-flight (15 min)

**Goal:** Confirm tooling sanity before touching code.

| # | Task | Verification |
|---|------|--------------|
| 0.1 | Confirm `react-native-reanimated/plugin` is in `babel.config.js` plugins array | `grep "reanimated" babel.config.js` |
| 0.2 | Confirm `react-native-svg` imports work in the project (check any existing usage) | `grep -r "react-native-svg" src/` |
| 0.3 | Confirm Expo dev client is built and current (Reanimated 4 requires native rebuild on first add) | `eas build:list --platform ios --limit 1` |
| 0.4 | Snapshot current `app.json` splash block | `git diff app.json` (should be clean) |

**Checkpoint:** If 0.1 fails, add the plugin and rebuild dev client before proceeding.

---

## Phase 1 — SVG wordmark ports (45 min)

**Goal:** Three RN-native wordmark components rendering with vector gradient fills, visually identical to the web design.

| # | Task | File | Output |
|---|------|------|--------|
| 1.1 | Create `src/components/splash/logos/svgPaths.ts` | new | Re-exports the three `p*` path-data records from `Design_splash_screen/src/imports/{App,Daddy,Studios}/svg-*.ts`, namespaced as `appPaths`, `daddyPaths`, `studiosPaths` |
| 1.2 | Create `AppWordmark.tsx` | new | `<Svg viewBox="0 0 589 208">` with 3 `<Path>` filled by `appGradient` def |
| 1.3 | Create `DaddyWordmark.tsx` | new | `<Svg viewBox="0 0 1555 785">` with 1 `<Path>` filled by `textGradient` def |
| 1.4 | Create `StudiosWordmark.tsx` | new | `<Svg viewBox="0 0 1011 140">` with 7 `<Path>` filled by `textGradient` def |
| 1.5 | Render all three in a throwaway test screen (e.g., `app/_splash-test.tsx`) on a dark `#0f172a` background | new (delete in P9) | Visual parity with `Design_splash_screen` running in browser |

**Validation gate:** Side-by-side comparison — web design in browser vs. RN test screen on iOS sim. Gradients should match within perceptible tolerance. If not, check `<Defs>` placement (must be inside each `<Svg>`, not shared).

**Risks:**
- `<clipPath>` references in source are unused; drop them. If logos clip incorrectly, restore.

---

## Phase 2 — Background layer + pulsing dots (1 hour)

**Goal:** Background gradient with two pulsing orbs and grid overlay, plus the three-dot indicator — all looping animations running on UI thread.

| # | Task | File | Output |
|---|------|------|--------|
| 2.1 | Create `BackgroundLayer.tsx` | new | `<View>` with `expo-linear-gradient` diagonal slate-950→slate-900→slate-950 fill |
| 2.2 | Add Orb A (top-left, emerald→teal) | same | `Animated.View` with `useSharedValue` driving `scale: [1, 1.2, 1]` + `opacity: [0.3, 0.5, 0.3]`, 4s repeat |
| 2.3 | Add Orb B (bottom-right, cyan→blue) | same | Same pattern, offset phase |
| 2.4 | Add grid overlay | same | Image asset (50px tile, white at 2% opacity) OR `<Svg>` line pattern (lower memory) |
| 2.5 | Create `PulsingDots.tsx` | new | 3× `Animated.View` circles, 1.5s opacity loop, staggered 0ms/200ms/400ms |
| 2.6 | Render `BackgroundLayer` + `PulsingDots` in `_splash-test.tsx` | edit | Visual: orbs visibly pulsing, dots blinking in sequence |

**Validation gate:** No frame drops on iOS sim during continuous loops. Profile with React DevTools FPS monitor if uncertain.

**Risks:**
- `expo-linear-gradient` not in `package.json`? If absent, use `react-native-svg` `<LinearGradient>` covering the full screen. Check first.

---

## Phase 3 — Stage A & Stage B layers (1.5 hours)

**Goal:** Two composable layers ready for the orchestrator to drive opacity/scale.

| # | Task | File | Output |
|---|------|------|--------|
| 3.1 | Create `StageA.tsx` accepting `{ stage, reducedMotion }` props | new | Stacks the three wordmarks vertically with the tagline + dots; each child uses `useAnimatedStyle` for its entering anim (200/400/600/1000/1200 ms delays per §6.1) |
| 3.2 | Add tagline `Text` with `Inter` or `Figtree` font from existing `useFonts` set, tracking-widest, uppercase, slate-400 | same | Text matches web design line 99 |
| 3.3 | Create `StageB.tsx` accepting `{ stage, reducedMotion }` | new | `<Image source={require('@/assets/parkDaddy-splash.png')}>` centered, `useAnimatedStyle` for scale-from-0.6 + fade-in driven by `stage === 'stageB'` |
| 3.4 | Render `<StageA stage="stageA" />` then `<StageB stage="stageB" />` in `_splash-test.tsx` via a hardcoded state | edit | Visual: Stage A enters with proper stagger; Stage B reveals when state flips |

**Validation gate:** Toggling stage manually in test screen produces both entering animations correctly. Stage A scale-down + Stage B scale-up should overlap (centered) without layout shift.

**Dependencies:** P1, P2 complete. **P7's `parkDaddy-splash.png` must exist** for 3.3 — but if P7 hasn't run, use `parkDaddyIcon-nobackground.png` as a temporary placeholder.

---

## Phase 4 — State machine orchestrator (1 hour)

**Goal:** `AnimatedSplash` component that progresses through states based on time + readiness, dismisses itself.

| # | Task | File | Output |
|---|------|------|--------|
| 4.1 | Create `AnimatedSplash.tsx` accepting `{ appReady }` prop | new | `useState<Stage>('idle')` + `useEffect` running the §3 state machine |
| 4.2 | Implement min-1200ms enforcement | same | Track `mountedAt` via `useRef(Date.now())`; advance to stageB only when `elapsed >= 1200 && appReady` |
| 4.3 | Implement hard 5s timeout | same | Force-advance to stageB after 5000ms regardless of `appReady`; `Sentry.captureMessage('splash_appReady_timeout')` |
| 4.4 | Implement dismissal (overlay opacity 1→0 over 250ms, then `setMounted(false)`) | same | After fade, return `null` |
| 4.5 | Wire reduce-motion check | same | `useEffect` calls `AccessibilityInfo.isReduceMotionEnabled()` once on mount; pass through to children |
| 4.6 | Add `onLayout` callback that calls `SplashScreen.hideAsync()` ONCE on first paint | same | Native splash hides exactly when JS splash is visible |
| 4.7 | Validate in `_splash-test.tsx` with `appReady` mocked via `setTimeout(setReady, 3000)` | edit | Splash runs full sequence and unmounts cleanly |

**Validation gate:** Stage transitions follow §3 timing table within ±50ms. Splash unmounts at expected time. No memory leaks (test by mounting/unmounting 10× via dev refresh).

**Risks:**
- `setState` inside `useAnimatedReaction` can crash worklets — keep state machine on JS thread, only animation values on UI thread.

---

## Phase 5 — `useAppReady` + context (45 min) — parallelizable

**Goal:** Single boolean source of truth for app readiness, available to `AnimatedSplash`.

| # | Task | File | Output |
|---|------|------|--------|
| 5.1 | Create `src/hooks/useAppReady.ts` | new | Hook composing `fontsLoaded || fontError` (received as arg) + `useAuth().isLoaded` + `useConvexAuth().isLoading === false` |
| 5.2 | Create `src/contexts/AppReadyContext.tsx` | new | Provider that runs the hook and exposes `{ ready: boolean }` via `useContext` |
| 5.3 | Unit smoke test: render `<AppReadyProvider>` in isolation with mocked Clerk/Convex and confirm `ready` flips from `false` to `true` | optional | Sanity check |

**Validation gate:** Hook returns `false` until all three signals resolve, then `true` and never flips back.

**Dependencies:** none. Can be built in parallel with P1-P4.

**Risks:**
- `useConvexAuth` is only legal inside `ConvexProviderWithClerk`. Provider must live inside it (per design §4.3).

---

## Phase 6 — `app/_layout.tsx` integration (1 hour)

**Goal:** Wire `AnimatedSplash` into the real provider tree and remove the old splash dismissal logic.

| # | Task | File | Change |
|---|------|------|--------|
| 6.1 | Remove `useEffect` calling `SplashScreen.hideAsync()` at `app/_layout.tsx:166-170` | edit | Replaced by overlay's `onLayout` (4.6) |
| 6.2 | Remove `if (!fontsLoaded && !fontError) return null;` at line 172 | edit | Render children always; splash overlay handles visual gating |
| 6.3 | Wrap `RootLayoutInner` with `AppReadyProvider`, pass `fontsLoaded` and `fontError` in | edit | Per design §4.3 tree |
| 6.4 | Inside `RootLayoutInner`, add `<AnimatedSplash />` as last child (after `WhatsNewSheet`) | edit | Overlay sits above navigator |
| 6.5 | Verify `WhatsNewSheet` still works (it reads AsyncStorage on mount — now mounts while splash is up, which is fine) | manual | Open app, dismiss splash, confirm WhatsNew shows on first version |

**Validation gate:** Cold-start the app on iOS sim. Native splash → JS splash with no flash. Splash dismisses cleanly. WhatsNewSheet still appears for first-time install of this version.

**Dependencies:** P4, P5 complete.

**Risks:**
- Removing the `return null` means the navigator may try to render before fonts load. Confirm no font-dependent screens crash on initial mount — they should fall back to system font via RN default behavior, but visual flash is possible. Mitigation: render navigator inside a `View` with `pointerEvents="none"` while splash is visible (optional polish).

---

## Phase 7 — Native assets (45 min) — parallelizable

**Goal:** Native splash and resized parkDaddy logo committed.

| # | Task | File | Output |
|---|------|------|--------|
| 7.1 | Generate `assets/splash-dark.png` (solid `#0f172a`, 1242×2688 for iPhone, 1284×2778 also acceptable; Expo upscales) | new | Native splash image |
| 7.2 | Resize `assets/parkDaddyIcon-nobackground.png` → `assets/parkDaddy-splash.png` at 512×512 with transparency preserved | new | ~30 KB target, down from 1.6 MB |
| 7.3 | Update `app.json` `splash.image` → `./assets/splash-dark.png`, `splash.backgroundColor` → `#0f172a` | edit | Native splash config |
| 7.4 | Update `android.adaptiveIcon.backgroundColor` → `#0f172a` | edit | Android system splash bg matches |
| 7.5 | (Optional) Add orb visuals to `splash-dark.png` for closer visual match — skip if friction high | edit | Fallback per design §8.2 is acceptable |

**Validation gate:** `assets/parkDaddy-splash.png` size < 100 KB. `app.json` schema valid (`npx expo config --type prebuild` succeeds).

**Dependencies:** none. Can be done first or last.

**Risks:**
- Replacing splash image requires a new dev/EAS build to take effect on iOS — pure JS reload won't show the new native splash. Test with `npx expo run:ios` (rebuilds native).

---

## Phase 8 — Reduce-motion + cross-device testing (1 hour)

**Goal:** All 9 acceptance criteria pass on real devices.

| # | Task | Device | Verification |
|---|------|--------|--------------|
| 8.1 | AC-1: native→JS handoff has no color flash | iOS sim + Android emu + iOS device | Visual, record screen if uncertain |
| 8.2 | AC-2: Stage A logos stagger at 200/400/600 ms | iOS sim | Slow-motion screen recording @ 60 fps |
| 8.3 | AC-3: Stage B contract no earlier than 1200ms | iOS sim | Mock `appReady=true` immediately at mount; confirm Stage B waits |
| 8.4 | AC-4: Splash dismisses within 100ms of last gating async resolving | iOS sim | Log timestamps in dev build |
| 8.5 | AC-5: Reduce-motion enabled → no orb/dot/scale motion | iOS device or sim with Accessibility → Reduce Motion ON | Visual: instant logo reveal, no orbs pulsing |
| 8.6 | AC-6: `_layout.tsx` auth/Convex flow unchanged | iOS sim | Sign out, kill, cold-start → splash → auth screen. Sign in → splash → tabs. |
| 8.7 | AC-7: Verified iOS sim + iOS device + Android emu | all three | Smoke test only |
| 8.8 | AC-8: parkDaddy logo crisp on dark gradient | iOS device | Visual at native resolution |
| 8.9 | AC-9: "Effortless Automation" verbatim | any | Inspect text |

**Validation gate:** All 9 ACs marked complete in the requirements doc's checklist.

**Dependencies:** P6, P7 complete.

**Risks:**
- iOS Reduce Motion only takes effect on app relaunch after toggling. Document this in test notes.

---

## Phase 9 — Cleanup (15 min) — post-merge

**Goal:** Remove dev-only scaffolding.

| # | Task | File | Action |
|---|------|------|--------|
| 9.1 | Delete `app/_splash-test.tsx` | delete | Throwaway test route |
| 9.2 | Confirm `Design_splash_screen/` is still wanted as reference | ask user | If no, `git rm -rf Design_splash_screen/` (large; ~170 KB lockfile + sources) |
| 9.3 | Update `project_status.md` memory with the splash ship date and v3.1.1 → v3.1.2 (or 3.2) version note | edit | Project memory sync |

**Dependencies:** All prior phases merged.

---

## Commit strategy

Per [[feedback_commit_hygiene]] (atomic commits, flag pre-staged work):

1. `feat: add SVG wordmark components for splash` (P1)
2. `feat: add splash background and pulsing dots` (P2)
3. `feat: add splash stage layers` (P3)
4. `feat: add splash state machine orchestrator` (P4)
5. `feat: add useAppReady hook and context` (P5)
6. `feat: integrate animated splash into root layout` (P6) — paired with the asset commit below
7. `chore: add dark splash assets and update app.json` (P7)
8. `chore: bump iOS buildNumber + Android versionCode for splash release` (after P8 passes)
9. `chore: remove splash test scaffolding` (P9)

## Quality gates (must pass before merge)

- [ ] All 9 ACs from `animated-splash-requirements.md` §5 pass
- [ ] No new TypeScript errors (`npx tsc --noEmit`)
- [ ] No new ESLint warnings
- [ ] Tested on iOS sim (cold start)
- [ ] Tested on iOS physical device (cold start, warm start, with Reduce Motion)
- [ ] Tested on Android emulator (cold start)
- [ ] `_splash-test.tsx` deleted
- [ ] `app.json` validates via `npx expo config --type prebuild`
- [ ] `useFonts`-dependent screens render without flash when splash hides
- [ ] WhatsNewSheet still triggers correctly on first launch of new version
- [ ] No Sentry `splash_appReady_timeout` events in dev (would indicate readiness hook is broken)

## Open coordination items

- **No coordination needed** — single-developer feature, no schema/migration, no backend changes. Safe to land before or after the pending Google Play submission and 24h parkeaz test (from `project_status.md`).

## Rollback plan

Splash is purely presentational. If it ships broken:

1. Revert the `_layout.tsx` integration commit (P6) — single revert restores old splash behavior.
2. Asset/app.json commits (P7) can be reverted independently to restore old native splash.
3. The component files (P1-P5) are dormant once `<AnimatedSplash />` is removed from the tree — no need to revert them.

Worst-case revert: `git revert <P6-sha>` ships a working v3.1.x within minutes.

---

**Next step:** `/sc:implement` to execute Phase 0 onward.
