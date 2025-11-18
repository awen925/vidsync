# 🔧 Execute Migrations Now

You need to run **3 migrations** in order to completely fix the issue:

## Migration 1: Fix project_invites Foreign Key

**File:** `cloud/migrations/20251117_fix_project_invites_fk.sql`

```sql
-- Migration: Fix project_invites foreign key constraint
-- Date: 2025-11-17
-- Purpose: Make created_by nullable and fix foreign key constraint
-- Issue: Foreign key constraint "project_invites_created_by_fkey" violates on insert
-- Root cause: created_by is NOT NULL but references auth.users table
-- Solution: Make created_by nullable with SET NULL on delete

BEGIN;

-- Step 1: Drop the existing foreign key constraint (handles both old and new constraint names)
DO $$
BEGIN
  ALTER TABLE IF EXISTS project_invites DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

-- Step 2: Make created_by nullable (allows NULL values)
-- This prevents NOT NULL constraint violations
ALTER TABLE IF EXISTS project_invites 
ALTER COLUMN created_by DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with SET NULL on delete
-- This ensures that if a user is deleted, the created_by field is set to NULL
-- instead of cascading the delete to the invite record
ALTER TABLE IF EXISTS project_invites 
ADD CONSTRAINT project_invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Verify the column is nullable
COMMIT;
```

---

## Migration 2: Add Foreign Key to projects.owner_id

**File:** `cloud/migrations/20251117_add_projects_owner_fk.sql`

```sql
-- Migration: Add foreign key constraint to projects.owner_id
-- Date: 2025-11-17
-- Purpose: Link projects to auth.users table for proper relationship queries
-- Issue: Supabase PostgREST can't find relationship between 'projects' and 'owner_id' without FK
-- Solution: Add foreign key constraint from projects.owner_id to auth.users(id)

BEGIN;

-- Step 1: Drop existing constraint if it exists (in case of previous migration attempts)
DO $$
BEGIN
  ALTER TABLE IF EXISTS projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

-- Step 2: Add foreign key constraint linking owner_id to auth.users
-- ON DELETE CASCADE ensures that if a user is deleted, their projects are also deleted
ALTER TABLE IF EXISTS projects 
ADD CONSTRAINT projects_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
```

---

## Migration 3: Remove Custom Users Table (NEW - IMPORTANT!)

**File:** `cloud/migrations/20251117_remove_users_table.sql`

This migration removes the custom `users` table that was causing confusion and replaces all references with `auth.users`.

```sql
-- Migration: Remove custom users table and use auth.users exclusively
-- Date: 2025-11-17
-- Purpose: Eliminate confusion between custom users table and Supabase auth.users
-- Issue: Having both tables causes FK constraint conflicts
-- Solution: Drop custom users table, update all FKs to reference auth.users

BEGIN;

-- Step 1: Drop foreign key constraints that reference the old users table
DO $$
BEGIN
  ALTER TABLE IF EXISTS devices DROP CONSTRAINT IF EXISTS devices_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS project_devices DROP CONSTRAINT IF EXISTS project_devices_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS sync_logs DROP CONSTRAINT IF EXISTS sync_logs_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS file_operations DROP CONSTRAINT IF EXISTS file_operations_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 2: Drop the old users table
DROP TABLE IF EXISTS users CASCADE;

-- Step 3: Re-add foreign key constraints referencing auth.users
ALTER TABLE IF EXISTS devices 
ADD CONSTRAINT devices_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS project_members 
ADD CONSTRAINT project_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS project_devices 
ADD CONSTRAINT project_devices_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sync_logs 
ADD CONSTRAINT sync_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS file_operations 
ADD CONSTRAINT file_operations_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Verify the schema is clean
-- All FKs should now reference auth.users(id)
COMMIT;
```

---

## How to Execute

### Option 1: Supabase SQL Editor (Recommended)

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Click **SQL Editor** (left sidebar)

**Run Migration 1:**
4. Click **New Query**
5. Copy from `cloud/migrations/20251117_fix_project_invites_fk.sql`
6. Paste into the editor
7. Click **Run** (green button)
8. Wait for "Query executed successfully" ✅

**Run Migration 2:**
9. Click **New Query**
10. Copy from `cloud/migrations/20251117_add_projects_owner_fk.sql`
11. Paste into the editor
12. Click **Run** (green button)
13. Wait for "Query executed successfully" ✅

**Run Migration 3 (IMPORTANT):**
14. Click **New Query**
15. Copy from `cloud/migrations/20251117_remove_users_table.sql`
16. Paste into the editor
17. Click **Run** (green button)
18. Wait for "Query executed successfully" ✅

---

### Option 2: psql (CLI)

```bash
# Run Migration 1
psql postgresql://[user]:[password]@[host]/[database] < cloud/migrations/20251117_fix_project_invites_fk.sql

# Run Migration 2
psql postgresql://[user]:[password]@[host]/[database] < cloud/migrations/20251117_add_projects_owner_fk.sql

# Run Migration 3 (IMPORTANT)
psql postgresql://[user]:[password]@[host]/[database] < cloud/migrations/20251117_remove_users_table.sql
```

---

## After Migrations

1. Restart your backend:
   ```bash
   npm run dev
   ```

2. Test the full workflow:
   - ✅ Generate invite token (no errors)
   - ✅ Join project with token (works)
   - ✅ View invited projects (no 500 error)
   - ✅ See owner info (relationship works)

---

## What These Migrations Fix

### Migration 1
- **Error:** `violates foreign key constraint "project_invites_created_by_fkey"`
- **Fix:** Make `created_by` nullable, reference `auth.users`
- **Result:** Invite tokens can be generated without constraint violation

### Migration 2
- **Error:** `Could not find a relationship between 'projects' and 'owner_id'`
- **Fix:** Add foreign key constraint from `projects.owner_id` to `auth.users(id)`
- **Result:** PostgREST can now join owner info correctly in queries

### Migration 3 (NEW)
- **Error:** Confusion between custom `users` table and `auth.users`
- **Fix:** Drop custom `users` table, update all FKs to use `auth.users`
- **Result:** Single source of truth - only `auth.users` exists

---

## Verify It Worked

Check in Supabase SQL Editor:

```sql
-- Check that users table is gone
SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'users');
-- Expected: false (no custom users table)

-- Check Migration 1
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'project_invites' AND column_name = 'created_by';
-- Expected: is_nullable = YES

-- Check Migration 2
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'projects' AND constraint_type = 'FOREIGN KEY';
-- Expected: projects_owner_id_fkey exists

-- Check Migration 3
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'devices' AND constraint_type = 'FOREIGN KEY';
-- Expected: devices_user_id_fkey exists and references auth.users
```

---

## Status

- ✅ All 3 migration files created and ready
- ✅ Schema updated in `cloud/schema.sql` (removed users table, all FKs to auth.users)
- ✅ Backend code is correct
- ⏳ **You:** Run all 3 migrations in Supabase (IN ORDER)
- ⏳ **You:** Restart backend
- ⏳ **You:** Test full invite/join workflow

**IMPORTANT:** Run migrations in order: 1 → 2 → 3

**Ready? Let's go!** 🚀

---

## Migration 2: Add Foreign Key to projects.owner_id

**File:** `cloud/migrations/20251117_add_projects_owner_fk.sql`

```sql
-- Migration: Add foreign key constraint to projects.owner_id
-- Date: 2025-11-17
-- Purpose: Link projects to auth.users table for proper relationship queries
-- Issue: Supabase PostgREST can't find relationship between 'projects' and 'owner_id' without FK
-- Solution: Add foreign key constraint from projects.owner_id to auth.users(id)

BEGIN;

-- Step 1: Drop existing constraint if it exists (in case of previous migration attempts)
DO $$
BEGIN
  ALTER TABLE IF EXISTS projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

-- Step 2: Add foreign key constraint linking owner_id to auth.users
-- ON DELETE CASCADE ensures that if a user is deleted, their projects are also deleted
ALTER TABLE IF EXISTS projects 
ADD CONSTRAINT projects_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
```

---

## How to Execute

### Option 1: Supabase SQL Editor (Recommended)

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**

**First, run Migration 1:**
5. Copy from `cloud/migrations/20251117_fix_project_invites_fk.sql`
6. Paste into the editor
7. Click **Run** (green button)
8. Wait for "Query executed successfully" ✅

**Then, run Migration 2:**
9. Click **New Query** again
10. Copy from `cloud/migrations/20251117_add_projects_owner_fk.sql`
11. Paste into the editor
12. Click **Run** (green button)
13. Wait for "Query executed successfully" ✅

---

### Option 2: psql (CLI)

```bash
# Run Migration 1
psql postgresql://[user]:[password]@[host]/[database] < cloud/migrations/20251117_fix_project_invites_fk.sql

# Run Migration 2
psql postgresql://[user]:[password]@[host]/[database] < cloud/migrations/20251117_add_projects_owner_fk.sql
```

---

## After Migrations

1. Restart your backend:
   ```bash
   npm run dev
   ```

2. Test the full workflow:
   - ✅ Generate invite token (no errors)
   - ✅ Join project with token (works)
   - ✅ View invited projects (no 500 error)
   - ✅ See owner info (relationship works)

---

## What These Migrations Fix

### Migration 1
- **Error:** `violates foreign key constraint "project_invites_created_by_fkey"`
- **Fix:** Make `created_by` nullable, reference `auth.users` instead of `users`
- **Result:** Invite tokens can be generated without constraint violation

### Migration 2
- **Error:** `Could not find a relationship between 'projects' and 'owner_id'`
- **Fix:** Add foreign key constraint from `projects.owner_id` to `auth.users(id)`
- **Result:** PostgREST can now join owner info correctly in queries

---

## Verify It Worked

Check in Supabase SQL Editor:

```sql
-- Check Migration 1
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'project_invites' AND column_name = 'created_by';
-- Expected: is_nullable = YES

-- Check Migration 2
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'projects' AND constraint_type = 'FOREIGN KEY';
-- Expected: projects_owner_id_fkey exists
```

---

## Status

- ✅ Both migration files created and ready
- ✅ Schema updated in `cloud/schema.sql`
- ✅ Backend code is correct
- ⏳ **You:** Run both migrations in Supabase
- ⏳ **You:** Restart backend
- ⏳ **You:** Test full invite/join workflow

**Ready? Let's go!** 🚀
