---
applyTo: "dst-crm/src/components/ImportStudents.tsx"
---

# Import Component

## What it does

Reads a local JSON file and writes records directly to Firestore via `addDoc`. No server involved.

Two separate upload flows on the same page:
- **Students** → `students` collection
- **Payments** → `payments` collection

## Students JSON format

Required fields: `mail`, `name`, `surname`. Records missing any are skipped and counted as errors.

```json
[
  {
    "name": "Meno",
    "surname": "Priezvisko",
    "region": "BA",
    "school": "Škola",
    "mail": "email@example.com",
    "telephoneNumber": "+421950123456",
    "typeOfPayment": "Classic",
    "period": "Year",
    "amount": "360",
    "iban": "SK1234567890",
    "vs": "123456",
    "note": "Poznámka"
  }
]
```

Automatically adds `importedAt: new Date()` to each record.

## Payments JSON format

No required field validation — all records are imported.

```json
[
  {
    "date": "2024-01-15",
    "amount": "360",
    "senderIban": "SK1234567890",
    "message": "popis platby",
    "senderName": "Meno Priezvisko",
    "vs": "123456"
  }
]
```

## Important behaviours

- Import is **additive** — running the same file twice creates duplicates. There is no deduplication or upsert logic.
- `vs` must be stored as a string. The import stores it as `student.vs || ''` which coerces any number to string.
- After a successful import the file input is reset: `(document.getElementById('file-input') as HTMLInputElement).value = ''`
- Payments imported here have no `matchStatus` set — they will be picked up as `unmatched` by `PaymentsManagement`.
