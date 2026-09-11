const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getSupabase, isSupabaseConfigured } = require("./supabase");

function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Detects "column doesn't exist yet" so the app keeps working before the
// admin-controls migration is applied.
//   42703   = Postgres undefined_column (raw SQL / select errors)
//   PGRST204 = PostgREST can't find the column in its schema cache (writes)
function isMissingColumnError(err) {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = String(err.message || "");
  return /could not find the '.*' column|column .* does not exist/i.test(msg);
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function itemStats(items) {
  const list = items || [];
  const pending = list.filter((i) => i.status === "pending").length;
  const completed = list.filter((i) => i.status === "completed").length;
  return { total: list.length, pending, completed };
}

function isSurveyItem(item) {
  if (!item) return false;
  return (
    item.taskType === "survey" ||
    (!item.taskType && !Array.isArray(item.fields))
  );
}

function isFormItem(item) {
  if (!item) return false;
  return (
    item.taskType === "form" ||
    (!item.taskType && Array.isArray(item.fields))
  );
}

function countByType(items, type) {
  const list = items || [];
  const pred = type === "form" ? isFormItem : isSurveyItem;
  return list.filter((i) => i.status === "pending" && pred(i)).length;
}

function cooldownRemaining(lastSubmittedAt, cooldownMs) {
  if (!lastSubmittedAt) return 0;
  const elapsed = Date.now() - new Date(lastSubmittedAt).getTime();
  return Math.max(0, cooldownMs - elapsed);
}

function buildSurveyItems(templates, count) {
  const pool = shuffle(templates);
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(pool[i % pool.length]);
  }
  const stamp = Date.now();
  return selected.map((tpl, idx) => ({
    queueId: `q_${stamp}_${idx}_${crypto.randomBytes(3).toString("hex")}`,
    templateId: tpl.id,
    taskType: "survey",
    question: tpl.question,
    options: (tpl.options || []).slice(0, 4),
    status: "pending",
    selectedOption: null,
    selectedText: null,
    submittedAt: null,
    submittedBy: null,
  }));
}

function filterFormTemplates(formTemplates, allowedIds) {
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) return formTemplates;
  const allowed = new Set(allowedIds.map(String));
  const filtered = (formTemplates || []).filter((t) => allowed.has(String(t.id)));
  // If the admin picked ids that no longer exist, fall back to all templates
  return filtered.length ? filtered : formTemplates;
}

function buildFormItems(formTemplates, count, allowedIds) {
  const pool = shuffle(filterFormTemplates(formTemplates, allowedIds));
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(pool[i % pool.length]);
  }
  const stamp = Date.now();
  return selected.map((tpl, idx) => ({
    queueId: `q_${stamp}_${idx}_${crypto.randomBytes(3).toString("hex")}`,
    templateId: tpl.id,
    taskType: "form",
    title: tpl.title,
    description: tpl.description || "",
    fields: tpl.fields || [],
    status: "pending",
    answers: null,
    submittedAt: null,
    submittedBy: null,
  }));
}

function buildMixedItems(
  surveyTemplates,
  formTemplates,
  surveyCount,
  formCount,
  allowedFormIds
) {
  const surveyItems = surveyCount > 0
    ? buildSurveyItems(surveyTemplates, surveyCount)
    : [];
  const formItems = formCount > 0
    ? buildFormItems(formTemplates, formCount, allowedFormIds)
    : [];
  return shuffle([...surveyItems, ...formItems]);
}

async function findUserByCredentials(userId, password) {
  const sb = getSupabase();
  const id = String(userId).trim().toLowerCase();
  let { data, error } = await sb
    .from("users")
    .select("user_id, password, name, role, banned")
    .eq("user_id", id)
    .maybeSingle();

  if (error && isMissingColumnError(error)) {
    // "banned" column not migrated yet — fall back gracefully.
    ({ data, error } = await sb
      .from("users")
      .select("user_id, password, name, role")
      .eq("user_id", id)
      .maybeSingle());
  }

  if (error) throw error;
  if (!data || data.password !== String(password)) return null;
  if (data.banned) {
    const e = new Error("This account is banned. Contact the admin.");
    e.status = 403;
    throw e;
  }
  return {
    userId: data.user_id,
    name: data.name,
    role: data.role,
  };
}

async function listWorkers() {
  const sb = getSupabase();
  let { data, error } = await sb
    .from("users")
    .select("user_id, name, role, banned")
    .eq("role", "worker")
    .order("user_id");
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await sb
      .from("users")
      .select("user_id, name, role")
      .eq("role", "worker")
      .order("user_id"));
  }
  if (error) throw error;
  return (data || []).map((u) => ({
    userId: u.user_id,
    name: u.name,
    role: u.role,
    banned: !!u.banned,
  }));
}

async function listAllUsers() {
  const sb = getSupabase();
  let { data, error } = await sb
    .from("users")
    .select("user_id, name, role, banned")
    .order("role")
    .order("user_id");
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await sb
      .from("users")
      .select("user_id, name, role")
      .order("role")
      .order("user_id"));
  }
  if (error) throw error;
  return (data || []).map((u) => ({
    userId: u.user_id,
    name: u.name,
    role: u.role,
    banned: !!u.banned,
  }));
}

async function createWorker({ userId, password, name }) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("users")
    .insert({
      user_id: userId,
      password,
      name,
      role: "worker",
    })
    .select("user_id, name, role")
    .single();
  if (error) {
    if (error.code === "23505") {
      const e = new Error("User ID already exists");
      e.status = 409;
      throw e;
    }
    throw error;
  }
  return { userId: data.user_id, name: data.name, role: data.role };
}

async function countTemplates() {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("templates")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function countFormTemplates() {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("form_templates")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function fetchAllTemplates() {
  const sb = getSupabase();
  // Supabase caps rows; fetch in pages
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await sb
      .from("templates")
      .select("id, question, options")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchAllFormTemplates() {
  const sb = getSupabase();
  // Supabase caps rows; fetch in pages
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await sb
      .from("form_templates")
      .select("id, title, description, fields")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function getLatestWorkMeta() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_work")
    .select("work_date, survey_count, form_count, generated_at, work_type")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

const DEFAULT_PLAN = {
  taskMode: "survey",
  taskModes: ["survey"],
  surveyCount: 50,
  formCount: 0,
};

// Normalise whatever is stored (task_modes array, or legacy task_mode string)
// into a clean array of valid modes. Falls back to ["survey"].
function normalizeTaskModes(taskModes, legacyMode) {
  const valid = ["survey", "form", "mix"];
  let arr = [];
  if (Array.isArray(taskModes)) {
    arr = taskModes;
  } else if (legacyMode) {
    arr = [legacyMode];
  }
  const cleaned = [...new Set(arr.map(String))].filter((m) =>
    valid.includes(m)
  );
  return cleaned.length ? cleaned : ["survey"];
}

// Progressive SELECT: try full column set, and on a missing-column error drop
// the newest optional column and retry, so existing columns still come back.
// `applyFilter(query)` lets callers add .eq()/.maybeSingle() etc.
async function selectTaskSettings(sb, applyFilter) {
  const columnSets = [
    "user_id, task_mode, task_modes, survey_count, form_count, form_template_ids, updated_at",
    "user_id, task_mode, survey_count, form_count, form_template_ids, updated_at",
    "user_id, task_mode, survey_count, form_count, updated_at",
  ];
  let lastError = null;
  for (const cols of columnSets) {
    const { data, error } = await applyFilter(
      sb.from("user_task_settings").select(cols)
    );
    if (!error) return data;
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  throw lastError;
}

function mapTaskSettingsRow(row) {
  const taskModes = normalizeTaskModes(row.task_modes, row.task_mode);
  return {
    userId: row.user_id,
    taskMode: row.task_mode || taskModes[0],
    taskModes,
    surveyCount: row.survey_count || 0,
    formCount: row.form_count || 0,
    formTemplateIds: Array.isArray(row.form_template_ids)
      ? row.form_template_ids
      : [],
    updatedAt: row.updated_at,
  };
}

async function getUserTaskSettings(userId) {
  const sb = getSupabase();
  const data = await selectTaskSettings(sb, (q) =>
    q.eq("user_id", userId).maybeSingle()
  );
  if (!data) return null;
  return mapTaskSettingsRow(data);
}

async function getAllUserTaskSettings() {
  const sb = getSupabase();
  const data = await selectTaskSettings(sb, (q) => q);
  const map = {};
  (data || []).forEach((row) => {
    map[row.user_id] = mapTaskSettingsRow(row);
  });
  return map;
}

async function upsertUserTaskSettings(userId, plan) {
  const sb = getSupabase();
  // Accept either a taskModes array or a single taskMode string.
  const taskModes = normalizeTaskModes(
    plan.taskModes,
    plan.taskMode || (Array.isArray(plan.taskModes) ? null : plan.taskMode)
  );
  const row = {
    user_id: userId,
    // Keep legacy single column populated (first mode) for old readers.
    task_mode: taskModes[0],
    task_modes: taskModes,
    survey_count: plan.surveyCount || 0,
    form_count: plan.formCount || 0,
    updated_at: new Date().toISOString(),
  };
  // Only write allowed form ids when explicitly provided so we don't wipe them
  // on plain mode-only updates.
  if (Array.isArray(plan.formTemplateIds)) {
    row.form_template_ids = plan.formTemplateIds.map(String);
  }

  // Upsert, and if a newer column is missing, drop just that column and retry
  // (repeat for each optional column) so existing columns still save.
  const optional = ["task_modes", "form_template_ids"];
  let attempt = { ...row };
  for (let i = 0; i <= optional.length; i++) {
    const { error } = await sb
      .from("user_task_settings")
      .upsert(attempt, { onConflict: "user_id" });
    if (!error) return;
    if (!isMissingColumnError(error)) throw error;
    // Figure out which optional column is still present and drop one.
    const dropped = optional.find((c) => c in attempt);
    if (!dropped) throw error;
    delete attempt[dropped];
  }
}

async function getEffectiveWorkerPlan(userId, settingsMap) {
  const settings = settingsMap ? settingsMap[userId] : await getUserTaskSettings(userId);
  if (settings) return settings;
  // Fallback: try to use the latest global default from daily_work if any
  const meta = await getLatestWorkMeta();
  if (meta) {
    return {
      userId,
      taskMode: meta.work_type === "mix" ? "mix" : meta.work_type === "form" ? "form" : "survey",
      surveyCount: meta.survey_count || DEFAULT_PLAN.surveyCount,
      formCount: meta.form_count || 0,
      isDefault: true,
    };
  }
  return { userId, ...DEFAULT_PLAN, isDefault: true };
}

async function getUserWork(userId, workDate) {
  const sb = getSupabase();

  if (workDate) {
    const { data, error } = await sb
      .from("daily_work")
      .select("*")
      .eq("user_id", userId)
      .eq("work_date", workDate)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await sb
    .from("daily_work")
    .select("*")
    .eq("user_id", userId)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getCompletionsForUser(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("completions")
    .select(
      "work_date, total, completed_count, status, completed_at, generated_at"
    )
    .eq("user_id", userId)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    date: row.work_date,
    total: row.total,
    completedCount: row.completed_count,
    status: row.status,
    completedAt: row.completed_at,
    generatedAt: row.generated_at,
  }));
}

async function upsertCompletion(userId, entry) {
  const sb = getSupabase();
  const { error } = await sb.from("completions").upsert(
    {
      user_id: userId,
      work_date: entry.date,
      total: entry.total,
      completed_count: entry.completedCount,
      status: entry.status,
      completed_at: entry.completedAt,
      generated_at: entry.generatedAt,
    },
    { onConflict: "user_id,work_date" }
  );
  if (error) throw error;
}

async function saveUserWorkRow(row) {
  const sb = getSupabase();
  const { error } = await sb.from("daily_work").upsert(
    {
      work_date: row.work_date,
      user_id: row.user_id,
      survey_count: row.survey_count || 0,
      form_count: row.form_count || 0,
      work_type: row.work_type || "survey",
      generated_at: row.generated_at,
      last_submitted_at: row.last_submitted_at,
      items: row.items,
    },
    { onConflict: "work_date,user_id" }
  );
  if (error) throw error;
}

async function generateDailyForAllWorkers(count, workType = "survey") {
  const isForm = workType === "form";
  const templates = isForm
    ? await fetchAllFormTemplates()
    : await fetchAllTemplates();
  if (!templates.length) {
    const e = new Error(
      isForm
        ? "No form templates in database. Run the migration, then: npm run seed:supabase"
        : "No survey templates in database. Run: npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }

  const workers = await listWorkers();
  if (!workers.length) {
    const e = new Error("No worker users found. Add a user first.");
    e.status = 400;
    throw e;
  }

  const date = todayDate();
  const now = new Date().toISOString();
  const sb = getSupabase();

  // Archive existing rows for these users on any previous open day is optional;
  // we upsert today's row and write completion status.
  for (const w of workers) {
    // If regenerating same day mid-progress, previous partial is overwritten;
    // still snapshot completion before replace if row exists.
    const existing = await getUserWork(w.userId, date);
    if (existing && Array.isArray(existing.items) && existing.items.length) {
      const stats = itemStats(existing.items);
      if (stats.completed > 0) {
        await upsertCompletion(w.userId, {
          date,
          total: stats.total,
          completedCount: stats.completed,
          status: stats.pending === 0 ? "complete" : "partial",
          completedAt:
            stats.pending === 0 ? existing.last_submitted_at || now : null,
          generatedAt: existing.generated_at || null,
        });
      }
    }

    const items = isForm
      ? buildFormItems(templates, count)
      : buildSurveyItems(templates, count);
    const { error } = await sb.from("daily_work").upsert(
      {
        work_date: date,
        user_id: w.userId,
        survey_count: isForm ? 0 : count,
        form_count: isForm ? count : 0,
        work_type: workType,
        generated_at: now,
        last_submitted_at: null,
        items,
      },
      { onConflict: "work_date,user_id" }
    );
    if (error) throw error;

    await upsertCompletion(w.userId, {
      date,
      total: count,
      completedCount: 0,
      status: "assigned",
      completedAt: null,
      generatedAt: now,
    });
  }

  return {
    workDate: date,
    generatedAt: now,
    count,
    workType,
    surveyCount: isForm ? 0 : count,
    formCount: isForm ? count : 0,
    workerCount: workers.length,
    total: count * workers.length,
    pending: count * workers.length,
    completed: 0,
  };
}

async function generateMixedBatchForAllWorkers(surveyCount, formCount) {
  const surveyTemplates = await fetchAllTemplates();
  const formTemplates = await fetchAllFormTemplates();
  if (surveyCount > 0 && !surveyTemplates.length) {
    const e = new Error(
      "No survey templates in database. Run: npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }
  if (formCount > 0 && !formTemplates.length) {
    const e = new Error(
      "No form templates in database. Run the form migration, then: npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }

  const workers = await listWorkers();
  if (!workers.length) {
    const e = new Error("No worker users found. Add a user first.");
    e.status = 400;
    throw e;
  }

  const date = todayDate();
  const now = new Date().toISOString();
  const sb = getSupabase();
  const total = surveyCount + formCount;

  for (const w of workers) {
    const existing = await getUserWork(w.userId, date);
    if (existing && Array.isArray(existing.items) && existing.items.length) {
      const stats = itemStats(existing.items);
      if (stats.completed > 0) {
        await upsertCompletion(w.userId, {
          date,
          total: stats.total,
          completedCount: stats.completed,
          status: stats.pending === 0 ? "complete" : "partial",
          completedAt:
            stats.pending === 0 ? existing.last_submitted_at || now : null,
          generatedAt: existing.generated_at || null,
        });
      }
    }

    const items = buildMixedItems(
      surveyTemplates,
      formTemplates,
      surveyCount,
      formCount
    );
    const { error } = await sb.from("daily_work").upsert(
      {
        work_date: date,
        user_id: w.userId,
        survey_count: surveyCount,
        form_count: formCount,
        work_type: "mix",
        generated_at: now,
        last_submitted_at: null,
        items,
      },
      { onConflict: "work_date,user_id" }
    );
    if (error) throw error;

    await upsertCompletion(w.userId, {
      date,
      total,
      completedCount: 0,
      status: "assigned",
      completedAt: null,
      generatedAt: now,
    });
  }

  return {
    workDate: date,
    generatedAt: now,
    workType: "mix",
    count: total,
    surveyCount,
    formCount,
    workerCount: workers.length,
    total: total * workers.length,
    pending: total * workers.length,
    completed: 0,
  };
}

async function generatePerWorkerDailyBatch({
  taskType,
  count = 0,
  surveyCount = 0,
  formCount = 0,
}) {
  if (!["survey", "form", "mix"].includes(taskType)) {
    const e = new Error('taskType must be "survey", "form", or "mix"');
    e.status = 400;
    throw e;
  }

  const workers = await listWorkers();
  if (!workers.length) {
    const e = new Error("No worker users found. Add a user first.");
    e.status = 400;
    throw e;
  }

  const settingsMap = await getAllUserTaskSettings();
  const surveyTemplates = await fetchAllTemplates();
  const formTemplates = await fetchAllFormTemplates();

  if (taskType === "survey" && count > 0 && !surveyTemplates.length) {
    const e = new Error(
      "No survey templates in database. Run: npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }
  if (taskType === "form" && count > 0 && !formTemplates.length) {
    const e = new Error(
      "No form templates in database. Run the form migration, then: npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }
  if (
    taskType === "mix" &&
    (surveyCount > 0 || formCount > 0) &&
    ((surveyCount > 0 && !surveyTemplates.length) ||
      (formCount > 0 && !formTemplates.length))
  ) {
    const e = new Error(
      "Missing survey/form templates. Run the form migration + npm run seed:supabase"
    );
    e.status = 500;
    throw e;
  }

  const date = todayDate();
  const now = new Date().toISOString();
  const sb = getSupabase();
  const perUser = [];
  let totalAssigned = 0;
  let matchedCount = 0;

  for (const w of workers) {
    const settings = settingsMap[w.userId];
    const workerModes =
      settings && Array.isArray(settings.taskModes) && settings.taskModes.length
        ? settings.taskModes
        : normalizeTaskModes(null, settings && settings.taskMode);
    const allowedFormIds =
      settings && Array.isArray(settings.formTemplateIds)
        ? settings.formTemplateIds
        : [];

    if (!workerModes.includes(taskType)) {
      perUser.push({
        userId: w.userId,
        name: w.name,
        mode: workerModes.join("+"),
        count: 0,
        skipped: `mode mismatch (worker is ${workerModes.join(
          "+"
        )}, batch is ${taskType})`,
      });
      continue;
    }

    let items;
    let workType = taskType;
    let total;
    let userSurveyCount = 0;
    let userFormCount = 0;
    if (taskType === "survey") {
      userSurveyCount = count;
      total = count;
      items = buildSurveyItems(surveyTemplates, count);
    } else if (taskType === "form") {
      userFormCount = count;
      total = count;
      items = buildFormItems(formTemplates, count, allowedFormIds);
    } else {
      userSurveyCount = surveyCount;
      userFormCount = formCount;
      total = surveyCount + formCount;
      items = buildMixedItems(
        surveyTemplates,
        formTemplates,
        surveyCount,
        formCount,
        allowedFormIds
      );
    }

    if (total === 0) {
      perUser.push({
        userId: w.userId,
        name: w.name,
        mode: workerMode,
        count: 0,
        skipped: "zero count",
      });
      continue;
    }

    const existing = await getUserWork(w.userId, date);

    // For multi-type workers, an admin may generate one type after another on
    // the same day. Keep the OTHER type's items so a survey-generate doesn't
    // wipe a form batch (and vice-versa). "mix" replaces both types.
    let carriedItems = [];
    let carriedSurvey = 0;
    let carriedForm = 0;
    if (existing && Array.isArray(existing.items) && existing.items.length) {
      if (taskType === "survey") {
        carriedItems = existing.items.filter((i) => isFormItem(i));
      } else if (taskType === "form") {
        carriedItems = existing.items.filter((i) => isSurveyItem(i));
      }
      carriedSurvey = carriedItems.filter((i) => isSurveyItem(i)).length;
      carriedForm = carriedItems.filter((i) => isFormItem(i)).length;

      // Snapshot completions for the items being replaced (same-type ones).
      const replaced = existing.items.filter(
        (i) => !carriedItems.includes(i)
      );
      const rstats = itemStats(replaced);
      if (rstats.completed > 0) {
        await upsertCompletion(w.userId, {
          date,
          total: rstats.total,
          completedCount: rstats.completed,
          status: rstats.pending === 0 ? "complete" : "partial",
          completedAt:
            rstats.pending === 0 ? existing.last_submitted_at || now : null,
          generatedAt: existing.generated_at || null,
        });
      }
    }

    const finalItems = shuffle([...items, ...carriedItems]);
    const rowSurveyCount = userSurveyCount + carriedSurvey;
    const rowFormCount = userFormCount + carriedForm;
    const rowTotal = finalItems.length;
    // If we merged two types, reflect that in work_type so the worker UI
    // shows both survey/form start buttons.
    const rowWorkType =
      rowSurveyCount > 0 && rowFormCount > 0 ? "mix" : workType;

    const { error } = await sb.from("daily_work").upsert(
      {
        work_date: date,
        user_id: w.userId,
        survey_count: rowSurveyCount,
        form_count: rowFormCount,
        work_type: rowWorkType,
        generated_at: now,
        last_submitted_at: null,
        items: finalItems,
      },
      { onConflict: "work_date,user_id" }
    );
    if (error) throw error;

    await upsertCompletion(w.userId, {
      date,
      total: rowTotal,
      completedCount: 0,
      status: "assigned",
      completedAt: null,
      generatedAt: now,
    });

    totalAssigned += total;
    matchedCount += 1;
    perUser.push({
      userId: w.userId,
      name: w.name,
      mode: workType,
      count: total,
    });
  }

  if (matchedCount === 0) {
    const e = new Error(
      `No workers assigned to type "${taskType}". Add or change a worker's task type first.`
    );
    e.status = 400;
    throw e;
  }

  return {
    workDate: date,
    generatedAt: now,
    workType: taskType,
    count: taskType === "mix" ? surveyCount + formCount : count,
    surveyCount: taskType === "survey" ? count : taskType === "mix" ? surveyCount : 0,
    formCount: taskType === "form" ? count : taskType === "mix" ? formCount : 0,
    workerCount: matchedCount,
    total: totalAssigned,
    pending: totalAssigned,
    completed: 0,
    skippedCount: workers.length - matchedCount,
    perUser,
  };
}

async function assignTodayBatchToNewUser(userId) {
  const meta = await getLatestWorkMeta();
  if (!meta || meta.work_date !== todayDate()) return;

  // Prefer this user's own settings over the global latest meta
  const settings = await getUserTaskSettings(userId);
  let taskMode;
  let surveyCount;
  let formCount;
  let allowedFormIds = [];
  if (settings) {
    taskMode = settings.taskMode;
    surveyCount = settings.surveyCount || 0;
    formCount = settings.formCount || 0;
    allowedFormIds = Array.isArray(settings.formTemplateIds)
      ? settings.formTemplateIds
      : [];
  } else {
    taskMode = meta.work_type === "mix" ? "mix" : meta.work_type === "form" ? "form" : "survey";
    surveyCount = meta.survey_count || 0;
    formCount = meta.form_count || 0;
  }
  if (surveyCount + formCount === 0) return;

  const surveyTemplates = surveyCount > 0 ? await fetchAllTemplates() : [];
  const formTemplates = formCount > 0 ? await fetchAllFormTemplates() : [];
  if (surveyCount > 0 && !surveyTemplates.length) return;
  if (formCount > 0 && !formTemplates.length) return;

  let items;
  if (taskMode === "mix") {
    items = buildMixedItems(
      surveyTemplates,
      formTemplates,
      surveyCount,
      formCount,
      allowedFormIds
    );
  } else if (taskMode === "form") {
    items = buildFormItems(formTemplates, formCount, allowedFormIds);
  } else {
    items = buildSurveyItems(surveyTemplates, surveyCount);
  }
  const now = meta.generated_at || new Date().toISOString();
  await saveUserWorkRow({
    work_date: meta.work_date,
    user_id: userId,
    survey_count: surveyCount,
    form_count: formCount,
    work_type: taskMode,
    generated_at: now,
    last_submitted_at: null,
    items,
  });
  await upsertCompletion(userId, {
    date: meta.work_date,
    total: surveyCount + formCount,
    completedCount: 0,
    status: "assigned",
    completedAt: null,
    generatedAt: now,
  });
}

async function fetchFormTemplateList() {
  const sb = getSupabase();
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await sb
      .from("form_templates")
      .select("id, title")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all.map((t) => ({ id: t.id, title: t.title }));
}

// Reset one worker's work for a given day (defaults to today).
// Delete a user's daily_work + completions rows for the given set of dates.
async function clearUserWorkDates(sb, userId, dates) {
  const list = [...new Set((dates || []).filter(Boolean))];
  if (!list.length) return [];
  const { error: delWork } = await sb
    .from("daily_work")
    .delete()
    .eq("user_id", userId)
    .in("work_date", list);
  if (delWork) throw delWork;

  const { error: delComp } = await sb
    .from("completions")
    .delete()
    .eq("user_id", userId)
    .in("work_date", list);
  if (delComp) throw delComp;
  return list;
}

// Reset the work a worker currently sees. This clears today's row AND the
// worker's latest open row (which is what /api/worker/* actually serves), so
// pending work from an earlier un-regenerated day is cleared too.
async function resetUserWorkForToday(userId, workDate) {
  const sb = getSupabase();
  const today = workDate || todayDate();

  const dates = [today];
  const latest = await getUserWork(userId); // most recent row, any date
  if (latest && latest.work_date) dates.push(latest.work_date);

  const cleared = await clearUserWorkDates(sb, userId, dates);
  return { userId, workDate: today, clearedDates: cleared };
}

// Manually complete a worker's work for today (or specified date) with a target count
async function manuallyCompleteUserWork(userId, { count, date } = {}) {
  const sb = getSupabase();
  const workDate = date || todayDate();
  const now = new Date().toISOString();

  // Verify user exists and is a worker
  const { data: user, error: userErr } = await sb
    .from("users")
    .select("user_id, name, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) {
    const e = new Error(`Worker "${userId}" not found`);
    e.status = 404;
    throw e;
  }
  if (user.role !== "worker") {
    const e = new Error("Can only complete work for worker accounts");
    e.status = 400;
    throw e;
  }

  // Fetch worker's work row for workDate
  let row = await getUserWork(userId, workDate);

  // If no work exists for this date, generate items so work can be completed
  if (!row || !Array.isArray(row.items) || row.items.length === 0) {
    const settings = await getUserTaskSettings(userId);
    const workerMode = (settings && settings.taskMode) || "survey";
    const allowedFormIds = (settings && settings.formTemplateIds) || [];
    const desiredCount =
      Number.isInteger(Number(count)) && Number(count) > 0
        ? Math.min(Number(count), 500)
        : (settings && (settings.surveyCount || settings.formCount)) || 50;

    const surveyTemplates =
      workerMode === "survey" || workerMode === "mix"
        ? await fetchAllTemplates()
        : [];
    const formTemplates =
      workerMode === "form" || workerMode === "mix"
        ? await fetchAllFormTemplates()
        : [];

    let items;
    if (workerMode === "form") {
      items = buildFormItems(formTemplates, desiredCount, allowedFormIds);
    } else if (workerMode === "mix") {
      const half = Math.floor(desiredCount / 2);
      items = buildMixedItems(
        surveyTemplates,
        formTemplates,
        desiredCount - half,
        half,
        allowedFormIds
      );
    } else {
      items = buildSurveyItems(surveyTemplates, desiredCount);
    }

    row = {
      work_date: workDate,
      user_id: userId,
      survey_count: workerMode === "form" ? 0 : desiredCount,
      form_count: workerMode === "survey" ? 0 : desiredCount,
      work_type: workerMode,
      generated_at: now,
      last_submitted_at: null,
      items,
    };
  }

  const items = row.items || [];
  let currentTotal = items.length;

  // If requested count is greater than current tasks, expand batch with extra tasks
  if (
    count !== undefined &&
    count !== null &&
    Number.isInteger(Number(count)) &&
    Number(count) > currentTotal
  ) {
    const extraCount = Math.min(Number(count) - currentTotal, 500 - currentTotal);
    if (extraCount > 0) {
      const settings = await getUserTaskSettings(userId);
      const workerMode =
        (settings && settings.taskMode) || row.work_type || "survey";
      const allowedFormIds = (settings && settings.formTemplateIds) || [];

      if (workerMode === "form") {
        const formTemplates = await fetchAllFormTemplates();
        const extraItems = buildFormItems(
          formTemplates,
          extraCount,
          allowedFormIds
        );
        items.push(...extraItems);
        row.form_count = items.length;
      } else if (workerMode === "mix") {
        const surveyTemplates = await fetchAllTemplates();
        const formTemplates = await fetchAllFormTemplates();
        const half = Math.floor(extraCount / 2);
        const extraItems = buildMixedItems(
          surveyTemplates,
          formTemplates,
          extraCount - half,
          half,
          allowedFormIds
        );
        items.push(...extraItems);
        row.survey_count = (row.survey_count || 0) + (extraCount - half);
        row.form_count = (row.form_count || 0) + half;
      } else {
        const surveyTemplates = await fetchAllTemplates();
        const extraItems = buildSurveyItems(surveyTemplates, extraCount);
        items.push(...extraItems);
        row.survey_count = items.length;
      }
      currentTotal = items.length;
    }
  }

  // Determine target completed count
  const targetCompletedCount =
    count !== undefined && count !== null && Number.isInteger(Number(count))
      ? Math.max(0, Math.min(Number(count), currentTotal))
      : currentTotal;

  for (let i = 0; i < currentTotal; i++) {
    const item = items[i];
    if (i < targetCompletedCount) {
      item.status = "completed";
      if (!item.submittedAt) item.submittedAt = now;
      if (!item.submittedBy) item.submittedBy = "admin";

      const isForm = item.taskType === "form" || Array.isArray(item.fields);
      if (isForm) {
        if (!item.answers || typeof item.answers !== "object") {
          const mockAnswers = {};
          (item.fields || []).forEach((f) => {
            if (
              f.type === "select" &&
              Array.isArray(f.options) &&
              f.options.length
            ) {
              mockAnswers[f.key] = f.options[0];
            } else if (f.type === "number") {
              mockAnswers[f.key] = "100";
            } else if (f.type === "tel") {
              mockAnswers[f.key] = "9876543210";
            } else if (f.type === "email") {
              mockAnswers[f.key] = "worker@example.com";
            } else {
              mockAnswers[f.key] = "Completed";
            }
          });
          item.answers = mockAnswers;
        }
      } else {
        if (
          item.selectedOption === null ||
          item.selectedOption === undefined
        ) {
          item.selectedOption = 0;
          item.selectedText =
            (item.options && item.options[0]) || "Option 1";
        }
      }
    } else {
      // Any tasks beyond targetCompletedCount remain or become pending
      item.status = "pending";
      item.submittedAt = null;
      item.submittedBy = null;
      if (item.selectedOption !== undefined) item.selectedOption = null;
      if (item.selectedText !== undefined) item.selectedText = null;
      if (item.answers !== undefined) delete item.answers;
    }
  }

  const stats = itemStats(items);
  const allDone = stats.pending === 0;

  row.last_submitted_at = now;
  row.items = items;

  await saveUserWorkRow(row);
  await upsertCompletion(userId, {
    date: row.work_date,
    total: stats.total,
    completedCount: stats.completed,
    status: allDone
      ? "complete"
      : stats.completed > 0
      ? "in_progress"
      : "assigned",
    completedAt: allDone ? now : null,
    generatedAt: row.generated_at || now,
  });

  return {
    userId,
    userName: user.name,
    workDate: row.work_date,
    total: stats.total,
    completed: stats.completed,
    pending: stats.pending,
    allDone,
  };
}

// Reset every worker's currently-visible work: today's rows plus each
// worker's latest open row.
async function resetAllWorkForToday(workDate) {
  const today = workDate || todayDate();
  const sb = getSupabase();

  // Delete all of today's rows in one shot.
  const { error: delWork } = await sb
    .from("daily_work")
    .delete()
    .eq("work_date", today);
  if (delWork) throw delWork;

  const { error: delComp } = await sb
    .from("completions")
    .delete()
    .eq("work_date", today);
  if (delComp) throw delComp;

  // Then clear each worker's latest open row (if it's on an earlier date).
  const workers = await listWorkers();
  for (const w of workers) {
    const latest = await getUserWork(w.userId);
    if (latest && latest.work_date && latest.work_date !== today) {
      await clearUserWorkDates(sb, w.userId, [latest.work_date]);
    }
  }

  return { workDate: today };
}

async function setUserBanned(userId, banned) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("users")
    .update({ banned: !!banned })
    .eq("user_id", userId)
    .eq("role", "worker")
    .select("user_id, name, role, banned")
    .maybeSingle();
  if (error && isMissingColumnError(error)) {
    const e = new Error(
      "Ban feature needs a DB migration. Run supabase/migration-admin-controls.sql first."
    );
    e.status = 400;
    throw e;
  }
  if (error) throw error;
  if (!data) {
    const e = new Error("Worker not found");
    e.status = 404;
    throw e;
  }
  return {
    userId: data.user_id,
    name: data.name,
    role: data.role,
    banned: !!data.banned,
  };
}

async function deleteWorker(userId) {
  const sb = getSupabase();
  // Ensure the target is a worker (never allow deleting an admin here)
  const { data: existing, error: findErr } = await sb
    .from("users")
    .select("user_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing) {
    const e = new Error("Worker not found");
    e.status = 404;
    throw e;
  }
  if (existing.role !== "worker") {
    const e = new Error("Only worker accounts can be deleted");
    e.status = 400;
    throw e;
  }

  // Related rows (daily_work, completions, user_task_settings) cascade on
  // delete via FK, but we clear explicitly to be safe across setups.
  await sb.from("daily_work").delete().eq("user_id", userId);
  await sb.from("completions").delete().eq("user_id", userId);
  await sb.from("user_task_settings").delete().eq("user_id", userId);

  const { error } = await sb.from("users").delete().eq("user_id", userId);
  if (error) throw error;
  return { userId };
}

async function getAdminStats() {
  const templateCount = await countTemplates();
  const formTemplateCount = await countFormTemplates();
  const workers = await listWorkers();
  const meta = await getLatestWorkMeta();
  const workDate = meta ? meta.work_date : null;
  const generatedAt = meta ? meta.generated_at : null;
  const surveyCount = meta ? meta.survey_count || 0 : 0;
  const formCount = meta ? meta.form_count || 0 : 0;
  const dailyCount = surveyCount + formCount;
  const workType = meta ? meta.work_type || "survey" : null;

  let totalPending = 0;
  let totalCompleted = 0;
  let totalAssigned = 0;

  const perUser = [];
  for (const w of workers) {
    const row = workDate ? await getUserWork(w.userId, workDate) : null;
    const stats = itemStats(row ? row.items : []);
    totalPending += stats.pending;
    totalCompleted += stats.completed;
    totalAssigned += stats.total;

    const completions = await getCompletionsForUser(w.userId);
    const completedDays = completions.filter((c) => c.status === "complete")
      .length;

    perUser.push({
      userId: w.userId,
      name: w.name,
      banned: !!w.banned,
      ...stats,
      completedDays,
    });
  }

  return {
    templateCount,
    formTemplateCount,
    workDate,
    generatedAt,
    dailyCount,
    surveyCount,
    formCount,
    workType,
    workerCount: workers.length,
    total: totalAssigned,
    pending: totalPending,
    completed: totalCompleted,
    perUser,
  };
}

const DEFAULT_SITE_NOTICE = {
  id: "default",
  bannerEnabled: true,
  bannerImageUrl: "/img/banner.jpg",
  title: "खास आपके लिए रोज कमाए ₹3000 तक",
  content: "BS Tech Limited के सभी वर्कर्स के लिए खास मौका!\n\n• घर बैठे काम करें\n• सुरक्षित और भरोसेमंद\n• कोई बड़ी इन्वेस्टमेंट नहीं\n• तुरंत पेमेंट सपोर्ट\n\nनीचे दिए गए लिंक पर क्लिक करके पूरी जानकारी प्राप्त करें और आज ही शुरू करें।",
  actionText: "यहां क्लिक करें",
  actionUrl: "/response.html",
  videoUrl: "",
  extraImages: [],
  updatedAt: new Date().toISOString(),
};

const NOTICE_FILE = path.join(__dirname, "..", "data", "site-notice.json");

function readNoticeFile() {
  try {
    if (fs.existsSync(NOTICE_FILE)) {
      const raw = fs.readFileSync(NOTICE_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to read local site-notice.json:", e.message);
  }
  return null;
}

function writeNoticeFile(data) {
  try {
    const dir = path.dirname(NOTICE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NOTICE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to write local site-notice.json:", e.message);
  }
}

async function getSiteNotice() {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("site_notices")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          bannerEnabled: data.banner_enabled !== false,
          bannerImageUrl: data.banner_image_url || "/img/banner.jpg",
          title: data.title || DEFAULT_SITE_NOTICE.title,
          content: data.content !== undefined && data.content !== null ? data.content : DEFAULT_SITE_NOTICE.content,
          actionText: data.action_text || "",
          actionUrl: data.action_url || "",
          videoUrl: data.video_url || "",
          extraImages: Array.isArray(data.extra_images) ? data.extra_images : [],
          updatedAt: data.updated_at || new Date().toISOString(),
        };
      }
    } catch (err) {
      // Fallback
    }
  }

  const fileData = readNoticeFile();
  if (fileData) {
    return { ...DEFAULT_SITE_NOTICE, ...fileData };
  }
  return { ...DEFAULT_SITE_NOTICE };
}

async function saveSiteNotice(fields) {
  const current = await getSiteNotice();
  const updated = {
    ...current,
    bannerEnabled: fields.bannerEnabled !== undefined ? Boolean(fields.bannerEnabled) : current.bannerEnabled,
    bannerImageUrl: fields.bannerImageUrl !== undefined ? String(fields.bannerImageUrl).trim() : current.bannerImageUrl,
    title: fields.title !== undefined ? String(fields.title).trim() : current.title,
    content: fields.content !== undefined ? String(fields.content) : current.content,
    actionText: fields.actionText !== undefined ? String(fields.actionText).trim() : current.actionText,
    actionUrl: fields.actionUrl !== undefined ? String(fields.actionUrl).trim() : current.actionUrl,
    videoUrl: fields.videoUrl !== undefined ? String(fields.videoUrl).trim() : current.videoUrl,
    extraImages: Array.isArray(fields.extraImages)
      ? fields.extraImages
      : typeof fields.extraImages === "string"
      ? fields.extraImages.split("\n").map((s) => s.trim()).filter(Boolean)
      : current.extraImages,
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("site_notices").upsert({
        id: "default",
        banner_enabled: updated.bannerEnabled,
        banner_image_url: updated.bannerImageUrl,
        title: updated.title,
        content: updated.content,
        action_text: updated.actionText,
        action_url: updated.actionUrl,
        video_url: updated.videoUrl,
        extra_images: updated.extraImages,
        updated_at: updated.updatedAt,
      });
      if (error) {
        console.warn("Supabase upsert site_notices warning:", error.message);
      }
    } catch (err) {
      console.warn("Supabase upsert site_notices error:", err.message);
    }
  }

  writeNoticeFile(updated);
  return updated;
}

const RESPONSES_FILE = path.join(__dirname, "..", "data", "worker-responses.json");

function readResponsesFile() {
  try {
    if (fs.existsSync(RESPONSES_FILE)) {
      const raw = fs.readFileSync(RESPONSES_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to read local worker-responses.json:", e.message);
  }
  return {};
}

function writeResponsesFile(data) {
  try {
    const dir = path.dirname(RESPONSES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to write local worker-responses.json:", e.message);
  }
}

function detectChoice(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  if (/^(हाँ|हा|haa|haan|yes|y|sahi|bilkul|karna chahta|karna chahti)/i.test(trimmed)) {
    return "yes";
  }
  if (/^(ना|न|nahi|naa|na|no|n|nhi|nahi karna)/i.test(trimmed)) {
    return "no";
  }
  return "other";
}

async function getWorkerResponse(userId) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("worker_responses")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        return {
          userId: data.user_id,
          name: data.name,
          choice: data.choice || "other",
          responseText: data.response_text,
          submittedAt: data.submitted_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err) {
      // fallback
    }
  }

  const map = readResponsesFile();
  return map[userId] || null;
}

async function saveWorkerResponse(userId, name, responseText, explicitChoice = null) {
  const text = String(responseText || "").trim();
  const choice = explicitChoice || detectChoice(text);
  const now = new Date().toISOString();

  const existing = await getWorkerResponse(userId);
  const record = {
    userId,
    name: name || (existing && existing.name) || userId,
    choice,
    responseText: text,
    submittedAt: (existing && existing.submittedAt) || now,
    updatedAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("worker_responses").upsert({
        user_id: userId,
        name: record.name,
        choice: record.choice,
        response_text: record.responseText,
        submitted_at: record.submittedAt,
        updated_at: record.updatedAt,
      });
      if (error) {
        console.warn("Supabase upsert worker_responses warning:", error.message);
      }
    } catch (err) {
      console.warn("Supabase worker_responses error:", err.message);
    }
  }

  const map = readResponsesFile();
  map[userId] = record;
  writeResponsesFile(map);

  return record;
}

async function listAllWorkerResponses() {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("worker_responses")
        .select("*")
        .order("updated_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d) => ({
          userId: d.user_id,
          name: d.name,
          choice: d.choice || "other",
          responseText: d.response_text,
          submittedAt: d.submitted_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (err) {
      // fallback
    }
  }

  const map = readResponsesFile();
  const list = Object.values(map);
  list.sort((a, b) => new Date(b.updatedAt || b.submittedAt).getTime() - new Date(a.updatedAt || a.submittedAt).getTime());
  return list;
}

async function deleteWorkerResponse(userId) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      await sb.from("worker_responses").delete().eq("user_id", userId);
    } catch (err) {
      // ignore
    }
  }

  const map = readResponsesFile();
  delete map[userId];
  writeResponsesFile(map);
  return { ok: true };
}

const AUDIOS_FILE = path.join(__dirname, "..", "data", "worker-audios.json");
const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads", "audios");

function readAudiosFile() {
  try {
    if (fs.existsSync(AUDIOS_FILE)) {
      const raw = fs.readFileSync(AUDIOS_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to read local worker-audios.json:", e.message);
  }
  return [];
}

function writeAudiosFile(data) {
  try {
    const dir = path.dirname(AUDIOS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AUDIOS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to write local worker-audios.json:", e.message);
  }
}

async function saveAudioUpload({ userId, workerName, title, fileName, mimeType, fileSize, fileData }) {
  const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  let localUrl = null;
  try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const base64Match = fileData && fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (base64Match) {
      const ext = path.extname(fileName) || ".mp3";
      const diskFilename = `${id}${ext}`;
      const diskPath = path.join(UPLOADS_DIR, diskFilename);
      fs.writeFileSync(diskPath, Buffer.from(base64Match[2], "base64"));
      localUrl = `/uploads/audios/${diskFilename}`;
    }
  } catch (e) {
    console.warn("Could not write local audio file copy:", e.message);
  }

  const record = {
    id,
    userId,
    workerName: workerName || userId,
    title: title || "",
    fileName: fileName || "recording.mp3",
    mimeType: mimeType || "audio/mpeg",
    fileSize: Number(fileSize) || 0,
    fileData: fileData || "",
    localUrl: localUrl || fileData || "",
    createdAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("worker_audios").insert({
        id: record.id,
        user_id: record.userId,
        worker_name: record.workerName,
        title: record.title,
        file_name: record.fileName,
        mime_type: record.mimeType,
        file_size: record.fileSize,
        file_data: record.fileData,
        created_at: record.createdAt,
      });
      if (error) {
        console.warn("Supabase worker_audios insert warning:", error.message);
      }
    } catch (err) {
      console.warn("Supabase worker_audios error:", err.message);
    }
  }

  const list = readAudiosFile();
  list.unshift(record);
  writeAudiosFile(list);

  return record;
}

async function getWorkerAudios(userId) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("worker_audios")
        .select("id, user_id, worker_name, title, file_name, mime_type, file_size, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          workerName: d.worker_name,
          title: d.title,
          fileName: d.file_name,
          mimeType: d.mime_type,
          fileSize: d.file_size,
          createdAt: d.created_at,
        }));
      }
    } catch (err) {
      // fallback
    }
  }

  const list = readAudiosFile();
  return list
    .filter((a) => a.userId === userId)
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      workerName: a.workerName,
      title: a.title,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      createdAt: a.createdAt,
    }));
}

async function getAllAudios() {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("worker_audios")
        .select("id, user_id, worker_name, title, file_name, mime_type, file_size, file_data, created_at")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          workerName: d.worker_name,
          title: d.title,
          fileName: d.file_name,
          mimeType: d.mime_type,
          fileSize: d.file_size,
          fileData: d.file_data,
          createdAt: d.created_at,
        }));
      }
    } catch (err) {
      // fallback
    }
  }

  return readAudiosFile();
}

async function getAudioById(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("worker_audios")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          userId: data.user_id,
          workerName: data.worker_name,
          title: data.title,
          fileName: data.file_name,
          mimeType: data.mime_type,
          fileSize: data.file_size,
          fileData: data.file_data,
          createdAt: data.created_at,
        };
      }
    } catch (err) {
      // fallback
    }
  }

  const list = readAudiosFile();
  return list.find((a) => a.id === id) || null;
}

async function deleteAudioUpload(id) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data } = await sb
        .from("worker_audios")
        .select("file_data")
        .eq("id", id)
        .maybeSingle();

      if (data && data.file_data) {
        const marker = "/storage/v1/object/public/worker-recordings/";
        if (data.file_data.includes(marker)) {
          const relativePath = data.file_data.split(marker)[1];
          if (relativePath) {
            await sb.storage
              .from("worker-recordings")
              .remove([decodeURIComponent(relativePath)]);
          }
        }
      }

      await sb.from("worker_audios").delete().eq("id", id);
    } catch (err) {
      // ignore
    }
  }

  const list = readAudiosFile();
  const filtered = list.filter((a) => a.id !== id);
  writeAudiosFile(filtered);
  return { ok: true };
}

// ---------- System Settings / Force Logout ----------
const SETTINGS_FILE = path.join(__dirname, "..", "data", "system-settings.json");

let cachedForceLogoutState = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 5000; // 5-second TTL cache for high performance

function readSettingsFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    }
  } catch (e) {
    // ignore
  }
  return {};
}

function writeSettingsFile(data) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    // ignore
  }
}

async function getForceLogoutTimestamp() {
  const now = Date.now();
  if (cachedForceLogoutState && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return cachedForceLogoutState;
  }

  let state = { timestamp: 0, target: "workers", updatedAt: null };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("site_notices")
        .select("content, updated_at")
        .eq("id", "system_settings")
        .maybeSingle();

      if (!error && data && data.content) {
        const parsed = JSON.parse(data.content);
        state = {
          timestamp: Number(parsed.forceLogoutAt) || 0,
          target: parsed.target || "workers",
          updatedAt: data.updated_at,
        };
        cachedForceLogoutState = state;
        lastCacheFetchTime = now;
        return state;
      }
    } catch (e) {
      // fallback
    }
  }

  const fileData = readSettingsFile();
  if (fileData && fileData.forceLogoutAt) {
    state = {
      timestamp: Number(fileData.forceLogoutAt) || 0,
      target: fileData.target || "workers",
      updatedAt: fileData.updatedAt || null,
    };
  }

  cachedForceLogoutState = state;
  lastCacheFetchTime = now;
  return state;
}

async function setForceLogoutTimestamp(target = "workers") {
  const now = Date.now();
  const logoutSec = Math.floor(now / 1000);
  const state = {
    forceLogoutAt: logoutSec,
    target,
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      await sb.from("site_notices").upsert({
        id: "system_settings",
        title: "System Settings",
        content: JSON.stringify(state),
        updated_at: state.updatedAt,
      });
    } catch (e) {
      console.warn("Failed to persist force logout to Supabase:", e.message);
    }
  }

  writeSettingsFile(state);

  cachedForceLogoutState = {
    timestamp: logoutSec,
    target,
    updatedAt: state.updatedAt,
  };
  lastCacheFetchTime = now;

  return cachedForceLogoutState;
}

module.exports = {
  todayDate,
  itemStats,
  countByType,
  cooldownRemaining,
  buildSurveyItems,
  buildFormItems,
  buildMixedItems,
  findUserByCredentials,
  listWorkers,
  listAllUsers,
  createWorker,
  countTemplates,
  countFormTemplates,
  fetchAllTemplates,
  fetchAllFormTemplates,
  getLatestWorkMeta,
  getUserWork,
  getCompletionsForUser,
  upsertCompletion,
  saveUserWorkRow,
  generatePerWorkerDailyBatch,
  assignTodayBatchToNewUser,
  getAdminStats,
  getUserTaskSettings,
  getAllUserTaskSettings,
  upsertUserTaskSettings,
  getEffectiveWorkerPlan,
  fetchFormTemplateList,
  resetUserWorkForToday,
  manuallyCompleteUserWork,
  resetAllWorkForToday,
  setUserBanned,
  deleteWorker,
  getSiteNotice,
  saveSiteNotice,
  getWorkerResponse,
  saveWorkerResponse,
  listAllWorkerResponses,
  deleteWorkerResponse,
  saveAudioUpload,
  getWorkerAudios,
  getAllAudios,
  getAudioById,
  deleteAudioUpload,
  getForceLogoutTimestamp,
  setForceLogoutTimestamp,
};
