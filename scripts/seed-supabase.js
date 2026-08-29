/**
 * Seeds 500 survey templates into Supabase.
 * Usage:
 *   1. Fill .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   2. Run schema SQL in Supabase SQL Editor first
 *   3. npm run seed:supabase
 */
try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch {
  // ignore
}

const { getSupabase, isSupabaseConfigured } = require("../lib/supabase");
const { buildTemplates } = require("../lib/templates-generate");
const { buildFormTemplates } = require("../lib/form-templates-generate");

async function main() {
  if (!isSupabaseConfigured()) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  // JWT payload role claim — service_role keys decode to role "service_role"
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString("utf8")
    );
    if (payload.role && payload.role !== "service_role") {
      console.error(
        `Wrong key type: role="${payload.role}".\n` +
          "In Supabase → Project Settings → API, copy the service_role key (secret),\n" +
          "NOT the anon public key. Put it in .env.local as SUPABASE_SERVICE_ROLE_KEY."
      );
      process.exit(1);
    }
  } catch {
    // ignore decode issues
  }

  const sb = getSupabase();
  const templates = buildTemplates(500);
  const rows = templates.map((t) => ({
    id: t.id,
    question: t.question,
    options: t.options,
  }));

  console.log(`Upserting ${rows.length} templates...`);

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from("templates").upsert(chunk, {
      onConflict: "id",
    });
    if (error) {
      console.error("Chunk failed at", i, error);
      if (error.code === "42501" || /row-level security/i.test(error.message || "")) {
        console.error(
          "\nFix:\n" +
            "1) Supabase SQL Editor me file chalao: supabase/fix-rls.sql\n" +
            "2) .env.local me service_role key ho (anon key nahi)\n" +
            "3) Phir: npm run seed:supabase"
        );
      }
      process.exit(1);
    }
    process.stdout.write(`  ${Math.min(i + chunkSize, rows.length)}/${rows.length}\r`);
  }

  const formTemplates = buildFormTemplates(500);
  const formRows = formTemplates.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    fields: t.fields,
  }));

  console.log(`Upserting ${formRows.length} form templates...`);

  for (let i = 0; i < formRows.length; i += chunkSize) {
    const chunk = formRows.slice(i, i + chunkSize);
    const { error } = await sb.from("form_templates").upsert(chunk, {
      onConflict: "id",
    });
    if (error) {
      console.error("Form templates chunk failed at", i, error);
      if (/relation .* does not exist/i.test(error.message || "")) {
        console.error(
          "\nFix: Supabase SQL Editor me pehle supabase/migration-form-tasks.sql chalao,\n" +
            "phir: npm run seed:supabase"
        );
      }
      process.exit(1);
    }
    process.stdout.write(`  ${Math.min(i + chunkSize, formRows.length)}/${formRows.length}\r`);
  }

  // Ensure default users exist
  const { error: userErr } = await sb.from("users").upsert(
    [
      {
        user_id: "user1",
        password: "pass123",
        name: "Alex Worker",
        role: "worker",
      },
      {
        user_id: "admin",
        password: "admin123",
        name: "Site Admin",
        role: "admin",
      },
    ],
    { onConflict: "user_id" }
  );
  if (userErr) {
    console.error("Users seed failed", userErr);
    process.exit(1);
  }

  console.log("\nDone. Survey + form templates + default users ready in Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
