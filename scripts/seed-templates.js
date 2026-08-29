/** Local JSON seed (optional — Vercel uses Supabase). */
const fs = require("fs");
const path = require("path");
const { buildTemplates } = require("../lib/templates-generate");
const { buildFormTemplates } = require("../lib/form-templates-generate");

const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(DATA_DIR, "templates.json");
const OUT_FORMS_FILE = path.join(DATA_DIR, "form-templates.json");

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const templates = buildTemplates(500);
  fs.writeFileSync(OUT_FILE, JSON.stringify(templates, null, 2), "utf8");
  console.log(`Seeded ${templates.length} survey templates → ${OUT_FILE}`);

  const formTemplates = buildFormTemplates(500);
  fs.writeFileSync(OUT_FORMS_FILE, JSON.stringify(formTemplates, null, 2), "utf8");
  console.log(`Seeded ${formTemplates.length} form templates → ${OUT_FORMS_FILE}`);
}

main();
