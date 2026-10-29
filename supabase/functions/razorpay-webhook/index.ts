import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, confirmAndActivate, confirmAndEnroll, confirmAndGrantFedge, confirmAndGrantPractice, hmacHex, json, safeEqual } from "../_shared/razorpay.ts";

// Razorpay → Fedge: starts a coaching's plan, unlocks a student's test
// series, starts a student's Practice plan or a Fedge pass, even when the app
// never got to call coaching-plan-verify / series-verify / practice-verify /
// fedge-verify (browser closed right after paying, network dropped).
// Razorpay signs every call with the webhook secret.
//
// Deploy with JWT verification OFF (Razorpay sends no Supabase token).
// Razorpay dashboard → Webhooks → URL:
//   https://<project>.supabase.co/functions/v1/razorpay-webhook
// events: payment.captured, order.paid; secret = RAZORPAY_WEBHOOK_SECRET.

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")
  if (!secret) return json({ error: "Webhook secret isn't set." }, 500)

  const raw = await req.text()
  const expected = await hmacHex(secret, raw)
  if (!safeEqual(expected, req.headers.get("X-Razorpay-Signature") ?? "")) return json({ error: "Bad signature" }, 401)

  try {
    const event = JSON.parse(raw)
    const payment = event?.payload?.payment?.entity
    if (!["payment.captured", "order.paid"].includes(event?.event) || !payment?.order_id) return json({ ok: true, ignored: true })
    // A coaching's plan payment, a student's test series purchase, a student's
    // Practice plan or a Fedge pass. Other payments on the account aren't ours to handle.
    const admin = adminClient()
    const { data: plan } = await admin
      .from("coaching_payments")
      .select("id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle()
    if (plan) {
      await confirmAndActivate(payment.order_id, payment.id)
      return json({ ok: true })
    }

    const { data: sale } = await admin
      .from("series_payments")
      .select("id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle()
    if (sale) {
      await confirmAndEnroll(payment.order_id, payment.id)
      return json({ ok: true })
    }

    const { data: practice } = await admin
      .from("practice_payments")
      .select("id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle()
    if (practice) {
      await confirmAndGrantPractice(payment.order_id, payment.id)
      return json({ ok: true })
    }

    const { data: fedge } = await admin
      .from("fedge_passes")
      .select("id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle()
    if (fedge) {
      await confirmAndGrantFedge(payment.order_id, payment.id)
      return json({ ok: true })
    }
    return json({ ok: true, ignored: true })
  } catch (err) {
    console.error("razorpay-webhook", err)
    // A 5xx makes Razorpay retry later.
    return json({ error: "Could not process" }, 500)
  }
})
