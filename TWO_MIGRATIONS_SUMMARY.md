# 📋 Two Migrations to Run

## Problem Summary

You successfully joined a project, but then got a **500 error** when fetching invited projects.

**Error Message:**
```
Failed to fetch invited projects: Could not find a relationship between 'projects' and 'owner_id' in the schema cache
```

**Root Cause:** The `projects` table's `owner_id` column doesn't have a foreign key constraint to `auth.users`, so Supabase PostgREST can't resolve the relationship.

---

## Two Migrations to Run

### 1️⃣ Migration 1: Fix project_invites FK
**File:** `cloud/migrations/20251117_fix_project_invites_fk.sql`

```
Problem: Invite token generation fails (violates FK constraint)
Root cause: created_by is NOT NULL, references users not auth.users
Solution:
  ✓ Make created_by nullable
  ✓ Reference auth.users instead of users
  ✓ Use SET NULL on delete (not CASCADE)
Result: Invite tokens can be generated ✅
```

### 2️⃣ Migration 2: Add projects.owner_id FK (NEW)
**File:** `cloud/migrations/20251117_add_projects_owner_fk.sql`

```
Problem: Can't fetch invited projects (missing relationship)
Root cause: owner_id has no FK constraint to auth.users
Solution:
  ✓ Add FK from projects.owner_id to auth.users(id)
  ✓ Use CASCADE on delete (owner deleted = projects deleted)
Result: PostgREST can now resolve owner info ✅
```

---

## Execution Order

```
RUN FIRST
    ↓
Migration 1: Fix project_invites FK
    ↓
RUN SECOND
    ↓
Migration 2: Add projects.owner_id FK
    ↓
RESTART
    ↓
Restart backend: npm run dev
    ↓
TEST
    ↓
✅ All features working!
```

---

## Quick Checklist

- [ ] Run Migration 1 in Supabase SQL Editor
- [ ] See "Query executed successfully" ✅
- [ ] Run Migration 2 in Supabase SQL Editor
- [ ] See "Query executed successfully" ✅
- [ ] Restart backend: `npm run dev`
- [ ] Generate invite token → Works ✅
- [ ] Join project → Works ✅
- [ ] Fetch invited projects → Works ✅

---

## What Changed in Schema

### Before
```sql
projects:
  id UUID PRIMARY KEY
  owner_id UUID NOT NULL  ← No FK constraint!
  ...

project_invites:
  created_by UUID NOT NULL REFERENCES users(id)  ← Wrong table & too strict
  ...
```

### After
```sql
projects:
  id UUID PRIMARY KEY
  owner_id UUID NOT NULL REFERENCES auth.users(id)  ← ✅ Has FK
  ...

project_invites:
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL  ← ✅ Nullable & correct
  ...
```

---

## Timeline

```
✅ Join project succeeds
  ↓
❌ Fetch invited projects fails (missing FK)
  ↓
🔧 Run Migrations 1 & 2
  ↓
🔄 Restart backend
  ↓
✅ Everything works!
```

---

## Files Modified/Created

| File | Status | Purpose |
|------|--------|---------|
| `cloud/migrations/20251117_fix_project_invites_fk.sql` | ✅ Ready | Fix invite token FK |
| `cloud/migrations/20251117_add_projects_owner_fk.sql` | ✅ Ready | Fix projects owner FK (NEW) |
| `cloud/schema.sql` | ✅ Updated | Both FKs defined |
| `EXECUTE_MIGRATION.md` | ✅ Updated | Step-by-step guide |

---

## Ready to Execute?

**See:** `EXECUTE_MIGRATION.md` for detailed copy-paste steps

**or** just copy both migration files into Supabase SQL Editor and run them!

🚀 Let me know once you've run both migrations!
