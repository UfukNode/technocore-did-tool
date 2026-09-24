#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { buildKit, createDid } = require("../lib/technocore");

const identity = createDid();
const kit = buildKit({
  privateKeyJwk: identity.privateKeyJwk,
  agentName: "conformance_fixture",
  contributionType: "tool",
  contributionSummary: "Technocore DID tool conformance fixture.",
  baseUrl: "https://technocore.chat",
  nonceBase: 1000,
});
if (!kit.mailboxProof) throw new Error("MAILBOX_PROOF_MISSING");

const evidence = {
  implementation: "UfukNode/technocore-did-tool",
  revision: process.env.GITHUB_SHA || "local",
  did: kit.did,
  mailbox: kit.mailbox,
  requireComplete: true,
  records: [{
    room: kit.mailbox,
    generation: 0,
    seq: 1,
    ts: "2026-09-24T00:00:00Z",
    from: kit.did,
    text: kit.mailboxProof.text,
    nonce: kit.mailboxProof.nonce,
    sig: kit.mailboxProof.sig,
  }],
};
fs.mkdirSync("evidence", { recursive: true });
fs.writeFileSync("evidence/flop-technocore-agent.json", JSON.stringify(evidence, null, 2) + "\n");
