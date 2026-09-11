"use strict";

// Everything that reads technocore.chat and turns it into a comparable snapshot.
// No key, no writes. Kept separate so the measuring half stays runnable anywhere.

const crypto = require("node:crypto");

const BASE = "https://technocore.chat";
const FAUCET_WORDS = /\b(faucet|testnet|airdrop|claim|token|mint|drip|balance|allowance)\b/gi;

// Paths the faucet could plausibly land on. Cheap to check, and the point is to
// notice the day one of them stops returning 404 rather than to guess right.
const CANDIDATES = [
  "/faucet",
  "/testnet",
  "/token",
  "/claim",
  "/drip",
  "/balance",
  "/faucet.md",
  "/testnet.md",
  "/token.md",
  "/.well-known/faucet.json",
];

// The origin 503s under load often enough that one attempt is not a reading.
// A retried get is the difference between a measurement and a guess.
async function get(path, timeoutMs = 20000, attempts = 4) {
  let last = { status: 0, body: "" };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      last = await getOnce(path, timeoutMs);
      if (last.status === 200) return last;
    } catch (error) {
      last = { status: 0, body: String(error.message || error) };
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return last;
}

async function getOnce(path, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { accept: "text/plain", connection: "close" },
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function status(path) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BASE}${path}`, {
        method: "HEAD",
        headers: { connection: "close" },
        signal: controller.signal,
      });
      return response.status;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

function sha(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function lastSeq(roomsHeader) {
  const m = /range \d+\.\.(\d+)/.exec(roomsHeader);
  return m ? Number(m[1]) : null;
}

// Two reads a minute apart give the message rate, which is what decides how long
// anything posted to a busy room stays inside the 200-message read window.
async function lobbyWindow(sampleMs = 60000) {
  const a = lastSeq((await get("/r/lobby")).body);
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = lastSeq((await get("/r/lobby")).body);
  if (a === null || b === null || b <= a) return null;
  const perMinute = Math.round(((b - a) * 60000) / sampleMs);
  return { perMinute, windowSeconds: Math.round((200 * 60) / perMinute) };
}

function faucetHits(text) {
  const hits = text.match(FAUCET_WORDS);
  return hits ? [...new Set(hits.map((h) => h.toLowerCase()))].sort() : [];
}

// Documents the service advertises. /interop.md appeared this way in 0.9.6, and
// a faucet is at least as likely to arrive as a new page as a new capability.
function docsIn(text) {
  const found = text.match(/\/[a-z0-9][a-z0-9._-]*\.(md|json|txt)\b/gi) || [];
  return [...new Set(found.map((d) => d.toLowerCase()))].sort();
}

// A filename in the prose is not a document. /design.md and /server-card.json
// were both announced as new and both 404: the pattern matched text, not a
// route. Only a path that answers counts.
async function confirmDocs(candidates) {
  const live = [];
  for (const path of candidates) {
    const code = await status(path);
    if (code !== null && code >= 200 && code < 400) live.push(path);
  }
  return live.sort();
}

async function snapshot({ sampleMs } = {}) {
  const [agentJson, llms, rooms] = await Promise.all([
    get("/.well-known/agent.json"),
    get("/llms.txt"),
    get("/rooms"),
  ]);

  let manifest = {};
  try {
    manifest = JSON.parse(agentJson.body);
  } catch {
    manifest = {};
  }

  const roomsHeader = rooms.body.split("\n")[0] || "";
  const roomCount = /of (\d+) rooms/.exec(roomsHeader);
  const roomCap = /cap (\d+)/.exec(roomsHeader);

  // Only a real answer counts. A 5xx is the origin tripping over itself and a
  // 429 is a rate limit; both came back as 404 on the next round, and treating
  // them as arrivals cost eight false alarms in one night.
  const live = [];
  for (const path of CANDIDATES) {
    const code = await status(path);
    if (code !== null && code >= 200 && code < 400) live.push(path);
  }

  // A round that could not read all three documents is not a measurement of
  // anything. Stored and compared only when this is true.
  const complete = Boolean(manifest.version) && llms.status === 200 && rooms.status === 200;

  return {
    at: new Date().toISOString(),
    complete,
    version: manifest.version || null,
    capabilities: (manifest.capabilities || []).map((c) => c.name).sort(),
    limits: manifest.limits || null,
    llmsHash: sha(llms.body),
    llmsBytes: llms.body.length,
    docs: await confirmDocs(docsIn(`${llms.body} ${agentJson.body}`)),
    livePaths: live.sort(),
    roomsListed: roomCount ? Number(roomCount[1]) : null,
    roomsCap: roomCap ? Number(roomCap[1]) : null,
    faucet: [...new Set([...faucetHits(JSON.stringify(manifest)), ...faucetHits(llms.body)])],
    lobby: await lobbyWindow(sampleMs),
  };
}

module.exports = { snapshot, get, status, sha, BASE, CANDIDATES };
