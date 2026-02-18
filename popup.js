// Dia-like popup strip that controls real Chrome tabs & groups

const GROUP_COLOR_TO_HEX = {
  grey: "#9BA0A6",
  blue: "#7AA7FF",
  red: "#FF6B6B",
  yellow: "#F2A36B",
  green: "#66D6C8",
  pink: "#F58BB8",
  purple: "#8E77FF",
  cyan: "#66D6C8",
  orange: "#F2A36B",
};

const BEAUTY = ["#F2A36B", "#7AA7FF", "#8E77FF", "#66D6C8", "#F58BB8"];

function hashToIndex(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function pickBeauty(key) {
  return BEAUTY[hashToIndex(key) % BEAUTY.length];
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
  strip.innerHTML = `<div class="empty">${text}</div>`;
}

function setCount(n) {
  document.getElementById("groupsCount").textContent = String(n || 0);
}

async function render() {
  const strip = document.getElementById("strip");
  strip.innerHTML = "";

  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const groups = await chrome.tabGroups.query({
    windowId: chrome.windows.WINDOW_ID_CURRENT,
  });
  if (!groups.length) {
    setCount(0);
    setEmpty("No groups in this window (Chrome groups).");
    return;
  }

  groups.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  setCount(groups.length);

  for (const g of groups) {
    const tabs = await chrome.tabs.query({
      currentWindow: true,
      groupId: g.id,
    });
    tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const color =
      (g.color && GROUP_COLOR_TO_HEX[g.color]) ||
      pickBeauty(g.title || String(g.id));

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

// live refresh while popup is open
chrome.tabs.onCreated.addListener(render);
chrome.tabs.onRemoved.addListener(render);
chrome.tabs.onUpdated.addListener(render);
chrome.tabs.onMoved.addListener(render);
chrome.tabs.onActivated.addListener(render);
chrome.tabGroups?.onCreated?.addListener(render);
chrome.tabGroups?.onUpdated?.addListener(render);
chrome.tabGroups?.onRemoved?.addListener(render);

render().catch(() => setEmpty("Failed to load"));
