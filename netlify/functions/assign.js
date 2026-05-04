const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    if (!process.env.SUPABASE_URL) {
      return json(500, { error: "Missing SUPABASE_URL in Netlify environment variables" });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables" });
    }

    const body = JSON.parse(event.body || "{}");

    const id4 = String(body.id4 || "").trim();
    const consent = body.consent === true;

    if (!/^[0-9]{4}$/.test(id4)) {
      return json(400, { error: "Please enter exactly 4 digits." });
    }

    if (!consent) {
      return json(400, { error: "Consent is required." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.rpc("assign_next_experiment", {
      p_id4: id4,
      p_consent: consent
    });

    if (error) {
      return json(500, {
        error: "Supabase RPC failed",
        details: error.message
      });
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      return json(500, {
        error: "Supabase function returned no data"
      });
    }

    return json(200, {
      assignmentNumber: result.assignment_number,
      group: result.assigned_group,
      redirectLink: result.redirect_link
    });

  } catch (err) {
    return json(500, {
      error: "Netlify function failed",
      details: err.message
    });
  }
};