---
applyTo: "dst-crm/src/context/**,dst-crm/src/components/Login.tsx,dst-crm/src/components/ProtectedRoute.tsx,dst-crm/src/components/UsersManagement.tsx"
---

# Auth System

## Role flow

1. User signs in (Google popup or email/password)
2. `onAuthStateChanged` fires → `AuthContext` reads `users/{uid}` from Firestore
3. Role is stored in `users/{uid}.role` as a plain string: `'admin'` | `'team'` | `'student'` | `'user'`
4. New accounts created via `setDoc` with `role: 'user'` by default — must be promoted manually in Firestore
5. `AuthContext` derives convenience booleans: `isAdmin`, `isTeam`, `isStudent`

## useAuth() contract

```ts
const { user, role, loading, isAdmin, isTeam, isStudent } = useAuth();
```

- `user` — Firebase `User` object or `null`
- `role` — raw string from Firestore, or `null` if signed out
- `loading` — true while auth state + role fetch are in progress; always render a loading state when true
- `isAdmin` / `isTeam` / `isStudent` — derived booleans; prefer these over `role === '...'` string comparisons

`useAuth()` throws if called outside `<AuthProvider>`.

## Email whitelist

Before a user can register or sign in:
- Google sign-in: `isEmailAllowed()` checks the `students` collection for a matching `mail` field, or falls back to `VITE_ADMIN_EMAIL`
- Email/password sign-in: no whitelist check on login (only on register)
- Email/password register: whitelist check runs before `createUserWithEmailAndPassword`

The admin email (`VITE_ADMIN_EMAIL`) always bypasses the whitelist.

## ProtectedRoute

```tsx
<ProtectedRoute>                          // auth only
<ProtectedRoute requiredRole="admin">     // auth + role check
```

- Renders `<div className="loading">` while `loading === true`
- Redirects to `/login` if not authenticated
- Redirects to `/unauthorized` if `requiredRole` is set and doesn't match

## UsersManagement

Admins change roles via a `<select>` that calls `updateDoc(doc(db, 'users', userId), { role: newRole })` directly. There is no Cloud Function or server-side role enforcement — Firestore security rules are the only guard.
