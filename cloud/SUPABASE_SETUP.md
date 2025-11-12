# Vidsync Supabase Schema Deployment Guide

## Overview
This document explains how to deploy the Vidsync database schema to Supabase and configure it for production use.

## Prerequisites
- Supabase account (free or paid at https://supabase.com)
- A new Supabase project created
- Supabase CLI installed (optional, for local testing)

## Step 1: Create a New Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New project"
3. Fill in:
   - **Project name**: `vidsync` (or your preferred name)
   - **Database password**: Generate a strong password (save it securely)
   - **Region**: Choose closest to your users (e.g., `us-east-1` for US)
4. Click "Create new project"
5. Wait for the project to initialize (2-3 minutes)

## Step 2: Access the SQL Editor

1. In your Supabase dashboard, navigate to **SQL Editor** (left sidebar)
2. Click **New query**
3. Name it `Vidsync Schema` or similar

## Step 3: Run the Schema SQL

1. Open `/home/fograin/work1/vidsync/cloud/schema.sql` in a text editor
2. Copy the entire SQL content
3. Paste it into the Supabase SQL Editor query window
4. Click **Run** (or press `Cmd+Enter` / `Ctrl+Enter`)
5. You should see success messages for each table and function creation

Alternatively, use the Supabase CLI:
```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref <PROJECT_REF>

# Push the schema
supabase push
```

## Step 4: Verify Tables Were Created

1. Go to **Table Editor** (left sidebar)
2. Confirm these tables exist:
   - `users`
   - `devices`
   - `projects`
   - `project_members`
   - `project_devices`
   - `sync_events`
   - `conflicts`
   - `user_settings`
   - `magic_link_tokens`
   - `audit_logs`

## Step 5: Configure Supabase Auth

### Enable Email Auth
1. Go to **Authentication** > **Providers**
2. Click on **Email**
3. Enable **Email/Password** (for Phase 1)
4. For Phase 2, enable **Magic Link** as well
5. Configure custom email templates if desired

### Create JWT Secret
1. Go to **Project Settings** > **API**
2. Find **JWT Secret** (under "JWT Settings")
3. Copy the JWT secret and save it to your `.env` files

### Get API URL and Anon Key
1. In **Project Settings** > **API**, you'll find:
   - **Project URL**: `https://<PROJECT_REF>.supabase.co`
   - **Anon Key**: `eyJhbGc...` (public key for client-side use)
   - **Service Role Key**: `eyJhbGc...` (private key for server-side use)

## Step 6: Update Cloud Backend Environment

Create or update `/home/fograin/work1/vidsync/cloud/.env`:

```bash
# Server
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
JWT_SECRET=<JWT_SECRET_FROM_SUPABASE>

# CORS
CORS_ORIGIN=http://localhost:3001,http://localhost:29999

# Optional: Email Service (for Phase 2)
SENDGRID_API_KEY=<YOUR_SENDGRID_KEY>
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

## Step 7: Update Cloud Backend Code

Replace stub implementations in `/home/fograin/work1/vidsync/cloud/src/api/` with real Supabase queries.

### Example: Auth Login Route
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const loginUser = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(`Login failed: ${error.message}`);
  
  return data.session?.access_token;
};
```

### Example: Get Projects Route
```typescript
export const getUserProjects = async (userId: string) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', userId)
    .or(`id.in.(select project_id from project_members where user_id=${userId} and status='accepted')`);

  if (error) throw new Error(`Fetch failed: ${error.message}`);
  return data;
};
```

## Step 8: Test Database Connections

Run the cloud backend:
```bash
cd /home/fograin/work1/vidsync/cloud
npm install @supabase/supabase-js
npm run dev
```

Test a health check:
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-11-12T..."
}
```

## Step 9: Enable Row-Level Security (RLS)

RLS policies are already defined in the schema. They restrict data access based on user ID.

**To verify RLS is enabled:**
1. Go to **Table Editor**
2. Click on any table
3. Look for an "Auth" tab showing RLS policies

RLS is **enabled by default** for all tables in the schema.sql file.

## Important Security Notes

⚠️ **In Production:**

1. **Never commit secrets to git** — use environment variables
2. **Enable HTTPS** — Supabase enforces this automatically
3. **Set strong database passwords** — 32+ characters with mixed case, numbers, symbols
4. **Monitor auth attempts** — Supabase logs all login failures
5. **Use Service Role Key only on server** — never expose in client code
6. **Enable backups** — Supabase includes daily backups on Pro plans
7. **Review RLS policies regularly** — ensure they match your authorization model

## Troubleshooting

### "Relation does not exist" error
- **Cause**: Schema wasn't applied, or table names are case-sensitive
- **Fix**: Re-run the entire schema.sql file in the SQL Editor

### "Permission denied" when inserting
- **Cause**: RLS policy is blocking the operation, or user is not authenticated
- **Fix**: Check the RLS policy in the Table Editor; ensure user is authenticated

### "Invalid JWT" error
- **Cause**: JWT_SECRET doesn't match Supabase's secret
- **Fix**: Verify JWT_SECRET in .env matches Supabase Project Settings

### Queries are slow
- **Cause**: Missing indexes on frequently-queried columns
- **Fix**: Check the schema.sql file; indexes are already created on common query paths

## Next Steps

1. **Phase 2 Implementation**:
   - Replace auth stub with real Supabase Auth
   - Implement password hashing with bcryptjs
   - Set up email verification and magic links
   - Add OAuth (Google, GitHub) for social login

2. **Testing**:
   - Write integration tests with Supabase test client
   - Load test with k6 or Artillery
   - Backup and restore testing

3. **Monitoring**:
   - Set up error logging (Sentry, LogRocket)
   - Monitor database performance (Supabase dashboard)
   - Alert on auth failures and rate limits

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row-Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

