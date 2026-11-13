import { TonConnectUI } from "https://esm.sh/@tonconnect/ui@2.3.0";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const intro = document.getElementById("intro");
const introText = document.getElementById("introText");
const app = document.getElementById("app");
const phrase = "Welcome to Test World";
const API = "https://testworld-8y9w.onrender.com/api";
const initData = tg?.initData || "";
let currentBalance = 0;
let tonConnectUI;

function sleep(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
function money(value) { return Number(value || 0).toFixed(2); }
function authHeaders(extra = {}) {
  return { ...extra, Authorization: `tma ${initData}` };
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: authHeaders({ "Content-Type": "application/json", ...(options.headers || {}) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderBalance(value) {
  currentBalance = Number(value || 0);
  const formatted = money(currentBalance);
  document.getElementById("balanceAmount").textContent = formatted;
  document.getElementById("profileBalance").textContent = formatted;
}

async function loadAccount() {
  if (!initData) {
    console.warn("Test World must be opened from its Telegram Mini App to authenticate.");
    return;
  }
  try {
    const data = await api("/me");
    renderBalance(data.user.balance);
    const user = data.user;
    const username = user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(" ") || "Telegram User";
    document.getElementById("profileUsername").textContent = username;
    document.getElementById("profileTelegramId").textContent = String(user.telegram_id);
    document.getElementById("profileAvatar").textContent = (user.first_name || user.username || "U").trim().charAt(0).toUpperCase();
  } catch (error) {
    console.error("Account load failed:", error);
    showNotice(error.message);
  }
}

function showNotice(message) {
  let notice = document.getElementById("appNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "appNotice";
    notice.className = "app-notice";
    document.querySelector(".main-content").prepend(notice);
  }
  notice.textContent = message;
  notice.hidden = false;
}

function setupBalance() {
  const claimButton = document.getElementById("claimButton");
  const balanceCard = document.querySelector(".balance-card");
  let busy = false;
  claimButton.addEventListener("click", async () => {
    if (busy) return;
    if (!initData) {
      showNotice("Open Test World inside Telegram to update your balance.");
      return;
    }
    busy = true;
    claimButton.disabled = true;
    try {
      const data = await api("/claim", { method: "POST", body: "{}" });
      renderBalance(data.user.balance);
      claimButton.classList.remove("is-claimed");
      balanceCard.classList.remove("bump");
      void claimButton.offsetWidth;
      claimButton.classList.add("is-claimed");
      balanceCard.classList.add("bump");
    } catch (error) {
      showNotice(error.message);
    } finally {
      busy = false;
      claimButton.disabled = false;
    }
  });
}

function setupNavigation() {
  const buttons = document.querySelectorAll(".nav-item");
  const pages = { home: document.getElementById("homePage"), profile: document.getElementById("profilePage") };
  buttons.forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.page;
    if (!pages[target]) return;
    buttons.forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      if (selected) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    });
    Object.entries(pages).forEach(([name, page]) => page.classList.toggle("active", name === target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault();
    document.querySelector('.nav-item[data-page="home"]').click();
  });
}

async function saveWalletAddress(address) {
  if (!initData) return;
  try { await api("/wallet", { method: "PUT", body: JSON.stringify({ address }) }); }
  catch (error) { console.error("Wallet address sync failed:", error); showNotice(error.message); }
}

async function setupTonConnect() {
  const manifestUrl = new URL("./tonconnect-manifest.json", window.location.href).href;
  tonConnectUI = new TonConnectUI({
    manifestUrl,
    buttonRootId: "ton-connect",
    uiPreferences: {
      theme: "DARK",
      borderRadius: "s",
      colorsSet: { dark: {
        connectButton: { background: "#d9f8ff", foreground: "#061014" },
        accent: "#9deafa",
        telegramButton: "#d9f8ff",
        background: { primary: "#090a0c", secondary: "#111318" },
        text: { primary: "#f5f6f8", secondary: "#9298a2" }
      } }
    }
  });
  tonConnectUI.onStatusChange(wallet => {
    const address = wallet?.account?.address || null;
    if (address) saveWalletAddress(address);
    else if (initData) saveWalletAddress(null);
  });
}

async function playIntro() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    introText.textContent = phrase;
    await sleep(900);
  } else {
    for (const character of phrase) {
      introText.textContent += character;
      await sleep(character === " " ? 95 : 72);
    }
    await sleep(850);
  }
  intro.classList.add("is-leaving");
  app.classList.add("is-visible");
  app.setAttribute("aria-hidden", "false");
  await sleep(900);
  intro.remove();
}

setupNavigation();
setupBalance();
loadAccount();
setupTonConnect().catch(error => {
  console.error("TON Connect initialization failed:", error);
  document.getElementById("ton-connect").innerHTML = '<span class="wallet-load-error">Wallet unavailable</span>';
});
playIntro();
