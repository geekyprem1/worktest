const crypto = require("crypto");
const { getSupabase } = require("./supabase");

function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    question: tpl.question,
    options: (tpl.options || []).slice(0, 4),
    status: "pending",
    selectedOption: null,
    selectedText: null,
    submittedAt: null,
    submittedBy: null,
  }));
}

async function findUserByCredentials(userId, password) {
  const sb = getSupabase();
  const id = String(userId).trim().toLowerCase();
  const { data, error } = await sb
    .from("users")
    .select("user_id, password, name, role")
    .eq("user_id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.password !== String(password)) return null;
  return {
    userId: data.user_id,
    name: data.name,
    role: data.role,
  };
}

async function listWorkers() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("users")
    .select("user_id, name, role")
    .eq("role", "worker")
    .order("user_id");
  if (error) throw error;
  return (data || []).map((u) => ({
    userId: u.user_id,
    name: u.name,
    role: u.role,
  }));
}

async function listAllUsers() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("users")
    .select("user_id, name, role")
    .order("role")
    .order("user_id");
  if (error) throw error;
  return (data || []).map((u) => ({
    userId: u.user_id,
    name: u.name,
    role: u.role,
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

async function getLatestWorkMeta() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_work")
    .select("work_date, survey_count, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
      survey_count: row.survey_count,
      generated_at: row.generated_at,
      last_submitted_at: row.last_submitted_at,
      items: row.items,
    },
    { onConflict: "work_date,user_id" }
  );
  if (error) throw error;
}

async function generateDailyForAllWorkers(count) {
  const templates = await fetchAllTemplates();
  if (!templates.length) {
    const e = new Error(
      "No survey templates in database. Run: npm run seed:supabase"
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

    const items = buildSurveyItems(templates, count);
    const { error } = await sb.from("daily_work").upsert(
      {
        work_date: date,
        user_id: w.userId,
        survey_count: count,
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
    workerCount: workers.length,
    total: count * workers.length,
    pending: count * workers.length,
    completed: 0,
  };
}

async function assignTodayBatchToNewUser(userId) {
  const meta = await getLatestWorkMeta();
  if (!meta || meta.work_date !== todayDate() || !meta.survey_count) return;

  const templates = await fetchAllTemplates();
  if (!templates.length) return;

  const items = buildSurveyItems(templates, meta.survey_count);
  const now = meta.generated_at || new Date().toISOString();
  await saveUserWorkRow({
    work_date: meta.work_date,
    user_id: userId,
    survey_count: meta.survey_count,
    generated_at: now,
    last_submitted_at: null,
    items,
  });
  await upsertCompletion(userId, {
    date: meta.work_date,
    total: meta.survey_count,
    completedCount: 0,
    status: "assigned",
    completedAt: null,
    generatedAt: now,
  });
}

async function getAdminStats() {
  const templateCount = await countTemplates();
  const workers = await listWorkers();
  const meta = await getLatestWorkMeta();
  const workDate = meta ? meta.work_date : null;
  const generatedAt = meta ? meta.generated_at : null;
  const dailyCount = meta ? meta.survey_count : 0;

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
      ...stats,
      completedDays,
    });
  }

  return {
    templateCount,
    workDate,
    generatedAt,
    dailyCount,
    workerCount: workers.length,
    total: totalAssigned,
    pending: totalPending,
    completed: totalCompleted,
    perUser,
  };
}

module.exports = {
  todayDate,
  itemStats,
  cooldownRemaining,
  buildSurveyItems,
  findUserByCredentials,
  listWorkers,
  listAllUsers,
  createWorker,
  countTemplates,
  fetchAllTemplates,
  getLatestWorkMeta,
  getUserWork,
  getCompletionsForUser,
  upsertCompletion,
  saveUserWorkRow,
  generateDailyForAllWorkers,
  assignTodayBatchToNewUser,
  getAdminStats,
};
