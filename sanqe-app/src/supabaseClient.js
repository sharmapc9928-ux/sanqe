import { createClient } from '@supabase/supabase-js'

// Set these in sanqe-app/.env.local (see .env.example). The anon / publishable
// key is safe to ship in the browser; row-level security is what protects data.
// The placeholders only keep `npm run build` working before you have a project.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-or-publishable-key'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
