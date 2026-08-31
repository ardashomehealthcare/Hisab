# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser, saves every entry on the device instantly, and also sends
each submit to **your Google Sheet** in its respective tab.

## What it does

| Section | What you enter |
|---|---|
| **Employees** | Name, phone, monthly / per-day wage, wage amount, 24 hr / 12 hr duty — **24 hr: duty start time • 12 hr: ☀️ day or 🌙 night duty** — joining date, client name |
| **Leave Entry** | One form: pick the employee and the leave start (time option appears for 24-hr duty) — a **Substitute box sits right below in the same form**: type any name (new/temporary OK), add a Wage per day if they're not in Employees, and one Submit saves leave + substitute together. Select an employee who is **already on leave** and the same form shows their status, a substitute type bar and the **🤝 Join duty** button (also in the live On-leave card below). On join duty the leave days are totalled automatically (24-hr shifts: 8 AM → next day 8 AM = 1 day, from the substitute's own start time), every substitute's duty **ends automatically** and their **salary is calculated automatically** (daily: rate × days • monthly: wage ÷ days-in-month × days) — record it as paid in one tap; it lands in All Records, Profit/Loss and the salary balance. Running substitute salaries are shown live while they cover |
| **Money Entry** | Client payment received — the client is selected from the client names saved on Employees • **Auto-generated invoice** (invoice #, date, amount + amount-in-words, employee, mode — only client name & address are editable; round **PAID stamp** with the company name on the border + date; print / save as PDF, and re-print any past invoice from All Records) • Payment given to employee (with date) • Other expenses — each with its **own Submit button**, **no field is compulsory** |
| **Salary Calculator** | Pick employee + a date range (From → To). **Manually-added substitutes (temporary workers) also appear in the employee list** — calculate their salary even if they are not in the Employees tab yet; one click takes them there to save the wage (From date auto-fills to their first substitute duty). The From date auto-fills to the employee's **last paid salary** date (or joining date). Shows full employee details, duty/leave days, salary, complete payment history for the range, and balance to pay. Monthly employees: per-day pro-rata (wage ÷ days-in-month × duty days, summed across any months in the range) — a full month with no leave equals full salary. Per-day employees = rate × duty days. Leave days deducted. For 24-hr duty employees a time option appears so days are counted by 24-hour shifts (8 AM → next day 8 AM = 1 day). **Auto-generated salary payment receipt** (same style as the client invoice, with the PAID stamp): receipt #, date, duty & leave details exactly like the copy message, salary, amount paid, balance, amount-in-words — plus an **online payment screenshot** (UPI / bank transfer) attached to the receipt when paid online. Preview first, then print / save as PDF; re-print any past receipt from All Records. |
| **Profit / Loss** | Per calendar month: Received − Employee payments − Expenses, split **50-50 between the two partners** |
| **All Records** | Every saved entry, filter by employee/month, delete entries, download / import JSON backup |

## How to run

Host it anywhere — GitHub Pages works great (sign-in with Google needs a proper `https://` address, so hosting is required for the Sheet sync; opening the file directly still works for on-device saving only).

## Connect Google Sheets — Google OAuth (one time, ~5 min, no Apps Script)

The app talks to your Google Sheet **directly from the browser with Google's official OAuth sign-in** — there is no Apps Script, no shared web-app URL, and no "Anyone with the link" access anymore. Each partner signs in with their own Google account, and Google itself checks that the account may edit the spreadsheet.

The spreadsheet is locked in `config.js`: `HISAB_SPREADSHEET_ID = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY'` — your existing sheet, existing data, existing tabs.

### One-time setup (admin, in Google Cloud Console)

1. Open **console.cloud.google.com** → create (or pick) a project, e.g. *Hisab*.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → user type **Internal** — this is the Google Workspace lock: only Google accounts inside your organisation can ever sign in. (No Workspace? Choose **External** and add your own accounts as test users.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → **Web application**.
5. **Authorised JavaScript origins** → add the exact origin where the app is served, e.g. `https://ardashomehealthcare.github.io` (add `http://localhost:8000` as well for local testing). Sign-in only works from a listed origin.
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) → paste it into **`config.js`** as `HISAB_GOOGLE_CLIENT_ID` (or into the box in the app's **Google Sheet** tab).
7. Share the Google Sheet with your partner as **Editor**, then in the app → **Google Sheet** tab → **🔐 Sign in with Google** → allow. Done.

The app auto-creates tabs on first sign-in: `Employees`, `DutyLeave`, `EmployeePayments`, `ClientReceipts`, `Expenses` — every submit lands in its respective tab. (DutyLeave also stores open leaves, join-duty dates and substitutes — substitute rows have the covering employee in `empName` and the employee on leave in the `forEmp` column.) If you previously used the Apps Script version, everything already in those tabs is read as-is — no migration needed, and you can delete the old Apps Script deployment.

To use the same data on a second phone/computer: open the app there, press **Sign in with Google** once — from then on it **auto-loads the latest data from the Sheet every time it starts** (you can still press **Load data FROM Sheet** to force a full replace, or use the JSON backup export/import in All Records). Sign-in lasts about an hour per session; if it expires, the app keeps saving on the device and one tap on **Sign in with Google** (or any sync button) refreshes it silently.
