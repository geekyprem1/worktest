# BS Tech Limited — Upcoming Plan

> Baad me implement karna hai. Abhi sirf planning document.

**Last updated:** 2026-08-10  
**Status:** Planned (not started)

---

## 1. Work duration (50 surveys ≈ 5 hours)

### Problem
- Abhi har survey ke baad **1 minute** cooldown hai.
- 50 surveys ≈ ~50 min waits + answer time — **5 ghante se bahut kam**.

### Goal
- Daily **50 units** dene par kam se kam **~5 hours** ka kaam lage.
- 5 hours = **300 minutes**.

### Options (baad me choose karke build)

| Approach | Idea | Rough math (50 units) |
|----------|------|------------------------|
| A. Longer cooldown | Submit ke baad lamba wait | ~**6 min** gap × 49 ≈ **~5h** |
| B. Min time on page | Survey open ke baad X min pehle Submit disable | e.g. **6 min** per unit |
| C. Mix | Short read time + cooldown | e.g. 3 min on-page + 3 min gap |
| D. Daily total timer | First start → last submit ≥ 5h (server check) | Hard minimum day length |
| E. Random gaps | 5–8 min random wait | Average ~6 min, thoda natural |

### Recommended (first implementation)
1. Cooldown **1 min → ~6 min** (config se change ho), **ya**
2. Admin setting: `cooldownMinutes` (default 6 for “5h mode”).
3. Optional: min seconds before Submit unlock.

### Config ideas
```text
COOLDOWN_MS = 6 * 60 * 1000   // 6 minutes
MIN_VIEW_MS = 0 or 2–3 min    // optional
TARGET_DAILY_MINUTES = 300    // optional hard rule
```

---

## 2. Survey ke alawa aur kaam (task types)

Survey ke saath-saath workers ko yeh daily tasks de sakte hain.

### 2.1 Easy fit (current 4-option / MCQ style — kam code change)

| Type | Example | UI |
|------|---------|-----|
| **Survey** (already live) | Preference / feedback MCQ | 4 options |
| **Quiz / training** | Company policy padho → MCQ | 4 options |
| **Categorize / tag** | Item ko category me daalo | 4 options |
| **Moderation** | Text/post OK / Reject + reason | 4 options |
| **Sentiment / rating** | Positive / Negative / Neutral / Mixed | 4 options |
| **Checklist** | “Page load hua?” Yes/No style | 2–4 options |

In sab ko practically **template bank** jaisa treat kiya ja sakta hai — field: `task_type`.

### 2.2 Medium (thoda naya UI)

| Type | Example | Extra feature |
|------|---------|----------------|
| **Data entry** | Name, city, phone fields | Text inputs + validation |
| **Typing task** | Paragraph type karo | Accuracy / WPM check |
| **Copy-check** | Do texts same hain? | Side-by-side compare |
| **Form fill** | Dummy application form | Multi-field form |
| **Reply draft (MCQ)** | Customer msg → best reply choose | Long text + 4 replies |

### 2.3 Heavier (baad me phase)

| Type | Example | Extra feature |
|------|---------|----------------|
| **Link check / research** | URL live? Price find? | Open link + answer field |
| **Image tag** | Photo me kya hai | Image + options |
| **Proof upload** | Step complete → screenshot | File/image upload (Supabase Storage) |
| **Audio / video** | Short clip → questions | Media player + MCQ |
| **App QA checklist** | Multi-step yes/no | Ordered checklist |

---

## 3. Sample daily mix (≈ 5 hours with timing rules)

Example daily batch (50 units):

| Slot | Task type | Count |
|------|-----------|-------|
| A | Surveys (MCQ) | 20 |
| B | Categorize / tag | 15 |
| C | Policy quiz | 10 |
| D | Checklist | 5 |
| **Total** | | **50** |

Har unit pe ~6 min rule → total work time ~**5 hours**.

---

## 4. Product / admin features (future)

| Feature | Description |
|---------|-------------|
| Task type filter | Admin generate: only surveys / mix / quiz only |
| Cooldown per day | Admin sets 1 / 5 / 6 min when generating |
| Template banks | Separate banks: surveys, quizzes, moderation |
| Per-user targets | Different workers different counts |
| Auto daily generate | Cron (Vercel cron / Supabase) — optional |
| Reports | Admin: who finished which date, time spent |
| Leaderboard | Optional daily completion ranking |

---

## 5. Suggested implementation phases

### Phase 1 — Time control (priority for “5 hour workday”)
- [ ] Configurable cooldown (default 6 min for 50→~5h)
- [ ] Optional min view time before Submit
- [ ] Admin UI: set cooldown when generating batch
- [ ] Show worker: “Next task in mm:ss” (already have timer UI)

### Phase 2 — Task types (MCQ family)
- [ ] DB: `task_type` on templates (`survey` \| `quiz` \| `categorize` \| `moderate` \| `sentiment` \| `checklist`)
- [ ] Seed extra templates per type
- [ ] Worker UI label: “Survey” / “Quiz” / etc.
- [ ] Admin generate: pick type mix or single type

### Phase 3 — Text / form tasks
- [ ] Data entry + typing tasks
- [ ] Validation rules
- [ ] Store free-text answers in completions

### Phase 4 — Media / upload / research
- [ ] Image tasks + storage
- [ ] Proof upload
- [ ] Link-check tasks

---

## 6. Data model sketch (for later)

```text
templates
  id, question, options (jsonb), task_type, metadata (jsonb)

daily_work.items[]
  queueId, templateId, task_type, question, options,
  status, selectedOption / answerText, submittedAt, ...

settings (optional table or env)
  default_cooldown_ms
  min_view_ms
  default_daily_count
```

---

## 7. Out of scope for now (explicit)

- Payment / payroll
- Mobile native app
- Real customer CRM integration
- Live chat between admin–worker
- Auto AI-generated unlimited templates (can explore later)

---

## 8. Current live system (reminder)

| Item | Now |
|------|-----|
| Templates pool | 500 MCQ surveys |
| Daily assign | Admin generate only (not auto) |
| Generate again same day | **Replace** (not add) |
| Cooldown | 1 minute |
| Hosting target | Vercel + Supabase free |
| Company | BS Tech Limited |

---

## 9. Decision log (fill jab decide ho)

| Date | Decision | Notes |
|------|----------|-------|
| | Cooldown minutes for 5h mode | e.g. 6 |
| | First new task type after survey | e.g. quiz / categorize |
| | Auto daily generate? | yes / no |

---

**Next action when ready:** Phase 1 (time control) pehle, phir Phase 2 (task types).
