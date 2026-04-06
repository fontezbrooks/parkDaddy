# parkDaddy iOS App Store Submission Guide

> Step-by-step checklist to go from dev build to App Store submission.
> Scope: iOS only. Google Play deferred.

---

## Prerequisites

- [x] Apple Developer account (enrolled, $99/year paid)
- [x] EAS CLI installed (`npm install -g eas-cli`)
- [x] EAS development build successful
- [x] App icon 1024x1024 (`assets/parkDaddyIcon.png`)
- [x] Privacy policy page (`docs/index.html`)
- [x] Store listing copy (`docs/store-listing.md`)
- [ ] Privacy policy hosted at a public URL (see Step 1)

---

## Step 1: Host Your Privacy Policy

Apple requires a **live URL** for your privacy policy before you can submit.

**Option A: GitHub Pages (free, easiest)**
1. Go to your repo on GitHub > Settings > Pages
2. Source: Deploy from branch `main`, folder `/docs`
3. Save. Your privacy policy will be live at:
   `https://fontezbrooks.github.io/parkDaddy/` (or whatever your GitHub username/repo is)
4. Verify the page loads in a browser

**Option B: Any static host** — Vercel, Netlify, or your own domain. Just needs to be a stable URL.

Write down this URL. You'll need it for App Store Connect.

---

## Step 2: App Store Connect Setup

This is where you create your app listing and get the IDs needed for `eas.json`.

### 2a. Find Your Apple Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Scroll down to **Membership Details**
3. Copy your **Team ID** (10-character alphanumeric string, e.g., `ABC1234DEF`)

### 2b. Create the App in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **My Apps** > **+** (blue plus button) > **New App**
3. Fill in:
   - **Platforms**: iOS
   - **Name**: `parkDaddy`
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.parkdaddy.app` from the dropdown
     - If it doesn't appear, register it first at developer.apple.com > Account > Identifiers > **+** > App IDs > App > Bundle ID: `com.parkdaddy.app`
   - **SKU**: `parkdaddy-ios-v1` (any unique string, internal use only)
   - **User Access**: Full Access
4. Click **Create**

### 2c. Get Your App Store Connect App ID (ascAppId)

1. After creating the app, you'll land on the app page
2. Look at the URL in your browser — it will look like:
   `https://appstoreconnect.apple.com/apps/1234567890/...`
3. That number (`1234567890`) is your **ascAppId**
4. Alternative: Go to **App Information** in the left sidebar, look for **Apple ID**

### 2d. Fill in App Store Listing

In App Store Connect, go to your app > **App Store** tab > **1.0 Prepare for Submission**:

**App Information (left sidebar):**
- **Category**: Utilities
- **Content Rights**: "This app does not contain, show, or access third-party content"
- **Age Rating**: Click "Edit" and answer all questions "No" — you'll get 4+

**Pricing and Availability:**
- Price: Free
- Availability: All territories (or just United States if you prefer)

**1.0 Prepare for Submission:**
- **Screenshots**: (see Step 7 below)
- **Description**: Copy from `docs/store-listing.md` (the iOS description)
- **Keywords**: `parking,guest parking,auto renew,ponce springs,atlanta,parking timer,apartment parking,lofts`
- **Promotional Text**: Copy from store-listing.md
- **Support URL**: Your GitHub repo URL or a contact page
- **Marketing URL**: Optional, can leave blank
- **Privacy Policy URL**: The URL from Step 1

**App Review Information:**
- **Contact Info**: Your name, email, phone
- **Demo Account**: This is CRITICAL. You must provide:
  - A working phone number or email that App Review can use to sign in via Clerk
  - Notes explaining what the app does and that it's built for a specific apartment complex
  - If your app requires being at a specific location or having specific access, explain this clearly
- **Notes for Review**: Something like:
  > "parkDaddy automates guest parking registration at Ponce Springs Lofts in Atlanta, GA. The app communicates with the ParkEaz parking system API to register and renew guest parking sessions. To test: sign in, tap Start Parking, enter any license plate (e.g., TEST123), and select a duration. The app will attempt to register with the parking system. Note: successful registration requires valid zone/guest codes for the Ponce Springs Lofts parking system."

### Gotchas

- **Bundle ID must be registered first.** If it's not in the dropdown when creating the app, register it at developer.apple.com > Identifiers before creating the app in App Store Connect.
- **Name conflicts.** If "parkDaddy" is taken on the App Store, you'll need a different display name. The bundle ID can stay the same.
- **ascAppId is NOT your Team ID.** They're different numbers. Team ID is from your developer account membership page. ascAppId is from App Store Connect after creating the app.
- **Screenshots are required.** You cannot submit without at least one set. See Step 7.
- **Review notes matter.** If the reviewer can't figure out how to use the app, they'll reject it. Be explicit.
- **Login flow.** If you use Clerk with phone/email OTP, the reviewer needs to actually receive the code. Make sure your Clerk production instance is working before submitting.

---

## Step 3: Clerk Production Setup

Your Clerk instance is currently in development mode (`pk_test_...`). Production mode is required for App Store.

### 3a. Switch Clerk to Production

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Select your `parkDaddy` application
3. In the left sidebar, look for the **Development/Production** toggle or go to **Settings** > **Instances**
4. Click **Enable Production** (or create a production instance)
5. Clerk will walk you through:
   - Verifying your application name
   - Optionally setting up a custom domain (not required — you can use Clerk's shared domain)
   - Confirming your auth settings carry over

### 3b. Get Production Keys

1. After switching, go to **API Keys** in the Clerk dashboard
2. Copy:
   - **Publishable Key**: Will start with `pk_live_...` (not `pk_test_`)
   - **JWT Issuer Domain**: Will be something like `https://your-app.clerk.accounts.com` (note: `.com` not `.dev`)
3. Keep these values — you'll need them for your env files and Convex

### 3c. Verify Auth Methods

1. In the Clerk production dashboard, go to **User & Authentication** > **Email, Phone, Username**
2. Confirm the same sign-in methods you use in dev are enabled in production
3. If you use phone OTP: make sure SMS is enabled and your Clerk plan supports production SMS

### Gotchas

- **Production Clerk is a separate instance.** Your dev users won't exist in production. You'll need to create new accounts.
- **SMS costs.** If you use phone-based auth, Clerk charges for SMS in production. Check your plan limits.
- **Can't switch back easily.** Once in production, switching back to dev creates a new dev instance. Your keys change permanently.
- **Custom domain is optional** but recommended for branding. Without it, your JWT issuer will be on `clerk.accounts.com`.

---

## Step 4: Convex Production Deployment

Your Convex backend is currently dev (`dev:tidy-seal-196`). You need a production deployment.

### 4a. Create Production Deployment

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev)
2. Select your project (`backend` in team `fontez`)
3. You should see your dev deployment. Look for a **Production** tab or **Deploy to Production** option
4. If there's no production deployment yet, run:
   ```bash
   npx convex deploy --prod
   ```
   This creates the production deployment and pushes all your functions to it.

### 4b. Set Environment Variables on Production

In the Convex dashboard, switch to the **Production** deployment, then go to **Settings** > **Environment Variables**. Set:

| Variable | Value | Notes |
|----------|-------|-------|
| `CLERK_JWT_ISSUER_DOMAIN` | `https://your-app.clerk.accounts.com` | From Clerk production (Step 3b) |
| Any ParkEaz API secrets | Same as dev unless separate env | Check what your dev deployment has |
| Any other server-side env vars | Copy from dev deployment | Check Settings > Env Vars on dev |

Check what env vars your dev deployment has and replicate them all on production.

### 4c. Note Production URLs

After deploying, your production Convex will have new URLs:
- **Convex URL**: Something like `https://your-prod-slug.convex.cloud`
- **Site URL**: `https://your-prod-slug.convex.site`
- **Deployment name**: `prod:some-name` instead of `dev:tidy-seal-196`

Copy these — you'll need them for your env files.

### 4d. Verify Functions Deployed

```bash
npx convex dashboard --prod
```

Check that:
- All functions are listed (sessions, parkeaz, renewal, notifications, crons, cronHandlers, etc.)
- Cron jobs are scheduled
- Schema is deployed

### Gotchas

- **Production data is separate.** No data from dev carries over. Production starts empty.
- **Cron jobs run immediately.** If you have crons that call external APIs (like ParkEaz), they'll start running as soon as you deploy. Make sure this is intentional.
- **Environment variables are per-deployment.** Setting them on dev doesn't set them on prod. You must set each one manually.
- **`convex deploy --prod` pushes your current local code.** Make sure your local code is the version you want in production.
- **Auth config is code-driven.** Your `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN` from env vars, so as long as you set the production Clerk domain as an env var on the Convex production deployment, it will work without code changes.

---

## Step 5: Push Notifications (APNs)

Expo notifications require an APNs key for iOS production push.

### 5a. Create an APNs Key

1. Go to [developer.apple.com/account/resources/authkeys](https://developer.apple.com/account/resources/authkeys)
2. Click **+** to create a new key
3. Name it: `parkDaddy Push Key`
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** > **Register**
6. **Download the .p8 file immediately** — Apple only lets you download it once!
7. Note the **Key ID** shown on screen (10-character string)

### 5b. Upload to EAS

```bash
eas credentials
```

1. Select **iOS**
2. Select **production** profile
3. Choose **Push Notifications** > **Set up Push Notifications Key**
4. Select **Upload a key**
5. Provide:
   - Path to the `.p8` file you downloaded
   - Key ID (from step 5a)
   - Team ID (from Step 2a)

Alternatively, when you run `eas build --platform ios --profile production`, EAS may prompt you to set up push credentials automatically. If you let EAS manage it, it can generate the key for you.

### 5c. Verify

```bash
eas credentials --platform ios
```

You should see your push key listed under the production profile.

### Gotchas

- **You can only have 2 APNs keys per Apple Developer account.** Don't create extras carelessly.
- **The .p8 file can only be downloaded once.** Store it securely (password manager, encrypted drive). If you lose it, revoke and create a new one.
- **EAS can auto-manage this.** If you're unsure, let EAS handle credentials during the build — it will prompt you.

---

## Step 6: Update App Configuration

Once you have all the production values, update these files:

### 6a. Update `eas.json`

Replace the placeholder values:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "fontez0622@gmail.com",
      "ascAppId": "YOUR_ACTUAL_APP_ID_FROM_STEP_2C",
      "appleTeamId": "YOUR_ACTUAL_TEAM_ID_FROM_STEP_2A"
    }
  }
}
```

### 6b. Update App Icon in `app.json`

Change icon references to point to new assets:
- `"icon"` -> `"./assets/parkDaddyIcon.png"`
- `"splash.image"` -> `"./assets/parkDaddyIcon-nobackground.png"` (or keep current if preferred)
- `expo-notifications` plugin icon -> `"./assets/parkDaddyIcon.png"`

### 6c. Update Environment Variables for Production

**Recommended approach: Use EAS Secrets** so your local `.env` stays pointed at dev:

```bash
eas secret:create --name EXPO_PUBLIC_CONVEX_URL --value "https://YOUR-PROD-SLUG.convex.cloud" --scope project
eas secret:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_XXXXX" --scope project
```

EAS builds will pick these up automatically, overriding local `.env` values. Your local dev environment stays unchanged.

**Alternative: Direct `.env` editing** (less safe, easier to mess up dev):
```bash
EXPO_PUBLIC_CONVEX_URL=https://YOUR-PROD-SLUG.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_XXXXX
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.com
CONVEX_DEPLOYMENT=prod:YOUR-PROD-SLUG
```

---

## Step 7: Screenshots

Apple requires screenshots for at least one device size. Recommended: provide for all required sizes.

**Required sizes (at minimum one set):**
- **6.7" Display** (iPhone 15 Pro Max / 16 Pro Max): 1290 x 2796 px
- **6.5" Display** (iPhone 11 Pro Max): 1284 x 2778 px
- **5.5" Display** (iPhone 8 Plus): 1242 x 2208 px

**How to capture:**
1. Run your app in the iOS Simulator
2. Select the right device (e.g., iPhone 15 Pro Max for 6.7")
3. Press **Cmd+S** in the Simulator to save a screenshot
4. Capture these screens:
   - **Welcome/Sign-in screen** — shows the app brand
   - **Home screen with active session** — countdown timer, status
   - **Start Parking flow** — plate entry + duration selection
   - **Session history** — shows past sessions
5. Screenshots land on your Desktop by default

**Alternative:** Design marketing screenshots in Figma/Canva with device frames and captions.

**Tip:** 6.7" screenshots can be reused for 6.5" — App Store Connect will auto-scale down.

---

## Step 8: Production Build

Once Steps 1-7 are complete:

```bash
eas build --platform ios --profile production
```

EAS will:
- Prompt for signing credentials if not already set up (distribution certificate, provisioning profile)
- Let EAS manage these automatically — select **"Let Expo handle it"** when prompted
- Build the `.ipa` file on EAS servers
- Give you a URL to download or submit

Build typically takes 10-20 minutes.

---

## Step 9: Submit to App Store

```bash
eas submit --platform ios --profile production --latest
```

EAS will:
- Use the `ascAppId` and `appleTeamId` from `eas.json`
- Upload the `.ipa` to App Store Connect
- You may need an **App-Specific Password**:
  1. Go to [appleid.apple.com](https://appleid.apple.com) > Sign-In and Security > App-Specific Passwords
  2. Generate one, name it "EAS Submit"
  3. EAS will prompt you for it

After submission:
1. Go to App Store Connect > your app > **TestFlight** tab
2. Build should appear (may take 10-30 minutes for processing)
3. Once processed, go to **App Store** tab > **1.0 Prepare for Submission**
4. Select the build under the **Build** section
5. Verify all metadata is complete
6. Click **Submit for Review**

---

## Step 10: App Review

**Timeline:** Typically 24-48 hours, sometimes same day, sometimes up to a week.

**Common rejection reasons for apps like parkDaddy:**

1. **Guideline 4.2 - Minimum Functionality**: Apple may say the app is too simple or could be a website. Counter: explain the automated server-side renewal is the core value, plus native push notifications and secure credential storage.
2. **Guideline 4.3 - Spam**: If they think it's too niche. Counter: it solves a real, specific problem for a defined user base.
3. **Guideline 5.1.1 - Data Collection**: Make sure your privacy policy matches what you actually collect (phone number, license plates). Be truthful in the App Privacy questionnaire.
4. **Login issues**: If the reviewer can't sign in, instant rejection. Test your Clerk production auth before submitting.

**If rejected:**
- Read the rejection reason carefully in the Resolution Center
- Fix the issue
- Resubmit (you don't need a new build for metadata-only changes)
- Reply in Resolution Center if you think the rejection is wrong — be polite and specific

---

## Execution Order Summary

Do these in order — each depends on the previous:

| # | Step | Produces |
|---|------|----------|
| 1 | Host privacy policy | Public URL |
| 2 | App Store Connect setup | ascAppId, appleTeamId |
| 3 | Clerk production | pk_live key, JWT issuer domain |
| 4 | Convex production | Production URLs, deployed functions |
| 5 | APNs setup | Push notification credentials in EAS |
| 6 | Update config files | eas.json, app.json, env vars |
| 7 | Screenshots | Image files for App Store listing |
| 8 | Production build | .ipa on EAS |
| 9 | Submit | Build in App Store Connect |
| 10 | App Review | Approval or feedback |

---

## Quick Reference: Values You'll Collect

| Value | Where to get it | Where it goes |
|-------|----------------|---------------|
| Apple Team ID | developer.apple.com > Membership | `eas.json` > `appleTeamId` |
| ASC App ID | App Store Connect URL or App Information | `eas.json` > `ascAppId` |
| Clerk Publishable Key (prod) | Clerk Dashboard > API Keys | EAS Secrets |
| Clerk JWT Issuer Domain (prod) | Clerk Dashboard > API Keys | Convex prod env vars |
| Convex Prod URL | Convex Dashboard after deploy | EAS Secrets |
| Convex Prod Deployment Name | Convex Dashboard | `.env.local` |
| APNs Key (.p8 file) | developer.apple.com > Keys | EAS credentials |
| APNs Key ID | developer.apple.com > Keys | EAS credentials |
| Privacy Policy URL | Your hosted page | App Store Connect |
| App-Specific Password | appleid.apple.com | EAS submit prompt |
