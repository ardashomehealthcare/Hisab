/* ============================================================
   HISAB — PERMANENT SETTINGS (Google OAuth, no Apps Script)
   ============================================================
   1) HISAB_SPREADSHEET_ID — the Google Sheet the app syncs with
      (already filled in below).

   2) HISAB_GOOGLE_CLIENT_ID — OAuth 2.0 Client ID from
      Google Cloud Console (one time, ~5 min — see README):

      a. https://console.cloud.google.com → create / pick a project
      b. APIs & Services → Library → enable "Google Sheets API"
      c. APIs & Services → OAuth consent screen
           User type: Internal  (Workspace-only — nobody outside
           your organisation can sign in)  or External + test users
      d. APIs & Services → Credentials → Create credentials
           → OAuth client ID → Web application
           → Authorised JavaScript origins: add the EXACT origin
             where this app is served, e.g.
             https://ardashomehealthcare.github.io
      e. Copy the Client ID (ends in .apps.googleusercontent.com)
         and paste it between the quotes below. That's ALL.

   NOTE: Google sign-in only works when the app is opened from an
   origin listed above (GitHub Pages, any https site, or
   http://localhost). Opening the file directly (file://) can't
   sign in — data still saves on the device either way.

   IF A PHONE KEEPS SHOWING "Error 401: invalid_client" AFTER
   THIS FILE IS FIXED, that phone is running an old cached copy
   of it. The app re-reads this file from the server by itself
   whenever the settings look wrong (and "Re-read config.js" on
   the Google Sheet tab does it on demand), then adopts the
   server values. After editing this file, bump the ?v= number
   on the config.js <script> tag in index.html so every device
   has to fetch the new copy.
   ============================================================ */

window.HISAB_SPREADSHEET_ID = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY';

window.HISAB_GOOGLE_CLIENT_ID = '663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com';
