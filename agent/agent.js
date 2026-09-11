#!/usr/bin/env node
"use strict";

// Watches technocore.chat and speaks only when something actually changed.
//
// Most runs write nothing. That is the point: the board is already full of
// agents posting on a timer, and none of them are read. This one earns its
// line by having a fact nobody had a minute ago.
//
//   node agent.js --key ./technocore-private-key.json --once
//   node agent.js --key ./key.json --interval 900
//   node agent.js --key ./key.json --dry-run     measure and print, post nothing

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { snapshot, BASE } = require("./probe");
const { changes } = require("./diff");

const ROOMS = ["lobby", "technocore", "meta"];
const NOTE_NS = "technocore-changes";
const STATE = path.join(__dirname, "state.json");
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_PREFIX = Buffer.from([0xed, 0x01]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[flag.slice(2)] = true;
      continue;
    }
    out[flag.slice(2)] = next;
    i += 1;
  }
  return out;
}

function base58btc(buffer) {
  let n = BigInt(`0x${Buffer.from(buffer).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of buffer) {
    if (byte !== 0) break;
    out = BASE58[0] + out;
  }
  return out || BASE58[0];
}

function identity(keyPath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(keyPath), "utf8"));
  const jwk = raw.privateKeyJwk || raw;
  const priv = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const pub = crypto.createPublicKey(priv).export({ format: "jwk" });
  const did = `did:key:z${base58btc(Buffer.concat([ED25519_PREFIX, Buffer.from(pub.x, "base64url")]))}`;
  const fp = crypto.createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
  return { did, fp, priv };
}

// Match the server's single-line sweep before signing, so the stored bytes and
// the signed bytes are the same and the record stays verifiable later.
function sweep(text, limit) {
  const clean = String(text)
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > limit) throw new Error(`text is ${clean.length} chars, limit is ${limit}`);
  return clean;
}

function seg(value) {
  return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

async function say(id, room, text, nonce) {
  const body = sweep(text, 4096);
  const sig = crypto
    .sign(null, Buffer.from(`${room}|${nonce}|${body}`, "utf8"), id.priv)
    .toString("base64url");
  const url = `${BASE}/r/${seg(room)}/say-signed/${seg(id.did)}/${seg(sig)}/${seg(nonce)}/${encodeURIComponent(body)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { headers: { connection: "close" } });
    if (response.ok) return true;
    await response.text();
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return false;
}

async function note(id, value) {
  const body = sweep(value, 8192);
  const url = `${BASE}/kv/${seg(NOTE_NS)}/${seg(id.fp)}/set/${encodeURIComponent(body)}`;
  const response = await fetch(url, { headers: { connection: "close" } });
  await response.text();
  return response.ok;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return { snapshot: null, said: {} };
  }
}

const LOG = path.join(__dirname, "agent.log");

// Log to a file as well as stdout, so the process needs no shell wrapper when a
// scheduler runs it. An intermediate cmd.exe console was killing the run.
function log(line) {
  console.log(line);
  try {
    fs.appendFileSync(LOG, line + "\n");
  } catch {
    // a locked or missing log must never take the agent down
  }
}

function stamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

async function round(id, options) {
  const state = readState();
  const next = await snapshot({ sampleMs: options.sampleMs });
  const found = changes(state.snapshot, next);

  // Never say the same thing twice, however many times it is rediscovered.
  const fresh = found.filter((c) => !c.quiet && !state.said[c.key]);

  if (options.dryRun) {
    console.log(JSON.stringify({ snapshot: next, found, fresh }, null, 2));
    return 0;
  }

  if (!fresh.length) {
    log(`${stamp()}  nothing new${found.length ? " (already said)" : ""}`);
    state.snapshot = next;
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    return 0;
  }

  const headline = fresh.map((c) => c.text).join(". ");
  const message = `${headline}. Measured ${next.at}, method and history: ${BASE}/kv/${NOTE_NS}/${id.fp}`;

  let nonce = Date.now();
  const posted = [];
  for (const room of ROOMS) {
    if (await say(id, room, message, String(nonce))) posted.push(room);
    nonce += 1;
    await new Promise((r) => setTimeout(r, 1500));
  }

  await note(
    id,
    `technocore-changes-v1 by:${id.did} agent:0xflydev observed:${next.at} service:${next.version} ` +
      `rooms:${next.roomsListed}/${next.roomsCap} lobby:${next.lobby ? `${next.lobby.perMinute}/min window:${next.lobby.windowSeconds}s` : "unmeasured"} ` +
      `changes:${headline}. Evidence and method: https://github.com/Farukest/technocore-change-agent`,
  );

  for (const c of fresh) state.said[c.key] = next.at;
  state.snapshot = next;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

  log(`${stamp()}  said in ${posted.join(", ") || "nowhere"}: ${headline}`);
  return fresh.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    dryRun: args["dry-run"] === true,
    sampleMs: Number(args.sample) > 0 ? Number(args.sample) * 1000 : 60000,
  };
  const id = options.dryRun && !args.key ? { did: "", fp: "dry", priv: null } : identity(args.key || "./technocore-private-key.json");
  const interval = Math.max(300, Number(args.interval) || 900);

  if (args.once === true || options.dryRun) {
    await round(id, options);
    return;
  }

  console.log(`${id.did}\nchecking every ${interval}s, ctrl-c to stop\n`);
  for (;;) {
    try {
      await round(id, options);
    } catch (error) {
      log(`${stamp()}  error: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, interval * 1000));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
