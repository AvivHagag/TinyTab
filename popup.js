const DEFAULTS = {
  enabled: true,
  autoArrange: true,
  autoGroup: true,
  ungroupBeforeGrouping: true,
};

// Chrome group color → CSS colour
const GROUP_COLOR_CSS = {
  grey: "#9aa0a6",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#1e8e3e",
  pink: "#e52592",
  purple: "#8430ce",
  cyan: "#129eaf",
  orange: "#e8711a",
};

/* ── Settings ── */
async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("enabled").checked = !!s.enabled;
  document.getElementById("autoArrange").checked = !!s.autoArrange;
  document.getElementById("autoGroup").checked = !!s.autoGroup;
  document.getElementById("ungroupBeforeGrouping").checked =
    !!s.ungroupBeforeGrouping;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: document.getElementById("enabled").checked,
    autoArrange: document.getElementById("autoArrange").checked,
    autoGroup: document.getElementById("autoGroup").checked,
    ungroupBeforeGrouping: document.getElementById("ungroupBeforeGrouping")
      .checked,
  });
}

document.getElementById("enabled").addEventListener("change", saveSettings);
document.getElementById("autoArrange").addEventListener("change", saveSettings);
document.getElementById("autoGroup").addEventListener("change", saveSettings);
document
  .getElementById("ungroupBeforeGrouping")
  .addEventListener("change", saveSettings);

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

/* ── Groups ── */
const MAX_PILLS = 4; // max tabs shown as pills before "+N more"

async function loadGroups() {
  const list = document.getElementById("groupList");
  const countEl = document.getElementById("groupsCount");

  const [groups, allTabs] = await Promise.all([
    chrome.tabGroups.query({}),
    chrome.tabs.query({}),
  ]);

  // map groupId -> tabs[]
  const tabsByGroup = new Map();
  for (const t of allTabs) {
    if (typeof t.groupId === "number" && t.groupId !== -1) {
      if (!tabsByGroup.has(t.groupId)) tabsByGroup.set(t.groupId, []);
      tabsByGroup.get(t.groupId).push(t);
    }
  }

  list.innerHTML = "";

  if (groups.length === 0) {
    list.innerHTML = '<div class="no-groups">No active groups</div>';
    countEl.textContent = "";
    return;
  }

  countEl.textContent = groups.length;

  for (const group of groups) {
    const tabs = tabsByGroup.get(group.id) || [];
    list.appendChild(buildGroupCard(group, tabs));
  }
}

function buildGroupCard(group, tabs) {
  const css = GROUP_COLOR_CSS[group.color] || "#9aa0a6";

  const card = document.createElement("div");
  card.className = "group-card";
  card.style.setProperty("--gc", css);

  // Group name — static text, no scroll animation
  const nameEl = document.createElement("span");
  nameEl.className = "group-name";
  nameEl.textContent = group.title || "Group";
  nameEl.title = group.title || "Group";

  // Tab pills
  const tabsWrap = document.createElement("div");
  tabsWrap.className = "group-tabs";

  const visible = tabs.slice(0, MAX_PILLS);
  const overflow = tabs.length - visible.length;

  for (const tab of visible) {
    tabsWrap.appendChild(buildTabPill(tab));
  }

  if (overflow > 0) {
    const more = document.createElement("span");
    more.className = "tab-overflow";
    more.textContent = "+" + overflow;
    tabsWrap.appendChild(more);
  }

  // Ungroup button
  const closeBtn = document.createElement("button");
  closeBtn.className = "group-close";
  closeBtn.title = "Ungroup";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ids = tabs.map((t) => t.id).filter((id) => id != null);
    if (ids.length) await chrome.tabs.ungroup(ids);
    loadGroups();
  });

  card.appendChild(nameEl);
  card.appendChild(tabsWrap);
  card.appendChild(closeBtn);
  return card;
}

function buildTabPill(tab) {
  const pill = document.createElement("div");
  pill.className = "tab-pill";
  pill.title = tab.title || tab.url || "";

  const img = document.createElement("img");
  img.width = 13;
  img.height = 13;
  img.src = tab.favIconUrl || "";
  img.onerror = () => {
    img.style.display = "none";
  };

  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = tab.title || tab.url || "Tab";

  pill.appendChild(img);
  pill.appendChild(label);

  pill.addEventListener("click", () => {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });

  return pill;
}

/* ── Init ── */
loadSettings();
loadGroups();
