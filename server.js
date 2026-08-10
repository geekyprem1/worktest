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
          "No surveys for today yet. Ask admin to generate today's daily surveys.",
      });
    }

    if (stats.pending === 0) {
      return res.json({
        ok: true,
        done: true,
        message: `All surveys complete for ${row.work_date}.`,
        workDate: row.work_date,
        generatedAt: row.generated_at,
        ...stats,
      });
    }

    res.json({
      ok: true,
      done: false,
      message: "Work session ready.",
      workDate: row.work_date,
      generatedAt: row.generated_at,
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

    if (stats.total === 0) {
      return res.status(400).json({
        error:
          "No surveys for today yet. Ask admin to generate today's daily surveys.",
      });
    }

    if (stats.pending === 0) {
      return res.json({
        done: true,
        message: `All surveys complete for ${row.work_date}.`,
        workDate: row.work_date,
        cooldownMs: remainingMs,
        generatedAt: row.generated_at,
        ...stats,
      });
    }

    if (remainingMs > 0) {
      return res.json({
        done: false,
        cooldown: true,
        cooldownMs: remainingMs,
        message: "Please wait before the next survey.",
        workDate: row.work_date,
        generatedAt: row.generated_at,
        ...stats,
      });
    }

    const current = items.find((i) => i.status === "pending");
    res.json({
      done: false,
      cooldown: false,
      cooldownMs: 0,
      workDate: row.work_date,
      generatedAt: row.generated_at,
      survey: {
        queueId: current.queueId,
        question: current.question,
        options: current.options,
      },
      ...stats,
    });
  })
);

app.post(
  "/api/worker/submit",
  requireRole("worker"),
  asyncHandler(async (req, res) => {
    const { queueId, selectedOption } = req.body || {};
    const userId = req.user.userId;

    if (!queueId || selectedOption === undefined || selectedOption === null) {
      return res
        .status(400)
        .json({ error: "queueId and selectedOption are required" });
    }

    const optionIndex = Number(selectedOption);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
      return res
        .status(400)
        .json({ error: "selectedOption must be 0, 1, 2, or 3" });
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
      return res.status(404).json({ error: "Survey not found in your queue" });
    }
    if (item.status === "completed") {
      return res.status(400).json({ error: "Survey already submitted" });
    }

    const firstPending = items.find((i) => i.status === "pending");
    if (!firstPending || firstPending.queueId !== queueId) {
      return res
        .status(400)
        .json({ error: "This is not the current survey to submit" });
    }

    const now = new Date().toISOString();
    item.status = "completed";
    item.selectedOption = optionIndex;
    item.selectedText = item.options[optionIndex];
    item.submittedAt = now;
    item.submittedBy = userId;

    row.last_submitted_at = now;
    row.items = items;

    const stats = db.itemStats(items);
    const allDone = stats.pending === 0;

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
        ? `All surveys complete for ${row.work_date}.`
        : "Survey submitted. Next survey unlocks in 1 minute.",
      cooldownMs: allDone ? 0 : COOLDOWN_MS,
      workDate: row.work_date,
      generatedAt: row.generated_at,
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
    res.json({ users });
  })
);

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

    try {
      const user = await db.createWorker({
        userId: id,
        password: pass,
        name: displayName,
      });
      await db.assignTodayBatchToNewUser(id);
      res.json({
        ok: true,
        message: `Worker "${displayName}" added.`,
        user,
      });
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
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
    let count = Number((req.body || {}).count);
    if (!Number.isFinite(count) || !Number.isInteger(count)) {
      return res.status(400).json({ error: "count must be an integer" });
    }
    if (count < 1 || count > 500) {
      return res.status(400).json({ error: "count must be between 1 and 500" });
    }

    const result = await db.generateDailyForAllWorkers(count);
    res.json({
      ok: true,
      message: `Daily surveys updated for ${result.workDate}: ${result.count} surveys x ${result.workerCount} worker(s).`,
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
