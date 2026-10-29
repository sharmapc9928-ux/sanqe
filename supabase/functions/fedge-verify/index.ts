import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, confirmAndGrantFedge, CORS_HEADERS, hmacHex, json, razorpayKeys, safeEqual, userFrom } from "../_shared/razorpay.ts";

// Called by the app when Razorpay Checkout reports success for a Fedge pass.
// Checks the checkout signature, that the order is the caller's own, and with
// Razorpay that the money arrived, then starts the pass.
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
      .from("fedge_passes")
      .select("id")
      .eq("razorpay_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!owned) return json({ error: "This payment isn't yours." }, 403)

    const pass = await confirmAndGrantFedge(orderId, paymentId)
    return json({ ok: true, kind: pass.kind, until: pass.until })
  } catch (err) {
    console.error("fedge-verify", err)
    return json({ error: "We couldn't confirm your payment yet. If money was taken, your access starts within a few minutes — refresh this page." }, 500)
  }
})
