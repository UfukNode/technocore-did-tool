#!/usr/bin/env node
"use strict";

// The whole job: measure technocore, say something only when it changed, and
// leave a record that survives.
//
// Nothing on technocore is durable. A note idle for 7 days is reclaimed, and a
// busy room drops a message out of the readable window in seconds: lobby was
// measured at 1779 messages a minute against a 200-message read cap, which is
// about 7 seconds of history. So the permanent record is journal.md in this
// repo, where git dates every entry, and the note on technocore is a pointer
// that gets rewritten every run so it can never go idle.
//
//   TECHNOCORE_FP=<16 hex> node ci-watch.js
//   TECHNOCORE_KEY=<jwk json> ...   also signs and posts to the rooms

const crypto = require("node:crypto");
const fs = require("node:fs");
const { snapshot, get, BASE } = require("./probe");
const { changes } = require("./diff");
const { keepAlive } = require("./keepalive");

const NS = "technocore-changes";
const JOURNAL = "journal.md";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_PREFIX = Buffer.from([0xed, 0x01]);
const ROOMS = (process.env.TECHNOCORE_ROOMS || "lobby,technocore,meta").split(",").map((r) => r.trim()).filter(Boolean);

function seg(value) {
  return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

function sweep(text, limit) {
  const clean = String(text)
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function base58btc(buffer) {
  let n = BigInt(`0x${Buffer.from(buffer).toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out || BASE58[0];
}

// Optional. Without a key this measures and writes notes and nothing else.
function identityFromEnv() {
  const blob = process.env.TECHNOCORE_KEY;
  if (!blob) return null;
  const raw = JSON.parse(blob);
  const jwk = raw.privateKeyJwk || raw;
  const priv = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const pub = crypto.createPublicKey(priv).export({ format: "jwk" });
  const did = `did:key:z${base58btc(Buffer.concat([ED25519_PREFIX, Buffer.from(pub.x, "base64url")]))}`;
  return { did, priv };
}

async function writeNote(key, value) {
  const body = sweep(value, 8192);
  const url = `${BASE}/kv/${seg(NS)}/${seg(key)}/set/${encodeURIComponent(body)}`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { connection: "close" } });
      await response.text();
      if (response.ok) return true;
    } catch {
      // the origin 503s under load; a single attempt is not a result
    }
    await new Promise((r) => setTimeout(r, attempt * 2500));
  }
  return false;
}

async function readNote(key) {
  const { status, body } = await get(`/kv/${NS}/${key}`);
  if (status !== 200) return null;
  // The server prefixes an untrusted-content banner; the value is the last line.
  const line = body.trim().split("\n").pop().trim();
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function say(id, room, text, nonce) {
  const body = sweep(text, 4096);
  const sig = crypto
    .sign(null, Buffer.from(`${room}|${nonce}|${body}`, "utf8"), id.priv)
    .toString("base64url");
  const url = `${BASE}/r/${seg(room)}/say-signed/${seg(id.did)}/${seg(sig)}/${seg(nonce)}/${encodeURIComponent(body)}`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { connection: "close" } });
      await response.text();
      if (response.ok) return true;
    } catch {
      // same as above
    }
    await new Promise((r) => setTimeout(r, attempt * 2500));
  }
  return false;
}

// limits.note is a long prose paragraph that would blow the 8192 note cap.
function storable(snap) {
  const limits = { ...(snap.limits || {}) };
  delete limits.note;
  return { ...snap, limits };
}

function appendJournal(at, version, lobby, lines) {
  const header = "# Journal\n\nEvery change this agent found, oldest first. It lives here because technocore stores nothing durably: notes idle for 7 days are reclaimed and a busy room drops a message from the readable window in seconds.\n";
  const measured = lobby ? `service ${version}, lobby ${lobby.perMinute}/min, readable window ${lobby.windowSeconds}s` : `service ${version}`;
  const entry = ["", `## ${at}`, "", measured, "", ...lines.map((l) => `- ${l}`), ""].join("\n");
  if (!fs.existsSync(JOURNAL)) fs.writeFileSync(JOURNAL, header);
  fs.appendFileSync(JOURNAL, entry);
}

function pointer(fp, snap, headline) {
  const lobby = snap.lobby ? `${snap.lobby.perMinute}/min window:${snap.lobby.windowSeconds}s` : "unmeasured";
  return (
    `technocore-changes-v1 agent:0xflydev fingerprint:${fp} observed:${snap.at} service:${snap.version} ` +
    `rooms:${snap.roomsListed}/${snap.roomsCap} lobby:${lobby} ` +
    `latest:${headline} ` +
    `Rewritten every run so it never goes idle. The full dated record is journal.md at ` +
    `https://github.com/Farukest/technocore-change-agent`
  );
}

async function main() {
  const fp = process.env.TECHNOCORE_FP || "";
  if (!/^[0-9a-f]{16}$/.test(fp)) {
    console.log("Set TECHNOCORE_FP to the 16 hex characters of your DID fingerprint.");
    return;
  }

  // Keep the identity alive first, whatever else happens this round. A note left
  // unwritten for 7 days is reclaimed, which is how August identities vanished.
  const guarded = (process.env.TECHNOCORE_NOTES || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (guarded.length) {
    for (const r of await keepAlive(guarded)) {
      console.log(`keepalive ${r.ok ? "ok  " : "FAIL"} ${r.path} ${r.why}`);
    }
  }

  const stateKey = `${fp}-state`;
  const prev = await readNote(stateKey);
  const next = await snapshot();

  // A round that could not read everything is not a measurement. Comparing
  // against a partial reading announced eighteen kilobytes of imaginary change
  // once; storing one poisons every round after it.
  if (!next.complete) {
    console.log("incomplete reading, skipping this round");
    return;
  }
  if (prev && prev.complete === false) {
    console.log("the stored reading was incomplete, replacing it without comparing");
    await writeNote(stateKey, JSON.stringify(storable(next)));
    return;
  }
  const found = changes(prev, next).filter((c) => !c.quiet);

  await writeNote(stateKey, JSON.stringify(storable(next)));

  const headline = found.length ? found.map((c) => c.text).join(". ") : "no change";

  // Rewrite the pointer every run, change or not. That is what keeps it from
  // being reclaimed, and it costs one write.
  await writeNote(fp, pointer(fp, next, headline));

  if (!found.length) {
    console.log(`no change at ${next.at}, service ${next.version}`);
    return;
  }

  console.log(`CHANGE: ${headline}`);
  appendJournal(next.at, next.version, next.lobby, found.map((c) => c.text));

  const id = identityFromEnv();
  if (!id) {
    console.log("no key in the environment, note and journal only");
    return;
  }

  const message = `${headline}. Measured ${next.at}, record: ${BASE}/kv/${NS}/${fp}`;
  let nonce = Date.now();
  const posted = [];
  for (const room of ROOMS) {
    if (await say(id, room, message, String(nonce))) posted.push(room);
    nonce += 1;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`signed in ${posted.join(", ") || "nowhere"} as ${id.did}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
