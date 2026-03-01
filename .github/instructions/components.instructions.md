---
applyTo: "dst-crm/src/components/**"
---

# Component Guide

## Dashboard tab system

`Dashboard.tsx` is the single shell for all authenticated features. Admin features are tabs — not routes.

```ts
type AdminTab = 'import' | 'communication' | 'students' | 'emails' | 'payments' | 'users' | 'statistics';
```

**To add a new admin tab:**
1. Add value to the `AdminTab` union type in `Dashboard.tsx`
2. Add a tab button: `<button className={`tab-btn ${adminTab === 'myTab' ? 'active' : ''}`} onClick={() => setAdminTab('myTab')}>Label</button>`
3. Add render: `{adminTab === 'myTab' && <MyComponent />}`
4. Create `src/components/MyComponent.tsx` with a named export
5. Create `src/styles/MyComponent.css` and import it in the component

## Role-based rendering in Dashboard

```tsx
{isAdmin ? (
  <div className="admin-section">...</div>   // all tabs
) : isTeam ? (
  <div className="team-section">
    <Statistics />                            // statistics only
  </div>
) : (
  <UserProfile />                            // own profile only
)}
```

## Component responsibilities

| Component | Visible to | Firestore collections |
|-----------|-----------|----------------------|
| `Login` | Everyone | `students`, `users` |
| `Dashboard` | Authenticated | — |
| `ProtectedRoute` | — | `users` (via AuthContext) |
| `ImportStudents` | Admin | `students`, `payments` |
| `AllowedEmails` | Admin | `allowedEmails` |
| `UsersManagement` | Admin | `users` |
| `StudentsManagement` | Admin | `students`, `payments` |
| `PaymentsManagement` | Admin | `payments`, `students` |
| `Communication` | Admin | `students`, `payments` + `/api/send-mail` |
| `Statistics` | Admin, Team | `students`, `payments` |
| `UserProfile` | Student | `students`, `payments` |
| `Unauthorized` | Everyone | — |

## Export convention

Use **named exports** for all new components:
```ts
export const MyComponent = () => { ... }
```
`PaymentsManagement`, `StudentsManagement`, `Communication`, and `Statistics` also have a `export default` at the bottom — this is an existing inconsistency, don't add more.

## CSS co-location

Each component has a matching CSS file in `src/styles/`:
```ts
import '../styles/MyComponent.css';
```

## Loading & feedback pattern

All data-fetching components follow the same pattern:
```tsx
const [loading, setLoading] = useState(true);
const [message, setMessage] = useState('');
const [messageType, setMessageType] = useState<'success' | 'error'>('success');

if (loading) return <div className="feature-container">Načítavam...</div>;

// In JSX:
{message && <div className={`message message-${messageType}`}>{message}</div>}
```

CSS classes used: `.message-success`, `.message-error`.

## Inline styles

`Communication` uses a JSX `<style>` block for table row colors. Prefer external CSS for any new styling.
