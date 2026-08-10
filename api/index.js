// Vercel serverless entry — all routes go through Express
// Load env (Vercel injects automatically; local vercel dev uses .env*)
try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch {
  // ignore
}

const app = require("../server");

module.exports = app;
