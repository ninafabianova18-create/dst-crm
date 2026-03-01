---
applyTo: "dst-crm/src/**/*.{ts,tsx}"
---

# Firestore Data Model

## Collections

### `users`
Created on first sign-in. Document ID = Firebase Auth UID.
```ts
{
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'team' | 'student' | 'user';
  createdAt: Timestamp;
}
```

### `students`
Imported via JSON upload. Document ID = auto-generated. Also used as the email whitelist.
```ts
{
  name: string;
  surname: string;
  region: string;        // Slovak region code: 'BA'|'TT'|'NR'|'TN'|'ZA'|'BB'|'PO'|'KE'
  school: string;
  mail: string;          // lowercase; used for whitelist lookup
  telephoneNumber: string;
  typeOfPayment: string; // 'Classic' or scholarship variant
  period: string;        // 'Year' | 'Half-year' | 'Month' (case-insensitive in logic)
  amount: string | number; // base EUR amount per installment
  iban: string;
  vs: string;            // variabilný symbol — ALWAYS treat as string, never number
  note: string;
  importedAt: Timestamp;
}
```

### `payments`
Imported via JSON upload. Matched to students by `vs`.
```ts
{
  vs: string;                              // ALWAYS treat as string
  amount: number;                          // EUR (display as-is)
  date: Timestamp;
  message: string;
  senderIban: string;
  senderName: string;
  matchedStudentId: string | null;         // doc ID from students collection
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
}
```

### `allowedEmails`
Legacy admin-managed whitelist (current login uses `students.mail` instead).
```ts
{
  email: string;   // lowercase
  addedAt: Timestamp;
}
```

## Key Firestore patterns

**Always normalize `vs` to string** before any comparison:
```ts
const normalizeVS = (value: any) =>
  value === undefined || value === null ? '' : String(value).trim();
```

**Timestamp conversion** — Firestore Timestamps have a `.toDate()` method:
```ts
data.date?.toDate ? data.date.toDate() : data.date ?? null
```

**Batch writes** for bulk updates — chunks of 450 to stay under Firestore's 500-doc limit:
```ts
for (let i = 0; i < updates.length; i += 450) {
  const batch = writeBatch(db);
  updates.slice(i, i + 450).forEach(u => batch.update(...));
  await batch.commit();
}
```

**No real-time listeners** — all components use one-shot `getDocs` and reload on mount or user action. Do not introduce `onSnapshot` without discussion.

## Firestore index requirements

`UserProfile` queries payments by `vs` + `orderBy('date', 'desc')` — requires a composite index on `payments(vs ASC, date DESC)`. If missing, Firestore returns `failed-precondition` with a link to create it in the console.

## Region field inconsistency

Due to import variance, the region field appears as both `region` and `Region` in student documents. Always read with:
```ts
student.Region ?? student.region ?? ''
```
Known region codes: `BA`, `TT`, `NR`, `TN`, `ZA`, `BB`, `PO`, `KE`.
