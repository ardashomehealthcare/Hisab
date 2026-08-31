# Google Cloud Console — step-by-step for Hisab (with direct links)

Every link below opens the exact console page. **One thing to do first:** the links
carry a `?project=` parameter, and Google needs *your* project ID there (not the
project *number*). Get it once in Step 0 and paste it into the links.

Values used by this app (from `config.js` — do not retype them, copy them):

| What | Value |
|---|---|
| Web address Google must allow (origin) | `https://ardashomehealthcare.github.io` |
| OAuth Client ID | `663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com` |
| Project **number** (prefix of the Client ID) | `663319983266` |
| Scope the app asks for | `https://www.googleapis.com/auth/spreadsheets` |
| Spreadsheet ID | `1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY` |

> **Got `Error 403: access_denied`?** Google already accepted the Client ID and the
> web address — it refused the **Google account**. Go straight to **Step 3**.

---

## Step 0 — Find the project and copy its Project ID

**Open:** <https://console.cloud.google.com/cloud-resource-manager>

1. Sign in with the Google account that created the Hisab project.
2. Find the row whose **Number** is `663319983266`. That is the project that owns
   your Client ID — every other step must happen in *that* project.
3. Copy the value in the **ID** column (something like `hisab-482913`).
4. Replace `PROJECT_ID` in every link below with it.

If you have only one project, the links work as they are — Google picks it for you.

---

## Step 1 — Enable the Google Sheets API

**Open:** <https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=PROJECT_ID>

Press **Enable**. (If the button says **Manage**, it is already on — nothing to do.)
Without this the sign-in succeeds but every read/write fails with
*"Google Sheets API has not been used in project…"*.

---

## Step 2 — Open the consent screen (it is now called “Google Auth Platform”)

**Open:** <https://console.cloud.google.com/auth/overview?project=PROJECT_ID>

- Since 2024 Google moved the **OAuth consent screen** here. The old menu item is
  gone; the settings are split into **Overview / Branding / Audience / Data access /
  Clients**.
- Branding page: <https://console.cloud.google.com/auth/branding?project=PROJECT_ID>
  — set **App name** to `Hisab` and pick a **User support email**. The app name is
  what the partners see on the “Hisab wants access to your Google Sheets” screen.
  Do not put the word “Google” in the app name (Google rejects it).
- If the page says **Google Auth Platform is not configured**, press **Get started**
  and work through the 4-step wizard. **Audience** is the only real decision — see
  Step 3.

---

## Step 3 — Audience: this is what fixes `403: access_denied`

**Open:** <https://console.cloud.google.com/auth/audience?project=PROJECT_ID>

Check three things on this page:

1. **User type**
   - **Internal** → only Google accounts *inside your Workspace organisation* can
     ever sign in. A personal `@gmail.com` is refused — that alone produces
     `403: access_denied`. Use this only if every partner has a work address.
   - **External** → any Google account can sign in, **but** the app starts in
     Testing mode (see 2). For a mixed team of personal Gmail accounts, choose this.
2. **Publishing status**
   - **Testing** → only accounts on the **Test users** list below may sign in;
     everyone else gets exactly the error you saw. Press **Add users** and add
     **every** partner's Google address (hard limit 100), then **Save**. It takes
     effect immediately.
   - Note: while in Testing, each authorisation **expires after 7 days**, so
     partners re-consent weekly.
   - **Publish app** (“In production”) removes the test-user list and the weekly
     re-consent. Anyone can then sign in; because `spreadsheets` is a *sensitive*
     scope and the app is unverified, they see a “Google hasn't verified this app”
     warning and must press **Advanced → Go to Hisab (unsafe)** → Continue.
     Unverified apps are capped at 100 users for the lifetime of the project —
     fine for a small team, otherwise submit for verification.
3. **Test users** — after adding an address, that person must press
   **Sign in with Google** again in the app and choose **Allow**.

---

## Step 4 — Data access (optional, the scopes shown on consent)

**Open:** <https://console.cloud.google.com/auth/scopes?project=PROJECT_ID>

Optional for this app — the browser requests `https://www.googleapis.com/auth/spreadsheets`
directly. If you want the scope listed: **Add or remove scopes** →
`…/auth/spreadsheets` → **Update**. Do **not** add Drive/Gmail scopes; Hisab never
asks for them and they trigger Google's verification process.

---

## Step 5 — Clients: the OAuth client and the allowed web address

**Open:** <https://console.cloud.google.com/auth/clients?project=PROJECT_ID>
(fallback if that link does not open: <https://console.cloud.google.com/apis/credentials?project=PROJECT_ID>)

1. Find the row whose **Client ID** is
   `663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com` and
   confirm its **Type** is **Web application**. Android/iOS/Desktop clients are
   refused by browser sign-in (`unauthorized_client`).
2. Open it and check **Authorised JavaScript origins** contains exactly:

   ```
   https://ardashomehealthcare.github.io
   ```

   No trailing slash, no path, no `http://`. Add `http://localhost:8000` too if you
   test locally. A missing entry gives `origin_mismatch`; a wrong Client ID gives
   `401: invalid_client`. **Save.**
3. If you had to create a new client: **Create client → Web application**, add the
   origin, **Create**, then copy the new **Client ID** (never the secret — it starts
   with `GOCSPX-` and this app never needs it) and put it in `config.js`:

   ```js
   window.HISAB_GOOGLE_CLIENT_ID = '…new id….apps.googleusercontent.com';
   ```

   Then bump the version on the `<script src="config.js?v=3">` line in `index.html`
   so every phone is forced to fetch the new file.

---

## Step 6 — Workspace admins only: allow the client for the organisation

**Open:** <https://admin.google.com/ac/owl> (third-party app access)

If **Security → Access and data control → API controls → App access control** is set
to *Trust only apps from your domain* / “only trusted Google OAuth clients”, the
client is refused for **everyone** in the organisation — `403: access_denied` no
matter what Step 3 says. Fix: **Configure new app** → paste the Client ID
`663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com` →
scope **All users** (or the OU that contains the partners) → mark **Trusted** →
**Save**. Changes can take up to 24 h, usually much less.

---

## Step 7 — Back in the app

1. Open <https://ardashomehealthcare.github.io> → **Google Sheet** tab.
2. **🔐 Sign in with Google** → pick the account you just allowed → **Allow**
   (pressing **Cancel** produces the same `403: access_denied`).
3. **🩺 Check my Google setup** → **📋 Copy report** if anything still fails: it
   prints the origin, the Client ID in use, the last Google error and the fix.
4. Each partner repeats step 2 with their own account, and each needs **Editor**
   access on the Sheet:
   <https://docs.google.com/spreadsheets/d/1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY/edit>

---

## If you signed in but no Sheet appeared in Drive

**Hisab never creates a Google Sheet.** Google's Sheets API has no "create file"
call — it can only add tabs to a file that already exists. So a successful sign-in
creates the 5 **tabs** (*Employees, DutyLeave, EmployeePayments, ClientReceipts,
Expenses*) inside the Sheet named by `HISAB_SPREADSHEET_ID`, and nothing else.

If no tabs appeared, one of these is true:

1. **That ID is not a Sheet you can open.** Check
   <https://docs.google.com/spreadsheets/d/1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY/edit>
   — "you need access" or "does not exist" means case 2 or 3.
2. **You want your own Sheet.** Open <https://sheet.new> (makes an empty Sheet),
   copy the address from the browser bar, paste it into the app's **Google Sheet to
   write into** box → **💾 Use this Sheet** → **🔐 Sign in with Google**. The 5 tabs
   appear in it straight away. That fixes this phone only — put the same ID in
   `config.js` as `HISAB_SPREADSHEET_ID` when the whole team should share it.
3. **The Sheet belongs to another account.** With *that* account: **Share** → add the
   address you sign in with → role **Editor**. Then sign in again.

The app says which case you are in. After sign-in it reports either *"✅ Signed in —
every submit now goes straight to your Google Sheet"* or *"⚠ Signed in — but the
Sheet itself is not reachable: …"* with the numbered fix underneath.

---

## Which error → which step

| Google says | Fix in |
|---|---|
| `403: access_denied` / “The developer hasn't given you access to this app” | Step 3 (Audience) — or Step 6 for a Workspace-managed domain |
| `401: invalid_client` | Step 5 — the Client ID does not exist / was cut short / is the secret |
| `400: origin_mismatch` | Step 5.2 — the web address is not in Authorised JavaScript origins |
| `400: unauthorized_client` | Step 5.1 — that client is not a Web application client |
| “Google Sheets API has not been used in project …” | Step 1 |
| “The caller does not have permission” (403 from Sheets) | Step 7.4 — share the Sheet as **Editor** with that account |
| Sign-in works but no Sheet / no tabs anywhere | Nothing to fix in Cloud Console: Hisab cannot create a Sheet *file*, and the ID it was given is wrong or not shared | The section above — 🆕 New empty Sheet → paste it in the app's **Google Sheet to write into** box → sign in again |
