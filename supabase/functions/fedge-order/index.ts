import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, CORS_HEADERS, json, razorpay, razorpayKeys, userFrom } from "../_shared/razorpay.ts";

// Starts a student's purchase of a Fedge pass: reads the price from the
// database (never from the request), creates a Razorpay order and records it,
// with the Fedge / coaching split, in fedge_passes. Returns what Razorpay
// Checkout needs.
//
//   { kind: "all" }                       FEDGE All-Access (fedge_plans 'all'),
//                                         bought from Fedge directly.
//   { kind: "mocks", coaching: "<uuid>" } Fedge mocks through a coaching the
//                                         student has added: the price is the
//                                         coaching's fedge_price_inr (never under
//                                         the floor in fedge_plans 'mocks') and
//                                         the coaching's commission_pct split.
//
// Deploy with JWT verification ON.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const user = await userFrom(req)
    if (!user) return json({ error: "Please log in." }, 401)
    const { kind, coaching: coachingId } = await req.json().catch(() => ({}))
    if (kind !== "mocks" && kind !== "all") return json({ error: "Choose what to buy." }, 400)

    const admin = adminClient()
    const { data: plan } = await admin
      .from("fedge_plans")
      .select("key, label, amount_inr, months")
      .eq("key", kind)
      .eq("active", true)
      .maybeSingle()
    if (!plan) return json({ error: "This isn't on sale right now." }, 400)

    // No paying twice for what is already running.
    const { data: running } = await admin
      .from("fedge_passes")
      .select("kind")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .gt("period_end", new Date().toISOString())
    if (kind === "all" && running?.some((p) => p.kind === "all")) {
      return json({ error: "You already have FEDGE All-Access." }, 400)
    }
    if (kind === "mocks" && running && running.length > 0) {
      return json({ error: "You already have access to Fedge mocks." }, 400)
    }

    let price = plan.amount_inr as number
    let pct = 0
    let coaching: { id: string; name: string } | null = null
    if (kind === "mocks") {
      if (typeof coachingId !== "string" || !UUID.test(coachingId)) return json({ error: "Choose a coaching." }, 400)
      const { data: c } = await admin
        .from("coachings")
        .select("id, name, status, commission_pct, fedge_price_inr")
        .eq("id", coachingId)
        .maybeSingle()
      if (!c || c.status !== "approved") return json({ error: "This coaching isn't available." }, 400)

      // The student must have added this coaching: its referral code, or a
      // course of theirs.
      const { data: joined } = await admin
        .from("coaching_students")
        .select("user_id")
        .eq("coaching_id", c.id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!joined) {
        const { data: enrolled } = await admin
          .from("series_enrollments")
          .select("series_id, test_series!inner(coaching_id)")
          .eq("user_id", user.id)
          .eq("test_series.coaching_id", c.id)
          .limit(1)
        if (!enrolled || enrolled.length === 0) return json({ error: "Add this coaching with its referral code first." }, 400)
      }

      price = Number(c.fedge_price_inr)
      if (!Number.isInteger(price) || price < plan.amount_inr) {
        return json({ error: "This coaching's price isn't set up properly. Please contact the coaching." }, 400)
      }
      pct = Number(c.commission_pct)
      coaching = { id: c.id, name: c.name }
    }

    // Direct sales are all Fedge's; through a coaching the usual split applies.
    const fedgeShare = coaching ? Math.round((price * pct) / 100) : price
    const coachingShare = price - fedgeShare

    const order = await razorpay("/orders", {
      method: "POST",
      body: {
        amount: price * 100,
        currency: "INR",
        receipt: `f_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { user_id: user.id, kind, coaching_id: coaching?.id ?? "" },
      },
    })

    const { error: insertError } = await admin.from("fedge_passes").insert({
      user_id: user.id,
      kind,
      coaching_id: coaching?.id ?? null,
      amount_inr: price,
      months: plan.months,
      commission_pct: coaching ? pct : 0,
      fedge_share_inr: fedgeShare,
      coaching_share_inr: coachingShare,
      razorpay_order_id: order.id,
    })
    if (insertError) throw insertError

    return json({
      key_id: razorpayKeys().keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.label,
      coaching: coaching?.name ?? null,
      email: user.email ?? "",
    })
  } catch (err) {
    console.error("fedge-order", err)
    return json({ error: "Could not start the payment. Please try again." }, 500)
  }
})
