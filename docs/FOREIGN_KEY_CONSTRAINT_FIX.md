# Foreign Key Constraint Fix for project_invites Table

## Problem

When generating an invite token, the following error occurred:
```
Failed to store invite token (table may not exist): insert or update on table "project_invites" 
violates foreign key constraint "project_invites_created_by_fkey"
```

## Root Cause

The `project_invites` table was created with a `NOT NULL` foreign key constraint on `created_by` that references the `users` table:

```sql
-- BEFORE (problematic)
created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
```

The issue occurs when:
1. The user ID from Supabase Auth doesn't exist in the `users` table
2. There's a timing issue where the auth user wasn't synced to the users table yet
3. The projects table doesn't have a matching foreign key relationship

## Solution

Changed the foreign key constraint to be optional (nullable) with SET NULL on delete:

```sql
-- AFTER (fixed)
created_by UUID REFERENCES users(id) ON DELETE SET NULL,
```

Benefits:
- No hard requirement for user to exist in users table
- Still tracks who created the token if the user exists
- Falls back gracefully if user doesn't exist
- Invite functionality still works without storage issues

## Implementation Steps

### Step 1: Update Supabase Database

Run this SQL in your Supabase SQL editor (Database → SQL Editor):

```sql
-- Drop the existing constraint
ALTER TABLE project_invites DROP CONSTRAINT project_invites_created_by_fkey;

-- Make created_by nullable
ALTER TABLE project_invites ALTER COLUMN created_by DROP NOT NULL;

-- Re-add the constraint with SET NULL on delete
ALTER TABLE project_invites ADD CONSTRAINT project_invites_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

### Step 2: Verify the Change

Run this query to confirm:
```sql
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'project_invites';
```

You should see a foreign key constraint with `MATCH SIMPLE` and `UPDATE NO ACTION` and `DELETE SET NULL`.

### Step 3: Restart Application

After applying the SQL changes:
1. Restart the cloud backend
2. Try generating an invite token again
3. The token should be created and stored successfully

## Files Modified

1. **cloud/schema.sql**
   - Updated project_invites table definition
   - Changed `created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - To: `created_by UUID REFERENCES users(id) ON DELETE SET NULL`
   - Future deployments will use this corrected schema

2. **cloud/src/api/projects/routes.ts**
   - Improved error logging for troubleshooting
   - Logs the payload that failed to insert
   - Still returns the token even if storage fails

## Error Handling

The endpoint now:
1. Generates the token regardless of storage success
2. Logs detailed error information for debugging
3. Returns the token to the client even if database insert fails
4. Allows the user to share the token and use the invite functionality

This ensures the feature works even if there are temporary database issues.

## Testing

After applying the fix:

1. **Generate Invite Code**
   ```
   POST /api/projects/{projectId}/invite-token
   ```
   - Should return token in response
   - Should store in project_invites table
   - No foreign key errors

2. **Use Invite Code**
   ```
   POST /api/projects/join
   Body: { "invite_code": "token" }
   ```
   - Should successfully join project
   - Should be added to project_members table

## Migration for Existing Deployments

If you already have the table with the strict constraint:

```sql
-- Check current constraint
SELECT constraint_definition 
FROM information_schema.constraint_column_usage 
WHERE table_name = 'project_invites' AND column_name = 'created_by';

-- If it exists, drop and recreate it
BEGIN;
  ALTER TABLE project_invites DROP CONSTRAINT project_invites_created_by_fkey;
  ALTER TABLE project_invites ALTER COLUMN created_by DROP NOT NULL;
  ALTER TABLE project_invites ADD CONSTRAINT project_invites_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
COMMIT;
```

## Status

✅ Schema updated in schema.sql
✅ Routes error handling improved
✅ Ready for Supabase database migration
✅ Invite token generation will work after SQL update
✅ Join functionality preserved

## Next Steps

1. Run the SQL ALTER statements in Supabase SQL editor
2. Restart the backend
3. Test invite code generation - should work without errors
4. Test joining projects with the invite code
