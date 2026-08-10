const jwt = require("jsonwebtoken");

const COOKIE_NAME = "bs_tech_session";
const DEFAULT_SECRET = "dev-only-change-me-bs-tech-limited";

function getSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || DEFAULT_SECRET;
}

function signUser(user) {
  return jwt.sign(
    {
      userId: user.userId,
      name: user.name,
      role: user.role,
    },
    getSecret(),
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    if (!payload || !payload.userId || !payload.role) return null;
    return {
      userId: payload.userId,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function getUserFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

module.exports = {
  COOKIE_NAME,
  signUser,
  verifyToken,
  getUserFromRequest,
  setAuthCookie,
  clearAuthCookie,
};
