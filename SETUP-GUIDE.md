# Hisab — Google setup guide (start here)

*Plain-language setup and fixes for the Google sign-in. The full click-by-click Cloud
Console walkthrough, with a deep link to every page, is in
[SETUP-GOOGLE-CONSOLE.md](SETUP-GOOGLE-CONSOLE.md).*

Written for the people who actually have to fix the sign-in, in plain language, with
the exact link for every page. Nothing here needs a developer.

- The app: <https://ardashomehealthcare.github.io>
- Troubleshooting inside the app: **Google Sheet** tab → **🩺 Check my Google setup** → **📋 Copy report**. Send that text to whoever manages the Google account; it already contains the address, the Client ID and the exact fix.

---

## A. If sign-in says `Error 403: access_denied`

Google **recognised** the app and this web address. What it refused is the **Google
account**. So do not touch the app, the Client ID or the address — only the
consent screen.

**Open this:** <https://console.cloud.google.com/auth/audience> *(pick the Hisab
project in the picker at the top if it asks)*

| What you see on that page | What it means | What to press |
|---|---|---|
| **Publishing status: Testing** | Only people on the test list may sign in. Everyone else gets `403: access_denied`. | **Audience → Test users → + Add users** → type each partner's Google address → **Save**. Works immediately, up to 100 people. |
| You would rather not keep a list | Testing also makes everyone re-consent every 7 days. | **Publish app** (status becomes *In production*). The first-time warning “Google hasn't verified this app” is normal — press **Advanced → Go to Hisab (unsafe)** → **Continue**. |
| **User type: Internal** | Only accounts **inside your organisation** can ever sign in. A personal `@gmail.com` always fails. | Either sign in with the work address, or change the user type to **External** and use the test-user list above. |

After any change: back in the app → **🔐 Sign in with Google** → pick the account you
just allowed → press **Allow** (pressing **Cancel** gives this same error).

**Company-managed accounts (Workspace):** if the admin has restricted third-party
apps, nobody in the organisation can sign in no matter what you set above. An admin
fixes it here: <https://admin.google.com/ac/owl> → **Configure new app** → paste the
Client ID `663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com`
→ **All users** → **Trusted** → **Save**.

---

## B. If you signed in but no Google Sheet appeared

**Hisab does not create Google Sheets — it cannot.** Google's Sheets API can only add
tabs to a Sheet that already exists. What sign-in creates is the 5 **tabs**
(*Employees, DutyLeave, EmployeePayments, ClientReceipts, Expenses*) inside the one
Sheet the app is pointed at, and every entry goes into them.

So one of these is true:

1. **You expected a new file in your own Drive.** It will never appear. The tabs are
   created in the shared Sheet that `config.js` names — open it here:
   <https://docs.google.com/spreadsheets/d/1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY/edit>
2. **That Sheet is not shared with the account you signed in with.** Whoever owns it
   must press **Share** → add your address → role **Editor** → Send. Then sign in
   again.
3. **You want a Sheet of your own.** In the app: **Google Sheet** tab → **Google Sheet
   to write into** box → **🆕 New empty Sheet** (that opens `sheet.new`) → copy the
   address from the browser bar → paste it in the box → **💾 Use this Sheet** →
   **🔐 Sign in with Google**. The 5 tabs appear in it at once. That fixes only that
   phone; to share one Sheet with the whole team, ask for the same ID to be put in
   `config.js` as `HISAB_SPREADSHEET_ID`.

The app tells you which case you are in. After sign-in it says either
*“✅ Signed in — every submit now goes straight to your Google Sheet”* or
*“⚠ Signed in — but the Sheet itself is not reachable: …”* with the fix underneath.

Nothing is ever lost while this is unresolved — every entry is saved on the phone and
goes to the Sheet on the next **🔄 Send all saved data to Sheet**.

---

## C. Setting it up from nothing (once, about 10 minutes, one admin)

Replace `PROJECT_ID` in the links with your project's ID (Step 1 tells you where to
find it). If you only have one project, the links work as they are.

| Step | What to do | Open |
|---|---|---|
| 1 | Find the project: the row whose **Number** is `663319983266` is the Hisab project. Copy its **ID**. | <https://console.cloud.google.com/cloud-resource-manager> |
| 2 | **Google Sheets API** → **Enable** (if it says *Manage*, it is already on). | <https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=PROJECT_ID> |
| 3 | Consent screen — now called **Google Auth Platform**. Set **App name** to `Hisab` and a support email. (Do not put the word “Google” in the app name; Google rejects it.) | <https://console.cloud.google.com/auth/branding?project=PROJECT_ID> |
| 4 | **Audience** — user type and test users. See section A. | <https://console.cloud.google.com/auth/audience?project=PROJECT_ID> |
| 5 | **Clients** — check the client `663319983266-4i2d…9il3.apps.googleusercontent.com` is type **Web application** and that **Authorised JavaScript origins** contains exactly `https://ardashomehealthcare.github.io` (no slash, no path). Save. | <https://console.cloud.google.com/auth/clients?project=PROJECT_ID> |
| 6 | The **Client ID** (ends `.apps.googleusercontent.com`) goes in `config.js` as `HISAB_GOOGLE_CLIENT_ID`; the Sheet's long ID goes in as `HISAB_SPREADSHEET_ID`. Both can also be pasted into the app's **Google Sheet** tab to fix one phone at once. | — |
| 7 | On the Sheet: **Share** → add every partner → **Editor**. Then each partner opens the app → **🔐 Sign in with Google** → **Allow**. | <https://docs.google.com/spreadsheets/d/1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY/edit> |

Scopes (optional — the app asks for `https://www.googleapis.com/auth/spreadsheets` by
itself): <https://console.cloud.google.com/auth/scopes?project=PROJECT_ID>
Do **not** add Drive or Gmail scopes; Hisab never asks for them and they trigger
Google's verification process.

---

## D. Which message means what

| You see | It means | Do this |
|---|---|---|
| `Error 403: access_denied` | Google refused the **account**, not the app | Section A |
| Sign-in works, no Sheet anywhere | The app cannot create a Sheet; the ID is wrong or not shared | Section B |
| `Error 401: invalid_client` | Google does not know this Client ID (typo, cut short, it is the secret, or it was deleted) | Step 5 — copy the Client ID with its copy icon |
| `Error 400: origin_mismatch` | The web address is not in **Authorised JavaScript origins** | Step 5 — add `https://ardashomehealthcare.github.io` |
| `Error 400: unauthorized_client` | That Client ID is an Android/iOS/Desktop client | Step 5 — create a **Web application** client |
| “The caller does not have permission” | Your account cannot edit the Sheet | Sheet → **Share** → your address → **Editor** |
| “Requested entity was not found” | That Sheet ID is not a Sheet your account can open | Section B, case 2 or 3 |
| “Google Sheets API has not been used in project …” | The API is not enabled | Step 2 |
| The Google window never opens | In-app browser (WhatsApp/Instagram), cookies or pop-ups blocked | Open the link in Chrome/Safari, allow pop-ups, sign in once |
| It worked yesterday, not today | The phone is running an old cached `config.js` | **🔄 Re-read config.js** in the red box, then sign in again |

---

*If a link above does not open, Google has moved that page again: in Cloud Console use
the menu **APIs & Services → Google Auth Platform** (Branding / Audience / Data access /
Clients). The numbers and IDs on this page are the ones this app is built with.*
