"use strict";

// Technocore reclaims any note left unwritten for 7 days, and deletes a room
// still on its first message after 24 hours. That is why identities published in
// August were gone by September: nothing rewrote them.
//
// This reads each listed note and writes the same bytes back. The content does
// not change; the idle timer does. One pass per run is enough to keep a record
// alive indefinitely.

const BASE = "https://technocore.chat";

function seg(value) {
  return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

async function fetchWithRetry(url, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "text/plain", connection: "close" } });
      const body = await response.text();
      if (response.status === 200) return { status: 200, body };
      if (attempt === attempts) return { status: response.status, body };
    } catch (error) {
      if (attempt === attempts) return { status: 0, body: String(error.message || error) };
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return { status: 0, body: "" };
}

// The server prefixes an untrusted-content banner; the value is the last line.
function valueOf(body) {
  const line = body.trim().split("\n").pop().trim();
  if (!line || /^see the namespace|^claim it only if absent|^\d{3} /.test(line)) return null;
  return line;
}

async function touch(path) {
  const read = await fetchWithRetry(`${BASE}${path}`);
  if (read.status !== 200) return { path, ok: false, why: `read ${read.status}` };

  const value = valueOf(read.body);
  if (!value) return { path, ok: false, why: "empty or reclaimed already" };

  const write = await fetchWithRetry(`${BASE}${path}/set/${encodeURIComponent(value)}`);
  return { path, ok: write.status === 200, why: write.status === 200 ? `${value.length} bytes` : `write ${write.status}` };
}

async function keepAlive(paths) {
  const results = [];
  for (const path of paths) {
    results.push(await touch(path));
    await new Promise((r) => setTimeout(r, 800));
  }
  return results;
}

module.exports = { keepAlive, touch, seg, BASE };
