import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase credentials are not set. Supabase client will not work until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided.');
}

let client: SupabaseClient | null = null;

try {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        // disable auto refresh on server
        persistSession: false,
      },
    });
  }
} catch (err) {
  console.warn('Failed to initialize Supabase client:', err);
  client = null;
}

// Create a mock Supabase client for development (when real credentials aren't available)
const createMockSupabaseClient = (): SupabaseClient => {
  const notConfiguredError = { message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable features.' };
  
  return {
    auth: {
      admin: {
        createUser: async () => ({ data: null, error: notConfiguredError }),
        signInWithPassword: async () => ({ data: null, error: notConfiguredError }),
        generateLink: async () => ({ data: null, error: notConfiguredError }),
      },
      signInWithPassword: async () => ({ data: null, error: notConfiguredError }),
      signInWithOtp: async () => ({ data: null, error: notConfiguredError }),
      getUser: async () => ({ data: null, error: notConfiguredError }),
    },
    from: () => ({
      insert: async () => ({ data: null, error: notConfiguredError }),
      select: () => ({
        single: async () => ({ data: null, error: notConfiguredError }),
        eq: async () => ({ data: null, error: notConfiguredError }),
      }),
      eq: async () => ({ data: null, error: notConfiguredError }),
      delete: () => ({
        eq: async () => ({ data: null, error: notConfiguredError }),
      }),
    }),
  } as unknown as SupabaseClient;
};

export const supabase: SupabaseClient = client || createMockSupabaseClient();

export default supabase;
