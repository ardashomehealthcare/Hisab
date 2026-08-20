# Hisab — Caretaker Services Manager

A simple calculator + employee database for a 2-partner caretaker services company.
Runs fully in the browser — all data is saved on the device (browser storage), with
JSON backup export/import for safekeeping or moving to another device.

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

## Backup

All data lives in the browser's local storage on the device you use.
Use **All Records → Download backup (JSON)** regularly, and **Import backup (JSON)**
to restore or move data to another phone/computer.
