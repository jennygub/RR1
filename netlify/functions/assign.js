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
      return json(500, { error: "Missing SUPABASE_URL" });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    const body = JSON.parse(event.body || "{}");

    const studentId = String(body.studentId || "").trim();
    const consent = body.consent === true;

    if (!/^[0-9]{7,9}$/.test(studentId)) {
      return json(400, { error: "Please enter an ID with 7 to 9 digits." });
    }

    if (!consent) {
      return json(400, { error: "Consent is required." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.rpc("assign_next_experiment", {
      p_student_id: studentId,
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
      return json(500, { error: "Supabase function returned no data" });
    }

    return json(200, {
      assignmentNumber: result.assignment_number,
      group: result.assigned_group,
      redirectLink: result.redirect_link,
      studentId: studentId
    });

  } catch (err) {
    return json(500, {
      error: "Netlify function failed",
      details: err.message
    });
  }
};
