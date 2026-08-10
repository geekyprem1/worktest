/** Shared generator for 500 survey templates */

const subjects = [
  "customers",
  "new users",
  "remote teams",
  "retail shoppers",
  "students",
  "freelancers",
  "managers",
  "support agents",
  "mobile users",
  "enterprise clients",
  "startup founders",
  "content creators",
  "sales teams",
  "product managers",
  "designers",
  "engineers",
  "marketers",
  "HR teams",
  "finance teams",
  "first-time buyers",
];

const outcomes = [
  "retention",
  "conversion",
  "engagement",
  "satisfaction",
  "productivity",
  "onboarding speed",
  "trust",
  "loyalty",
  "collaboration",
  "response time",
  "daily active use",
  "feature adoption",
  "referral rate",
  "task completion",
  "team morale",
];

const actions = [
  "faster load times",
  "clearer pricing",
  "personalized recommendations",
  "better search",
  "live chat support",
  "email digests",
  "push notifications",
  "gamified rewards",
  "simpler forms",
  "dark mode",
  "offline access",
  "AI suggestions",
  "weekly reports",
  "role-based access",
  "guided tutorials",
  "keyboard shortcuts",
  "bulk actions",
  "template library",
  "auto-save",
  "two-factor auth",
];

const contexts = [
  "SaaS product",
  "e-commerce store",
  "workplace tool",
  "learning app",
  "customer support desk",
  "mobile banking app",
  "project management suite",
  "health tracking app",
  "social community",
  "booking platform",
  "CRM system",
  "analytics dashboard",
  "HR portal",
  "inventory system",
  "knowledge base",
];

const questionStarters = [
  (s, o, a, c) => `In a ${c}, which option most improves ${o} for ${s}?`,
  (s, o, a, c) => `What should a ${c} prioritize to boost ${o} among ${s}?`,
  (s, o, _a, c) => `For ${s} using a ${c}, which choice best supports ${o}?`,
  (s, o) => `Which of the following is most likely to improve ${o} for ${s}?`,
  (s, _o, a, c) =>
    `When designing a ${c} for ${s}, which feature delivers the most value?`,
  (s, o, a, c) =>
    `Survey: ${s} and ${o} — pick the strongest approach in a ${c}.`,
  (s, o) =>
    `Compared with the alternatives, what helps ${s} the most with ${o}?`,
  (_s, o, a, c) =>
    `In weekly product reviews, which lever best moves ${o} for a ${c}?`,
  (s, o, a, c) =>
    `If budget is limited, what should a ${c} invest in first for ${s}' ${o}?`,
  (s, _o, a, c) =>
    `Which option best matches feedback from ${s} about a ${c}?`,
];

const optionBanks = [
  actions,
  [
    "Reduce friction in signup",
    "Add social proof on landing pages",
    "Offer free trials",
    "Improve mobile layout",
    "Send re-engagement emails",
    "Add progress indicators",
    "Simplify navigation menus",
    "Provide export options",
    "Enable team workspaces",
    "Add calendar integrations",
    "Show usage analytics",
    "Offer multi-language support",
    "Add audit logs",
    "Improve error messages",
    "Provide sandbox mode",
    "Add in-app tips",
    "Offer priority support",
    "Create video walkthroughs",
    "Add custom branding",
    "Support API webhooks",
  ],
  [
    "Morning check-ins",
    "Async standups",
    "Shared dashboards",
    "Pair programming sessions",
    "Office hours",
    "Peer reviews",
    "Customer interviews",
    "A/B testing",
    "Heatmap analysis",
    "NPS surveys",
    "Churn interviews",
    "Feature voting boards",
    "Changelog emails",
    "Beta waitlists",
    "Referral codes",
    "Loyalty tiers",
    "Seasonal campaigns",
    "Micro-surveys",
    "Usage limits",
    "Transparent SLAs",
  ],
  [
    "Option A: Speed first",
    "Option B: Clarity first",
    "Option C: Personalization first",
    "Option D: Reliability first",
    "Invest in UX research",
    "Invest in backend scale",
    "Invest in content quality",
    "Invest in sales enablement",
    "Automate repetitive tasks",
    "Hire specialist talent",
    "Outsource non-core work",
    "Build in-house tooling",
    "Ship smaller releases",
    "Ship larger milestones",
    "Focus on power users",
    "Focus on beginners",
    "Prioritize desktop",
    "Prioritize mobile",
    "Prioritize integrations",
    "Prioritize core workflow",
  ],
];

function pick(arr, i, salt) {
  return arr[(i * 7 + salt * 13) % arr.length];
}

function uniqueOptions(seed) {
  const bank = optionBanks[seed % optionBanks.length];
  const picked = [];
  let offset = seed;
  while (picked.length < 4) {
    const item = bank[offset % bank.length];
    if (!picked.includes(item)) picked.push(item);
    offset += 3 + (seed % 5);
    if (offset > seed + 200) {
      picked.push(`Choice ${picked.length + 1} (variant ${seed})`);
    }
  }
  return picked;
}

function buildTemplates(count = 500) {
  const templates = [];
  for (let i = 0; i < count; i++) {
    const s = pick(subjects, i, 1);
    const o = pick(outcomes, i, 2);
    const a = pick(actions, i, 3);
    const c = pick(contexts, i, 4);
    const starter = questionStarters[i % questionStarters.length];
    let question = starter(s, o, a, c);
    if (i > 0 && i % 97 === 0) {
      question = `[Batch ${Math.floor(i / 97)}] ${question}`;
    }
    templates.push({
      id: `tpl_${String(i + 1).padStart(3, "0")}`,
      question,
      options: uniqueOptions(i + 11),
    });
  }
  return templates;
}

module.exports = { buildTemplates };
