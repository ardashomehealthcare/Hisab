# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser, saves every entry on the device instantly, and also sends
each submit to **your Google Sheet** in its respective tab.

## What it does

| Section | What you enter |
|---|---|
| **Employees** | Name, phone, monthly / per-day wage, wage amount, 24 hr / 12 hr duty (with duty start time for 24 hr), joining date, client name |
| **Duty / Leave** | When an employee did duty or took leave (from → to dates, optional times for 24-hr duty) |
| **Money Entry** | Client payment received • Payment given to employee (with date) • Other expenses — each with its **own Submit button**, **no field is compulsory** |
| **Salary Calculator** | Pick employee + month. Shows full employee details, duty/leave days, salary, complete payment history for the month, and balance to pay. Full calendar month duty (30/31 days) = full monthly salary; fewer days = per-day calculation; leave days deducted; per-day = rate × duty days; 24-hr duty counted by actual time (8 AM → next day 8 AM = 1 day). |
| **Profit / Loss** | Per calendar month: Received − Employee payments − Expenses, split **50-50 between the two partners** |
| **All Records** | Every saved entry, filter by employee/month, delete entries, download / import JSON backup |

## How to run

Just open `index.html` in any browser — or host it anywhere (GitHub Pages works great).

## Connect Google Sheets (one time, ~5 min)

The Apps Script is already locked to spreadsheet ID `1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY`.

1. Open the spreadsheet → menu **Extensions → Apps Script**.
2. Delete existing code → paste all of `google-apps-script.gs` → save.
3. **Deploy → New deployment → ⚙ Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy.
4. Authorize when asked (Advanced → Go to project → Allow — it's your own script).
5. Copy the **Web app URL** (ends in `/exec`).
6. In the app → **Google Sheet** tab → paste the URL → **Save & test connection** → **Send all saved data to Sheet**.

The script auto-creates tabs: `Employees`, `DutyLeave`, `EmployeePayments`, `ClientReceipts`, `Expenses` — every submit lands in its respective tab.

To use the same data on a second phone/computer: connect the same URL there and press **Load data FROM Sheet** — or use the JSON backup export/import in All Records.
