import { createClient } from "@supabase/supabase-js";

// Never call createClient at module level - only inside functions at runtime
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
