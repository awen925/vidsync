# Quick Migration Steps

## TL;DR - Just Do This

1. **Open Supabase Dashboard**
   - Go to your project
   - Click SQL Editor

2. **Copy & Paste This**
```sql
BEGIN;
ALTER TABLE IF EXISTS project_invites DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;
ALTER TABLE IF EXISTS project_invites ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE IF EXISTS project_invites ADD CONSTRAINT project_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
COMMIT;
```

3. **Click Run**
   - Wait for "Query executed successfully"

4. **Restart your backend**
   ```bash
   # Stop current process (Ctrl+C)
   # Then restart
   npm run dev
   ```

5. **Done!** ✅
   - Try generating invite tokens
   - Should work without errors now

## That's it!

The migration is in: `cloud/migrations/20251117_fix_project_invites_fk.sql`

For detailed info, see: `docs/MIGRATION_GUIDE.md`
