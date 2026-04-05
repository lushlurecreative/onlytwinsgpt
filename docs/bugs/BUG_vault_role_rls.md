# Bug: Vault Role RLS

## Status: CLOSED — Theoretical, confirmed not triggering in production

## Expected behavior

When a subscriber visits `/vault`, their `profiles.role` is `"creator"` (set during account provisioning) and the page renders normally.

## Actual behavior

This bug cannot trigger in practice. Investigation on 2026-04-02 confirmed:

1. **Only one non-creator profile exists**: the admin user (role = `admin`), which is correct behavior.
2. **DB default** is `'creator'` (migration `202603200001`). Every new profile row gets `role = 'creator'` unless explicitly overridden.
3. **CHECK constraint** only allows `'creator'` or `'admin'` — no null or unexpected values possible.
4. **`getUserRole()`** in `lib/roles.ts` returns `"creator"` for any non-`"admin"` value, including null/undefined. Safe default.
5. **RLS allows reads** — `profiles_select_own` policy (`id = auth.uid()`) lets users read their own profile via user-scoped client.
6. **Both webhook handlers** (`checkout.session.completed` line 305, `customer.subscription.created` line 472) set `role: "creator"` via admin client.
7. The vault redirect (`role !== "creator"`) only fires for admin users, who should not be in `/vault` anyway.

## Dead code note

`setUserRole()` in `lib/roles.ts` (lines 25-36) has zero callers. It is not needed because:
- Role is set by DB default on row creation
- Role is set by webhook handlers via admin client
- No user-facing flow needs to change roles

Can be removed during a future cleanup pass. Not a bug.

## Production query (2026-04-02)

```sql
SELECT id, role FROM profiles WHERE role IS NULL OR role != 'creator';
-- Result: 1 row — admin user (7f68fd24-...) with role = 'admin'. Correct.
```
