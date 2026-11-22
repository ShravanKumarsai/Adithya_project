import { createClient } from "@supabase/supabase-js";

import { supabaseUrl, supabasePublishableKey } from "./supabase-config.js";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
