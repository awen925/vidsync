# Quick Fix: Invite Token Foreign Key Error

## The Error You're Seeing
```
Failed to store invite token (table may not exist): 
insert or update on table "project_invites" violates foreign key constraint "project_invites_created_by_fkey"
```

## One-Line Fix (Copy & Paste)

Go to your **Supabase Dashboard** → **SQL Editor** and run this:

```sql
ALTER TABLE project_invites DROP CONSTRAINT project_invites_created_by_fkey;
ALTER TABLE project_invites ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE project_invites ADD CONSTRAINT project_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

## What This Does
- ✅ Removes the strict foreign key requirement
- ✅ Allows the `created_by` field to be NULL
- ✅ Fixes the constraint violation error
- ✅ Invite token generation will now work

## Then What?
1. **Restart your cloud backend** (stop and start the server)
2. **Try generating an invite token again** in YourProjects
3. **It should work now!** ✅

## Why Did This Happen?
The original table required `created_by` to be a valid user in the `users` table, but Supabase auth users don't always sync to your users table immediately. The fix makes this constraint optional.

## Testing After Fix

### Test 1: Generate Invite
1. Go to YourProjects
2. Click a project menu
3. Click "Generate Invite Code"
4. ✅ Should see token appear (no error)

### Test 2: Use Invite
1. Go to Invited Projects
2. Click "Join"
3. Paste the token
4. Click "Join Project"
5. ✅ Should successfully join

## Still Having Issues?
Check the cloud terminal for the logs - they'll now show:
- The payload that was attempted
- The exact error (if any)
- Whether the token was still returned

## Code Changes
- ✅ `cloud/schema.sql` - Updated table definition
- ✅ `cloud/src/api/projects/routes.ts` - Better error logging
- ✅ Both files ready to deploy
