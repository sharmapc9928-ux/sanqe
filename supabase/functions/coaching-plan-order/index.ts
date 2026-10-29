import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, CORS_HEADERS, json, razorpay, razorpayKeys, userFrom } from "../_shared/razorpay.ts";

// Starts a plan payment for the caller's coaching: reads the plan's price
// from coaching_plans (never from the request), creates a Razorpay order and
// records it in coaching_payments. Returns what Razorpay Checkout needs.
//
// Deploy with JWT verification ON. Body: { plan: "monthly" | "yearly" }.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const user = await userFrom(req)
    if (!user) return json({ error: "Please log in." }, 401)
    const { plan: planKey } = await req.json().catch(() => ({}))

    const admin = adminClient()
    const { data: coaching } = await admin
      .from("coachings")
      .select("id, name, status")
      .eq("owner_id", user.id)
      .maybeSingle()
    if (!coaching) return json({ error: "Apply as a coaching first." }, 400)
    if (coaching.status !== "approved") return json({ error: "This coaching account is paused. Contact Fedge support." }, 403)

    const { data: plan } = await admin
      .from("coaching_plans")
      .select("key, label, amount_inr, days")
      .eq("key", planKey)
      .eq("active", true)
      .maybeSingle()
    if (!plan) return json({ error: "Choose a plan." }, 400)

    const order = await razorpay("/orders", {
      method: "POST",
      body: {
        amount: plan.amount_inr * 100,
        currency: "INR",
        receipt: `c_${coaching.id.slice(0, 8)}_${Date.now()}`,
        notes: { coaching_id: coaching.id, plan: plan.key },
      },
    })

    const { error: insertError } = await admin.from("coaching_payments").insert({
      coaching_id: coaching.id,
      plan: plan.key,
      amount_inr: plan.amount_inr,
      days: plan.days,
      razorpay_order_id: order.id,
    })
    if (insertError) throw insertError

    return json({
      key_id: razorpayKeys().keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.label,
      coaching: coaching.name,
      email: user.email ?? "",
    })
  } catch (err) {
    console.error("coaching-plan-order", err)
    return json({ error: "Could not start the payment. Please try again." }, 500)
  }
})
