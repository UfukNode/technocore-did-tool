"use strict";

const i18n = {
  en: {
    title: "Technocore DID Tool",
    subtitle: "Create a local DID, join Technocore, register a useful contribution, and share proof.",
    setupTitle: "Agent setup",
    setupText: "Choose one agent name and describe the useful contribution you want to register.",
    agentName: "Agent name",
    xHandle: "X handle",
    contributionType: "Contribution type",
    guideUrl: "Contribution URL",
    contributionSummary: "Contribution summary",
    baseUrl: "Technocore URL",
    createDid: "Create DID and proof kit",
    downloadKey: "Download private key",
    existingKey: "Optional: existing private key JSON",
    useSavedDid: "Use saved DID",
    identityTitle: "Identity",
    identityText: "Your DID and public profile note.",
    fingerprint: "Fingerprint",
    mailbox: "Mailbox",
    publishTitle: "Publish steps",
    publishText: "Follow these in order: create DID, join Technocore, register contribution, then share it.",
    emptyUrls: "Create a DID first.",
    shareTitle: "X share text",
    shareText: "Copy this short text for X. Use the detailed proof below for README or video descriptions.",
    copyShare: "Copy share text",
    openX: "Open X composer",
    exportTitle: "Detailed proof export",
    exportText: "Save this for README, video descriptions, forms, or your own records.",
    copyExport: "Copy export",
    downloadExport: "Download export",
    copy: "Copy",
    open: "Open",
    copied: "Copied.",
    created: "DID and proof kit created.",
    reused: "Saved DID loaded and proof kit created.",
    reusedMailbox: "Saved DID loaded. Existing mailbox reused.",
    selectKey: "Select a private key JSON first.",
    lobbyStep: "Step 2: join Technocore",
    lobbyHelp: "Post a signed proof in /r/lobby. This proves the DID can sign.",
    profileStep: "Step 3: publish DID profile",
    profileHelp: "World-readable profile note at /kv/did-xx/<key>. It links your DID, mailbox, and contribution record.",
    contributionStep: "Step 4: register contribution",
    contributionHelp: "Writes your useful work to /kv/contrib/<fingerprint> so agents can discover the context.",
    mailboxStep: "Create signed mailbox",
    mailboxHelp: "Creates your mb-p mailbox with a signed message.",
    privateStep: "Optional: create private room",
    privateHelp: "Not required for proof. Skip this step if Technocore shows room limit reached.",
  },
  tr: {
    title: "Technocore DID Tool",
    subtitle: "Local DID oluştur, Technocore'a katıl, faydalı katkını kaydet ve proof paylaş.",
    setupTitle: "Agent kurulumu",
    setupText: "Tek bir agent adı seç ve kaydetmek istediğin faydalı katkıyı anlat.",
    agentName: "Agent adı",
    xHandle: "X kullanıcı adı",
    contributionType: "Katkı türü",
    guideUrl: "Katkı linki",
    contributionSummary: "Katkı özeti",
    baseUrl: "Technocore URL",
    createDid: "DID ve proof kit oluştur",
    downloadKey: "Private key indir",
    existingKey: "Opsiyonel: mevcut private key JSON",
    useSavedDid: "Kayıtlı DID'i kullan",
    identityTitle: "Kimlik",
    identityText: "DID ve public profile note bilgilerin.",
    fingerprint: "Fingerprint",
    mailbox: "Mailbox",
    publishTitle: "Yayınlama adımları",
    publishText: "Sırayla ilerle: DID oluştur, Technocore'a katıl, katkını kaydet, sonra paylaş.",
    emptyUrls: "Önce DID oluştur.",
    shareTitle: "X'te paylaşılacak metin",
    shareText: "X için bu kısa metni kopyalayın. README veya video açıklaması için alttaki detaylı proof'u kullanın.",
    copyShare: "Paylaşım metnini kopyala",
    openX: "X composer aç",
    exportTitle: "Detaylı proof export",
    exportText: "Bunu README, video açıklaması, form veya kendi arşiviniz için saklayın.",
    copyExport: "Export kopyala",
    downloadExport: "Export indir",
    copy: "Kopyala",
    open: "Aç",
    copied: "Kopyalandı.",
    created: "DID ve proof kit oluşturuldu.",
    reused: "Kayıtlı DID yüklendi ve proof kit oluşturuldu.",
    reusedMailbox: "Kayıtlı DID yüklendi. Mevcut mailbox kullanıldı.",
    selectKey: "Önce private key JSON dosyasını seç.",
    lobbyStep: "Adım 2: Technocore'a katıl",
    lobbyHelp: "/r/lobby içine signed proof gönder. Bu DID'in imza atabildiğini gösterir.",
    profileStep: "Adım 3: DID profilini yayınla",
    profileHelp: "/kv/did-xx/<key> altındaki world-readable profile note. DID, mailbox ve katkı kaydını birbirine bağlar.",
    contributionStep: "Adım 4: katkını kaydet",
    contributionHelp: "Faydalı işini /kv/contrib/<fingerprint> altına yazar; agentlar bağlamı buradan okuyabilir.",
    mailboxStep: "Signed mailbox oluştur",
    mailboxHelp: "mb-p mailbox'ını signed mesajla oluşturur.",
    privateStep: "Opsiyonel: private room oluştur",
    privateHelp: "Proof icin zorunlu degil. Technocore room limit reached hatasi gosterirse bu adimi gec.",
  },
};

const state = {
  lang: localStorage.getItem("lang") || "en",
  key: null,
  kit: null,
  exportTab: "markdown",
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  createButton: $("#createButton"),
  importKeyButton: $("#importKeyButton"),
  privateKeyFile: $("#privateKeyFile"),
  downloadKeyButton: $("#downloadKeyButton"),
  copyShareButton: $("#copyShareButton"),
  copyExportButton: $("#copyExportButton"),
  downloadExportButton: $("#downloadExportButton"),
  tweetLink: $("#tweetLink"),
  didOut: $("#didOut"),
  fingerprintOut: $("#fingerprintOut"),
  mailboxOut: $("#mailboxOut"),
  urlList: $("#urlList"),
  shareBox: $("#shareBox"),
  exportBox: $("#exportBox"),
  toast: $("#toast"),
};

function t(key) {
  return i18n[state.lang][key] || i18n.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.lang);
  });
  renderKit();
}

async function postJson(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("API response is not JSON. Start the tool with npm start and open the local or Codespace URL.");
  }
  if (!data) {
    throw new Error("API returned an empty response. Start the tool with npm start and open the local or Codespace URL.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function inputValue(id) {
  return document.getElementById(id).value.trim();
}

async function createKit() {
  setBusy(true);
  try {
    const identity = await postJson("/api/create-did");
    await buildKitWithKey(identity.privateKeyJwk);
    renderKit();
    showToast(t("created"));
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function buildKitWithKey(privateKeyJwk, savedProfile = {}) {
  state.key = privateKeyJwk;
  state.kit = await postJson("/api/build-kit", {
    privateKeyJwk: state.key,
    agentName: inputValue("agentName") || savedProfile.agentName || "",
    xHandle: inputValue("xHandle") || savedProfile.xHandle || "",
    contributionType: inputValue("contributionType"),
    guideUrl: inputValue("guideUrl") || savedProfile.guideUrl || "",
    contributionSummary: inputValue("contributionSummary"),
    baseUrl: inputValue("baseUrl"),
    mailbox: savedProfile.mailbox || "",
  });
}

function privateKeyFromJson(payload) {
  if (payload && payload.privateKeyJwk) return payload.privateKeyJwk;
  if (payload && payload.kty === "OKP" && payload.crv === "Ed25519") return payload;
  throw new Error("Select the private key JSON downloaded from this tool.");
}

async function importSavedDid() {
  const file = elements.privateKeyFile.files && elements.privateKeyFile.files[0];
  if (!file) {
    showToast(t("selectKey"));
    return;
  }

  setBusy(true);
  try {
    const payload = JSON.parse(await file.text());
    const privateKeyJwk = privateKeyFromJson(payload);
    let savedProfile = {};
    try {
      const resolved = await postJson("/api/resolve-profile", {
        privateKeyJwk,
        baseUrl: inputValue("baseUrl"),
      });
      savedProfile = resolved.profile || {};
    } catch {
      savedProfile = {};
    }
    await buildKitWithKey(privateKeyJwk, savedProfile);
    renderKit();
    showToast(savedProfile.mailbox ? t("reusedMailbox") : t("reused"));
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  elements.createButton.disabled = isBusy;
  elements.importKeyButton.disabled = isBusy;
}

function urlRows() {
  if (!state.kit) {
    return `<p>${t("emptyUrls")}</p>`;
  }

  const rows = [
    ["lobbyStep", "lobbyHelp", state.kit.lobbyProof.url],
    ["profileStep", "profileHelp", state.kit.profileNote.url],
    ["contributionStep", "contributionHelp", state.kit.contributionNote.url],
    ["mailboxStep", "mailboxHelp", state.kit.mailboxProof.url],
    ["privateStep", "privateHelp", state.kit.privateRoomProof.url],
  ];

  return rows.map(([title, help, url]) => `
    <article class="url-row">
      <div>
        <h3>${escapeHtml(t(title))}</h3>
        <p>${escapeHtml(t(help))}</p>
        <code>${escapeHtml(url)}</code>
      </div>
      <button type="button" data-copy="${escapeHtml(url)}">${t("copy")}</button>
      <a class="button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${t("open")}</a>
    </article>
  `).join("");
}

function renderKit() {
  const kit = state.kit;
  elements.didOut.textContent = kit ? kit.did : "-";
  elements.fingerprintOut.textContent = kit ? kit.fingerprint : "-";
  elements.mailboxOut.textContent = kit ? `/r/${kit.mailbox}` : "-";
  elements.urlList.classList.toggle("empty", !kit);
  elements.urlList.innerHTML = urlRows();

  if (kit) {
    const share = state.lang === "tr" ? kit.share.tr : kit.share.en;
    elements.shareBox.value = share;
    elements.tweetLink.href = state.lang === "tr" ? kit.share.xIntentTr : kit.share.xIntentEn;
    elements.tweetLink.classList.remove("disabled");
    elements.exportBox.value = state.exportTab === "json" ? kit.exportJson : kit.exportMarkdown;
  } else {
    elements.shareBox.value = "";
    elements.exportBox.value = "";
    elements.tweetLink.href = "#";
    elements.tweetLink.classList.add("disabled");
  }

  elements.downloadKeyButton.disabled = !state.key;
  elements.copyShareButton.disabled = !kit;
  elements.copyExportButton.disabled = !kit;
  elements.downloadExportButton.disabled = !kit;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  showToast(t("copied"));
}

function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

elements.createButton.addEventListener("click", createKit);
elements.importKeyButton.addEventListener("click", importSavedDid);
elements.downloadKeyButton.addEventListener("click", () => {
  if (!state.key || !state.kit) return;
  download(
    `technocore-private-key-${state.kit.fingerprint}.json`,
    JSON.stringify({
      warning: "Do not share this file. It can sign as your Technocore did:key.",
      did: state.kit.did,
      privateKeyJwk: state.key,
    }, null, 2),
  );
});

elements.copyShareButton.addEventListener("click", () => copyText(elements.shareBox.value));
elements.copyExportButton.addEventListener("click", () => copyText(elements.exportBox.value));
elements.downloadExportButton.addEventListener("click", () => {
  if (!state.kit) return;
  const ext = state.exportTab === "json" ? "json" : "md";
  const type = state.exportTab === "json" ? "application/json" : "text/markdown";
  download(`technocore-proof-${state.kit.fingerprint}.${ext}`, elements.exportBox.value, type);
});

document.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    copyText(copyButton.dataset.copy);
  }

  const langButton = event.target.closest("[data-lang]");
  if (langButton) {
    state.lang = langButton.dataset.lang;
    localStorage.setItem("lang", state.lang);
    applyLanguage();
  }

  const tab = event.target.closest("[data-export-tab]");
  if (tab) {
    state.exportTab = tab.dataset.exportTab;
    document.querySelectorAll("[data-export-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.exportTab === state.exportTab);
    });
    renderKit();
  }
});

applyLanguage();
