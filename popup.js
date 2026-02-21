import { THEMES } from "./themes.js";

// Dia-like popup strip that controls real Chrome tabs & groups

function hashToIndex(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

let activeThemeColors = THEMES[0].colors;

function pickThemeColor(key) {
  return activeThemeColors[hashToIndex(key) % activeThemeColors.length];
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function faviconUrl(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl || "");
  u.searchParams.set("size", String(size));
  return u.toString();
}

async function focusTab(tab) {
  if (!tab?.id) return;
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  } catch {}
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {}
}

async function closeGroup(groupId) {
  const tabs = await chrome.tabs.query({ currentWindow: true, groupId });
  const ids = tabs.map((t) => t.id).filter(Boolean);
  if (ids.length) await chrome.tabs.remove(ids);
}

async function toggleCollapse(group) {
  try {
    await chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
  } catch {}
}

function setEmpty(text) {
  const strip = document.getElementById("strip");
  strip.innerHTML = "";
  const div = el("div", "empty");
  div.textContent = text;
  strip.appendChild(div);
}

function setCount(n) {
  document.getElementById("groupsCount").textContent = String(n || 0);
}

let renderGeneration = 0;

async function render() {
  const gen = ++renderGeneration;
  const strip = document.getElementById("strip");
  strip.innerHTML = "";

  const [allTabs, groups, settings] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    chrome.storage.sync.get({ colorTheme: "default" }),
  ]);
  if (gen !== renderGeneration) return;

  const themeObj =
    THEMES.find((t) => t.id === settings.colorTheme) || THEMES[0];
  activeThemeColors = themeObj.colors;

  const active = allTabs.find((t) => t.active);

  if (!groups.length) {
    setCount(0);
    setEmpty("No groups in this window (Chrome groups).");
    return;
  }

  groups.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  setCount(groups.length);

  for (const g of groups) {
    const tabs = allTabs
      .filter((t) => t.groupId === g.id)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const color = pickThemeColor(g.title || String(g.id));

    const pill = el("div", "groupPill");
    pill.style.setProperty("--c", color);

    // Group label
    const label = el("div", "gLabel");
    const dot = el("div", "gDot");
    const txt = el("div", "gText");
    txt.textContent = g.title || "Group";
    label.append(dot, txt);

    // Tabs container
    const tabsWrap = el("div", "tabs");

    const MAX = 4; // like your Dia screenshot (show few)
    const show = tabs.slice(0, MAX);
    const overflow = tabs.length - show.length;

    for (const t of show) {
      const seg = el("div", "tabSeg");
      if (active?.id && t.id === active.id) seg.classList.add("active");
      seg.title = t.title || "";

      const img = document.createElement("img");
      img.className = "fav";
      img.src = t.favIconUrl || faviconUrl(t.url || "", 32);
      img.alt = "";

      const title = el("div", "tTitle");
      title.textContent = (t.title || "Tab").trim();

      const x = el("button", "tX");
      x.type = "button";
      x.textContent = "×";
      x.title = "Close tab";
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        await closeTab(t.id);
        await render();
      });

      seg.append(img, title, x);
      seg.addEventListener("click", () => focusTab(t));
      tabsWrap.appendChild(seg);
    }

    if (overflow > 0) {
      const more = el("div", "more");
      more.textContent = `+${overflow}`;
      tabsWrap.appendChild(more);
    }

    // Actions (right side)
    const actions = el("div", "gActions");

    const collapse = el("button", "gBtn");
    collapse.type = "button";
    collapse.title = g.collapsed ? "Expand group" : "Collapse group";
    collapse.textContent = g.collapsed ? "▸" : "▾";
    collapse.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleCollapse(g);
      await render();
    });

    const close = el("button", "gBtn danger");
    close.type = "button";
    close.title = "Close all tabs in group";
    close.textContent = "×";
    close.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = confirm(`Close all tabs in "${g.title || "Group"}"?`);
      if (!ok) return;
      await closeGroup(g.id);
      await render();
    });

    actions.append(collapse, close);

    pill.append(label, tabsWrap, actions);
    strip.appendChild(pill);
  }
}

document.getElementById("refresh").addEventListener("click", async (e) => {
  e.preventDefault();
  await render();
});

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(
    () => render().catch(() => setEmpty("Failed to load")),
    200,
  );
}

// live refresh while popup is open
chrome.tabs.onCreated.addListener(scheduleRender);
chrome.tabs.onRemoved.addListener(scheduleRender);
chrome.tabs.onUpdated.addListener(scheduleRender);
chrome.tabs.onMoved.addListener(scheduleRender);
chrome.tabs.onActivated.addListener(scheduleRender);
chrome.tabGroups?.onCreated?.addListener(scheduleRender);
chrome.tabGroups?.onUpdated?.addListener(scheduleRender);
chrome.tabGroups?.onRemoved?.addListener(scheduleRender);

render().catch(() => setEmpty("Failed to load"));
