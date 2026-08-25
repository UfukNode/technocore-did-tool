"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  createDid,
  buildKit,
  didProfileReadPaths,
  normalizeBaseUrl,
  parseProfileNote,
  publicProofFromPrivateKey,
} = require("./lib/technocore");

const host = process.env.HOST || (process.env.CODESPACES === "true" ? "0.0.0.0" : "127.0.0.1");
let port = Number.parseInt(process.env.PORT || process.argv[2] || "5173", 10);
const root = __dirname;
const safeRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  send(response, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (body.length > 64 * 1024) {
      throw new Error("Request body is too large.");
    }
  }

  return body ? JSON.parse(body) : {};
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return "";
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveProfile(body) {
  const baseUrl = normalizeBaseUrl(body.baseUrl);
  const proof = publicProofFromPrivateKey(body.privateKeyJwk);
  const paths = didProfileReadPaths(proof.fingerprint);

  for (const pathItem of paths) {
    const value = await fetchText(`${baseUrl}${pathItem}`);
    if (!value || !value.includes("technocore-profile-v1")) continue;
    return {
      ...proof,
      found: true,
      profilePath: pathItem,
      profileUrl: `${baseUrl}${pathItem}`,
      profile: parseProfileNote(value),
    };
  }

  return {
    ...proof,
    found: false,
    profilePath: "",
    profileUrl: "",
    profile: {},
  };
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "POST" && pathname === "/api/create-did") {
      sendJson(response, 200, { ok: true, ...createDid() });
      return;
    }

    if (request.method === "POST" && pathname === "/api/build-kit") {
      const body = await readJson(request);
      sendJson(response, 200, { ok: true, ...buildKit(body) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/public-proof") {
      const body = await readJson(request);
      sendJson(response, 200, { ok: true, ...publicProofFromPrivateKey(body.privateKeyJwk) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/resolve-profile") {
      const body = await readJson(request);
      sendJson(response, 200, { ok: true, ...await resolveProfile(body) });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

async function handleStatic(response, pathname) {
  const safePathname = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, decodeURIComponent(safePathname)));

  if (filePath !== root && !filePath.startsWith(safeRoot)) {
    send(response, 403, "Forbidden");
    return;
  }

  const body = await fs.readFile(filePath);
  send(response, 200, body, contentTypes[path.extname(filePath)] || "application/octet-stream");
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl.pathname);
      return;
    }

    await handleStatic(response, requestUrl.pathname);
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 404, "Not found");
      return;
    }

    send(response, 500, "Server error");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < 5190) {
    port += 1;
    console.warn(`Port ${port - 1} is already in use. Trying ${port}...`);
    server.listen(port, host);
    return;
  }

  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  const shownHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`Technocore DID Tool running at http://${shownHost}:${port}`);
});
