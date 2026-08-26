# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser, saves every entry on the device instantly, and also sends
each submit to **your Google Sheet** in its respective tab.

## What it does

| Section | What you enter |
|---|---|
| **Employees** | Name, phone, monthly / per-day wage, wage amount, 24 hr / 12 hr duty (with duty start time for 24 hr), joining date, client name |
| **Leave Entry** | Pick the entry type from the dropdown: **🔁 going on leave** — enter only the leave start date + time (time appears for 24-hr duty employees); the employee stays **ON LEAVE** (shown live on the Leave tab and Dashboard) until you press **🤝 Join duty** with the join date & time — leave days are then counted automatically (24-hr shifts: 8 AM → next day 8 AM = 1 day). Or **🤝 substitute** — pick who is on leave ("in place of") and **type the substitute's name manually** (any name works — a new/temporary person is fine; add them to Employees later with the same name and their salary is calculated automatically). On join duty the substitute's duty **ends automatically** and their **salary is calculated automatically** (daily: rate × days • monthly: wage ÷ days-in-month × days) — record it as paid in one tap; it lands in All Records, Profit/Loss and the salary balance |
| **Money Entry** | Client payment received — the client is selected from the client names saved on Employees • **Auto-generated invoice** (invoice #, date, amount + amount-in-words, employee, mode — only client name & address are editable; round **PAID stamp** with the company name on the border + date; print / save as PDF, and re-print any past invoice from All Records) • Payment given to employee (with date) • Other expenses — each with its **own Submit button**, **no field is compulsory** |
| **Salary Calculator** | Pick employee + a date range (From → To). **Manually-added substitutes (temporary workers) also appear in the employee list** — calculate their salary even if they are not in the Employees tab yet; one click takes them there to save the wage (From date auto-fills to their first substitute duty). The From date auto-fills to the employee's **last paid salary** date (or joining date). Shows full employee details, duty/leave days, salary, complete payment history for the range, and balance to pay. Monthly employees: per-day pro-rata (wage ÷ days-in-month × duty days, summed across any months in the range) — a full month with no leave equals full salary. Per-day employees = rate × duty days. Leave days deducted. For 24-hr duty employees a time option appears so days are counted by 24-hour shifts (8 AM → next day 8 AM = 1 day). **Auto-generated salary payment receipt** (same style as the client invoice, with the PAID stamp): receipt #, date, duty & leave details exactly like the copy message, salary, amount paid, balance, amount-in-words — plus an **online payment screenshot** (UPI / bank transfer) attached to the receipt when paid online. Preview first, then print / save as PDF; re-print any past receipt from All Records. |
| **Profit / Loss** | Per calendar month: Received − Employee payments − Expenses, split **50-50 between the two partners** |
| **All Records** | Every saved entry, filter by employee/month, delete entries, download / import JSON backup |

## How to run

Just open `index.html` in any browser — or host it anywhere (GitHub Pages works great).

## Connect Google Sheets (one time, ~5 min)

The Apps Script is already locked to spreadsheet ID `1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY`.

1. Open the spreadsheet → menu **Extensions → Apps Script**.
2. In the editor, press **Ctrl+A** (Mac: **Cmd+A**) to select everything, then **Delete**. Paste **only** the contents of `google-apps-script.gs` — no extra notes or `*` bullets after the last `}` — then save. If you see `SyntaxError: Unexpected token '*'`, leftover text is still in `Code.gs`; select-all and paste again.
3. **Deploy → New deployment → ⚙ Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy.
4. Authorize when asked (Advanced → Go to project → Allow — it's your own script).
5. Copy the **Web app URL** (ends in `/exec`).
6. In the app → **Google Sheet** tab → paste the URL → **Save & test connection** → **Send all saved data to Sheet**.

The script auto-creates tabs: `Employees`, `DutyLeave`, `EmployeePayments`, `ClientReceipts`, `Expenses` — every submit lands in its respective tab. (DutyLeave also stores open leaves, join-duty dates and substitutes — substitute rows have the covering employee in `empName` and the employee on leave in the `forEmp` column; no Apps Script change is needed.)

To use the same data on a second phone/computer: just open the app there — it now **auto-loads the latest data from the Sheet every time it starts** (you can still press **Load data FROM Sheet** to force a full replace, or use the JSON backup export/import in All Records).
