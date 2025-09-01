// src/lib/supabase.ts
// Compat layer: permite que importações antigas de "@/lib/supabase"
// continuem funcionando, reexportando o cliente oficial.

export { supabase } from './supabaseClient';
export type { SupabaseClient } from '@supabase/supabase-js';
