// One-off helper: add a fully-completed work day for a specific worker.
// Usage: node scripts/add-completed-day.js <userId> <YYYY-MM-DD> <count> <ISO time>
// Defaults to: anju123, 2026-08-29, 50 surveys, completed at 21:14 IST.
require("dotenv").config({ path: ".env.local" });
const db = require("../lib/db");

async function main() {
  const userId = process.argv[2] || "anju123";
  const workDate = process.argv[3] || "2026-08-29";
  const count = Number(process.argv[4] || 50);
  // Completed at 9:14 PM India time on that date.
  const completedAt = process.argv[5] || `${workDate}T21:14:00+05:30`;
  // Generated a bit earlier the same day (so history looks natural).
  const generatedAt = `${workDate}T09:00:00+05:30`;

  const templates = await db.fetchAllTemplates();
  if (!templates.length) {
    throw new Error("No survey templates found in DB.");
  }

  // Build the queue, then mark every item as completed.
  const items = db.buildSurveyItems(templates, count).map((item) => {
    const optionIndex = 0; // pick first option as the recorded answer
    return {
      ...item,
      status: "completed",
      selectedOption: optionIndex,
      selectedText: (item.options && item.options[optionIndex]) || null,
      submittedAt: completedAt,
      submittedBy: userId,
    };
  });

  await db.saveUserWorkRow({
    work_date: workDate,
    user_id: userId,
    survey_count: count,
    form_count: 0,
    work_type: "survey",
    generated_at: generatedAt,
    last_submitted_at: completedAt,
    items,
  });

  await db.upsertCompletion(userId, {
    date: workDate,
    total: count,
    completedCount: count,
    status: "complete",
    completedAt,
    generatedAt,
  });

  // Read back for confirmation.
  const row = await db.getUserWork(userId, workDate);
  const stats = db.itemStats(row.items || []);
  const comps = await db.getCompletionsForUser(userId);
  const c = comps.find((x) => x.date === workDate);
  console.log("daily_work:", {
    date: row.work_date,
    type: row.work_type,
    surveyCount: row.survey_count,
    items: (row.items || []).length,
    completed: stats.completed,
    pending: stats.pending,
    lastSubmittedAt: row.last_submitted_at,
  });
  console.log("completion:", c);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
