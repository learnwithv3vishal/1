const { createHash } = require("node:crypto");

const MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY || "";
const SALT = process.env.PAYU_SALT || "";
const APP_ORIGIN = "https://learnwithvishal.com";

function sha512(str) {
  return createHash("sha512").update(str).digest("hex");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
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

  if (!MERCHANT_KEY || !SALT) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Server not configured. Set PAYU_MERCHANT_KEY and PAYU_SALT in Netlify env vars.",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { name, email, mobile, amount, productinfo, thankYouType } = body;

    if (!name || !email || !mobile || !amount || !productinfo || !thankYouType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const txnid = "LWV" + Date.now() + Math.floor(Math.random() * 100000);
    const amt = Number(amount).toFixed(2);

    // PayU will POST back here after payment — same domain, no cross-origin redirect, no 404.
    const cb = `${APP_ORIGIN}/api/payu-callback?type=${encodeURIComponent(thankYouType)}`;

    // PayU hash format: sha512(key|txnid|amount|productinfo|firstname|email|udf1||||||||||SALT)
    const udf1 = thankYouType;
    const hashStr = `${MERCHANT_KEY}|${txnid}|${amt}|${productinfo}|${name}|${email}|${udf1}||||||||||${SALT}`;
    const hash = sha512(hashStr);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "https://secure.payu.in/_payment",
        params: {
          key: MERCHANT_KEY,
          txnid,
          amount: amt,
          productinfo,
          firstname: name,
          email,
          phone: mobile,
          udf1,
          surl: cb,
          furl: cb,
          hash,
          service_provider: "payu_paisa",
        },
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: String(e && e.message ? e.message : e) }),
    };
  }
};
