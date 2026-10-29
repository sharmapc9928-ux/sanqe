import { createClient } from "jsr:@supabase/supabase-js@2";

// Shared by coaching-plan-order, coaching-plan-verify, series-order, series-verify,
// practice-order, practice-verify, fedge-order, fedge-verify and razorpay-webhook.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  — Razorpay → Account & Settings → API keys
//   RAZORPAY_WEBHOOK_SECRET               — the secret typed when adding the webhook

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

export const adminClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

export function razorpayKeys() {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID")
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")
  if (!keyId || !keySecret) throw new Error("Razorpay keys aren't set on the server.")
  return { keyId, keySecret }
}

// Calls the Razorpay REST API with the account's keys.
export async function razorpay(path: string, init: { method?: string; body?: unknown } = {}) {
  const { keyId, keySecret } = razorpayKeys()
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Razorpay ${path}: ${data?.error?.description ?? res.status}`)
  return data
}

// Lowercase hex HMAC-SHA256, as Razorpay signs payments and webhooks.
export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Constant-time string comparison for signatures.
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// The signed-in user from the request's bearer token, or null.
export async function userFrom(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token) return null
  const { data, error } = await adminClient().auth.getUser(token)
  return error ? null : data?.user ?? null
}

// Confirms with Razorpay that the payment belongs to the order and has the
// full amount, and captures it if it's only authorised.
async function confirmPayment(orderId: string, paymentId: string, amountInr: number) {
  const paise = amountInr * 100
  let payment = await razorpay(`/payments/${encodeURIComponent(paymentId)}`)
  if (payment.order_id !== orderId || payment.amount !== paise || payment.currency !== "INR") {
    throw new Error("Payment doesn't match the order.")
  }
  if (payment.status === "authorized") {
    payment = await razorpay(`/payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: { amount: paise, currency: "INR" },
    })
  }
  if (payment.status !== "captured") throw new Error(`Payment is ${payment.status}.`)
}

// Confirms a coaching's plan payment with Razorpay, then extends the
// coaching's paid_until. Returns the new paid_until.
export async function confirmAndActivate(orderId: string, paymentId: string) {
  const admin = adminClient()
  const { data: order, error } = await admin
    .from("coaching_payments")
    .select("amount_inr, status")
    .eq("razorpay_order_id", orderId)
    .maybeSingle()
  if (error) throw error
  if (!order) throw new Error("Unknown order.")
  if (order.status !== "paid") await confirmPayment(orderId, paymentId, order.amount_inr)
  const { data: paidUntil, error: rpcError } = await admin.rpc("activate_coaching_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  })
  if (rpcError) throw rpcError
  return paidUntil as string
}

// Confirms a student's test series purchase with Razorpay, then enrols them.
// Returns the series id (null if the series or account was deleted since).
export async function confirmAndEnroll(orderId: string, paymentId: string) {
  const admin = adminClient()
  const { data: sale, error } = await admin
    .from("series_payments")
    .select("amount_inr, status")
    .eq("razorpay_order_id", orderId)
    .maybeSingle()
  if (error) throw error
  if (!sale) throw new Error("Unknown order.")
  if (sale.status !== "paid") await confirmPayment(orderId, paymentId, sale.amount_inr)
  const { data: seriesId, error: rpcError } = await admin.rpc("activate_series_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  })
  if (rpcError) throw rpcError
  return seriesId as string | null
}

// Confirms a student's Practice plan payment with Razorpay, then starts the
// pass. Returns { tier, until } (until is null if the account was deleted since).
export async function confirmAndGrantPractice(orderId: string, paymentId: string) {
  const admin = adminClient()
  const { data: sale, error } = await admin
    .from("practice_payments")
    .select("amount_inr, status")
    .eq("razorpay_order_id", orderId)
    .maybeSingle()
  if (error) throw error
  if (!sale) throw new Error("Unknown order.")
  if (sale.status !== "paid") await confirmPayment(orderId, paymentId, sale.amount_inr)
  const { data: pass, error: rpcError } = await admin.rpc("activate_practice_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  })
  if (rpcError) throw rpcError
  return pass as { tier: string; until: string | null }
}

// Confirms a student's Fedge pass payment (Fedge mocks through a coaching, or
// FEDGE All-Access) with Razorpay, then starts the pass. Returns { kind, until }
// (until is null only if the account was deleted since).
export async function confirmAndGrantFedge(orderId: string, paymentId: string) {
  const admin = adminClient()
  const { data: sale, error } = await admin
    .from("fedge_passes")
    .select("amount_inr, status")
    .eq("razorpay_order_id", orderId)
    .maybeSingle()
  if (error) throw error
  if (!sale) throw new Error("Unknown order.")
  if (sale.status !== "paid") await confirmPayment(orderId, paymentId, sale.amount_inr)
  const { data: pass, error: rpcError } = await admin.rpc("activate_fedge_pass", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  })
  if (rpcError) throw rpcError
  return pass as { kind: string; until: string | null }
}
