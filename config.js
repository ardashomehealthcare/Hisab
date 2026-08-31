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
   ============================================================ */

window.HISAB_SPREADSHEET_ID = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY';

window.HISAB_GOOGLE_CLIENT_ID = '663319983266-vh2pokf42mlvufc8lrp0kiab1vfqq10k.apps.googleusercontent.com';
