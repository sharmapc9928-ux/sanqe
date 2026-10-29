import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Permanently deletes the calling user's account. Every table that holds
// personal data references auth.users with ON DELETE CASCADE, so removing the
// auth user removes their dream job, practice attempts, sessions, mistake
// notebook, daily-challenge results, descriptive drafts, submissions and
// evaluations in the same step.
//
// Deploy with JWT verification ON — only a signed-in user can call this, and
// only for themselves (the id comes from their own token, never the body).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "Please log in." }, 401)
    const { data, error } = await admin.auth.getUser(token)
    const user = data?.user
    if (error || !user) return json({ error: "Please log in." }, 401)

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error("delete-account failed", user.id, deleteError.message)
      return json({ error: "Could not delete your account. Please try again or email us." }, 500)
    }
    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: "Could not delete your account. Please try again or email us." }, 500)
  }
})
