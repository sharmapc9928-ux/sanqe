import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, confirmAndActivate, CORS_HEADERS, hmacHex, json, razorpayKeys, safeEqual, userFrom } from "../_shared/razorpay.ts";

// Called by the app when Razorpay Checkout reports success. Checks the
// checkout signature, that the order is the caller's own, and with Razorpay
// that the money arrived, then extends the coaching's paid_until.
//
// Deploy with JWT verification ON.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const user = await userFrom(req)
    if (!user) return json({ error: "Please log in." }, 401)
    const body = await req.json().catch(() => ({}))
    const orderId = String(body.razorpay_order_id ?? "")
    const paymentId = String(body.razorpay_payment_id ?? "")
    const signature = String(body.razorpay_signature ?? "")
    if (!orderId || !paymentId || !signature) return json({ error: "Payment details are missing." }, 400)

    const expected = await hmacHex(razorpayKeys().keySecret, `${orderId}|${paymentId}`)
    if (!safeEqual(expected, signature)) return json({ error: "This payment couldn't be verified." }, 400)

    const { data: owned } = await adminClient()
      .from("coaching_payments")
      .select("id, coachings!inner(owner_id)")
      .eq("razorpay_order_id", orderId)
      .eq("coachings.owner_id", user.id)
      .maybeSingle()
    if (!owned) return json({ error: "This payment isn't for your coaching." }, 403)

    const paidUntil = await confirmAndActivate(orderId, paymentId)
    return json({ ok: true, paid_until: paidUntil })
  } catch (err) {
    console.error("coaching-plan-verify", err)
    return json({ error: "We couldn't confirm your payment yet. If money was taken, your plan starts within a few minutes — refresh this page." }, 500)
  }
})
