const { createHash } = require("node:crypto");

const APP_ORIGIN = "https://learnwithvishal.com";

function sha512(str) {
  return createHash("sha512").update(str).digest("hex");
}

exports.handler = async (event) => {
  // Read env vars inside the handler so the function always picks up the latest
  // values on cold-start without needing a redeploy.
  const SALT = (process.env.PAYU_SALT || "").trim();
  // Note: env var name is "Website_Payment_Webhook_URL" with that exact casing
  // (case matters on Linux/Netlify).
  const SHEET_WEBHOOK = (process.env.Website_Payment_Webhook_URL || "").trim();

  const typeFromQuery = (event.queryStringParameters && event.queryStringParameters.type) || "";

  // PayU POSTs form-urlencoded data. Parse it manually.
  let data = {};
  if (event.httpMethod === "POST" && event.body) {
    try {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;
      const params = new URLSearchParams(rawBody);
      params.forEach((v, k) => {
        data[k] = v;
      });
    } catch (_) {
      /* continue with empty data; verification will fail naturally */
    }
  }

  // Core PayU response fields
  const status = (data.status || "unknown").toLowerCase();
  const txnid = data.txnid || "";
  const mihpayid = data.mihpayid || ""; // PayU's internal txn ID
  const amount = data.amount || "";
  const productinfo = data.productinfo || "";
  const firstname = data.firstname || "";
  const email = data.email || "";
  const phone = data.phone || "";
  const mode = data.mode || ""; // Payment mode (CC, DC, NB, UPI, etc.)
  const bankcode = data.bankcode || "";
  const udf1 = data.udf1 || typeFromQuery;
  const udf2 = data.udf2 || "";
  const udf3 = data.udf3 || "";
  const udf4 = data.udf4 || "";
  const udf5 = data.udf5 || "";
  const additionalCharges = data.additionalCharges || "";
  const key = data.key || "";
  const receivedHash = (data.hash || "").toLowerCase();
  const errorMessage = data.error_Message || data.error || "";

  // PayU India reverse-hash formats (per https://docs.payu.in/docs/hashing-request-and-response):
  //   1) sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  //   2) sha512(additional_charges|SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const base = `${SALT}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  const withCharges = `${additionalCharges}|${base}`;
  const candidates = additionalCharges ? [withCharges, base] : [base];
  let verified = false;
  for (const candidate of candidates) {
    if (sha512(candidate) === receivedHash) {
      verified = true;
      break;
    }
  }

  console.log("PayU callback received:", {
    txnid,
    status,
    udf1,
    amount,
    hasHash: !!receivedHash,
    verified,
  });

  // Log EVERY payment attempt to Google Sheet (success + failure + cancellations),
  // so the merchant can see drop-offs and not just completions.
  if (SHEET_WEBHOOK) {
    try {
      await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txnid,
          payuTxnId: mihpayid,
          status,
          name: firstname,
          email,
          phone,
          amount,
          productinfo,
          type: udf1,
          mode,
          bankcode,
          errorMessage,
          verified,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.warn("Google Sheet logging failed:", String(e && e.message ? e.message : e));
    }
  }

  // Trust PayU's status field as the primary signal for the user-facing redirect.
  // PayU determines the actual transaction outcome with the bank.
  const successful = status === "success";
  const target = successful
    ? `${APP_ORIGIN}/thank-you?type=${encodeURIComponent(udf1)}&txn=${encodeURIComponent(txnid)}`
    : `${APP_ORIGIN}/payment-failed?type=${encodeURIComponent(udf1)}&status=${encodeURIComponent(status)}&txn=${encodeURIComponent(txnid)}`;

  return {
    statusCode: 303,
    headers: { Location: target },
    body: "",
  };
};
