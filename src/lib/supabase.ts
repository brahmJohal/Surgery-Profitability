import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secureUrl = !import.meta.env.PROD || url?.startsWith("https://");

// Production clients must never connect to Supabase over plain HTTP.
export const supabase = url && key && secureUrl ? createClient(url, key) : null;
