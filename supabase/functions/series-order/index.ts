import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, CORS_HEADERS, json, razorpay, razorpayKeys, userFrom } from "../_shared/razorpay.ts";

// Starts a student's purchase of a test series: reads the price and the
// coaching's commission from the database (never from the request), creates a
// Razorpay order for the full price and records it, with the Fedge /
// coaching split, in series_payments. Returns what Razorpay Checkout needs.
//
// Deploy with JWT verification ON. Body: { series: "<test_series id>" }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const user = await userFrom(req)
    if (!user) return json({ error: "Please log in." }, 401)
    const { series: seriesId } = await req.json().catch(() => ({}))
    if (typeof seriesId !== "string" || !UUID.test(seriesId)) return json({ error: "Choose a test series." }, 400)

    const admin = adminClient()
    const { data: series } = await admin
      .from("test_series")
      .select("id, title, price_inr, on_sale, coaching_id, coachings(id, name, status, commission_pct)")
      .eq("id", seriesId)
      .maybeSingle()
    const coaching = series?.coachings
    if (!series || !series.on_sale || !coaching || coaching.status !== "approved") {
      return json({ error: "This test series isn't on sale." }, 400)
    }
    const price = Number(series.price_inr)
    if (!Number.isInteger(price) || price <= 0) return json({ error: "This test series isn't on sale." }, 400)

    const { data: enrolled } = await admin
      .from("series_enrollments")
      .select("series_id")
      .eq("series_id", series.id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (enrolled) return json({ error: "You already have this test series." }, 400)

    const { count: mocks } = await admin
      .from("coaching_mocks")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id)
      .eq("status", "published")
    if (!mocks) return json({ error: "This test series has no mocks yet. Check back once the coaching adds them." }, 400)

    const pct = Number(coaching.commission_pct)
    const fedgeShare = Math.round((price * pct) / 100)

    const order = await razorpay("/orders", {
      method: "POST",
      body: {
        amount: price * 100,
        currency: "INR",
        receipt: `s_${series.id.slice(0, 8)}_${Date.now()}`,
        notes: { series_id: series.id, coaching_id: coaching.id, user_id: user.id },
      },
    })

    const { error: insertError } = await admin.from("series_payments").insert({
      series_id: series.id,
      series_title: series.title,
      coaching_id: coaching.id,
      user_id: user.id,
      amount_inr: price,
      commission_pct: pct,
      fedge_share_inr: fedgeShare,
      coaching_share_inr: price - fedgeShare,
      razorpay_order_id: order.id,
    })
    if (insertError) throw insertError

    return json({
      key_id: razorpayKeys().keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      title: series.title,
      coaching: coaching.name,
      email: user.email ?? "",
    })
  } catch (err) {
    console.error("series-order", err)
    return json({ error: "Could not start the payment. Please try again." }, 500)
  }
})
