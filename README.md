1.	Create a DB in Supabase and run the following script, replace the experiment link with real links:
create table if not exists public.experiment_counter (
  id int primary key,
  current_value bigint not null
);

insert into public.experiment_counter (id, current_value)
values (1, 0)
on conflict (id) do nothing;

create table if not exists public.experiment_assignments (
  id bigint generated always as identity primary key,
  id4 text not null,
  consent boolean not null,
  assigned_group text not null check (assigned_group in ('A','B','C','D','E','F')),
  redirect_link text not null,
  assigned_at timestamptz not null default now()
);

create or replace function public.assign_next_experiment(
  p_id4 text,
  p_consent boolean
)
returns table (
  assignment_number bigint,
  assigned_group text,
  redirect_link text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_value bigint;
  groups text[] := array['A','B','C','D','E','F'];
  links text[] := array[
    'https://example.com/form1',
    'https://example.com/form2',
    'https://example.com/form3',
    'https://example.com/form4',
    'https://example.com/form5',
    'https://example.com/form6'
  ];
  idx int;
begin
  if p_id4 !~ '^[0-9]{4}$' then
    raise exception 'ID must contain exactly 4 digits';
  end if;

  if p_consent is not true then
    raise exception 'Consent is required';
  end if;

  update public.experiment_counter
  set current_value = current_value + 1
  where id = 1
  returning current_value into new_value;

  idx := ((new_value - 1) % 6) + 1;

  insert into public.experiment_assignments (
    id4,
    consent,
    assigned_group,
    redirect_link,
    assigned_at
  )
  values (
    p_id4,
    p_consent,
    groups[idx],
    links[idx],
    now()
  );

  return query
  select
    new_value,
    groups[idx],
    links[idx];
end;
$$;
2.	Create a GitHub project with the following structure:
your-repo/
index.html
package.json
netlify.toml
netlify/
functions/
assign.js
3.	The contents of the files:
a.	Index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Experiment Assignment</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 520px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.4;
    }

    h2 {
      margin-bottom: 8px;
    }

    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 600;
    }

    input[type="tel"] {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      box-sizing: border-box;
    }

    .consent-box {
      margin-top: 14px;
      padding: 12px;
      border: 1px solid #ddd;
    }

    .consent-box label {
      display: inline;
      font-weight: normal;
    }

    button {
      width: 100%;
      padding: 12px;
      margin-top: 16px;
      font-size: 16px;
      cursor: pointer;
    }

    .msg {
      margin-top: 14px;
      color: #444;
    }

    .error {
      color: #b00020;
    }
  </style>
</head>

<body>

  <h2>Start Experiment</h2>
  <p>Please enter the last 4 digits of your ID and confirm consent.</p>

  <form id="assignmentForm">

    <label for="id4">Last 4 digits of ID</label>
    <input
      type="tel"
      id="id4"
      name="id4"
      inputmode="numeric"
      maxlength="4"
      minlength="4"
      pattern="[0-9]{4}"
      placeholder="1234"
      required
    />

    <div class="consent-box">
      <input type="checkbox" id="consent" name="consent" required />
      <label for="consent">
        I declare that I work on my own, without other participants and/or tools except Base44 and those approved by the lecturer.<!-- replace with your text -->
      </label>
    </div>

    <button type="submit" id="submitBtn">Continue</button>

  </form>

  <div class="msg" id="msg"></div>

  <script>
    document.getElementById("assignmentForm").addEventListener("submit", async function (e) {
      e.preventDefault();

      const msg = document.getElementById("msg");
      const btn = document.getElementById("submitBtn");

      msg.className = "msg";
      msg.textContent = "";

      const id4 = document.getElementById("id4").value.trim();
      const consentChecked = document.getElementById("consent").checked;

      // validation
      if (!/^[0-9]{4}$/.test(id4)) {
        msg.className = "msg error";
        msg.textContent = "Please enter exactly 4 digits.";
        return;
      }

      if (!consentChecked) {
        msg.className = "msg error";
        msg.textContent = "Please check the consent box.";
        return;
      }

      btn.disabled = true;
      msg.textContent = "Assigning and redirecting...";

      try {
        const response = await fetch("/.netlify/functions/assign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id4: id4,
            consent: consentChecked
          })
        });

        // SAFE parsing (fix for your error)
        const rawText = await response.text();

        let result;
        try {
          result = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
          throw new Error("Server returned non-JSON response: " + rawText);
        }

        if (!response.ok) {
          throw new Error(result.error || rawText || "Assignment failed.");
        }

        if (!result.redirectLink) {
          throw new Error("No redirect link received from server.");
        }

        // redirect
        window.location.href = result.redirectLink;

      } catch (err) {
        msg.className = "msg error";
        msg.textContent = err.message || "Something went wrong. Please try again.";
        btn.disabled = false;
      }
    });
  </script>

</body>
</html>
b.	Package.json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.0.0"
  }
}
c.	Netlify.toml
[build]
  publish = "."
  functions = "netlify/functions"
d.	Assign.js
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
4.	Deploy the GitHub repo to Netlify
5.	Define Netlify environment variables:
SUPABASE_URL (Project URL)
SUPABASE_SERVICE_ROLE_KEY (Found under settings  API Keys)
6.	After defining the variables – redeploy the repo

In order to view the assignments, run in SQL Editor in Supabase:
select *
from public.experiment_assignments
order by id desc;

