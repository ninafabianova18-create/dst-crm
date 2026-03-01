# Copilot Instructions

## Project Overview

DST CRM — a role-based CRM for managing students, payments, and communication. Built with React 19 + TypeScript + Vite (frontend) and a minimal Node.js/Express server (backend) for email dispatch.

## Commands

All frontend commands run from `dst-crm/`:

```bash
npm run dev       # start Vite dev server
npm run build     # tsc -b && vite build
npm run lint      # ESLint
```

Backend (`dst-crm/server/`):

```bash
npm run dev       # nodemon index.js
npm start         # node index.js (production)
```

There are no tests currently.

## Architecture

```
DSTFINAL/
├── dst-crm/                        # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── config/firebase.ts      # Firebase init — exports auth, db, googleProvider
│   │   ├── context/AuthContext.tsx # Auth state + role resolution via Firestore
│   │   ├── components/             # All UI components (flat, no subdirectories)
│   │   └── styles/                 # Per-component CSS files
│   └── server/                     # Node.js/Express email server
│       └── index.js                # POST /api/send-mail endpoint
└── package.json                    # Root — only firebase dependency
```

The app has two routes: `/login` and `/dashboard`. All feature logic lives inside `Dashboard.tsx` via a tab switcher — there are no additional routes per feature.

## Auth & Role System

Roles are stored in Firestore `users/{uid}.role`. Three active roles: `admin`, `team`, `student`. New sign-ups default to `'user'` (no special access) until manually promoted in Firestore.

- `useAuth()` from `AuthContext` exposes: `user`, `role`, `loading`, `isAdmin`, `isTeam`, `isStudent`
- Always use `useAuth()` in components — never call Firebase auth directly
- `ProtectedRoute` accepts an optional `requiredRole?: UserRole` prop; omitting it only checks authentication

**Access whitelist**: to register or sign in, the email must either match `VITE_ADMIN_EMAIL` or exist in the Firestore `students` collection (`mail` field).

## Firestore Collections

- `users` — auth profiles with `role` field (`admin` | `team` | `student` | `user`)
- `students` — student records: `name`, `surname`, `mail`, `region`, `school`, `vs`, `iban`, `amount`, `typeOfPayment`, `period`, `note`, `telephoneNumber`
- payments collection — imported via `ImportStudents` component

## Environment Variables

Frontend (`.env.local` in `dst-crm/`):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_ADMIN_EMAIL       # bypasses the email whitelist check
```

Backend (`.env` in `dst-crm/server/`):

```
SMTP_HOST
SMTP_PORT              # defaults to 587
SMTP_USER
SMTP_PASS
FROM_EMAIL
PORT                   # defaults to 3001
```

## Key Conventions

- **CSS**: each component has a matching CSS file in `src/styles/` (e.g. `Dashboard.tsx` → `styles/Dashboard.css`). Import it directly in the component file.
- **Component exports**: use named exports — `export const MyComponent = () => ...`. (`PaymentsManagement` and `StudentsManagement` use default exports — an existing inconsistency.)
- **Firebase imports**: always import `auth`, `db`, `googleProvider` from `../config/firebase`. Never call `getAuth()` or `getFirestore()` again inside components.
- **Role checks**: use `isAdmin`, `isTeam`, `isStudent` booleans from `useAuth()` — don't compare `role` strings directly.
- **Adding a new admin tab**: in `Dashboard.tsx`, add the value to the `adminTab` union type, add a `<button>` in the tab bar, and add a conditional render block. Then create the component and its matching CSS file in `styles/`.
- **Language**: all UI strings are in Slovak.
