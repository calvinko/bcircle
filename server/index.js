import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "user-profile.json");

const DEFAULT_PROFILE = {
  name: "Bible Reader",
  email: "reader@example.com",
  goal: "Read every day",
};

const DEFAULT_READING_PLAN = {
  selectedPlan: "whole-bible",
  search: "",
  days: "365",
  activeReference: "Genesis 1",
  mainPage: "reader",
  translation: "web",
};

function normalizeProfile(profile = {}) {
  return {
    name: typeof profile.name === "string" ? profile.name : DEFAULT_PROFILE.name,
    email: typeof profile.email === "string" ? profile.email : DEFAULT_PROFILE.email,
    goal: typeof profile.goal === "string" ? profile.goal : DEFAULT_PROFILE.goal,
  };
}

function normalizeReadingPlan(readingPlan = {}) {
  return {
    selectedPlan:
      typeof readingPlan.selectedPlan === "string"
        ? readingPlan.selectedPlan
        : DEFAULT_READING_PLAN.selectedPlan,
    search: typeof readingPlan.search === "string" ? readingPlan.search : DEFAULT_READING_PLAN.search,
    days: typeof readingPlan.days === "string" ? readingPlan.days : DEFAULT_READING_PLAN.days,
    activeReference:
      typeof readingPlan.activeReference === "string"
        ? readingPlan.activeReference
        : DEFAULT_READING_PLAN.activeReference,
    mainPage:
      typeof readingPlan.mainPage === "string"
        ? readingPlan.mainPage
        : DEFAULT_READING_PLAN.mainPage,
    translation:
      typeof readingPlan.translation === "string"
        ? readingPlan.translation
        : DEFAULT_READING_PLAN.translation,
  };
}

function normalizePayload(payload = {}) {
  return {
    profile: normalizeProfile(payload.profile),
    readingPlan: normalizeReadingPlan(payload.readingPlan),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(normalizePayload({}), null, 2));
  }
}

async function readUserData() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, "utf8");
  return normalizePayload(JSON.parse(raw));
}

async function writeUserData(payload) {
  const normalized = normalizePayload({
    ...payload,
    updatedAt: new Date().toISOString(),
  });
  await ensureDataFile();
  await writeFile(DATA_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { method = "GET", url = "/" } = req;

  if (method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (method === "GET" && url === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (method === "GET" && url === "/api/user-profile") {
    try {
      const data = await readUserData();
      return sendJson(res, 200, data);
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Failed to read user data." });
    }
  }

  if (method === "PUT" && url === "/api/user-profile") {
    try {
      const body = await readJsonBody(req);
      const saved = await writeUserData(body);
      return sendJson(res, 200, saved);
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Failed to save user data." });
    }
  }

  return sendJson(res, 404, { error: "Route not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Bible Reading backend listening on http://127.0.0.1:${PORT}`);
});
