// ==========================================================
// RuxLog Platform — Supabase connection
//
// This file creates the one Supabase client that every other
// script in the app uses to talk to the database and auth.
//
// The anon/public key below is SAFE to commit and expose in
// frontend code — it is designed to be public. Access control
// is enforced by the Row Level Security policies defined in
// supabase/schema.sql, not by keeping this key secret.
//
// Never put the "service_role" key here or anywhere in
// frontend code — that key bypasses all security rules.
// ==========================================================

const SUPABASE_URL = "https://iqvtznzucdoitiseevai.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__vHvHLYTxVdsB5FvTTBqFg_1DA-7vfO";

// Named "supabaseClient" (not "supabase") so it doesn't clash with the
// "supabase" global that the CDN <script> tag above this one provides.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
