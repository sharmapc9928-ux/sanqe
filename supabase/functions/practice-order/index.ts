import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, CORS_HEADERS, json, razorpay, razorpayKeys, userFrom } from "../_shared/razorpay.ts";

// Starts a student's purchase of a Practice plan: reads the plan's price from
// practice_plans (never from the request), creates a Razorpay order and
// records it in practice_payments. Returns what Razorpay Checkout needs.
//
// Deploy with JWT verification ON. Body: { plan: <a practice_plans key, e.g.
// "prelims_quarter" | "both_quarter" | "prelims_year" | "both_year"> }.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const user = await userFrom(req)
    if (!user) return json({ error: "Please log in." }, 401)
    const { plan: planKey } = await req.json().catch(() => ({}))

    const admin = adminClient()
    const { data: plan } = await admin
      .from("practice_plans")
      .select("key, label, tier, amount_inr, months")
      .eq("key", planKey)
      .eq("active", true)
      .maybeSingle()
    if (!plan) return json({ error: "Choose a plan." }, 400)

    // A Prelims plan adds nothing to a running Prelims + Mains one.
    if (plan.tier === "prelims") {
      const { count } = await admin
        .from("practice_payments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("tier", "full")
        .eq("status", "paid")
        .gt("period_end", new Date().toISOString())
      if (count) return json({ error: "You already have a plan that includes this." }, 400)
    }

    const order = await razorpay("/orders", {
      method: "POST",
      body: {
        amount: plan.amount_inr * 100,
        currency: "INR",
        receipt: `p_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { user_id: user.id, plan: plan.key },
      },
    })

    const { error: insertError } = await admin.from("practice_payments").insert({
      user_id: user.id,
      plan: plan.key,
      tier: plan.tier,
      amount_inr: plan.amount_inr,
      months: plan.months,
      razorpay_order_id: order.id,
    })
    if (insertError) throw insertError

    return json({
      key_id: razorpayKeys().keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.label,
      email: user.email ?? "",
    })
  } catch (err) {
    console.error("practice-order", err)
    return json({ error: "Could not start the payment. Please try again." }, 500)
  }
})
