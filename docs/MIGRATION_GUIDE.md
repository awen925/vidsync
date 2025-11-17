# Migration Guide: Fix project_invites Foreign Key

## File Location
`cloud/migrations/20251117_fix_project_invites_fk.sql`

## What This Migration Does

This migration updates your existing Supabase database to:
1. ✅ Drop the strict NOT NULL constraint on `created_by`
2. ✅ Make `created_by` nullable (can be NULL)
3. ✅ Update the foreign key constraint from CASCADE to SET NULL
4. ✅ Fix the foreign key violation error when generating invite tokens

## Why You Need This

The current table definition in your Supabase database has:
```sql
created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
```

This causes an error when you try to generate an invite token because:
- The user from Supabase Auth may not exist in your `users` table yet
- The strict NOT NULL constraint requires the user to exist
- The CASCADE delete behavior is overly restrictive

## How to Apply the Migration

### Method 1: Using Supabase SQL Editor (Easiest) ✅

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project
   - Navigate to **SQL Editor**

2. **Create New Query**
   - Click "New Query"
   - Copy the entire content from: `cloud/migrations/20251117_fix_project_invites_fk.sql`
   - Paste it into the editor

3. **Run the Migration**
   - Click the **"Run"** button (or press Ctrl+Enter)
   - Wait for the query to complete
   - You should see: `Query executed successfully`

### Method 2: Using psql Command Line

```bash
# If you have psql installed and Supabase connection string
psql YOUR_SUPABASE_CONNECTION_STRING < cloud/migrations/20251117_fix_project_invites_fk.sql
```

### Method 3: Using Supabase CLI

```bash
# If you have supabase-cli installed
supabase db pull  # First, pull your current schema
# Then apply the migration
supabase migration new fix_project_invites_fk
# Copy the migration content to the new file
supabase migration up
```

## Migration Content

The migration file contains:

```sql
BEGIN;

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE IF EXISTS project_invites 
DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;

-- Step 2: Make created_by nullable
ALTER TABLE IF EXISTS project_invites 
ALTER COLUMN created_by DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with SET NULL
ALTER TABLE IF EXISTS project_invites 
ADD CONSTRAINT project_invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
```

## What Each Step Does

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Drop constraint | Remove the old strict constraint |
| 2 | Drop NOT NULL | Allow NULL values in created_by |
| 3 | Add constraint | Re-add with SET NULL behavior |

## Safety Features

✅ **Wrapped in Transaction**: Uses BEGIN/COMMIT to ensure all-or-nothing execution
✅ **IF EXISTS**: Uses `IF EXISTS` clauses to prevent errors if objects don't exist
✅ **Non-Destructive**: Doesn't drop any data, only modifies constraints
✅ **Reversible**: Can be rolled back if needed

## Verification

After running the migration, verify it worked:

1. **In Supabase SQL Editor**, run:
```sql
SELECT 
  constraint_name, 
  constraint_type,
  column_name
FROM information_schema.constraint_column_usage 
WHERE table_name = 'project_invites' AND column_name = 'created_by';
```

2. **Expected result**:
```
constraint_name: project_invites_created_by_fkey
constraint_type: FOREIGN KEY
column_name: created_by
```

3. **Check column nullability**:
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'project_invites' AND column_name = 'created_by';
```

Expected: `is_nullable = YES`

## Rollback (If Needed)

If something goes wrong, you can revert by running this in Supabase SQL Editor:

```sql
BEGIN;

ALTER TABLE IF EXISTS project_invites 
DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;

ALTER TABLE IF EXISTS project_invites 
ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE IF EXISTS project_invites 
ADD CONSTRAINT project_invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;
```

## After Migration

Once the migration is applied:

1. **Restart your backend server**
   ```bash
   npm run dev  # or your start command
   ```

2. **Test invite token generation**
   - Go to YourProjects page
   - Click a project menu
   - Click "Generate Invite Code"
   - Should show token without errors ✅

3. **Test joining with invite**
   - Go to Invited Projects page
   - Click "Join" button
   - Paste the token
   - Click "Join Project"
   - Should successfully join ✅

## Troubleshooting

### "Constraint does not exist" Error
- This is normal and handled by the `IF EXISTS` clause
- The migration will still succeed

### "Table does not exist" Error
- This means the `project_invites` table wasn't created yet
- Run the schema.sql first to create the table
- Then run this migration

### "Permission denied" Error
- You may not have sufficient Supabase permissions
- Contact your Supabase project owner
- Ensure you're using the correct role/password

### Still Getting Foreign Key Errors
- Verify the migration ran successfully (check verification step above)
- Check that `created_by` column is nullable: `is_nullable = YES`
- Restart your backend completely (not just reload)
- Clear any cached connections

## Files Modified

- ✅ `cloud/migrations/20251117_fix_project_invites_fk.sql` - New migration file
- ✅ `cloud/schema.sql` - Already updated with corrected schema definition

## Related Documentation

- See: `docs/FOREIGN_KEY_CONSTRAINT_FIX.md` - Detailed explanation of the issue
- See: `docs/QUICK_FIX_INVITE_TOKEN.md` - Quick reference guide
- See: `docs/INVITE_AND_JOIN_IMPLEMENTATION.md` - Full feature documentation

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Supabase documentation at https://supabase.com/docs
3. Check cloud backend logs for error messages
4. Verify the migration file syntax is correct

## Checklist

- [ ] Opened Supabase SQL Editor
- [ ] Copied migration content to SQL Editor
- [ ] Ran the migration
- [ ] Saw "Query executed successfully" message
- [ ] Restarted backend
- [ ] Tested invite token generation
- [ ] Tested joining with invite code
- [ ] All working! ✅
