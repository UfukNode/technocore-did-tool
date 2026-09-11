"use strict";

// Turns two snapshots into the sentences worth saying, and nothing else.
// If this returns an empty array the agent stays quiet, which is most of the time.

// The rate oscillates between roughly 1200 and 2300 a minute, so a percentage
// threshold fires on ordinary wobble: 20 of the first 42 journal entries were
// nothing but that. What matters is the readable window crossing a boundary a
// reader would act on, not the rate moving.
const WINDOW_BANDS = [60, 30, 15, 10, 5, 2];

function band(seconds) {
  return WINDOW_BANDS.findIndex((b) => seconds >= b);
}

function pct(a, b) {
  if (!a) return Infinity;
  return Math.abs(b - a) / a;
}

function changes(prev, next) {
  const out = [];

  if (!prev) {
    out.push({
      key: "first-run",
      quiet: true,
      text: `baseline recorded at ${next.version || "unknown version"}`,
    });
    return out;
  }

  if (prev.version !== next.version) {
    out.push({
      key: `version:${next.version}`,
      text: `technocore.chat is on ${next.version}, was ${prev.version}`,
    });
  }

  const gained = next.capabilities.filter((c) => !prev.capabilities.includes(c));
  const lost = prev.capabilities.filter((c) => !next.capabilities.includes(c));
  if (gained.length) out.push({ key: `cap+:${gained.join(",")}`, text: `new capability: ${gained.join(", ")}` });
  if (lost.length) out.push({ key: `cap-:${lost.join(",")}`, text: `capability removed: ${lost.join(", ")}` });

  // The one worth waking up for.
  const newWords = next.faucet.filter((w) => !prev.faucet.includes(w));
  if (newWords.length) {
    out.push({
      key: `faucet:${newWords.join(",")}`,
      text: `the manual now mentions ${newWords.join(", ")}, which it did not before. Read /llms.txt and /.well-known/agent.json`,
    });
  }

  // A path that answers is the loudest signal this agent can carry, so it has to
  // survive two consecutive rounds before it is worth saying. One round of 503s
  // from a busy origin already cost eight false alarms.
  const confirmed = prev.livePaths
    ? next.livePaths.filter((path) => prev.livePaths.includes(path))
    : [];
  for (const path of confirmed) {
    out.push({
      key: `live:${path}`,
      text: `the path ${path} is answering, and was 404 until recently. Flop Labs has said the testnet faucet will live on this host and be reachable by agents holding a DID key`,
    });
  }

  const newDocs = prev.docs ? next.docs.filter((d) => !prev.docs.includes(d)) : [];
  if (newDocs.length) {
    out.push({ key: `docs:${newDocs.join(",")}`, text: `new document advertised: ${newDocs.join(", ")}` });
  }
  if (prev.llmsHash !== next.llmsHash) {
    const delta = next.llmsBytes - prev.llmsBytes;
    out.push({
      key: `llms:${next.llmsHash}`,
      text: `/llms.txt changed, ${delta >= 0 ? "+" : ""}${delta} bytes`,
    });
  }

  for (const [field, label] of [["note_chars", "note size"], ["message_chars", "message size"], ["rooms", "room cap"], ["notes", "note cap"]]) {
    const a = prev.limits?.[field];
    const b = next.limits?.[field];
    if (a !== undefined && b !== undefined && a !== b) {
      out.push({ key: `limit:${field}:${b}`, text: `${label} moved from ${a} to ${b}` });
    }
  }

  if (prev.lobby && next.lobby && band(prev.lobby.windowSeconds) !== band(next.lobby.windowSeconds)) {
    out.push({
      key: `window:${band(next.lobby.windowSeconds)}`,
      text: `the readable window in /r/lobby is now about ${next.lobby.windowSeconds} seconds, was ${prev.lobby.windowSeconds}. The read lane caps at 200 messages whatever limit you pass, and lobby is running ${next.lobby.perMinute} a minute, so anything posted there stops being verifiable that fast`,
    });
  }

  return out;
}

module.exports = { changes };
