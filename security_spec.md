# Firestore Security Specification (`security_spec.md`)

## 1. Architecture & Relationship Mapping (23 Top-Level Collections)
- **Authority Source of Truth (`/users/{uid}`)**: Stores employee profile, `role` (`'admin' | 'user'`), `active` (`bool`), `deleted` (`bool`, optional), `deletedAt` (`number | null`, optional), `branchIds` (`list` of allowed branch IDs), `perms` (`map` of granular section/edit/delete/report/confidential booleans), and optional UI preferences (`theme`, `sidebarCollapsed`). Never stores plain-text passwords (`pass`, `password`, `passwordHash`). If `deleted == true`, `active` must be `false`.
- **System Configuration (`/settings/main`)**: Singleton company configuration (`companyName`, `currency`, `taxRate`, `features`, `lotExpiryMode`, `directSaleMode`, `isBranchCompany`, etc.). Readable by active authenticated users (`allow get`); writable only by `admin` or active users with `perms.settings == true`.
- **Sequential Numbering (`/counters/{branchId}`)**: Separated from `/settings/main` so branch-assigned staff can create/increment per-branch document counters (`INV`, `DEL`, `RSL`, `RIN`, `INT`, `ARR`, `TRF`, `DSP`, `CHK`, `BRT`, `PAY`, `MTR`, `EXP`) strictly within their authorized `branchIds`.
- **Company Structure (`/branches/{branchId}`)**: Branch locations; readable by active employees, writable exclusively by `admin`.
- **Catalogs & Financials (`/customers/{id}`, `/items/{id}`, `/accounts/{id}`, `/checks/{id}`, `/moneyMoves/{id}`, `/expenses/{id}`)**: Strictly gated by active status + module/edit/delete permissions (`customers`, `inventory`, `purchasing`, `ledger`, `checks`, `reports`, etc.).
- **Branch-Scoped Operations (`/stocks/{id}`, `/invoices/{id}`, `/deliveries/{id}`, `/returnSlips/{id}`, `/returnInvoices/{id}`, `/intakes/{id}`, `/arrivals/{id}`, `/payments/{id}`, `/disposals/{id}`, `/barters/{id}`, `/adjusts/{id}`)**: Enforces both module/action permission AND `branchId in userBranchIds()` (plus `fromBranchId` / `toBranchId` membership for `/transfers/{id}`).
- **Append-Only Audit & Adjustments (`/audit/{id}`, `/adjusts/{id}`)**: Immutable once written (`allow update: if false`), deletable only by `admin`.

## 2. Core Data Invariants
1. **Authenticated Internal Identity Only**: Every access requires `request.auth != null && request.auth.token.email is string && request.auth.token.email.matches('.*@company\\.internal$')`. Note: `@company.internal` Email/Password accounts do not use email verification links.
2. **No Plain-Text Passwords in Firestore**: `/users/{uid}` strictly rejects `pass`, `password`, and `passwordHash` keys and validates exact allowed field sets via `hasAll` + `hasOnly`.
3. **ID Poisoning Guard**: Every document ID (`uid`, `branchId`, record `id`) and stored `id` field must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
4. **Temporal Integrity & Immutable Identity**:
   - `id` and `createdAt` cannot change after creation (`incoming().id == existing().id`, `incoming().createdAt == existing().createdAt`).
   - `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Initial Admin Bootstrap Lock**: Only `admin@company.internal` creating their own `/users/$(request.auth.uid)` when neither `/settings/main` nor `/users/$(request.auth.uid)` exists can initialize the first admin account; all other user creations/edits/deletions require `isAdmin()`.
6. **Least-Privilege Field & Action Updates**: Non-admin self-updates on `/users/{uid}` are limited to `['theme', 'sidebarCollapsed', 'updatedAt']`; credit-note linkage on `/returnSlips/{id}` is scoped via `affectedKeys().hasOnly(['returnInvoiceId', 'updatedAt'])`; item cost updates from Arrivals only touch `['cost', 'updatedAt']`.
7. **Terminal State Locking**: Completed/cancelled `transfers` and `moneyMoves`, approved/rejected `disposals`, and cleared/bounced `checks` cannot be mutated by non-admin users.
8. **Global Default-Deny Catch-All**: `match /{document=**} { allow read, write: if false; }` blocks all unspecified paths.

## 3. The "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Access**: Anonymous or unauthenticated client reading/writing `/settings/main`, `/items`, or `/invoices`.
2. **External Non-Internal Email Bypass**: Token with `email: 'outsider@gmail.com'` accessing any collection.
3. **Plain-Text Password Storage**: Writing `{ ..., pass: '123456' }` into `/users/{uid}`.
4. **Privilege Self-Escalation**: Non-admin user creating or updating `/users/{uid}` to set `role: 'admin'`, `active: true`, or adding `delete_invoices: true` to `perms`.
5. **Post-Bootstrap Admin Spoof**: `admin@company.internal` attempting `isInitialAdminBootstrap` create after `/settings/main` already exists.
6. **Inactive Employee Access**: Deactivated user (`users/{uid}.active == false`) attempting to read or write any business collection.
7. **Cross-User Profile Snooping**: Non-admin user listing `/users` or calling `get` on another employee's `/users/{otherUid}`.
8. **Cross-Branch Unauthorized Access**: Employee restricted to `['b2']` reading or writing `/invoices`, `/stocks`, or `/counters/b1` belonging to `'b1'`.
9. **Unauthorized Delete / Edit Escalation**: User with `sales: true` (create invoice/delivery) but `edit_invoices: false` / `delete_invoices: false` attempting `update` or `delete` on `/invoices/{id}`.
10. **Shadow / Ghost Field Injection**: Creating/updating a document with unapproved keys outside `hasOnly(...)` or `affectedKeys().hasOnly(...)`.
11. **Timestamp Forgery & Audit Tampering**: Forging `createdAt != request.time` on create or attempting `allow update` on immutable `/audit/{id}` or `/adjusts/{id}`.
12. **Terminal State Bypass**: Non-admin modifying a `/disposals/{id}` with `status == 'approved'` or `/transfers/{id}` with `status == 'completed'` or `/checks/{id}` with `status == 'cleared'`.
