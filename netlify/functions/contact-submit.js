// Netlify Function: receives contact form submissions from /api/contact-submit
// and forwards them to a Google Apps Script Web App that logs each one as a
// row in the Contact Form Google Sheet.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  // Env var name matches what's set on Netlify (case-sensitive).
  const SHEET_WEBHOOK = (process.env.CONTACT_FORM_WEBHOOK_URL || "").trim();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!SHEET_WEBHOOK) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Server not configured. Set CONTACT_FORM_WEBHOOK_URL in Netlify env vars.",
      }),
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 320);
  const mobile = String(body.mobile || "").trim().slice(0, 20);
  const message = String(body.message || "").trim().slice(0, 3000);

  if (!name || !email || !mobile) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing required fields (name, email, mobile)" }),
    };
  }

  // Forward to Google Apps Script webhook
  try {
    await fetch(SHEET_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone: mobile,
        message,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("Contact form -> Google Sheet failed:", String(e && e.message ? e.message : e));
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Could not record submission. Please try again." }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
