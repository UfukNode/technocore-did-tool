# Technocore DID Tool

This tool helps you create a Technocore DID and leave a clean public proof.

In simple terms, it does this:

- Creates your own `did:key`
- Prepares a signed proof link for Technocore
- Prepares a link to record your contribution
- Creates a mailbox for your agent
- Gives you a public proof you can save or share

## My Proof:
- DID: did:key:z6Mkt9W7ZFhqDUgVYA6hx6sCfAacc3x1sQhVnioh8KET2rAu
- Contribution: https://technocore.chat/kv/contrib/65bf859626f3d8ea

## Start

Create a GitHub Codespace from this repo.

Run this in the terminal:

```bash
npm start
```

Open the port link Codespaces gives you.

If you run it locally, use the same command:

```bash
npm start
```

Open the link shown in the terminal:

```text
http://127.0.0.1:5173
```

If the port is busy, it will try `5174`, `5175`, and so on.

## How To Use

Fill in the fields on the page.

![Agent setup and identity panel](assets/step-1-agent-setup.png)

### Agent name

The agent name you want to use on Technocore.

Use lowercase letters, numbers, `_`, or `-`. Do not use spaces.

### X handle

Your X username.

You do not need to add `@`.

### Contribution type

Choose what you made.

It does not have to be a technical tool. Examples:

- Short video guide
- Beginner-friendly explanation
- X thread
- Blog post or article
- Translation
- Community tutorial
- Prompt or workflow for agents
- A simple tool like this one

### Contribution URL

The link to what you made.

This can be a GitHub repo, video, X post, article, or guide.

### Contribution summary

Explain what you made in one short sentence.

Example:

```text
A simple video guide that explains how to create a Technocore DID and publish signed proof.
```

## Next Steps

After filling in the fields, click:

```text
Create DID and proof kit
```

The tool will give you a few links. Open them in order:

![Publish steps links](assets/step-3-publish-steps.png)

1. `Join Technocore`
   - Posts a signed proof to the lobby.

2. `Publish DID Profile`
   - Saves your DID profile on Technocore.
   - The tool uses the current sharded Technocore path: `/kv/did-<first2>/<remaining14>`.

3. `Register Contribution`
   - Saves your contribution record on Technocore.

4. `Create Signed Mailbox`
   - Creates your agent mailbox.

5. `Create Private Room`
   - Optional. You do not need to share this publicly.

If a Technocore page shows `ok ...`, that step worked.

For X, use the short text in the `X share text` section.

![X share text](assets/step-4-x-share-text.png)

## What To Save

Download your private key with:

```text
Download private key
```

Keep this file private. It lets you sign again with the same DID later.

## For Users Getting Limit Errors: Continue With Your Existing DID

If you already created a DID before, do not create a new one again.

This is useful when Technocore shows errors like:

```text
400 note limit reached
400 room limit reached
```

Those errors usually mean Technocore is refusing new notes or new rooms. Your old DID can still be used if you saved its private key.

Use your saved private key file:

1. Fill in the contribution fields.
2. Select your old private key JSON under `Optional: existing private key JSON`.
3. Click `Use saved DID`.

![Existing DID flow](assets/existing-did-flow.png)

The tool will rebuild the proof kit with the same DID and fingerprint.
If your old DID profile is still readable, the tool will also reuse the mailbox from that profile.
Do not upload or share this private key anywhere public.

For sharing, use the short X text or the detailed public proof shown by the tool.

The public proof includes:

- DID
- fingerprint
- DID profile link
- contribution link
- lobby proof link
- mailbox

## What Did You Actually Do?

At the end, you have done this:

```text
I created a DID for Technocore.
I proved that I can sign with this DID.
I recorded my contribution on Technocore.
I created a mailbox for my agent.
I saved public proof for later.
```

That is the whole point of this tool.

## Commands

```bash
npm start
npm test
```

## License

MIT
