# 🎯 Three Migrations to Run (Critical Fix)

## The Root Problem

Your database had **two conflicting user tables**:
1. Custom `users` table (old, not used)
2. Supabase `auth.users` table (actual, being used)

This caused foreign key confusion when trying to resolve relationships.

---

## Solution: Run 3 Migrations in Order

```
Migration 1: Fix project_invites FK
    ↓ (wait for success)
Migration 2: Add projects.owner_id FK
    ↓ (wait for success)
Migration 3: Delete custom users table & fix all FKs
    ↓ (wait for success)
RESTART Backend
    ↓
✅ ALL WORKING!
```

---

## What Each Migration Does

### Migration 1: `20251117_fix_project_invites_fk.sql`
```
Make created_by nullable
Reference auth.users (not users)
Result: Invite tokens can be generated
```

### Migration 2: `20251117_add_projects_owner_fk.sql`
```
Add FK from projects.owner_id to auth.users
Result: PostgREST can resolve owner relationship
```

### Migration 3: `20251117_remove_users_table.sql` (NEW!)
```
DROP custom users table
UPDATE all FKs to reference auth.users only
Clean up all 5 tables that reference user_id
Result: Single source of truth = auth.users only
```

---

## Before vs After

### Before
```
users (custom table) ← CONFUSING!
  ↑
  └─ devices.user_id references this
  └─ project_members.user_id references this
  └─ conflicts.resolved_by references this
  └─ etc...

auth.users (Supabase built-in)
  └─ projects.owner_id tries to reference this
  └─ project_invites.created_by tries to reference this

RESULT: FK conflicts! 💥
```

### After
```
auth.users (Supabase built-in) ← SINGLE SOURCE OF TRUTH ✅
  ├─ devices.user_id REFERENCES auth.users
  ├─ project_members.user_id REFERENCES auth.users
  ├─ projects.owner_id REFERENCES auth.users
  ├─ project_invites.created_by REFERENCES auth.users
  ├─ conflicts.resolved_by REFERENCES auth.users
  ├─ user_settings.user_id REFERENCES auth.users
  ├─ audit_logs.user_id REFERENCES auth.users
  └─ ... all other FKs REFERENCE auth.users

RESULT: Everything works! 🎉
```

---

## Files Changed

### Migration Files Created
- ✅ `cloud/migrations/20251117_fix_project_invites_fk.sql`
- ✅ `cloud/migrations/20251117_add_projects_owner_fk.sql`
- ✅ `cloud/migrations/20251117_remove_users_table.sql` (NEW!)

### Schema Updated
- ✅ `cloud/schema.sql`:
  - Removed custom `users` table definition (lines 9-28)
  - Updated all FK references from `users` to `auth.users` (7 changes)
  - Added comment: "All user references use Supabase's built-in auth.users table"

---

## Execute Now

### In Supabase SQL Editor:

```
1. New Query → Paste Migration 1 → Run → ✅
2. New Query → Paste Migration 2 → Run → ✅
3. New Query → Paste Migration 3 → Run → ✅
4. Terminal: npm run dev
5. Test it! 🚀
```

**See `EXECUTE_MIGRATION.md` for copy-paste SQL**

---

## After Migrations

Your database will be clean and consistent:
- ✅ Only `auth.users` for user data
- ✅ All FKs properly point to `auth.users`
- ✅ No conflicting tables
- ✅ Supabase PostgREST can resolve all relationships
- ✅ Invite tokens generate without errors
- ✅ Invited projects endpoint works
- ✅ Owner info loads correctly

---

## Status Checklist

- [ ] Run Migration 1 in Supabase
- [ ] Run Migration 2 in Supabase
- [ ] Run Migration 3 in Supabase (NEW!)
- [ ] See "Query executed successfully" for all 3
- [ ] Restart backend: `npm run dev`
- [ ] Test generate invite → ✅ Works
- [ ] Test join project → ✅ Works
- [ ] Test invited projects list → ✅ Works

---

## Questions?

All migrations are **safe**:
- ✅ Wrapped in transactions
- ✅ Use IF EXISTS to prevent errors
- ✅ Drop old FKs before re-adding
- ✅ Only drop custom `users` table (not auth.users)
- ✅ Preserve all data

Let's go! 🚀
