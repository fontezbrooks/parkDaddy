# Google Play — First Production Submission

**App:** parkDaddy `com.parkdaddy.app` · **Version:** 3.2.0 (versionCode 3) · **Account:** organization (no closed-test gate)
**Prepared:** 2026-09-28. Everything below is derived from the repo and the Play Console's own forms. Where a value is a judgment call it says so.

## 3.3.0 release notes

Renewals now take one tap. ParkEaz added a human check; parkDaddy pings you before each 2-hour window ends.

Note: the production AAB (versionCode 4) must be rebuilt from this branch's final commit before upload; the build referenced below predates 3.3.0.

## 0. What is already done

| Item | Where |
|------|-------|
| Android runtime verified on device (icon, Google SSO warm + cold path) | PR #4, merged `6e24ed0` |
| Store copy: short + full description | `docs/store-listing.md` → Google Play section |
| Data safety answers, importable | `docs/data_safety_import.csv` (this doc §3.7) |
| 512×512 icon, 1024×500 feature graphic | `docs/play-assets/` |
| Privacy policy, public | https://fontezbrooks.github.io/parkDaddy |
| In-app account deletion | Settings → Delete my account (`convex/users.ts` `deleteAccount`) |
| Production AAB | EAS build `67c4c1a6`, profile production, versionCode 3 (in progress at time of writing) |

## 1. Before you open the Console

1. **Wait for the production build to finish**, then download the `.aab` from the EAS build page (or `eas build:list --platform android`). Confirm the build page shows `versionCode 3`. Do not upload a preview APK; the production track needs an AAB.
2. **Screenshots (the only asset you still have to make).** Minimum 2 phone screenshots, PNG or JPG, 16:9 or 9:16, each side between 320 and 3840 px. Take them on the Android device from the production or preview build:
   ```
   adb exec-out screencap -p > docs/play-assets/screen-1-home.png
   ```
   Suggested set: home with live countdown, start-parking form, history, settings. iOS-framed screenshots are rejected.
3. **Test account for reviewers.** Every screen sits behind login, so Play requires credentials (§3.1). Create a dedicated email+password account now, complete profile setup, and do not delete it while the app is under review.
4. **Commit the working tree.** `app.json` currently has an uncommitted `versionCode: 3` written by EAS auto-increment. Commit it together with `docs/play-assets/`, the CSV, and this doc so the repo matches the store build.

## 2. Console: create the app

Play Console → All apps → **Create app**.

| Field | Value |
|-------|-------|
| App name | parkDaddy |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free (cannot be changed later) |
| Declarations | tick both policy checkboxes |

Then work through the **Dashboard → "Set up your app"** checklist. Each row below is one item in that list, in the order the Console shows them.

## 3. Dashboard tasks (App content)

### 3.1 App access
- Select **"All or some functionality is restricted"**.
- Add instruction set:
  - Name: `Reviewer login`
  - Username / password: the test account from §1.3
  - Any other information (paste):
    > Sign in with the email/password above (Google sign-in also works but needs a Google account). After sign-in you may be asked for first name, last name, phone; any values work. The app registers guest parking at one specific apartment building in Atlanta, GA through the property's parking vendor. Starting a session sends a real registration to that vendor, so please review the flow without starting a session, or stop it immediately after. All other screens (history, settings, notifications, account deletion) are fully reviewable.

### 3.2 Ads
- **No**, the app does not contain ads. (No ad SDKs in `package.json`.)

### 3.3 Content rating
Start questionnaire → email address → category **Utility, Productivity, Communication, or Other**. Answer **No** to every question (violence, sexuality, language, controlled substances, gambling, user interaction / user-generated content, sharing location, purchases). Expected result: **Everyone** (ESRB), PEGI 3, and equivalents. "Does the app allow users to interact or exchange content with other users?" is **No**; sessions are private to the account.

### 3.4 Target audience and content
- Target age group: **18 and over** only. Choosing any group under 18 triggers the Families policy and a stricter data-safety review. The app is for apartment residents managing guest parking.
- "Could your store listing unintentionally appeal to children?" → **No**.

### 3.5 News apps
- **No**.

### 3.6 COVID-19 contact tracing and status apps
- Not a contact tracing or status app.

### 3.7 Data safety
Do **not** fill the form by hand. Data safety → **Import from CSV** → upload `docs/data_safety_import.csv`. Then open each section once and confirm the summary reads as below before saving:

| Section | Expected after import |
|---------|----------------------|
| Overview | Collects data: yes · Encrypted in transit: yes · Users can request deletion: yes · Deletion URL: privacy policy |
| Account creation | Username and password · OAuth |
| Personal info | Name, Email, User IDs, Phone, Other info (vehicle plate, make/model, colour) — collected, not shared, required |
| App info and performance | Crash logs, Diagnostics — collected, analytics |
| App activity | App interactions (Sentry session replay), Other actions (parking sessions) — collected |
| Device or other IDs | collected, app functionality + analytics |
| Everything else | not collected |

**Judgment call, recorded so you can flip it:** name, email, phone and plate are sent to ParkEaz to register the guest. The CSV declares these as *collected, not shared*, relying on Google's exemption for data transferred "based on a specific user-initiated action, where the user reasonably expects the data to be shared". The user taps Start Parking to register with the building's parking system, and privacy policy §4 says so explicitly. To be conservative instead, set `PSL_DATA_USAGE_ONLY_SHARED` to `true` and `DATA_USAGE_SHARING_PURPOSE / PSL_APP_FUNCTIONALITY` to `true` for `PSL_NAME`, `PSL_EMAIL`, `PSL_PHONE`, `PSL_OTHER_PERSONAL` in the CSV and re-import. The listing will then show "Data shared with third parties".

Why the other answers are what they are:
- **Email purpose includes Developer communications** because Clerk sends verification emails on the developer's behalf.
- **Crash logs / Diagnostics / App interactions** come from Sentry (`sendDefaultPii: true`, logs on, 10 % session replay, 100 % replay on error). Purpose **Analytics** is Google's bucket for "diagnose and fix bugs or crashes".
- **Device or other IDs** = Expo push token stored in Convex `pushTokens`, plus Sentry's installation id.
- **All collected types are marked required** because there is no opt-out inside the app for any of them.
- **Family policy question left blank** because target audience is 18+.
- **Independent security review (MASA):** no.

### 3.8 Government apps
- **No**.

### 3.9 Financial features
- **No financial features** (no payments, no loans, no crypto). Tick "My app doesn't provide any financial features".

### 3.10 Health
- **No health features**.

### 3.11 Privacy policy
- URL: `https://fontezbrooks.github.io/parkDaddy`
- The same URL is used for the account-deletion link inside the data safety form. Google checks that the linked page describes how to delete an account; §7 of the policy names both the in-app path (Settings → Delete my account) and the email fallback.

## 4. Store presence

### 4.1 Store settings
| Field | Value |
|-------|-------|
| App category | Tools |
| Tags | Parking, Utilities (pick from the list, max 5) |
| Contact email | `fontez0622@gmail.com` (public on the listing) |
| Website | `https://fontezbrooks.github.io/parkDaddy` |
| External marketing | leave on |

### 4.2 Main store listing
| Field | Source |
|-------|--------|
| App name | parkDaddy |
| Short description (80 max) | `docs/store-listing.md` → Google Play → Short Description (66 chars) |
| Full description (4000 max) | `docs/store-listing.md` → Google Play → Full Description |
| App icon 512×512 | `docs/play-assets/icon-512.png` |
| Feature graphic 1024×500 | `docs/play-assets/feature-graphic-1024x500.png` |
| Phone screenshots | from §1.2, upload 2–8 |
| 7-inch / 10-inch tablet | skip; `supportsTablet` is false and Play only requires them if you opt into tablets |

## 5. Release to Production

Production → **Create new release**.

1. **App integrity → Play App Signing:** accept. EAS manages the upload key; Google holds the app signing key. Nothing to configure.
2. **App bundles:** upload the `.aab` from §1.1. The Console reads version 3.2.0 (3) from the bundle.
3. **Release name:** `3.2.0 (3)`.
4. **Release notes** (en-US), paste:
   ```
   <en-US>
   First Android release of parkDaddy.
   • Auto-renews guest parking at Ponce Springs Lofts until your chosen time is up
   • Daily and Extended Stay modes
   • Expiry warning notification 15 minutes before a session ends, with one-tap extend
   • Save vehicles for one-tap future sessions
   • Sign in with Google or email
   </en-US>
   ```
5. **Countries / regions:** United States only. The app only works at one Atlanta property.
6. **Review release → Start rollout to Production.** Ignore warnings about missing tablet screenshots and "no deobfuscation file" (Hermes bytecode, no ProGuard mapping needed). Errors block; warnings do not.

First review for a brand-new organization account commonly takes 3–7 days, sometimes longer. Status is shown on the Publishing overview page.

## 6. After you press rollout

- **Sentry:** confirm an Android event arrives tagged `release: com.parkdaddy.app@3.2.0+3`. If nothing shows within a day of install, check that the Sentry Expo plugin uploaded source maps for the production build.
- **Play Console → Vitals:** watch ANR and crash rate for the first week.
- **`eas submit` for next time.** Create a service-account JSON in Google Cloud, grant it Release Manager in Play Console → Users and permissions, then uncomment the `android` block in `eas.json` `submit.production` with `serviceAccountKeyPath` and `track: "production"`. From release 2 on, `eas submit -p android` replaces the manual upload.
- **Known follow-ups already tracked** in `.claude/plans/google-play-first-release-requirements.md`: hide the Apple button on Android (FR-3), verify the `POST_NOTIFICATIONS` prompt on Android 13+ (FR-4), notification small icon is full-colour `icon.png` and will render as a flat blob in the status bar (FR-4).

## 7. Common first-submission rejections and how this app avoids them

| Rejection reason | Status |
|------------------|--------|
| Login required, no credentials provided | §3.1 test account |
| Account creation without account deletion path | in-app deletion + URL in data safety + privacy §7 |
| Data safety form contradicts observed SDK behaviour (Sentry, Clerk) | CSV declares crash logs, diagnostics, interactions, device IDs |
| Privacy policy URL not reachable or not linked in-app | public GitHub Pages URL; linked from sign-up screen |
| Screenshots from another platform | take on Android per §1.2 |
| Feature graphic missing | `docs/play-assets/feature-graphic-1024x500.png` |
| Target audience includes children without Families compliance | 18+ only |
