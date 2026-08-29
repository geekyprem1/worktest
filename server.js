try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch {
  // optional
}

const express = require("express");
const path = require("path");
const {
  signUser,
  getUserFromRequest,
  setAuthCookie,
  clearAuthCookie,
} = require("./lib/auth");
const { isSupabaseConfigured } = require("./lib/supabase");
const db = require("./lib/db");

const app = express();
const PORT = process.env.PORT || 3000;
const COOLDOWN_MS = 60 * 1000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function requireRole(role) {
  return (req, res, next) => {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (user.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = user;
    next();
  };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function mapDbError(err, res) {
  console.error(err);
  if (err && err.code === "ENV_MISSING") {
    return res.status(503).json({
      error:
        "Server not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || "Server error",
  });
}

// ---------- Health ----------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    company: "BS Tech Limited",
    supabase: isSupabaseConfigured(),
  });
});

// ---------- Auth ----------
app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { userId, password } = req.body || {};
    if (!userId || !password) {
      return res
        .status(400)
        .json({ error: "User ID and password are required" });
    }

    const user = await db.findUserByCredentials(userId, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid user ID or password" });
    }

    const token = signUser(user);
    setAuthCookie(res, token);
    res.json({ ok: true, user });
  })
);

app.post("/api/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user });
});

// ---------- Worker ----------
app.get(
  "/api/worker/status",
  requireRole("worker"),
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const row = await db.getUserWork(userId);
    const items = row ? row.items || [] : [];
    const stats = db.itemStats(items);
    const remainingMs = db.cooldownRemaining(
      row ? row.last_submitted_at : null,
      COOLDOWN_MS
    );

    let completedDays = await db.getCompletionsForUser(userId);

    // Merge live row into history view if needed
    if (row && row.work_date && stats.total > 0) {
      const exists = completedDays.some((c) => c.date === row.work_date);
      const live = {
        date: row.work_date,
        total: stats.total,
        completedCount: stats.completed,
        status:
          stats.pending === 0
            ? "complete"
            : stats.completed > 0
              ? "in_progress"
              : "assigned",
        completedAt:
          stats.pending === 0 ? row.last_submitted_at || null : null,
        generatedAt: row.generated_at || null,
      };
      if (!exists) {
        completedDays = [live, ...completedDays];
      } else {
        completedDays = completedDays.map((c) =>
          c.date === row.work_date ? { ...c, ...live } : c
        );
      }
    }

    const fullyDoneDays = completedDays.filter((d) => d.status === "complete");

    res.json({
      workDate: row ? row.work_date : null,
      generatedAt: row ? row.generated_at : null,
      workType: row ? row.work_type || "survey" : null,
      surveyCount: row ? row.survey_count || 0 : 0,
      formCount: row ? row.form_count || 0 : 0,
      pendingSurveyCount: db.countByType(items, "survey"),
      pendingFormCount: db.countByType(items, "form"),
      ...stats,
      cooldownMs: remainingMs,
      lastSubmittedAt: row ? row.last_submitted_at : null,
      completedDays,
      completedDates: fullyDoneDays.map((d) => d.date),
      completedDaysCount: fullyDoneDays.length,
    });
  })
);

app.post(
  "/api/worker/start",
  requireRole("worker"),
  asyncHandler(async (req, res) => {
    const row = await db.getUserWork(req.user.userId);
    const items = row ? row.items || [] : [];
    const stats = db.itemStats(items);

    if (stats.total === 0) {
      return res.status(400).json({
        error:
          "No work for today yet. Ask admin to generate today's daily batch.",
      });
    }

    if (stats.pending === 0) {
      return res.json({
        ok: true,
        done: true,
        message: `All work complete for ${row.work_date}.`,
        workDate: row.work_date,
        generatedAt: row.generated_at,
        workType: row.work_type || "survey",
        ...stats,
      });
    }

    res.json({
      ok: true,
      done: false,
      message: "Work session ready.",
      workDate: row.work_date,
      generatedAt: row.generated_at,
      workType: row.work_type || "survey",
      ...stats,
    });
  })
);

app.get(
  "/api/worker/current",
  requireRole("worker"),
  asyncHandler(async (req, res) => {
    const row = await db.getUserWork(req.user.userId);
    const items = row ? row.items || [] : [];
    const stats = db.itemStats(items);
    const remainingMs = db.cooldownRemaining(
      row ? row.last_submitted_at : null,
      COOLDOWN_MS
    );
    const pendingSurveyCount = db.countByType(items, "survey");
    const pendingFormCount = db.countByType(items, "form");

    const requestedType = String(req.query.type || "").toLowerCase();
    const filterType =
      requestedType === "survey" || requestedType === "form"
        ? requestedType
        : null;

    if (stats.total === 0) {
      return res.status(400).json({
        error:
          "No work for today yet. Ask admin to generate today's daily batch.",
      });
    }

    if (stats.pending === 0) {
      return res.json({
        done: true,
        message: `All work complete for ${row.work_date}.`,
        workDate: row.work_date,
        cooldownMs: remainingMs,
        generatedAt: row.generated_at,
        workType: row.work_type || "survey",
        pendingSurveyCount,
        pendingFormCount,
        ...stats,
      });
    }

    if (remainingMs > 0) {
      return res.json({
        done: false,
        cooldown: true,
        cooldownMs: remainingMs,
        message: "Please wait before the next task.",
        workDate: row.work_date,
        generatedAt: row.generated_at,
        workType: row.work_type || "survey",
        pendingSurveyCount,
        pendingFormCount,
        requestedType: filterType,
        ...stats,
      });
    }

    const matchesType = (item) => {
      if (!filterType) return true;
      if (filterType === "form")
        return (
          item.taskType === "form" ||
          (!item.taskType && Array.isArray(item.fields))
        );
      return (
        item.taskType === "survey" ||
        (!item.taskType && !Array.isArray(item.fields))
      );
    };

    const current = items.find((i) => i.status === "pending" && matchesType(i));
    if (!current) {
      return res.json({
        done: false,
        noTaskOfType: true,
        requestedType: filterType,
        workDate: row.work_date,
        generatedAt: row.generated_at,
        workType: row.work_type || "survey",
        pendingSurveyCount,
        pendingFormCount,
        ...stats,
      });
    }
    const isForm =
      current.taskType === "form" || Array.isArray(current.fields);

    res.json({
      done: false,
      cooldown: false,
      cooldownMs: 0,
      workDate: row.work_date,
      generatedAt: row.generated_at,
      workType: row.work_type || (isForm ? "form" : "survey"),
      pendingSurveyCount,
      pendingFormCount,
      requestedType: filterType,
      task: isForm
        ? {
            queueId: current.queueId,
            taskType: "form",
            title: current.title,
            description: current.description || "",
            fields: current.fields || [],
          }
        : {
            queueId: current.queueId,
            taskType: "survey",
            question: current.question,
            options: current.options,
          },
      ...stats,
    });
  })
);

function validateFormAnswers(fields, answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { error: "answers object is required" };
  }

  const clean = {};
  for (const field of fields) {
    const raw = answers[field.key];
    const value = raw === undefined || raw === null ? "" : String(raw).trim();

    if (field.required && !value) {
      return { error: `"${field.label}" is required` };
    }
    if (!value) {
      if (!field.required) clean[field.key] = "";
      continue;
    }
    if (value.length > 200) {
      return { error: `"${field.label}" is too long (max 200 characters)` };
    }
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { error: `"${field.label}" must be a valid email` };
    }
    if (field.type === "tel" && value.replace(/\D/g, "").length < 7) {
      return { error: `"${field.label}" must have at least 7 digits` };
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      return { error: `"${field.label}" must be a number` };
    }
    if (
      field.type === "select" &&
      Array.isArray(field.options) &&
      !field.options.includes(value)
    ) {
      return { error: `"${field.label}" has an invalid choice` };
    }
    clean[field.key] = value;
  }

  return { answers: clean };
}

app.post(
  "/api/worker/submit",
  requireRole("worker"),
  asyncHandler(async (req, res) => {
    const { queueId } = req.body || {};
    const userId = req.user.userId;

    if (!queueId) {
      return res.status(400).json({ error: "queueId is required" });
    }

    const row = await db.getUserWork(userId);
    if (!row || !Array.isArray(row.items) || !row.items.length) {
      return res.status(404).json({ error: "No work assigned for this user" });
    }

    const remainingMs = db.cooldownRemaining(row.last_submitted_at, COOLDOWN_MS);
    if (remainingMs > 0) {
      return res.status(429).json({
        error: "Cooldown active. Please wait before submitting again.",
        cooldownMs: remainingMs,
      });
    }

    const items = row.items;
    const item = items.find((i) => i.queueId === queueId);
    if (!item) {
      return res.status(404).json({ error: "Task not found in your queue" });
    }
    if (item.status === "completed") {
      return res.status(400).json({ error: "Task already submitted" });
    }

    const firstPending = items.find((i) => i.status === "pending");
    if (!firstPending || firstPending.queueId !== queueId) {
      return res
        .status(400)
        .json({ error: "This is not the current task to submit" });
    }

    const isForm = item.taskType === "form" || Array.isArray(item.fields);

    if (isForm) {
      const result = validateFormAnswers(
        item.fields || [],
        (req.body || {}).answers
      );
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      item.answers = result.answers;
    } else {
      const { selectedOption } = req.body || {};
      if (selectedOption === undefined || selectedOption === null) {
        return res.status(400).json({ error: "selectedOption is required" });
      }
      const optionIndex = Number(selectedOption);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
        return res
          .status(400)
          .json({ error: "selectedOption must be 0, 1, 2, or 3" });
      }
      item.selectedOption = optionIndex;
      item.selectedText = item.options[optionIndex];
    }

    const now = new Date().toISOString();
    item.status = "completed";
    item.submittedAt = now;
    item.submittedBy = userId;

    row.last_submitted_at = now;
    row.items = items;

    const stats = db.itemStats(items);
    const allDone = stats.pending === 0;
    const unit = isForm ? "form" : "survey";

    await db.saveUserWorkRow(row);
    await db.upsertCompletion(userId, {
      date: row.work_date,
      total: stats.total,
      completedCount: stats.completed,
      status: allDone ? "complete" : "in_progress",
      completedAt: allDone ? now : null,
      generatedAt: row.generated_at || null,
    });

    res.json({
      ok: true,
      message: allDone
        ? `All work complete for ${row.work_date}.`
        : `${
            isForm ? "Form" : "Survey"
          } submitted. Next ${unit} unlocks in 1 minute.`,
      cooldownMs: allDone ? 0 : COOLDOWN_MS,
      workDate: row.work_date,
      generatedAt: row.generated_at,
      workType: row.work_type || unit,
      ...stats,
      allDone,
    });
  })
);

// ---------- Admin: users ----------
app.get(
  "/api/admin/users",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const users = await db.listAllUsers();
    const settingsMap = await db.getAllUserTaskSettings();
    const enriched = users.map((u) => ({
      ...u,
      settings: settingsMap[u.userId] || null,
    }));
    res.json({ users: enriched });
  })
);

function parseTaskType(body) {
  const valid = ["survey", "form", "mix"];
  const b = body || {};
  let modes;
  if (Array.isArray(b.taskModes)) {
    modes = b.taskModes.map((m) => String(m));
  } else if (b.taskMode !== undefined) {
    modes = [String(b.taskMode)];
  } else {
    modes = ["survey"];
  }
  modes = [...new Set(modes)].filter((m) => valid.includes(m));
  if (!modes.length) {
    return {
      error: 'taskModes must contain "survey", "form", and/or "mix"',
    };
  }
  return { taskModes: modes, taskMode: modes[0] };
}

app.post(
  "/api/admin/users",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { userId, password, name } = req.body || {};
    const id = String(userId || "")
      .trim()
      .toLowerCase();
    const pass = String(password || "");
    const displayName = String(name || "").trim();

    if (!id || !pass || !displayName) {
      return res
        .status(400)
        .json({ error: "userId, password, and name are required" });
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(id)) {
      return res.status(400).json({
        error:
          "userId must be 3–32 chars: letters, numbers, dot, underscore, hyphen",
      });
    }
    if (pass.length < 4) {
      return res
        .status(400)
        .json({ error: "password must be at least 4 characters" });
    }
    if (displayName.length < 2) {
      return res
        .status(400)
        .json({ error: "name must be at least 2 characters" });
    }

    const typeResult = parseTaskType(req.body || {});
    if (typeResult.error) {
      return res.status(400).json({ error: typeResult.error });
    }

    try {
      const user = await db.createWorker({
        userId: id,
        password: pass,
        name: displayName,
      });
      await db.upsertUserTaskSettings(id, {
        taskModes: typeResult.taskModes,
        surveyCount: 0,
        formCount: 0,
      });
      const settings = await db.getUserTaskSettings(id);
      await db.assignTodayBatchToNewUser(id);
      res.json({
        ok: true,
        message: `Worker "${displayName}" added (type: ${(
          settings.taskModes || [settings.taskMode]
        ).join(", ")}).`,
        user,
        settings,
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  })
);

app.get(
  "/api/admin/users/:userId/settings",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    // Fall back to a default (survey / no restriction) for older accounts
    // that don't have a settings row yet, so the edit modal still opens.
    const settings =
      (await db.getUserTaskSettings(userId)) || {
        userId,
        taskMode: "survey",
        taskModes: ["survey"],
        surveyCount: 0,
        formCount: 0,
        formTemplateIds: [],
        isDefault: true,
      };
    res.json({ settings });
  })
);

app.put(
  "/api/admin/users/:userId/settings",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const typeResult = parseTaskType(req.body || {});
    if (typeResult.error) {
      return res.status(400).json({ error: typeResult.error });
    }
    const userId = String(req.params.userId || "").trim().toLowerCase();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    // If this worker has no settings row yet (older accounts), create one
    // on save instead of erroring out.
    const existing = (await db.getUserTaskSettings(userId)) || {
      surveyCount: 0,
      formCount: 0,
      formTemplateIds: [],
    };

    // Optional: allowed form template ids for this worker.
    // - undefined  → keep existing selection
    // - []         → all forms eligible
    // - [ids...]   → restrict to these ids
    const body = req.body || {};
    let formTemplateIds;
    if (body.formTemplateIds !== undefined) {
      if (!Array.isArray(body.formTemplateIds)) {
        return res
          .status(400)
          .json({ error: "formTemplateIds must be an array of ids" });
      }
      formTemplateIds = body.formTemplateIds.map((v) => String(v));
    } else {
      formTemplateIds = existing.formTemplateIds || [];
    }

    await db.upsertUserTaskSettings(userId, {
      taskModes: typeResult.taskModes,
      surveyCount: existing.surveyCount || 0,
      formCount: existing.formCount || 0,
      formTemplateIds,
    });
    const settings = await db.getUserTaskSettings(userId);
    res.json({ ok: true, settings });
  })
);

// List available form templates (id + title) for the edit picker
app.get(
  "/api/admin/form-templates",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const templates = await db.fetchFormTemplateList();
    res.json({ templates });
  })
);

// Ban / unban a worker
app.post(
  "/api/admin/users/:userId/ban",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({ error: "You cannot ban yourself" });
    }
    const banned = ((req.body || {}).banned) !== false; // default true
    const user = await db.setUserBanned(userId, banned);
    res.json({
      ok: true,
      message: banned
        ? `Worker "${user.name}" is now banned.`
        : `Worker "${user.name}" is unbanned.`,
      user,
    });
  })
);

// Reset one worker's work for today
app.post(
  "/api/admin/users/:userId/reset",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const result = await db.resetUserWorkForToday(userId);
    res.json({
      ok: true,
      message: `Today's work reset for "${userId}".`,
      ...result,
    });
  })
);

// Delete a worker (and all their work/settings)
app.delete(
  "/api/admin/users/:userId",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({ error: "You cannot delete yourself" });
    }
    const result = await db.deleteWorker(userId);
    res.json({
      ok: true,
      message: `Worker "${userId}" deleted.`,
      ...result,
    });
  })
);

// Master reset: clear today's work for every worker
app.post(
  "/api/admin/reset",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const result = await db.resetAllWorkForToday();
    res.json({
      ok: true,
      message: `All workers' work reset for ${result.workDate}.`,
      ...result,
    });
  })
);

// ---------- Admin: stats + generate ----------
app.get(
  "/api/admin/stats",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const stats = await db.getAdminStats();
    res.json(stats);
  })
);

app.post(
  "/api/admin/generate",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const taskType = String(body.taskType || "survey");
    if (taskType !== "survey" && taskType !== "form" && taskType !== "mix") {
      return res
        .status(400)
        .json({ error: 'taskType must be "survey", "form", or "mix"' });
    }

    let result;
    if (taskType === "mix") {
      const surveyCount = Number(body.surveyCount);
      const formCount = Number(body.formCount);
      if (!Number.isInteger(surveyCount) || !Number.isInteger(formCount)) {
        return res
          .status(400)
          .json({ error: "surveyCount and formCount must be integers" });
      }
      if (surveyCount < 0 || surveyCount > 500) {
        return res
          .status(400)
          .json({ error: "surveyCount must be between 0 and 500" });
      }
      if (formCount < 0 || formCount > 500) {
        return res
          .status(400)
          .json({ error: "formCount must be between 0 and 500" });
      }
      if (surveyCount + formCount === 0) {
        return res
          .status(400)
          .json({ error: "Add at least 1 survey or 1 form" });
      }
      if (surveyCount + formCount > 500) {
        return res
          .status(400)
          .json({ error: "Total per worker must be at most 500" });
      }
      result = await db.generatePerWorkerDailyBatch({
        taskType: "mix",
        surveyCount,
        formCount,
      });
      res.json({
        ok: true,
        message: `Daily mixed batch updated for ${result.workDate}: ${result.surveyCount} surveys + ${result.formCount} forms → ${result.workerCount} matching worker(s)${
          result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ""
        }.`,
        ...result,
      });
      return;
    }

    let count = Number(body.count);
    if (!Number.isFinite(count) || !Number.isInteger(count)) {
      return res.status(400).json({ error: "count must be an integer" });
    }
    if (count < 1 || count > 500) {
      return res.status(400).json({ error: "count must be between 1 and 500" });
    }
    result = await db.generatePerWorkerDailyBatch({ taskType, count });
    const label = taskType === "form" ? "forms" : "surveys";
    res.json({
      ok: true,
      message: `Daily ${label} updated for ${result.workDate}: ${result.count} ${label} → ${result.workerCount} matching worker(s)${
        result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ""
      }.`,
      ...result,
    });
  })
);

// ---------- Fallback ----------
app.get("/api/*", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler (must be last)
app.use((err, req, res, next) => {
  mapDbError(err, res);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `BS Tech Limited — Survey Work at http://localhost:${PORT}`
    );
    console.log(
      isSupabaseConfigured()
        ? "Supabase: configured"
        : "Supabase: NOT configured (set .env.local)"
    );
  });
}

module.exports = app;
