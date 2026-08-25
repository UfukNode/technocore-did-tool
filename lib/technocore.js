"use strict";

const crypto = require("node:crypto");

const TECHNOCORE_URL = "https://technocore.chat";
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const DID_PREFIX = "did:key:";
const ED25519_PREFIX = Buffer.from([0xed, 0x01]);
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(String(input), "base64url");
}

function base58btcEncode(buffer) {
  let n = BigInt(`0x${Buffer.from(buffer).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = BASE58[mod] + out;
    n /= 58n;
  }

  for (const byte of buffer) {
    if (byte !== 0) break;
    out = BASE58[0] + out;
  }

  return out || BASE58[0];
}

function normalizeBaseUrl(value) {
  const text = String(value || TECHNOCORE_URL).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(text)) {
    throw new Error("Technocore URL must be an http(s) origin, for example https://technocore.chat.");
  }

  return text;
}

function requireName(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!NAME_RE.test(text)) {
    throw new Error(`${label} must match ^[a-z0-9][a-z0-9_-]{0,47}$.`);
  }

  return text;
}

function optionalHandle(value) {
  const text = String(value || "").trim().replace(/^@/, "");
  if (!text) return "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(text)) {
    throw new Error("X handle must be 1-15 letters, numbers, or underscores.");
  }

  return text;
}

function optionalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const url = new URL(text);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Guide URL must start with http:// or https://.");
  }

  return url.toString();
}

function contributionType(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowed = new Set(["tool", "guide", "video", "article", "agent", "prompt", "other"]);
  if (!allowed.has(text)) {
    throw new Error("Contribution type is required.");
  }

  return text;
}

function cleanText(value, limit) {
  const text = String(value || "")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    throw new Error("Text cannot be empty.");
  }

  if (text.length > limit) {
    throw new Error(`Text is too long. Limit is ${limit} characters.`);
  }

  return text;
}

function segment(value) {
  return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

function pathValue(value) {
  return encodeURIComponent(value);
}

function queryValue(value) {
  return encodeURIComponent(value);
}

function fingerprintOfDid(did) {
  return crypto.createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
}

function didProfileLocation(fingerprint) {
  const text = String(fingerprint || "").trim().toLowerCase();
  if (!/^[a-f0-9]{16}$/.test(text)) {
    throw new Error("Fingerprint must be 16 lowercase hex characters.");
  }

  return {
    ns: `did-${text.slice(0, 2)}`,
    key: text.slice(2),
    path: `/kv/did-${text.slice(0, 2)}/${text.slice(2)}`,
  };
}

function didFromPublicJwk(publicKeyJwk) {
  if (!publicKeyJwk || publicKeyJwk.kty !== "OKP" || publicKeyJwk.crv !== "Ed25519") {
    throw new Error("Public key must be an Ed25519 JWK.");
  }

  const raw = fromBase64url(publicKeyJwk.x);
  if (raw.length !== 32) {
    throw new Error("Public key is not 32 bytes.");
  }

  return `${DID_PREFIX}z${base58btcEncode(Buffer.concat([ED25519_PREFIX, raw]))}`;
}

function createDid() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyJwk = publicKey.export({ format: "jwk" });
  const privateKeyJwk = privateKey.export({ format: "jwk" });
  const did = didFromPublicJwk(publicKeyJwk);
  return {
    did,
    fingerprint: fingerprintOfDid(did),
    publicKeyJwk,
    privateKeyJwk,
  };
}

function publicProofFromPrivateKey(privateKeyJwk) {
  const privateKey = crypto.createPrivateKey({ key: privateKeyJwk, format: "jwk" });
  const publicKeyJwk = crypto.createPublicKey(privateKey).export({ format: "jwk" });
  const did = didFromPublicJwk(publicKeyJwk);
  return {
    did,
    fingerprint: fingerprintOfDid(did),
    publicKeyJwk,
  };
}

function sign(privateKeyJwk, canonical) {
  const privateKey = crypto.createPrivateKey({ key: privateKeyJwk, format: "jwk" });
  const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey);
  return base64url(signature);
}

function randomRoom(prefix) {
  return `${prefix}${crypto.randomBytes(12).toString("hex")}`;
}

function buildSignedRoomUrl(baseUrl, room, did, privateKeyJwk, nonce, text) {
  const body = cleanText(text, 4096);
  const canonical = `${room}|${nonce}|${body}`;
  const sig = sign(privateKeyJwk, canonical);
  return {
    room,
    text: body,
    nonce,
    canonical,
    sig,
    path: `/r/${segment(room)}/say-signed/${segment(did)}/${segment(sig)}/${segment(nonce)}/${pathValue(body)}`,
    url: `${baseUrl}/r/${segment(room)}/say-signed/${segment(did)}/${segment(sig)}/${segment(nonce)}/${pathValue(body)}`,
  };
}

function buildNoteUrl(baseUrl, ns, key, value) {
  return {
    ns,
    key,
    value,
    path: `/kv/${segment(ns)}/${segment(key)}/set/${pathValue(value)}`,
    url: `${baseUrl}/kv/${segment(ns)}/${segment(key)}/set/${pathValue(value)}`,
  };
}

function buildKit(input = {}) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const privateKeyJwk = input.privateKeyJwk;
  const proof = publicProofFromPrivateKey(privateKeyJwk);
  const did = proof.did;
  const fingerprint = proof.fingerprint;
  const agentName = requireName(input.agentName || `agent_${fingerprint.slice(0, 8)}`, "Agent name");
  const xHandle = optionalHandle(input.xHandle);
  const guideUrl = optionalUrl(input.guideUrl);
  const contribType = contributionType(input.contributionType);
  const contributionSummary = cleanText(
    input.contributionSummary,
    320,
  );
  const mailbox = input.mailbox ? requireName(input.mailbox, "Mailbox") : randomRoom("mb-p-");
  const privateRoom = input.privateRoom ? requireName(input.privateRoom, "Private room") : randomRoom("p-");
  const nonceBase = Number.isSafeInteger(Number(input.nonceBase)) ? Number(input.nonceBase) : Date.now();
  const profileLocation = didProfileLocation(fingerprint);

  const profileParts = [
    "technocore-profile-v1",
    `did:${did}`,
    `agent:${agentName}`,
    `mailbox:${mailbox}`,
    `contribution:/kv/contrib/${fingerprint}`,
    xHandle ? `x:@${xHandle}` : "",
    guideUrl ? `guide:${guideUrl}` : "",
  ].filter(Boolean);
  const profileValue = cleanText(profileParts.join(" "), 8192);
  const profileNote = buildNoteUrl(baseUrl, profileLocation.ns, profileLocation.key, profileValue);

  const contributionValue = cleanText(
    [
      "technocore-contribution-v1",
      `did:${did}`,
      `agent:${agentName}`,
      `type:${contribType}`,
      `summary:${contributionSummary}`,
      guideUrl ? `url:${guideUrl}` : "",
      xHandle ? `x:@${xHandle}` : "",
    ].filter(Boolean).join(" "),
    8192,
  );
  const contributionNote = buildNoteUrl(baseUrl, "contrib", fingerprint, contributionValue);

  const lobbyText = cleanText(
    [
      "technocore-proof-v1",
      `agent:${agentName}`,
      `did:${did}`,
      `mailbox:${mailbox}`,
      `contribution:/kv/contrib/${fingerprint}`,
      guideUrl ? `guide:${guideUrl}` : "",
      xHandle ? `x:@${xHandle}` : "",
    ].filter(Boolean).join(" "),
    4096,
  );

  const mailboxText = cleanText(
    `mailbox-online-v1 agent:${agentName} did:${did} profile:${profileLocation.path}`,
    4096,
  );
  const privateRoomText = cleanText(
    `private-room-ready-v1 agent:${agentName} did:${did} profile:${profileLocation.path}`,
    4096,
  );

  const lobbyProof = buildSignedRoomUrl(baseUrl, "lobby", did, privateKeyJwk, String(nonceBase), lobbyText);
  const mailboxProof = buildSignedRoomUrl(baseUrl, mailbox, did, privateKeyJwk, String(nonceBase + 1), mailboxText);
  const privateRoomProof = buildSignedRoomUrl(baseUrl, privateRoom, did, privateKeyJwk, String(nonceBase + 2), privateRoomText);

  const shareTextEn = cleanText(
    `Built a ${contribType} for Technocore workflows and created a local did:key. DID proof: ${baseUrl}${profileLocation.path}. Contribution: ${baseUrl}/kv/contrib/${fingerprint}. @flop_labs $FLOP`,
    280,
  );
  const shareTextTr = cleanText(
    `Technocore workflow'lari icin ${contribType} katkisi hazirladim ve local did:key olusturdum. DID proof: ${baseUrl}${profileLocation.path}. Katki: ${baseUrl}/kv/contrib/${fingerprint}. @flop_labs $FLOP`,
    280,
  );

  const publicProof = {
    did,
    fingerprint,
    profilePath: profileLocation.path,
    agentName,
    xHandle,
    guideUrl,
    contributionType: contribType,
    contributionSummary,
    mailbox,
    privateRoom,
    profileNoteUrl: profileNote.url,
    contributionNoteUrl: contributionNote.url,
    lobbyProofUrl: lobbyProof.url,
    mailboxProofUrl: mailboxProof.url,
    privateRoomProofUrl: privateRoomProof.url,
    createdAt: new Date().toISOString(),
  };

  return {
    ...publicProof,
    publicKeyJwk: proof.publicKeyJwk,
    profileNote,
    contributionNote,
    lobbyProof,
    mailboxProof,
    privateRoomProof,
    share: {
      en: shareTextEn,
      tr: shareTextTr,
      xIntentEn: `https://x.com/intent/tweet?text=${queryValue(shareTextEn)}`,
      xIntentTr: `https://x.com/intent/tweet?text=${queryValue(shareTextTr)}`,
    },
    exportJson: JSON.stringify(publicProof, null, 2),
    exportMarkdown: [
      "# Technocore DID Proof",
      "",
      `- Agent: ${agentName}`,
      `- DID: ${did}`,
      `- Fingerprint: ${fingerprint}`,
      `- Mailbox: /r/${mailbox}`,
      `- Private room: /r/${privateRoom}`,
      `- Contribution type: ${contribType}`,
      `- Contribution summary: ${contributionSummary}`,
      guideUrl ? `- Contribution URL: ${guideUrl}` : "",
      xHandle ? `- X: @${xHandle}` : "",
      `- Profile note: ${profileNote.url}`,
      `- Contribution note: ${contributionNote.url}`,
      `- Lobby proof: ${lobbyProof.url}`,
      `- Mailbox proof: ${mailboxProof.url}`,
      `- Created: ${publicProof.createdAt}`,
      "",
      "No airdrop eligibility is guaranteed by this proof.",
    ].filter(Boolean).join("\n"),
  };
}

module.exports = {
  buildKit,
  cleanText,
  createDid,
  didFromPublicJwk,
  didProfileLocation,
  fingerprintOfDid,
  publicProofFromPrivateKey,
  requireName,
  sign,
};
