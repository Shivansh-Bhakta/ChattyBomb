# Email channel setup

Email is **polled** every 2 minutes (Inngest `poll-email`) or on demand ("Check email now" in /settings/channels).
Replies thread by `References`/`In-Reply-To`. Auto-replies, mailing lists and our own sends are ignored to prevent loops.

## Option A: Gmail / Google Workspace (OAuth)
1. Google Cloud Console → new project → enable **Gmail API**.
2. OAuth consent screen → User type **External** → publishing status **Testing**. Add each pilot mailbox as a **test user**
   (max 100; refresh tokens in Testing mode expire after 7 days, so pilots must reconnect weekly).
3. Credentials → OAuth client ID → Web application. Authorized redirect URI: `{APP_URL}/api/google/oauth`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` in Vercel. The owner clicks **Connect Gmail**.
5. Scopes used: `gmail.readonly` (restricted) and `gmail.send` (sensitive).

### Production verification (needed before non-test users)
`gmail.readonly` is a **restricted** scope. To publish the app:
1. Verify the app domain in Google Search Console; host a privacy policy and homepage on that domain.
2. Submit the consent screen for verification (scope justification + a demo video of the OAuth flow and how mail data is used).
3. Pass the annual **CASA security assessment** (Cloud Application Security Assessment, via a Google-approved assessor) required for restricted scopes.
4. Expect several weeks. Until then, stay in Testing mode or use Option B.

## Option B: any provider via IMAP/SMTP (fallback)
1. In the mailbox's security settings, enable 2-step verification and create an **app password** (Gmail, Zoho, Outlook all support this).
2. In /settings/channels → "Other email": address, login, app password, IMAP host/port (993 = TLS), SMTP host/port (465 = TLS).
3. "Test connection and save" logs in to both before storing. The app password is stored AES-256-GCM encrypted.
   We never ask for the main account password.

Common hosts: Zoho India `imap.zoho.in` / `smtp.zoho.in`; Gmail `imap.gmail.com` / `smtp.gmail.com`; Outlook `outlook.office365.com` / `smtp.office365.com` (port 587, STARTTLS: shortcut, only 465/993 TLS are auto-detected today).

## First poll
The first poll only records the mailbox position; older mail is not answered.
