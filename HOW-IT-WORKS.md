# Hisab — how it works, rule by rule

Every number the app shows comes from one of five tables. Those tables are saved in the
browser and, when signed in, mirrored into one Google Sheet. Nothing is calculated on a
server — the rules below run in the browser each time the screen is drawn.

---

## 1. The big picture

```
   Phone / computer                                     Google
┌──────────────────────────┐   "Sign in with Google"  ┌──────────────────────┐
│  index.html + config.js  │ ───────────────────────► │  OAuth (Identity     │
│  (the whole app, no      │                          │  Services) → token   │
│   server of its own)     │ ◄─────────────────────── │  valid ~1 hour       │
│                          │        access token      └──────────────────────┘
│  localStorage            │                                   │
│  hisabData_v1  ──────────┼──── Sheets API v4 (Bearer token) ─┘
│  = the five tables       │     read / write the user's own Sheet
└──────────────────────────┘
```

* **No backend, no Apps Script.** The app is static files; Google is called directly from
  the browser with the signed-in user's token.
* **On-device first.** Every submit is written to `localStorage` immediately, so the app
  works offline and on `file://`; the Sheet is an extra copy, not the source of truth for input.
* **The Sheet id is the only wiring.** `config.js` holds the OAuth Client ID and the Sheet ID.

---

## 2. The five tables (= the five Sheet tabs)

| Table (local) | Tab | Columns |
|---|---|---|
| `employees` | **Employees** | `id` `name` `phone` `wageType` `wageAmount` `dutyHours` `dutyTime` `joinDate` `clientDutyStartDate` `client` `clientPhone` `clientDeal` `savedAt` `updatedAt` |
| `dutyLeave` | **DutyLeave** | `id` `empName` `type` `from` `fromTime` `to` `toTime` `days` `client` `savedAt` `forEmp` `wageType` `wageAmount` `reason` `notes` `updatedAt` |
| `payments` | **EmployeePayments** | `id` `empName` `date` `amount` `payType` `mode` `savedAt` `periodFrom` `periodTo` `invoiceNo` `summary` `balance` `updatedAt` |
| `receipts` | **ClientReceipts** | `id` `client` `clientPhone` `date` `amount` `empName` `mode` `savedAt` `clientAddress` `invoiceNo` `dealAmount` `updatedAt` |
| `expenses` | **Expenses** | `id` `item` `date` `amount` `savedAt` `updatedAt` |

`updatedAt` is the last column of every tab: an ISO stamp (`2026-09-25T09:12:33.114Z`) written on
every change to that row. It decides which copy of a row wins when two devices hold it — see §12.

`dutyLeave.type` is the state machine of the business:

| `type` | Meaning | Filled by |
|---|---|---|
| `leave` | Employee is (or was) on leave. Empty `to` = still on leave. | Leave Entry |
| `substitute` | Someone covers a person on leave. Empty `to` = still covering. `forEmp` = who is covered. | Leave Entry / On-leave card / Join duty |
| `endEmployeeDuty` | That employee stopped working (`to` = last day) | ⏹ End employee duty |
| `endClientDuty` | The whole client posting stopped (`to` = last day) | 🛑 End client duty |

App-only helpers (`dutyShift`, `byShifts`, `subWage`, `synced`) are kept in memory and are
also written into the Sheet **while that column exists there**, so an older Sheet loses nothing.

---

## 3. Counting rules (the arithmetic core)

| Rule | Function | Detail |
|---|---|---|
| Days in a range | `dayCount(from,to)` | Inclusive: 1 Aug → 3 Aug = **3** days |
| 24-hour shifts | `shiftCount(from,fromTime,to,toTime)` | Whole 24-hour blocks: 8 AM → next day 8 AM = **1** day. Falls back to calendar days when no time is given |
| Hours → days (24-hr duty) | `hoursToDays(h)` | `h ÷ 24`, rounded to 2 decimals, never below `0.04` (= about one hour). 18 hrs = **0.75 day**, 12 hrs = **0.5 day** |
| Hours between two datetimes | `hoursBetween(from,fromTime,to,toTime)` | `hoursToDays(0)` = 0 hours if the range is empty or reversed |
| Days a row covers inside a period | `rowDaysInRange(r,from,to,empTime)` | Row clipped to the period; **if the row (or the employee) carries a time, the hours decide** the fraction, otherwise calendar days |
| Days a record covers | `recordDates(r,from,to)` | When a row has `fromTime` **and** `days` (e.g. `"3 days and 6 hours"`), that `days` value wins; otherwise calendar days |
| Split over months | `splitAcrossMonths(from,to,total)` | Proportional to calendar days, last month absorbs rounding |
| Days per month | `groupByMonth(dateSet)` | Simple count of dated days per `yyyy-mm` |
| Pro-rata wage | in the calculators | `wage ÷ days-in-month × duty-days`, **month by month**, then summed |
| Client deal proration | `proRateDeal(deal,from,to)` | Same rule against the monthly deal |
| Amount in words | `amountInWords` | Indian numbering (Thousand / Lakh / Crore) + “Rupees Only” |
| Invoice numbers | `nextInvoiceNo` / `nextPayInvoiceNo` | Highest saved number + 1 → `INV-0001…`, `PAY-0001…` |

Dates are handled as plain `yyyy-mm-dd` strings everywhere (no timezone maths), and are
written into the Sheet as **text** (`valueInputOption=RAW`) so Google never re-types them.

---

## 4. Employees tab

* **Add** — type a name; if that name already exists (case-insensitive) the record is
  **updated** instead of duplicated, so re-submitting is the edit path. **✎** on a row loads
  the whole record back into the form.
* **Duty fields** — `daily` wage → hourly fields hidden. `monthly` + `24 hour` → duty start
  time. `monthly` + `12 hour` → ☀️ day / 🌙 night.
* **Day/night storage** — the new arrangement has no day/night column, so a 12-hour duty
  keeps its choice in `dutyTime` (`day` / `night`). While a Sheet still has the older
  `dutyShift` column, that column is used instead — never both.
* **Client columns** — `client`, `clientDutyStartDate`, `clientPhone`, `clientDeal`. Typing a
  client name auto-fills phone + deal from that client's newest receipt, so the client's
  details live on the employee row as well.
* **Where employees are used** — salary calculator, leave/substitute pickers, billing
  calculator, duty windows.

---

## 5. Leave → substitute → join duty

```
Leave Entry:
  employee + start date (+ time if 24-hr)         → row {type:'leave', to:'', days:''}
  optional substitute below it                    → row {type:'substitute', forEmp:<employee>, to:''}
        ├─ typed wage per day   → wageType=daily,  wageAmount=<typed>
        └─ no wage typed        → wageType/wageAmount from that person's Employees row

On-leave card / join box:
  more substitutes can be added any time          → same rows

🤝 Join duty (asks date + time for 24-hr):
  leave row      : to = join date      days = dutyDayCount(r)          (24-hr: hours ÷ 24)
  every open substitute for that person:
                 : to = join date      days = hours it covered / 24     (only whole if whole)
  then the “substitute salary” dialog opens →  💸 Record payment
```

* A substitute's pay is computed by `substitutePay(row)` **from the row's own columns**:
  `wageType` `daily` → rate × days; `monthly` → pro-rated month by month. If the row carries
  no rate, the person's Employees row is used; the dialog says which one was used, and shows
  “no wage saved” when neither exists (it never guesses).
* Join duty **also closes the substitutes' duty rows automatically** and offers the payment
  in the same step — that payment lands in EmployeePayments (and therefore in Profit/Loss).
* Nothing is ever deleted by joining: the leave row keeps its dates, the substitute rows keep
  their days.

---

## 6. End duty / reactivate

| Action | Writes | Effect |
|---|---|---|
| ⏹ End employee duty | `type:'endEmployeeDuty'`, `to:<today>`, `toTime` (asked only for 24-hr employees — blank = normal duty time), `reason` (asked, default `Assignment completed`), `notes:'Employee duty ended'` | The employee disappears from active lists and pickers; the **salary window closes** on that date, at that hour |
| 🛑 End client duty | `type:'endClientDuty'`, `to:<today>`, `client`, same `reason`/`notes` wording | The client and everyone posted there become inactive |
| ↩ Re-activate (row button) | Deletes that end-duty row | They come back; the sheet is re-pushed |

For a 24-hour employee the dialog first asks the reason and then the **time the duty ended**
(blank, or a full shift, keeps the usual duty time = a whole day). That time lands in the
`toTime` column of the DutyLeave row, so the last part shift is paid by its hours.

“Ended” is derived, never stored: `endedState()` scans the DutyLeave rows and any employee
whose name — or whose client — has an end row is treated as inactive. Showing them again is a
checkbox (*Show ended employees*), and no record, invoice or salary is touched.

---

## 7. Salary Calculator

0. **Everyone on the app can be calculated.** The employee list holds **every** person: active
   employees, employees whose **duty ended** (marked “— duty ended”, so past months stay
   calculable) and every person who appears **only in Duty & Leave** (a substitute, or someone
   with just a leave row — marked “— not in Employees”). A substitute without an Employees row
   is paid from the **rate on their own substitute rows** (newest row in the period wins;
   `daily` → rate × days, `monthly` → pro-rata); a saved day count on the row
   (“3”, “2 days”, “3 days and 6 hours”) is the billed truth and is counted as such. If no rate
   exists anywhere, the result explains it and one click takes them to the Employees tab to
   save a wage.
1. **Period** = From → To. From auto-fills to the employee's **last paid salary** date; for a
   new hire it is the earlier of `joinDate` / `clientDutyStartDate`; for a substitute-only
   person, their first duty row.
2. **Duty rows** in the period: `type='duty'` or `substitute` for that person (open ones are
   clipped to the period). **Leave rows**: `type='leave'`, counted separately.
3. **Duty window** (when there are no duty rows for the person): start = `joinDate` or
   `clientDutyStartDate`, whichever is **earlier** (or the person's first duty row); end = the
   person's `endEmployeeDuty` date, or their client's `endClientDuty` date. The checkbox
   *“count the whole period as duty”* only widens the **start** to the From date — the end-duty
   date always stops the count.
4. **Leave days are removed from duty days**, so a leave shortens the month automatically.
5. **24-hour employees are paid according to hours** (see the box below). The count is made
   by `duty24For()` once and used by the calculator, the payment summaries and re-printed
   receipts, so all of them always agree.
6. **Money**: per-day → `rate × duty days`; monthly → `wage ÷ days-in-month × duty days`
   summed month by month (so the on-screen table shows each month's duty days, leave days and
   amount). A fractional day is multiplied as it is — 4.25 days at ₹1,000/day = **₹4,250**, a
   monthly ₹31,000 ÷ 30 × 4.25 days = **₹4,392** (rounded to the rupee at the end).
7. **Balance** = salary − payments whose `date` falls inside the period. Payments outside the
   period are ignored; the history table lists the ones inside, plus the all-time total.
8. **Outputs**: 📋 copy-message (duty/leave detail, day totals, balance in words-free plain
   text), 🧾 payment receipt (PAID stamp, duty detail, salary, paid, balance, online-payment
   screenshot, WhatsApp share), and 💸 *Record balance as payment given today* which writes an
   EmployeePayments row with `periodFrom` `periodTo` `summary` `balance` filled from the same rules.

### 24-hour duty is paid according to hours

A 24-hour duty is **one day** when it runs the full shift (the duty time on the Employees row →
same time next day, usually 8 AM → 8 AM). Whenever it does **not** fill whole days, the money
follows the hours instead of being rounded up to a whole day:

| Situation | Days counted | Why |
|---|---|---|
| Employee joins mid-shift (save leave time / join-duty time on the form) | `hours ÷ 24` | The leave starts at the real hour, so the part already worked is paid |
| Duty ends part-way (the end-duty dialog asks **what time it ended** for 24-hr employees) | `hours ÷ 24` | The last shift's hours are paid, e.g. ending 2 PM after an 8 AM start = **0.25 day** |
| Substitute covers only part of a shift (their own row's times) | `hours ÷ 24` | `substitutePay()` uses the row's `fromTime`/`toTime`; a saved `days` value still wins |
| Leave taken part-way (e.g. 8 AM → 8 PM = 12 hrs) | **0.5 day** removed from duty | Duty days go down by exactly the leave hours |
| No time anywhere (duty time not saved, or a whole period with only dates) | Calendar days, exactly as before | “According to hours **if required**” — nothing changes until real hours are known |

* The formula is always the same in the code: `days = hours ÷ 24`, and then
  `rate × days` (daily wage) or `wage ÷ days-in-month × days` (monthly wage).
* On screen and on messages a part day is written with its hours — *“4.25 days (102 hrs)”*,
  *“₹800 / day × 0.75 days (18 hrs)”* — so the number never looks like a mistake.
* If a 24-hr employee has **no duty time** on the Employees row, the calculator shows a hint:
  add the duty time (or type the From/To times in the calculator) and the hours rule turns on
  for that person.
* Join duty (`jTime`), leave start (`lFromT`) and the end-duty question all feed the same rule.
* If a leave or duty row is still open, it is clipped to the period and counted up to *today*,
  so a running leave shows a fraction that grows while you look at it.

---

## 8. Money Entry

**Client payment received** → `receipts` (+ invoice):
* client picked from names saved on Employees; **deal amount, address and WhatsApp number are
  remembered** from that client's newest receipt, so they only have to be typed once.
* Invoice preview: `INV-####`, date, amount, amount-in-words, employee, mode — plus the round
  **RECEIVED** stamp carrying the company name on the border and the date. Bottom line: **Thank you**.
* Print / save as PDF; 🖼 save as PNG (html2canvas); 📲 WhatsApp → the invoice image is saved
  and the client's chat opens **directly on the client's number**. A number saved without the
  country code still opens the right chat — the app adds **91** (or the set `WA_DEFAULT_CC`)
  itself, because `wa.me` only accepts full international numbers. No number saved? The app asks
  for it once on the spot (typed numbers are remembered per client), or the share sheet / chooser
  picks the chat.

**Payment given to an employee** → `payments`:
* `payType`, `mode`, optional `periodFrom`/`periodTo`. When a period is given, the app fills the
  Sheet's **`summary`** (duty days, leave days, the rule used, paid, balance) and **`balance`**
  columns from the same rules as the calculator.

**Expense** → `expenses`. Each block has its own Submit and no compulsory field.

---

## 9. Client billing calculator

* Deal = the client's newest `dealAmount`, or `clientDeal` from the Employees row.
* From date defaults to that client's duty start (`clientDutyStartDate`, else `joinDate`).
* Per month: `deal ÷ days-in-month × service days` = bill; **receipts dated in that month offset
  that month's bill** (so part-payments land in the right month); the difference is *due* or
  *advance*; totals are summed and a copy-message is generated.
* *Record balance in Money Entry* prefills the receipt (`dealAmount` + balance), so the invoice
  matches the bill.

---

## 10. Profit / Loss

Per calendar month, from the three money tables:

```
received (receipts.amount)  −  paid to employees (payments.amount)  −  expenses (expenses.amount)
                                        = profit  →  split 50 : 50 between the two partners
```

A month appears as soon as any dated money row exists in it (dated by `date`, i.e. the day the
money actually moved).

---

## 11. All Records

* Filters by employee and by month; every table is deletable row by row.
* **⬇ Download backup (JSON)** / **⬆ Import backup (JSON)** — the whole five tables in one file;
  import replaces the device's data after a confirmation.
* **📥 Add the data included in the app** — merges `data/hisab-data.json` (see §13).
* **🔄 Push app data to Sheet** — see §12.
* **🗑 Clear app data** — opens a dialog that names both places the books live and lets you
  choose: *this device only* (the Sheet keeps every row) or *this device **and** the five tabs in
  the Google Sheet* (headings are kept, rows deleted; recoverable from Sheets → File → Version
  history). The Sheet is emptied **first**, so if Google refuses, nothing is deleted anywhere.
  A wiped device is left with a dated note that switches the automatic pull off — see §12.1 — so
  the rows cannot come back by themselves.

---

## 12. Google Sheets sync

### The one rule: a write touches ONE row
Every write in the app — a new entry, an edit, a delete — goes to a single row, found by its `id`:

| what happened | what is sent to the Sheet |
|---|---|
| a new entry (any form) | `values/<Tab>!A1:append` — one row |
| an entry edited | `values:batchUpdate` writing **that row only** (`<Tab>!A<row>`) |
| an entry deleted | `spreadsheets:batchUpdate` with `deleteDimension` for **that row only** |
| a row that has to wait (offline / not signed in) | marked `synced:false`, sent by the next sync |

**The sync never uses `values:clear`.** (The only `:clear` left in the app is inside 🗑 *Clear app data → this device and the Google Sheet*, §11 — a deliberate wipe behind two confirmations.) That call was the bug behind “the whole Sheet went empty when
my partner signed in”: a push cleared all five tabs and rewrote them from one phone's memory, so a
phone holding 3 rows could delete the 500 rows it had never read. Since `deleteDimension` removes a
row by its number, the row is first found **by its own `id`** in the Sheet (column A, or wherever
the `id` heading sits) immediately before the delete, so rows that moved in the meantime — another
phone adding or removing rows — can never make the app delete the wrong row.

### Sign in
`google.accounts.oauth2.initTokenClient`, scope `https://www.googleapis.com/auth/spreadsheets`
plus `email` (only so the app can **show which account is signed in**; if Google ever refuses that
extra scope, sign-in is retried without it). The token lasts ~1 hour; it is refreshed **silently**
(`prompt:''`) and retried once on a 401, so the popup appears only when you press a button (the
press is what browsers require). Access is enforced by Google: each partner needs Editor rights on
the Sheet.

The Google Sheet tab shows **“signed in as …”**, and signing in with a *different* account on a
device that already holds books says so: one browser has **one** copy of the books
(`hisabData_v1`), shared by whoever signs in there — the saved data is not split per account.

### 🛡 Writing (push) — read first, then write only what differs
**🔄 Push app data to Sheet** does three things in this order:

1. **Reads the Sheet** (`values:batchGet`, all five tabs) — with the row numbers, and which rows
   are written in an older column order;
2. **Merges** it with this device (`mergeSheetData`), by `id`:
   * on both sides → this device wins if it has an unsent change **and** its `updatedAt` is not
     older; otherwise the Sheet's copy wins (last write wins, per row);
   * only here, never confirmed as sent → **append** it;
   * only here, but confirmed as sent before → it was deleted on another phone → remove it here;
   * only in the Sheet → add it here, unless this device deleted it just now; rows the Sheet holds
     in an older column order are queued to be **rewritten in its own current order**;
3. **Writes only what differs** — one `append` per tab with its new rows, one `values:batchUpdate`
   for its changed rows, one `deleteDimension` per deleted row. A tab with nothing to do is not
   touched at all, and a push whose books already match writes nothing.

Two extra safety rules fall out of that:

* **An empty tab never deletes anything.** If the Sheet comes back empty on a tab that has rows
  here, this device keeps its books, marks them unsent and says so (`sheetSafetyWarning`). Even if
  the Sheet is emptied by an old cached copy somewhere, no phone loses its rows and the next push
  puts them back.
* **A device that was deliberately cleared refuses to push** (it used to ask, then wipe): press
  **⬇ Load data FROM Sheet** or **↩ Turn the automatic pull back on** first.

One push runs at a time (`pushPromise`): a button pressed twice, or a delete that also syncs, joins
the push already running instead of racing it.

**Every row carries `updatedAt`** — an ISO stamp written by the app on every change, in a column of
its own at the end of each tab. A Sheet that does not have that column yet gets it the first time
the app writes there (one cell, `…!<col>1`), and `missingSheetCols()` never reports it as a missing
column. Submits append one row straight away with the same stamp.

* Missing tabs are created on sign-in (`ensureTabs`), with their header row; the same call records
  each tab's `sheetId`, which is what a single-row delete needs.

### Reading (pull)
`values:batchGet` for all five tabs, `UNFORMATTED_VALUE`:
* **By column name** (from the header row), not by position — inserting or moving a column in
  the Sheet cannot shift data;
* numeric date/time cells (rows typed into the Sheet by hand) are converted back from Sheets
  serials to `yyyy-mm-dd` / `HH:mm`;
* trailing blank rows are ignored;
* a column the app needs but the Sheet lacks is reported on screen instead of guessed;
* legacy columns (`dutyShift`, `byShifts`, `subWage`) are read while they exist;
* **rows written in an older arrangement are read with the arrangement they really hold**
  (`LEGACY_LAYOUTS` — Employees before the client columns, DutyLeave before
  `wageType`/`wageAmount`, ClientReceipts before `clientPhone` moved to position 3). A row gives
  itself away by what its cells are (a saved-at stamp where a payment mode belongs, a date where a
  name belongs), so a tab whose headings were already rewritten while its rows were not — the state
  that shows money under “Date” and the date under “Mode” — is read correctly anyway, and the
  *Google Sheet* tab names those tabs. The same test is applied to the records already on the
  device (`repairShiftedRecords()`), so they are put back in their right columns at start-up and
  marked unsent instead of being pushed back out wrong.

**Auto-load on start:** if the device is signed in, the Sheet is pulled and merged — entries that
were never sent are kept and marked unsent. **Nothing is written by a pull.** The device remembers
which Sheet it last synced with (`hisabSyncedSheetId`); if the app is pointed at a different Sheet,
everything on the device is kept and marked unsent instead of silently disappearing, and
*Load data FROM Sheet* warns before replacing. *Load data FROM Sheet* takes the Sheet's rows as
they are, keeps rows that were never sent, and **never** empties the device (the empty-tab rule
above applies to it as well).

**Errors** are translated into plain fixes (401 invalid_client → wrong Client ID; origin_mismatch
→ add the origin; 403 access_denied → test users / Internal screen; 404 → wrong Sheet ID; API not
enabled → enable it). 🩺 *Check my Google setup* prints the origin Google needs, the Client ID in
use and where it came from, and the last error.

### 12.0 How this is tested (no Google account needed)
`node tools/sync-engine.test.mjs` extracts the `<script>` out of `index.html`, runs it in a Node VM
with a stubbed DOM/localStorage, and talks to an **in-memory mock of the Sheets API** that logs
every request. 78 assertions cover: a push from a
device holding fewer rows deletes nothing; the
10 rows another phone added meanwhile survive; deleting one entry removes exactly its own row;
a cleared device's push writes nothing at all; a Sheet that comes back empty keeps the device's
rows and puts them back; one `sendRecord` appends one row and adds the `updatedAt` column; the
newer `updatedAt` wins in both directions; a row in the old column order is repaired in place;
a Sheet in the older arrangement is never re-ordered; phone A → phone B handoff writes nothing
twice; an entry saved while a push runs lands once; a push that fails half-way does not duplicate
on retry; **a Sheet that lost most of a tab takes nothing from the phone, and one push puts it
all back**; one row deleted on the other phone still leaves this phone; and every button on the
page calls a function that exists. Run the same suite against `git show HEAD:index.html` and
scenario 1 fails with **5 × `values:clear`** — that is the "whole Sheet went empty" bug this
engine replaced.

### 12.1 Clearing does not undo itself
The old *Clear all data* emptied the device copy only, so the next open pulled every row back
from the Sheet and the data looked like it had never been cleared. **🗑 Clear app data** now
writes a dated note (`hisabDeviceCleared`) that stays until you say otherwise:

* the automatic pull on start stops, and the one-time load of `data/hisab-data.json` is skipped —
  the app opens **empty** and stays empty across restarts, even while signed in;
* an amber note appears on *All Records* and on the *Google Sheet* tab with two ways out —
  **⬇ Load data FROM Sheet** (bring the books back and resume the pull, `setDeviceCleared(false)`)
  or **↩ Turn the automatic pull back on** (resume without loading);
* **🔄 Push app data to Sheet** is refused outright on a cleared device (it used to ask “overwrite
  anyway?” and then empty the Sheet, because a push wrote this device's few rows and cleared the
  rest): the app says *nothing was written* and points at the two ways back;
* an **imported backup never** switches the pull back on, so an import cannot be overwritten by
  the Sheet behind the user's back.

The device-only wipe removes everything Hisab keeps on the device: the five tables
(`hisabData_v1`), the receipt images (`hisabPayImages_v1`), the remembered WhatsApp numbers
(`hisabWaNum:*`), the "bundled data already loaded" mark, and any dated copies of the books an
earlier build kept (`hisabSafetyCopy_v1` — no longer made). Settings — the Google account, the
Client ID / Sheet ID, which Sheet this device belongs to — are left alone, because they are not
books.

### The bundled records
`data/hisab-data.json` holds the app's own books in the Sheet's column layout — and it ships
**empty**: all app data has been cleared, and the records are added **from the Google Sheet**
after sign-in (the automatic pull on start, or *Load data FROM Sheet*). The app
stores **no link to any other spreadsheet** — no "reference sheet", no URL, no id; it reads and
writes only its own Sheet. 🔄 **Push app data to Sheet** writes the device's rows into the
app's own Sheet: headers in §2's arrangement, the rows underneath in the same order.

---

### 12.2 If a Sheet was emptied — recovery, in this order
An emptied Sheet is **not** the end of the books, and since this build it cannot take a phone's
copy with it either (§12.3). The wipe is recognisable: the tabs a pushing device had nothing for
sit with only their heading row (a surviving tab — say *Expenses* — means the phone that pushed
held only those rows).

1. **Reload the app on both phones first** (or close it and open it again). A phone serving a
   cached copy of the *old* build still writes the old way; check 📱 **App version** on the
   *Google Sheet* tab and make sure both phones show the same, current line (§15.1).
2. **A phone that still shows yesterday's rows is the quickest way back.** Open *All Records* and
   compare the counts with what you expect. If the rows are there, press **🔄 Push app data to
   Sheet** once: the push reads the Sheet first, adds the rows it is missing, and deletes nothing.
   (With the *old* build still on the phone, do this in **airplane mode → no**: export first —
   *All Records → ⬇ Download backup (JSON)* — then push from the fixed build.)
3. **Put back the version Google kept, on a computer.** Google Sheets → *File → Version history →
   See version history* → pick the version from just before the wipe (check that all five tabs
   have their rows) → **Restore this version**. That restores the whole file at once, so copy
   anything added *after* the wipe (today's rows) out first — version history keeps every version,
   so nothing is lost by restoring. *Drive → the file → Activity* shows who changed it and when.
4. **From a file, if you have one.** A backup downloaded earlier with **⬇ Download backup (JSON)**
   (`hisab-backup-<date>.json`) goes back in with *⬆ Import backup (JSON)* — it replaces that
   phone's copy, so use it on a phone whose own rows are older — then **🔄 Push app data to
   Sheet**: every imported row counts as *not sent yet*, rows the Sheet already has are matched by
   `id`, and only the missing ones are added.
5. **Type it back, as a last resort.** The rows that survived in a tab, the invoices and receipts
   printed or sent on WhatsApp (§9/§10), and the payment screenshots on the device
   (`hisabPayImages_v1`) are all still there to copy from.

The app never throws a row away by itself any more, and **🔄 Push app data to Sheet** never removes
a row you did not delete yourself — so it is always safe to try the next step when the previous
one does not have what you need.

### 12.3 A data loss on one phone can no longer follow a data loss in the Sheet
The reported incident had two halves: the old build **emptied the tabs** and wrote that phone's few
rows, and then **every other phone read the rows it held as "deleted on another phone" and threw
its own copy away** — the books then existed in neither place. Both halves are now closed:

* **A push never clears a tab** (§12) — it reads first and writes row by row;
* **A wipe cannot take a phone's rows with it.** Rows this device had sent but the Sheet no longer
  has are still read as deletions when there are only a few of them (that is what a real deletion on
  the other phone looks like). But when a pull would remove **six rows or more *and* at least 30 %
  of that tab at once** (`looksLikeWipe()`), the app refuses to believe them: the rows are kept,
  marked **not sent yet**, and an amber notice on *All Records* and the *Google Sheet* tab says
  so — one press of **🔄 Push app data to Sheet** and the Sheet holds them again.
  Deleting a whole block on purpose still works: delete it on this device as well (the ✕ button on
  the row), and then only that row leaves the Sheet.

## 13. The data that ships with the app

`data/hisab-data.json` holds the five tables and ships **empty** — all app data has been
cleared, and the records are added **from your Google Sheet** (sign in → the rows are pulled in;
*Load data FROM Sheet* takes the Sheet as-is). It is only records — no spreadsheet id, no URL,
no credentials — and it is **not** a second data source: once loaded it lives in the same five
tables.

* On a device with **no data at all**, it loads once automatically (`hisabIncludedDataAuto`) —
  nothing to add while the file is empty; rows put into the file reach a new phone on its first
  open.
* On a device that already has data: **📥 Add the data included in the app** shows what is new per
  tab, asks, then merges.
* **Duplicates are skipped** against a snapshot taken *before* the merge: employees by name,
  everything else by person/client + date + amount. Two identical rows that really are two rows
  are both kept; importing twice cannot double the books.
* Added rows are marked **unsent**, so 🔄 Push app data to Sheet sends them to the Sheet when you
  are ready.

---

## 14. What is stored in the browser

| Key | Holds |
|---|---|
| `hisabData_v1` | the five tables |
| `hisabGoogleAuth_v1` | access token + expiry |
| `hisabClientId` | Client ID typed on this device (overrides `config.js`) |
| `hisabSheetId` | Sheet ID typed on this device (overrides `config.js`) |
| `hisabSyncedSheetId` | which Sheet this device last synced with |
| `hisabPendingDeletes_v1` | ids deleted here whose Sheet row still has to be removed (§12) |
| `hisabAccountEmail` | the Google account last signed in on this device (shown on the Google Sheet tab) |
| `hisabWaNum:<name>` | the WhatsApp number typed for a person without a saved one |
| `hisabIncludedDataAuto` | the shipped data has been auto-loaded once |
| `hisabDeviceCleared` | the day this device was cleared — while set, the automatic pull from the Sheet stays off (§12.1) |
| `hisabPayImages_v1` | online-payment screenshots attached to receipts |

---

## 15. Startup sequence

1. Read settings from `config.js` (and any device overrides), load the tables from `localStorage`.
1b. `repairShiftedRecords()` — records that were read while a Sheet's columns were out of step are
   put back in their right columns (§13) and marked unsent, so the wrong values can never be
   pushed back out.
2. Draw everything (`renderAll`), which also labels the push buttons with the number of unsent rows.
3. If the device is empty, pull in `data/hisab-data.json` once.
4. If signed in, pull the Sheet in the background and merge (`mergeSheetData` — by `id`, both sides
   kept, nothing written, rows marked unsent if a tab came back empty); if the settings look wrong,
   re-read `config.js` uncached (a phone can be serving a stale copy) and adopt the server values.
5. Steps 3 and 4 are **skipped while the device carries the cleared note** (§12.1) — a cleared app
   stays empty until *Load data FROM Sheet* is pressed.

### 15.1 Which copy of the app a phone is running (`APP_BUILD`)

`APP_BUILD` (top of the script, `index.html`) is bumped with every release that changes the app.
The **Google Sheet** tab shows it under the push hint, and the 🩺 setup check prints it, so the two
partner phones can be compared: a phone showing an **older** version is still serving a cached
`index.html` and must reload (or be closed and reopened) **before** it presses anything that
writes — an old copy still writes the heading/row mismatch of §13 back into the Sheet, **and its
push clears the five tabs before writing** (the behaviour that emptied the Sheet for everybody;
this version never clears a tab and refuses to write anything to a tab it read as empty). A phone
that has the new copy reads such a Sheet correctly, keeps its own rows, and the next push from it
repairs the Sheet row by row, so nothing is ever lost either way.

---

## 16. Rules of thumb

* Money is counted by the **date the money moved**, duty is counted by **dates and times of duty**.
* A 24-hour duty is one day when it runs the full shift; any part shift, late joining or early
  ending is paid by its hours (`hours ÷ 24`), and a part day always shows its hours next to it.
* A monthly wage is always `wage ÷ days-in-month × days actually served`, month by month.
* A duty starts at the earlier of joining date / client duty start, and stops at an end-duty row.
* Leave removes days from duty; a substitute adds its own paid days, priced from its row.
* The Sheet is a mirror, but never in one direction only: a write goes to **one row** (append /
  update / delete that row), it is never a rewrite of a tab, and the app always reads the Sheet
  **by column name**. Two partners can therefore work on the same books at the same time — the
  rows each device has that the Sheet lacks are merged in, and the newer `updatedAt` wins for a
  row both devices changed.
