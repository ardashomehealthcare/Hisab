# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser, saves every entry on the device instantly, and also sends
each submit to **your Google Sheet** in its respective tab.

## What it does

| Section | What you enter |
|---|---|
| **Employees** | Name, phone, monthly / per-day wage, wage amount, 24 hr / 12 hr duty — **24 hr: duty start time • 12 hr: ☀️ day or 🌙 night duty** — joining date, client name |
| **Leave Entry** | One form: pick the employee and the leave start (time option appears for 24-hr duty) — a **Substitute box sits right below in the same form**: type any name (new/temporary OK), add a Wage per day if they're not in Employees, and one Submit saves leave + substitute together. Select an employee who is **already on leave** and the same form shows their status, a substitute type bar and the **🤝 Join duty** button (also in the live On-leave card below). On join duty the leave days are totalled automatically (24-hr shifts: 8 AM → next day 8 AM = 1 day, from the substitute's own start time), every substitute's duty **ends automatically** and their **salary is calculated automatically** (daily: rate × days • monthly: wage ÷ days-in-month × days) — record it as paid in one tap; it lands in All Records, Profit/Loss and the salary balance. Running substitute salaries are shown live while they cover |
| **Money Entry** | Client payment received — the client is selected from the client names saved on Employees • **Auto-generated invoice** (invoice #, date, amount + amount-in-words, employee, mode — only client name, address & WhatsApp number are editable; round **PAID stamp** with the company name on the border + date; the bottom line is just **Thank you**; print / save as PDF, and re-print any past invoice from All Records) • **📲 Send on WhatsApp** — the invoice goes as an **image**: **WhatsApp opens directly on their number** — the invoice image is saved to the device and their chat opens with the message typed; just attach the saved picture and send (number saved per client and auto-filled next time — a number saved **without 91** still opens the right chat, the app adds the country code itself; if no number is saved the app asks for it once and remembers it). There is also a **🖼 Save as image** button to keep the PNG anytime • Payment given to employee (with date) • Other expenses — each with its **own Submit button**, **no field is compulsory** |
| **Salary Calculator** | Pick employee + a date range (From → To). **The list has every person on the app**: active employees, employees whose duty ended (marked “— duty ended”), and every substitute / Duty-&-Leave-only person (marked “— not in Employees”) — a substitute is paid from the rate on their own duty rows even with no Employees row; one click takes them to the Employees tab to save the wage permanently (From date auto-fills to their first substitute duty). The From date auto-fills to the employee's **last paid salary** date (or joining date). Shows full employee details, duty/leave days, salary, complete payment history for the range, and balance to pay. Monthly employees: per-day pro-rata (wage ÷ days-in-month × duty days, summed across any months in the range) — a full month with no leave equals full salary. Per-day employees = rate × duty days. Leave days deducted. For 24-hr duty employees a time option appears so days are counted by 24-hour shifts (8 AM → next day 8 AM = 1 day). **Auto-generated salary payment receipt** (same style as the client invoice, with the PAID stamp): receipt #, date, duty & leave details exactly like the copy message, salary, amount paid, balance, amount-in-words — plus an **online payment screenshot** (UPI / bank transfer) attached to the receipt when paid online. Preview first, then print / save as PDF, or **📲 Send on WhatsApp** — the receipt image is saved and WhatsApp opens directly on the employee's saved number (a substitute not in Employees is asked for their number once on the spot — it is remembered for next time — or the share sheet / contact chooser picks the chat), plus **🖼 Save as image**; re-print any past receipt from All Records. |
| **Profit / Loss** | Per calendar month: Received − Employee payments − Expenses, split **50-50 between the two partners** |
| **All Records** | Every saved entry, filter by employee/month, delete entries, download / import JSON backup |

## How it works — every rule in one place

📖 **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)** — the five tables (= the five Sheet tabs), how days and
24-hour shifts are counted, employee / leave / substitute / join-duty / end-duty logic, the salary
calculator step by step, Money Entry, client billing, Profit/Loss, the Google Sheets sync
(push & pull, column-name mapping), the data that ships with the app, and what is stored in the browser.

## Data included in the app

Hisab carries **`data/hisab-data.json`** — the employees, duty & leave rows, employee payments, client receipts and expenses. All app data has been cleared: the file **ships with the five tables empty** — the records are added **from your Google Sheet** (sign in and they are pulled in, or press **⬇ Load from Google Sheet**). It is only the **rows**: the app is not connected to any other spreadsheet, and nothing points at one — `config.js` still names the single Sheet Hisab writes into (`HISAB_SPREADSHEET_ID`).

| File | What it holds |
|---|---|
| `data/hisab-data.json` | The five tables — same columns as the Sheet tabs, **empty**; the Sheet's rows are added after sign-in |

* **The data comes from the Sheet.** Sign in with Google and the Sheet's rows are added on the device (pulled automatically on every start; **⬇ Load from Google Sheet** takes the Sheet as-is). While the file is empty there is nothing bundled to load — a new phone starts clean and fills from the Sheet.
* **On a device that already has data:** *All Records* → **📥 Add the data included in the app**. It shows what is new, asks first, merges, and never deletes anything.
* **Duplicates are skipped** — an employee is matched by name, everything else by person/client + date + amount — so importing twice cannot double the books.
* Added records are marked *not sent yet*, so **🔄 Push app data to Sheet** writes them into your own Sheet when you are ready.
* The file is a plain Hisab backup (the same shape as *⬇ Download backup (JSON)*), so you can also edit it, or import it on a phone with *⬆ Import backup (JSON)*.

> ⚠️ If rows are put back into this file (names, wages, client numbers/addresses): on a **public** GitHub repo they are readable by anyone — keep the repo private or the file empty if the app is public.

## Clearing the app data

The books live in **two** places — **this device** and **your Google Sheet** — so *All Records* → **🗑 Clear app data** opens a dialog that shows how many records are on the device and asks which of the two to empty:

| Choice | What is deleted | What is kept |
|---|---|---|
| **This device only** | Every record, the saved receipt images and the remembered WhatsApp numbers on this device | The whole Google Sheet — **⬇ Load data FROM Sheet** (or **⬆ Import backup**) brings the books back any time |
| **This device *and* the Google Sheet** | The same, **plus** every row inside the five tabs of the Sheet (the tabs keep only their column headings) | Nothing — recoverable only from Google Sheets → **File → Version history** |

* **The Sheet is emptied first.** If Google refuses (not signed in, wrong Sheet, no permission) **nothing is deleted anywhere** and the reason is shown on screen.
* **A cleared device stays cleared.** The wipe leaves a dated note in the browser (`hisabDeviceCleared`) that switches the automatic pull **off**, so the next time the app opens the rows do **not** come back from the Sheet — this is what made the old *Clear all data* look like it had not worked. An amber note on *All Records* and on the *Google Sheet* tab shows the cleared state with two buttons: **⬇ Load data FROM Sheet** (brings the books back and resumes the pull) and **↩ Turn the automatic pull back on** (resumes without loading). An imported backup never switches the pull back on, so nothing overwrites it behind your back.
* **Download a backup first** — the dialog has a **⬇ Download backup first** button that saves all five tables as one JSON file.
* **🔄 Push app data to Sheet** asks before overwriting right after a clear: a push *replaces* the Sheet with the rows this device holds (which, just after a clear, is nothing).

## How to run

Host it anywhere — GitHub Pages works great (sign-in with Google needs a proper `https://` address, so hosting is required for the Sheet sync; opening the file directly still works for on-device saving only).

## Connect Google Sheets — Google OAuth (one time, ~5 min)

The app talks to your Google Sheet **directly from the browser with Google's official OAuth sign-in** — there is no shared URL to hand out, nothing to host, and no "Anyone with the link" access. Each partner signs in with their own Google account, and Google itself checks that the account may edit the spreadsheet.

The spreadsheet is locked in `config.js`: `HISAB_SPREADSHEET_ID = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY'` — your existing sheet, existing data, existing tabs.

### One-time setup (admin, in Google Cloud Console)

📖 **[SETUP-GUIDE.md](SETUP-GUIDE.md)** — plain-language setup and fixes, organised by the message you saw.
📖 **[SETUP-GOOGLE-CONSOLE.md](SETUP-GOOGLE-CONSOLE.md)** — the same steps with a **direct link to every console page** (project, Sheets API, consent screen, test users, clients, Workspace admin), and the error → step table.

1. Open <https://console.cloud.google.com/cloud-resource-manager> → create (or pick) a project, e.g. *Hisab*; copy its **Project ID**.
2. <https://console.cloud.google.com/apis/library/sheets.googleapis.com> → **Enable** the **Google Sheets API**.
3. <https://console.cloud.google.com/auth/overview> — the consent screen is now **Google Auth Platform** (the old “OAuth consent screen” menu item is gone). In **Audience** (<https://console.cloud.google.com/auth/audience>) pick **Internal** (Google Workspace only — every partner must sign in with a work address) or **External** and add each partner under **Test users**; **Publish app** removes the test-user list.
4. <https://console.cloud.google.com/auth/clients> → **Create client** → **Web application**.
5. **Authorised JavaScript origins** → add the exact origin where the app is served, e.g. `https://ardashomehealthcare.github.io` (add `http://localhost:8000` as well for local testing). Sign-in only works from a listed origin.
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) → paste it into **`config.js`** as `HISAB_GOOGLE_CLIENT_ID` (or into the box in the app's **Google Sheet** tab).
7. Share the Google Sheet with your partner as **Editor**, then in the app → **Google Sheet** tab → **🔐 Sign in with Google** → **Allow**. Done.

The app auto-creates tabs on first sign-in: `Employees`, `DutyLeave`, `EmployeePayments`, `ClientReceipts`, `Expenses` — every submit lands in its respective tab. (DutyLeave also stores open leaves, join-duty dates and substitutes — substitute rows have the covering employee in `empName` and the employee on leave in the `forEmp` column.) Anything already in those tabs is read as-is — no migration needed.

### The records included in the app — column for column

The records file (`data/hisab-data.json`) is simply **the app's own books** — the five tables in
the standard column layout — and it ships **empty**: all app data has been cleared, and the
records are added **from your Google Sheet** after sign-in (the automatic pull on start, or
**⬇ Load from Google Sheet**). Nothing else is kept: **no other spreadsheet, no reference sheet,
no link to any outside Sheet is stored in the app** — it writes only to its own Sheet
(`HISAB_SPREADSHEET_ID` in `config.js`). On the **Google Sheet** tab, **🔄 Push app data to
Sheet** writes the device's rows into the app's own Sheet: same tabs, same columns, same rows
in the same order, starting under row 1's headers.

### The Sheet layout — column for column

This is the **arrangement the app writes into** — the column order of every tab:

* **Reading is by column name.** The app reads the Sheet's own header row every time it loads, so a Sheet that is still in an older arrangement (or that has an extra column of your own) is read correctly, and a single new entry is still appended under the right headings.
* **A row that was written in an older column order is recognised and read that way.** The three arrangements this app has used are known to it (`LEGACY_LAYOUTS`): Employees before the client columns existed, DutyLeave before `wageType` / `wageAmount`, and **ClientReceipts before `clientPhone` moved from the last column to position 3**. A row is spotted by what its cells *are* — a saved-at stamp where a payment mode belongs, a date-only cell where a name belongs — and then read with the arrangement it really holds. This is what puts money received back under **Amount** (instead of under **Date**) and the payment mode back under **Mode** (instead of the saved date) on a Sheet that was written half-way through a column change.
* **Records already on a device repair themselves** at start-up: a receipt that was read while the columns were out of step is put back in its right columns, marked *not sent yet*, and the *Google Sheet* tab says so.
* **Writing it once.** Press **🔄 Push app data to Sheet** (it sits on the *Google Sheet* tab and in *All Records*) one time to rewrite all five tabs in the arrangement below. The **header row and the rows are written in the same order** — always the current arrangement — so a tab can never end up with today's headings over yesterday's rows (that is what makes money appear under Date and the date under Mode). Nothing is lost, because everything was read correctly first. The app tells you on the *Google Sheet* tab when a tab is still in the old arrangement or has rows in an older order.
* If the Sheet does not have a column the app needs at all, the app says which one — it never guesses and never shifts values into the wrong column.

| Tab | Columns (A → …) |
|---|---|
| **Employees** | `id` • `name` • `phone` • `wageType` • `wageAmount` • `dutyHours` • `dutyTime` • `joinDate` • `clientDutyStartDate` • `client` • `clientPhone` • `clientDeal` • `savedAt` |
| **DutyLeave** | `id` • `empName` • `type` • `from` • `fromTime` • `to` • `toTime` • `days` • `client` • `savedAt` • `forEmp` • `wageType` • `wageAmount` • `reason` • `notes` |
| **EmployeePayments** | `id` • `empName` • `date` • `amount` • `payType` • `mode` • `savedAt` • `periodFrom` • `periodTo` • `invoiceNo` • `summary` • `balance` |
| **ClientReceipts** | `id` • `client` • `clientPhone` • `date` • `amount` • `empName` • `mode` • `savedAt` • `clientAddress` • `invoiceNo` • `dealAmount` |
| **Expenses** | `id` • `item` • `date` • `amount` • `savedAt` |

Where each value comes from:

* **Employees** — the last three client boxes of the *Add employee* form are the Sheet's `clientDutyStartDate`, `clientPhone` and `clientDeal` columns. Typing a client name fills the phone and the deal automatically from Money Entry (the client's last receipt); press **✎** on any row to edit it later.
* **DutyLeave** — a substitute row carries the covering person in `empName`, the person on leave in `forEmp`, `daily` in `wageType` and the substitute's wage in `wageAmount`; an **End employee duty / End client duty** row carries `Assignment completed` in `reason` plus `Employee duty ended` / `Client service ended` in `notes`.
* **12-hour duty has no day/night column in the new layout** — the ☀️ day / 🌙 night choice travels in `dutyTime` (that column only holds a start time for 24-hour duty) and comes back as day/night duty on every device. While a Sheet still has the older `dutyShift` column, that column keeps being filled as well.
* Nothing is dropped while your Sheet is still in the older arrangement: the app also keeps filling the old `dutyShift` (Employees) and `byShifts` / `subWage` (DutyLeave) columns until the tabs are rewritten.
* Amounts and dates are written as **plain text** (`RAW`), so nothing is re-typed by Google Sheets and what you entered is what comes back.

### What every column drives

The app calculates from the columns, so a row typed straight into the Sheet works the same as one entered in the app:

| Column | What it decides |
|---|---|
| `Employees.wageType` + `wageAmount` | The salary rule: per-day = rate × duty days • monthly = wage ÷ days-in-month × duty days, summed across months |
| `Employees.joinDate` + `clientDutyStartDate` | **When duty starts** — the earlier of the two. The salary's *From* date and the "count duty" window use it, and the client bill starts there |
| `Employees.dutyHours` + `dutyTime` | 24-hour duty → days counted as 24-hr shifts (8 AM → next day 8 AM = 1 day) |
| `Employees.client` • `clientDeal` • `clientPhone` | The client bill rate (deal), the client's WhatsApp number, and the *From* date of a client bill |
| `DutyLeave.type` | `leave` • `substitute` • `endEmployeeDuty` • `endClientDuty` — the app's whole duty/leave state |
| `DutyLeave.from` `fromTime` `to` `toTime` `days` | Day and shift counting; an empty `to` means the leave/substitute is still open. **Join duty** fills `to` + `days`; the substitute's duty is closed with the same dates and its salary is calculated at once |
| `DutyLeave.forEmp` | Who the substitute is covering (and who is on leave) |
| `DutyLeave.wageType` + `wageAmount` | The pay for **that** substitute duty: `daily` × days, or `monthly` pro-rata ÷ days-in-month. Empty → the person's Employees row is used |
| `DutyLeave.reason` + `notes` | Why a duty ended (`Assignment completed` by default — the app asks) and the leave note; both are shown again in the app's records |
| `endEmployeeDuty.to` / `endClientDuty.to` | **When duty stops** — the salary window closes on this date, so no salary accrues after it |
| `EmployeePayments.amount` / `date` / `periodFrom` / `periodTo` | What has been paid, and over which period (the Salary Calculator picks up from the last paid date) |
| `EmployeePayments.summary` / `balance` / `invoiceNo` | Written by the app: duty + leave days, the rule used, paid and balance left, plus the receipt number |
| `ClientReceipts.amount` / `date` | Money received; the client bill and Profit/Loss count these per month |
| `ClientReceipts.dealAmount` / `clientPhone` / `clientAddress` / `invoiceNo` | Saved with each receipt, and used to pre-fill the next invoice (deal, WhatsApp number, address) |
| `Expenses.amount` / `date` | Counted in the monthly Profit/Loss for the partners |


To use the same data on a second phone/computer: open the app there, press **Sign in with Google** once — from then on it **auto-loads the latest data from the Sheet every time it starts** (you can still press **Load data FROM Sheet** to force a full replace, or use the JSON backup export/import in All Records). Sign-in lasts about an hour per session; if it expires, the app keeps saving on the device and one tap on **Sign in with Google** (or any sync button) refreshes it silently.

### If Google refuses the sign-in — what each error means

Press **🩺 Check my Google setup** on the app's **Google Sheet** tab: it prints the exact origin Google must allow, the Client ID in use and where it came from (`config.js` or this device), whether the Sheet is reachable with your current sign-in, and the last error Google sent — with the numbered clicks to fix it (copyable, to send to whoever manages the Google account). The app also shows this guidance automatically whenever Google refuses something.

| What you see | What it means | What to do |
|---|---|---|
| **Error 401: invalid_client** (`flowName=GeneralOAuthFlow`) | Google does not know this **Client ID** at all. It is typed with one wrong character, cut short, it is actually the *Client secret* (starts with `GOCSPX-`), or the client/project was deleted. Not a password problem, and no data is lost. | Cloud Console → **APIs & Services → Credentials → OAuth 2.0 Client IDs** → open the **Web application** row → copy the **Client ID** with its copy icon. Paste it into the **Google OAuth Client ID** box in the app → **💾 Use this Client ID** → sign in. No Web application row (or Google still says invalid)? **Create credentials → OAuth client ID → Web application**, add the origin the setup check prints, and put the new ID in `config.js`. |
| **Access blocked: authorization error / `origin_mismatch` / “no registered origin” (Error 401: invalid_client)** | The address the app is served from is not in the client's *Authorised JavaScript origins* — Google knows the Client ID but does not allow this web address to use it. | Add exactly the origin shown by the setup check (e.g. `https://ardashomehealthcare.github.io`, plus `http://localhost:8000` for testing). `file://` can never sign in. |
| **`403: access_denied` / “The developer hasn't given you access to this app” / “Google hasn't verified this app”** | Google **accepted** the Client ID *and* the origin (those fail as `invalid_client` / `origin_mismatch`) and then refused the **Google account**. Causes: the consent screen is still in **Testing** and that address is not a **test user**; or it is **Internal** and a personal `@gmail.com` was used; or a Workspace admin policy blocks the client; or **Cancel** was pressed on the consent screen. | **OAuth consent screen → Publishing status**: add every partner under **Audience → Test users → + Add users**, or press **Publish app** (In production — the “unverified” warning is then normal, press Continue). Internal screen → sign in with the work address. Admin policy: **Security → Access and data control → API controls → App access control** → add the Client ID. Cancelled by mistake → sign in again and press **Allow** (clear a stuck grant at `myaccount.google.com/permissions`). |
| **`unauthorized_client`** | That Client ID is an Android / iOS / Desktop / TV client, not a web one. | Create a **Web application** client ID. |
| **“The caller does not have permission” (403)** | The account you signed in with cannot edit the Sheet. | Open the Sheet → **Share** → add that exact email as **Editor** → sign in again with it. Every partner needs their own Editor access. |
| **Sign-in works but no Sheet / no tabs appear** | Hisab **never creates a Google Sheet** — the Sheets API cannot create files. It creates the 5 *tabs* inside the Sheet named by `HISAB_SPREADSHEET_ID`, so if that ID is missing, wrong, or the Sheet isn't shared with the account you signed in with, nothing new shows up in Drive. | Create one Sheet once — **🆕 New empty Sheet** in the app's **Google Sheet to write into** box, or `sheet.new` — then paste its address in that box → **💾 Use this Sheet** → **🔐 Sign in with Google** again. Share it with every partner as **Editor**, and put the same ID in `config.js` so every phone writes to it. |
| **“Requested entity was not found” (404)** | `HISAB_SPREADSHEET_ID` in `config.js` is not a Sheet this account can open. | Copy the long string between `/d/` and `/edit` in the Sheet's own URL into the **Google Sheet to write into** box (fixes that phone instantly) or into `config.js` (fixes every phone). |
| **“Google Sheets API has not been used in project …”** | The API is not enabled in the project that owns the Client ID. | Library → enable **Google Sheets API** in that project, wait a minute, sign in again. |
| **`idpiframe_initialization_failed`, popup blocked/closed** | Google's window cannot open: in-app browser (WhatsApp/Instagram), blocked cookies, or pop-ups disallowed. | Open the link in Chrome/Safari directly, allow cookies + pop-ups for the site, sign in once and press **Allow**. |
| **Works on one phone but not another** — or it still fails after you *fixed* `config.js` | The browser is running an **old cached copy of `config.js`** and signs in with a Client ID the server no longer has, so Google answers `401: invalid_client` even though the file on GitHub is correct. | Press **🔄 Re-read config.js** in the red box on the Google Sheet tab (the app also re-reads it by itself whenever the settings look off, and adopts the server values). Or hard-reload: Ctrl+Shift+R / Cmd+Shift+R; iPhone Home-Screen icon → remove and add again. When you edit `config.js`, bump the `?v=` number on its `<script>` tag in `index.html` so every device must fetch the new copy. |
| **One phone shows corrected/new behaviour and another does not** (columns out of step, money under Date and the date under Mode) | That phone is running an **old cached copy of `index.html`**. Both phones talk to the same Sheet, so a phone that reloaded repairs the Sheet on its next **🔄 Push app data to Sheet**, while an old copy can still write the mismatch back. | On the **Google Sheet** tab, compare **📱 App version** (also printed by 🩺 *Check my Google setup*). If a phone shows an older version, reload the page — or close the app and open it again (iPhone Home-Screen icon: remove and add it again). Do that on **both** phones, then press **🔄 Push app data to Sheet** once from either one: the headings and rows are rewritten together and the Sheet is correct for everybody. `APP_BUILD` in `index.html` is bumped with every release. |

Signing in on one device never unlocks another: each phone/laptop signs in with its own Google account. **A wrong `config.js` Client ID used to be unfixable without re-uploading the code** — now the value typed on the device overrides `config.js` (the tag next to the box shows which one is live), and **↩ Use the one in config.js** hands control back to the file.
