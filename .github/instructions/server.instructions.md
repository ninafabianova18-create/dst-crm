---
applyTo: "dst-crm/server/**"
---

# Email Server

## Overview

A minimal Node.js/Express server at `dst-crm/server/index.js` that relays emails via SMTP. It exists because Firebase client SDK cannot send email — all other app logic is client-side.

## Single endpoint

```
POST /api/send-mail
Content-Type: application/json

{
  "bcc": string | string[],
  "subject": string,
  "text": string
}
```

Each recipient receives a **separate individual email** — no group BCC. This is intentional so recipients cannot see each other's addresses.

Success response:
```json
{ "ok": true, "count": 3, "results": [...] }
```

## Dev proxy

`vite.config.ts` proxies `/api` → `http://localhost:3001` in development. So `fetch('/api/send-mail', ...)` in `Communication.tsx` works without CORS issues locally.

In production, configure a reverse proxy (e.g. nginx) to route `/api` to the Express server.

## Running both services together

```bash
# Terminal 1 — Vite frontend
cd dst-crm && npm run dev

# Terminal 2 — email server
cd dst-crm/server && npm run dev    # uses nodemon
```

## Environment (`dst-crm/server/.env`)

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587          # use 465 for SSL (sets secure: true automatically)
SMTP_USER=user@example.com
SMTP_PASS=secret
FROM_EMAIL=admin@example.com
PORT=3001
```

If SMTP config is incomplete at startup, the server logs a warning but still starts — it will error on actual send requests.
