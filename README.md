# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser and saves every entry to **your Google Sheet**.

## What it does

| Section | What you enter |
|---|---|
| **Employees** | Name, phone, monthly/daily wage, wage amount, 24 hr / 12 hr duty, joining date |
| **Duty / Leave** | When an employee did duty or took leave (from → to dates) |
| **Money Entry** | Client payment received • Payment given to employee (with date) • Other expenses — each with its **own Submit button**, **no field is compulsory** |
| **Salary Calculator** | Pick employee + month. Full calendar month duty (30/31 days) = full monthly salary; fewer days = per-day calculation; leave days deducted; daily-wage = rate × duty days. Shows balance left to pay. |
| **Profit / Loss** | Per calendar month: Received − Employee payments − Expenses, split **50-50 between the two partners** |
| **All Records** | Every saved entry, filter by employee/month, delete entries, download JSON backup |

## How to run

Just open `index.html` in any browser — or host it anywhere (GitHub Pages works great).
Data is saved on the device instantly, and also sent to Google Sheets once connected.

## Connect Google Sheets (one time, ~5 min)

1. Go to **sheets.google.com** → create a blank spreadsheet, name it `Hisab`.
2. Menu **Extensions → Apps Script** → delete existing code → paste all of `google-apps-script.gs` → save.
3. **Deploy → New deployment → ⚙ Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy.
4. Authorize when asked (Advanced → Go to project → Allow — it's your own script).
5. Copy the **Web app URL** (ends in `/exec`).
6. In the app, open the **Google Sheet** tab → paste the URL → **Save & test connection** → **Send all saved data to Sheet**.

The script auto-creates tabs: `Employees`, `DutyLeave`, `EmployeePayments`, `ClientReceipts`, `Expenses` — every submit lands in its respective tab.

To use the same data on a second phone/computer: connect the same URL there and press **Load data FROM Sheet**.
