"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  buildKit,
  cleanText,
  createDid,
  didProfileLocation,
  didProfileReadPaths,
  fingerprintOfDid,
  parseProfileNote,
  privateKeyJwkFromSeed,
  publicProofFromPrivateKey,
  requireName,
  sign,
} = require("../lib/technocore");

test("creates an Ed25519 did:key with a Technocore-compatible shape", () => {
  const identity = createDid();
  assert.match(identity.did, /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/);
  assert.equal(identity.fingerprint, fingerprintOfDid(identity.did));
  assert.equal(identity.publicKeyJwk.crv, "Ed25519");
  assert.equal(identity.privateKeyJwk.crv, "Ed25519");
});

test("builds the sharded DID profile note path", () => {
  assert.deepEqual(didProfileLocation("65bf859626f3d8ea"), {
    ns: "did-65",
    key: "bf859626f3d8ea",
    path: "/kv/did-65/bf859626f3d8ea",
  });
  assert.deepEqual(didProfileReadPaths("65bf859626f3d8ea"), [
    "/kv/did-65/bf859626f3d8ea",
    "/kv/did/65bf859626f3d8ea",
  ]);
});

test("parses mailbox details from a DID profile note", () => {
  const profile = parseProfileNote(
    "technocore-profile-v1 did:did:key:z6Mkxxx agent:demo_agent mailbox:mb-p-111111111111111111111111 contribution:/kv/contrib/65bf859626f3d8ea x:@demo_user guide:https://example.com/tool",
  );

  assert.equal(profile.agentName, "demo_agent");
  assert.equal(profile.mailbox, "mb-p-111111111111111111111111");
  assert.equal(profile.xHandle, "demo_user");
  assert.equal(profile.guideUrl, "https://example.com/tool");
});

test("creates a reusable private JWK from a Technocore seed", () => {
  const seed = "aa".repeat(32);
  const key = privateKeyJwkFromSeed(seed);
  const upperKey = privateKeyJwkFromSeed(seed.toUpperCase());
  const proof = publicProofFromPrivateKey(key);
  const sig = sign(key, "lobby|1|hello");
  const privateKey = crypto.createPrivateKey({ key, format: "jwk" });
  const publicKey = crypto.createPublicKey(privateKey);

  assert.equal(key.kty, "OKP");
  assert.equal(key.crv, "Ed25519");
  assert.equal(key.d, Buffer.from(seed, "hex").toString("base64url"));
  assert.equal(upperKey.d, key.d);
  assert.match(proof.did, /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/);
  assert.equal(
    crypto.verify(null, Buffer.from("lobby|1|hello", "utf8"), publicKey, Buffer.from(sig, "base64url")),
    true,
  );
});

test("signs canonical Technocore room messages", () => {
  const identity = createDid();
  const canonical = `lobby|123|hello technocore`;
  const sig = sign(identity.privateKeyJwk, canonical);
  const privateKey = crypto.createPrivateKey({ key: identity.privateKeyJwk, format: "jwk" });
  const publicKey = crypto.createPublicKey(privateKey);
  assert.equal(sig.length, 86);
  assert.equal(
    crypto.verify(null, Buffer.from(canonical, "utf8"), publicKey, Buffer.from(sig, "base64url")),
    true,
  );
});

test("builds one profile note and signed proof URLs", () => {
  const identity = createDid();
  const kit = buildKit({
    privateKeyJwk: identity.privateKeyJwk,
    agentName: "ufuk_agent",
    xHandle: "UfukNode",
    contributionType: "tool",
    contributionSummary: "Simple Technocore DID starter for agents.",
    guideUrl: "https://example.com/guide",
    baseUrl: "https://technocore.chat",
    nonceBase: 1000,
  });

  assert.equal(kit.did, identity.did);
  assert.equal(kit.agentName, "ufuk_agent");
  assert.match(kit.mailbox, /^mb-p-[a-f0-9]{24}$/);
  assert.match(kit.privateRoom, /^p-[a-f0-9]{24}$/);
  assert.match(kit.profileNote.url, /^https:\/\/technocore\.chat\/kv\/did-[a-f0-9]{2}\/[a-f0-9]{14}\/set\//);
  assert.equal(kit.profilePath, `/kv/did-${kit.fingerprint.slice(0, 2)}/${kit.fingerprint.slice(2)}`);
  assert.ok(kit.mailboxProof.text.includes(`profile:${kit.profilePath}`));
  assert.ok(kit.profileNote.url.includes("https%3A%2F%2Fexample.com%2Fguide"));
  assert.ok(!kit.profileNote.url.includes("https%3A%252F%252Fexample.com"));
  assert.match(kit.contributionNote.url, /^https:\/\/technocore\.chat\/kv\/contrib\//);
  assert.ok(kit.contributionNote.value.includes("type:tool"));
  assert.ok(kit.lobbyProof.text.includes(`/kv/contrib/${kit.fingerprint}`));
  assert.match(kit.lobbyProof.url, /\/r\/lobby\/say-signed\//);
  assert.match(kit.mailboxProof.url, /\/r\/mb-p-/);
  assert.ok(kit.exportMarkdown.includes("No airdrop eligibility is guaranteed"));
  assert.ok(kit.exportMarkdown.includes("Contribution note:"));
});

test("rejects invalid names and cleans invisible text", () => {
  assert.throws(() => requireName("../bad", "Agent name"), /must match/);
  assert.equal(cleanText("hello\u200b\nworld", 100), "hello world");
});

test("requires an explicit contribution type and summary", () => {
  const identity = createDid();
  assert.throws(
    () => buildKit({ privateKeyJwk: identity.privateKeyJwk, contributionSummary: "Useful guide." }),
    /Contribution type is required/,
  );
  assert.throws(
    () => buildKit({ privateKeyJwk: identity.privateKeyJwk, contributionType: "guide" }),
    /Text cannot be empty/,
  );
});

test("derives the public proof from a private JWK", () => {
  const identity = createDid();
  const proof = publicProofFromPrivateKey(identity.privateKeyJwk);
  assert.equal(proof.did, identity.did);
  assert.equal(proof.fingerprint, identity.fingerprint);
});
