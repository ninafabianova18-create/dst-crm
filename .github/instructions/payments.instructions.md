---
applyTo: "dst-crm/src/components/PaymentsManagement.tsx,dst-crm/src/components/StudentsManagement.tsx,dst-crm/src/components/Communacation.tsx,dst-crm/src/components/Statistics.tsx,dst-crm/src/components/UserProfile.tsx"
---

# Payment Logic

## Match statuses

Every payment in Firestore has a `matchStatus`:

| Status | Meaning | `matchedStudentId` |
|--------|---------|-------------------|
| `matched` | Exactly one student has this `vs` | set to student doc ID |
| `unmatched` | No student has this `vs` | `null` |
| `ambiguous` | Multiple students share this `vs` | `null` |

## Auto-pairing algorithm (`PaymentsManagement`)

1. Load all students into `Map<vs, studentId[]>`
2. For each payment where `matchStatus !== 'matched'`:
   - 1 match → `matchStatus: 'matched'`, `matchedStudentId: studentId`
   - 2+ matches → `matchStatus: 'ambiguous'`, `matchedStudentId: null`
   - 0 matches → skip
3. Batch-write updates in chunks of 450

## Payment period values

`period` field (case-insensitive normalization required):

| Raw value | Normalized | Installments/year | Year total |
|-----------|-----------|-------------------|------------|
| `year` / `yearly` | `year` | 1 | `amount × 1` |
| `half-year` / `halfyear` / `half year` | `half-year` | 2 | `amount × 2` |
| `month` / `monthly` | `month` | 10 | `amount × 10` |

```ts
const normalizePeriod = (value?: string) => {
  const v = (value ?? '').toLowerCase().trim();
  if (v === 'year' || v === 'yearly') return 'year';
  if (v.startsWith('half')) return 'half-year';
  if (v === 'month' || v === 'monthly') return 'month';
  return 'other';
};
```

## Communication: installment index

`Communication` computes expected payment per student given an `installmentIndex` (1–10, where 1 = September):

- `year`: always `amount × 1`
- `half-year`: `amount × 1` for index 1–5, `amount × 2` for index 6–10
- `month`: `amount × installmentIndex`

Student statuses: `paid` (expected === paid), `overpaid` (paid > expected), `unpaid` (paid < expected).

## Finance stats (Statistics)

`calculateFinanceStats(studentIds?)` returns:
- **paid**: sum of all matched payments (optionally scoped to a region's student IDs)
- **expected**: expected payment this academic month (based on `currentMonth - 8` → academic month 1–12)
- **difference**: `paid - expected`
- **final**: total expected by end of academic year

Academic year starts September. Expected this month:
- `year` students: only in academic month 1 (October)
- `half-year`: academic month 1 and 5 (October, February)
- `month`: every month

## Payment deadlines (UserProfile)

Deadlines are computed client-side from `typeOfPayment` (keyword-matched: `year/roč`, `half/pol`, `month/mesa`):
- `Year`: Sep 30
- `Half-year`: Sep 30, Feb 28
- `Monthly`: last day of each month Sep–Jun

The hardcoded IBAN in `UserProfile` is `SK02 8330 0000 0023 0154 8060 (Fio banka)`.

## vs field — critical

- Always store and compare as **string**
- Type mismatch (number vs string) in Firestore `where('vs', '==', vs)` silently returns no results
- Normalize immediately when reading from Firestore: `String(data.vs ?? '').trim()`
