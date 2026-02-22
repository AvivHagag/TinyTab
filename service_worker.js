import { MULTIPART_SUFFIXES } from "./public_suffixes.js";

const DEFAULTS = {
  enabled: true,
  onboardingDone: false,
  browserMode: "CHROME", // "DIA" | "CHROME"
  colorTheme: "default",
  excludedHosts: [],

  // Chrome-mode behavior (your choice "2"):
  autoArrange: true,
  autoGroup: true,
  groupMinTabs: 2,
  ungroupBeforeGrouping: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.sync.get(DEFAULTS);
  if (!s.onboardingDone) chrome.runtime.openOptionsPage();
  scheduleRecompute();
});

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
function hostOf(url) {
  const u = safeUrl(url);
  return u ? u.host : "";
}
function isRenamableUrl(url) {
  return !!url && !url.startsWith("chrome://") && !url.startsWith("edge://");
}

/* ------------------------
   Registrable domain
   ------------------------ */
function getGroupingKey(host) {
  if (!host) return "unknown";
  const reg = registrableDomain(host) || host;
  if (reg === "google.com") {
    return host.replace(/^www\./, "");
  }
  return reg;
}

function registrableDomain(host) {
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");

  if (MULTIPART_SUFFIXES.has(last2)) return last3;

  return last2;
}

function domainLabel(regDom) {
  if (!regDom) return "Site";
  const first = regDom.split(".")[0] || regDom;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTitle(title) {
  return (title || "")
    .replace(/^\(\d+\)\s*/, "") // strip leading notification counts like (119)
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingSitePart(title, domainLbl) {
  let t = title;
  t = t.replace(/\s+[·•]\s+[^·•]+$/g, "");
  t = t.replace(/\s+\|\s+[^|]+$/g, "");
  t = t.replace(/\s+[-–—]\s+[^-–—]+$/g, "");
  if (domainLbl) {
    const re = new RegExp(`\\s+${escapeRegExp(domainLbl)}\\s*$`, "i");
    t = t.replace(re, "");
  }
  return t.trim();
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "at",
  "from",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "home",
  "dashboard",
  "page",
  "tab",
  "new",
  "login",
  "sign",
  "signin",
  "signup",
  "settings",
  "account",
  "accounts",
  "watch",
  "video",
  "channel",
]);

function tokenizeWords(s) {
  const raw = (s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!raw) return [];

  return raw
    .split(" ")
    .filter(Boolean)
    .filter((w) => w.length >= 3)
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => !/^\d+$/.test(w));
}

function shortestUniqueOneWord(labels) {
  const lower = labels.map((x) => (x || "tab").toLowerCase());
  const unique = (arr) => new Set(arr).size === arr.length;

  if (unique(lower)) return lower;

  const pref = lower.map((w, i) => {
    const ww = w || "tab";
    for (let len = 1; len <= Math.min(ww.length, 12); len++) {
      const p = ww.slice(0, len);
      const ok = lower.every((other, j) => j === i || !other.startsWith(p));
      if (ok) return p;
    }
    return ww.slice(0, 12);
  });

  if (unique(pref)) return pref;

  const counts = new Map();
  return pref.map((w) => {
    const c = (counts.get(w) || 0) + 1;
    counts.set(w, c);
    return c === 1 ? w : `${w} (${c})`;
  });
}

/* ------------------------
   Smart extractors
   ------------------------ */
function isGmail(host) {
  return host === "mail.google.com" || host.endsWith(".mail.google.com");
}
function isGitHub(host) {
  return host === "github.com" || host.endsWith(".github.com");
}
function isYouTube(host) {
  return (
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com")
  );
}

function githubRepoFromUrl(url) {
  const u = safeUrl(url);
  if (!u) return "";
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) return parts[1] || "";
  return "";
}

function gmailLabelFromUrl(url) {
  const u = safeUrl(url);
  if (!u) return "";
  const h = (u.hash || "").replace(/^#/, "");
  if (!h) return "";
  const simple = h.split(/[?&]/)[0];

  if (simple.startsWith("label/")) {
    const lab = decodeURIComponent(simple.slice("label/".length));
    return lab.split("/")[0] || "label";
  }
  if (simple.startsWith("category/")) {
    return (
      decodeURIComponent(simple.slice("category/".length)).split("/")[0] ||
      "cat"
    );
  }
  if (simple.startsWith("search/")) return "search";
  return decodeURIComponent(simple.split("/")[0] || "");
}

/* Pick the most meaningful segment from a URL path.
   Skips random-looking IDs (long all-caps/hex strings). */
function meaningfulPathSegment(url) {
  const u = safeUrl(url);
  if (!u) return "";
  const segments = u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  // Walk from the end; prefer human-readable segments over IDs
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // Looks like a random ID → skip (e.g. "XvJJ_29RJpE", UUIDs, long hex)
    if (seg.length > 24 || /^[A-Z0-9_-]{6,}$/.test(seg)) continue;
    const word = seg.toLowerCase().replace(/[-_]/g, " ").trim().split(" ")[0];
    if (word && word.length >= 2) return word;
  }
  return "";
}

function youtubeWordFromUrlAndTitle(url, title) {
  const u = safeUrl(url);
  if (!u) return "";
  const p = u.pathname || "/";

  // Fixed path shortcuts (always reliable regardless of title language)
  if (p.startsWith("/watch")) return "watch";
  if (p.startsWith("/shorts")) return "shorts";
  if (p.startsWith("/results")) return "search";
  if (p.startsWith("/channel/")) return "channel";
  if (p.startsWith("/@")) return p.split("/")[1].replace("@", "") || "channel";

  // Try title-based extraction first
  const words = tokenizeWords(
    stripTrailingSitePart(normalizeTitle(title), "YouTube"),
  );
  if (words.length > 0) return words[0];

  // Fall back to URL path — works for any language (history, playlist, etc.)
  return meaningfulPathSegment(url) || "youtube";
}

const NON_LATIN_RE =
  /\p{Script=Hebrew}|\p{Script=Arabic}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Cyrillic}/u;

function isNonLatinTitle(title) {
  return NON_LATIN_RE.test(title);
}

function oneWordLabelForTab(tab, regDom, host) {
  const domLbl = domainLabel(regDom);
  const title = normalizeTitle(tab.title || "");

  if (isGmail(host)) {
    const lab = gmailLabelFromUrl(tab.url || "");
    const w = tokenizeWords(lab)[0] || (lab || "inbox").toLowerCase();
    return w;
  }

  if (isGitHub(host)) {
    const repo = githubRepoFromUrl(tab.url || "");
    if (repo) return repo.toLowerCase();
    const stripped = stripTrailingSitePart(title, "GitHub");
    return tokenizeWords(stripped)[0] || "github";
  }

  if (isYouTube(host)) {
    return youtubeWordFromUrlAndTitle(tab.url || "", title).toLowerCase();
  }

  const stripped = stripTrailingSitePart(title, domLbl);
  // Skip tokenization entirely for non-Latin scripts; URL segments are more reliable
  if (!isNonLatinTitle(stripped)) {
    const word = tokenizeWords(stripped)[0];
    if (word) return word;
  }
  return meaningfulPathSegment(tab.url || "") || domLbl.toLowerCase() || "tab";
}

/* ------------------------
   Apply titles
   ------------------------ */
async function applyTitle(tabId, title) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "APPLY_TITLE", title });
  } catch {}
}

async function restoreAll() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((t) => t.id != null)
      .map((t) =>
        chrome.tabs
          .sendMessage(t.id, { type: "RESTORE_TITLE" })
          .catch(() => {}),
      ),
  );
}

/* ------------------------
   Chrome mode: reorder + real groups
   ------------------------ */
function hashToIndex(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const CHROME_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

function pickChromeGroupColor(key) {
  return CHROME_GROUP_COLORS[hashToIndex(key) % CHROME_GROUP_COLORS.length];
}

let isMutatingTabs = false;
let pendingRecompute = false;

async function arrangeAndGroupChrome(windowId, settings) {
  if ((!settings.autoArrange && !settings.autoGroup) || isMutatingTabs) return;
  isMutatingTabs = true;

  try {
    const all = await chrome.tabs.query({ windowId });

    // keep pinned tabs untouched
    const pinned = all.filter((t) => t.pinned);
    const normal = all.filter(
      (t) => !t.pinned && t.id != null && isRenamableUrl(t.url || ""),
    );

    // Build desired domain → tabs map
    const items = normal.map((t) => {
      const host = hostOf(t.url || "");
      const key = getGroupingKey(host);
      return { tab: t, key };
    });

    const desiredByDom = new Map();
    for (const it of items) {
      if (!desiredByDom.has(it.key)) desiredByDom.set(it.key, []);
      desiredByDom.get(it.key).push(it.tab);
    }

    // Check if the current grouping already matches what we'd build.
    // If yes, just silently refresh titles/colors and bail out —
    // this avoids the ungroup→regroup cycle that makes Chrome animate
    // the group label on every YouTube title update.
    if (settings.autoGroup) {
      const existingGroups = await chrome.tabGroups.query({ windowId });
      const groupById = new Map(existingGroups.map((g) => [g.id, g]));

      let alreadyCorrect = true;

      for (const [reg, tabs] of desiredByDom.entries()) {
        const wantsGroup = tabs.length >= settings.groupMinTabs;

        if (!wantsGroup) {
          // These tabs should NOT be in a group
          if (tabs.some((t) => t.groupId !== -1)) {
            alreadyCorrect = false;
            break;
          }
          continue;
        }

        // All tabs should share the same group with the right label
        const firstGid = tabs[0].groupId;
        if (firstGid === -1 || !tabs.every((t) => t.groupId === firstGid)) {
          alreadyCorrect = false;
          break;
        }
        const grp = groupById.get(firstGid);
        if (!grp || grp.title !== domainLabel(reg)) {
          alreadyCorrect = false;
          break;
        }
      }

      if (alreadyCorrect) {
        // Groups are already right — just ensure color/title are up to date
        for (const [reg, tabs] of desiredByDom.entries()) {
          if (tabs.length < settings.groupMinTabs) continue;
          const gid = tabs[0].groupId;
          if (gid !== -1) {
            await chrome.tabGroups
              .update(gid, {
                title: domainLabel(reg),
                color: pickChromeGroupColor(reg),
              })
              .catch(() => {});
          }
        }
        return;
      }
    }

    // Groups need rebuilding — do the full arrange + regroup
    if (settings.autoGroup && settings.ungroupBeforeGrouping) {
      const idsToUngroup = normal
        .filter((t) => typeof t.groupId === "number" && t.groupId !== -1)
        .map((t) => t.id);

      if (idsToUngroup.length) {
        await chrome.tabs.ungroup(idsToUngroup);
      }
    }

    // Anchor each domain at the smallest current index among its tabs.
    // This keeps existing groups where they are — new tabs from the same
    // domain are pulled in next to the group instead of the whole group
    // jumping to an alphabetical position.
    const anchorIndex = new Map();
    for (const it of items) {
      const prev = anchorIndex.get(it.key) ?? Infinity;
      anchorIndex.set(it.key, Math.min(prev, it.tab.index ?? 0));
    }

    items.sort(
      (a, b) =>
        (anchorIndex.get(a.key) ?? 0) - (anchorIndex.get(b.key) ?? 0) ||
        (a.tab.index ?? 0) - (b.tab.index ?? 0),
    );

    // Move tabs to be contiguous by domain (single batched call)
    if (settings.autoArrange) {
      const orderedIds = items.map((it) => it.tab.id);
      if (orderedIds.length) {
        await chrome.tabs.move(orderedIds, { index: pinned.length });
      }
    }

    // Requery for correct order after moves
    const after = await chrome.tabs.query({ windowId });
    const afterNormal = after
      .filter((t) => !t.pinned && t.id != null && isRenamableUrl(t.url || ""))
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const byDom = new Map(); // regDom -> tabIds[]
    for (const t of afterNormal) {
      const host = hostOf(t.url || "");
      const key = getGroupingKey(host);
      if (!byDom.has(key)) byDom.set(key, []);
      byDom.get(key).push(t.id);
    }

    // Create groups for domains with N+ tabs
    if (settings.autoGroup) {
      for (const [reg, ids] of byDom.entries()) {
        if (ids.length < settings.groupMinTabs) continue;

        const groupId = await chrome.tabs.group({ tabIds: ids });
        await chrome.tabGroups.update(groupId, {
          title: domainLabel(reg),
          color: pickChromeGroupColor(reg),
        });
      }
    }
  } finally {
    // delay to absorb event storm
    setTimeout(() => {
      isMutatingTabs = false;
    }, 250);
  }
}

/* ------------------------
   Dia mode: group similar-domain tabs
   ------------------------ */
async function groupSimilarTabsDia(windowId, settings) {
  if (!settings.autoGroup || isMutatingTabs) return;
  isMutatingTabs = true;

  try {
    const all = await chrome.tabs.query({ windowId });
    const normal = all.filter(
      (t) => !t.pinned && t.id != null && isRenamableUrl(t.url || ""),
    );

    // Build domain → tabs map
    const byDomain = new Map();
    for (const t of normal) {
      const host = hostOf(t.url || "");
      const key = getGroupingKey(host);
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(t);
    }

    for (const [reg, tabs] of byDomain.entries()) {
      // Ungroup tabs that no longer meet the minimum threshold
      if (tabs.length < settings.groupMinTabs) {
        const toUngroup = tabs
          .filter((t) => t.groupId !== -1)
          .map((t) => t.id)
          .filter(Boolean);
        if (toUngroup.length) {
          await chrome.tabs.ungroup(toUngroup).catch(() => null);
        }
        continue;
      }

      // All already share the same group — nothing to do
      const firstGid = tabs[0].groupId;
      if (firstGid !== -1 && tabs.every((t) => t.groupId === firstGid))
        continue;

      // Group all domain tabs together (reuse an existing group if possible)
      const tabIds = tabs.map((t) => t.id).filter(Boolean);
      const existingGid = tabs.find((t) => t.groupId !== -1)?.groupId;

      await chrome.tabs
        .group(
          existingGid != null ? { tabIds, groupId: existingGid } : { tabIds },
        )
        .catch(() => null);
    }
  } finally {
    setTimeout(() => {
      isMutatingTabs = false;
    }, 250);
  }
}

/* ------------------------
   Rename logic: Dia vs Chrome
   ------------------------ */
function scopeKeyForTab(settings, tab) {
  // Dia mode: uniqueness inside each group (domain-grouped or Dia-native)
  if (settings.browserMode === "DIA") {
    const gid = tab.groupId;
    return typeof gid === "number" && gid !== -1 ? `g:${gid}` : "g:ungrouped";
  }
  // Chrome mode: whole window as one scope (because we group by domain anyway)
  return "w:current";
}

async function recomputeAll() {
  if (isMutatingTabs) {
    pendingRecompute = true;
    return;
  }
  pendingRecompute = false;
  const settings = await getSettings();
  if (!settings.enabled) return;

  const currentTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const windowId = currentTabs[0]?.windowId;

  // Chrome mode: reorder + group first
  if (settings.browserMode === "CHROME" && windowId != null) {
    await arrangeAndGroupChrome(windowId, settings);
  }

  // Dia mode: group tabs that share the same domain (without reordering)
  if (settings.browserMode === "DIA" && windowId != null) {
    await groupSimilarTabsDia(windowId, settings);
  }

  // Then rename
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });

  const scopes = new Map(); // scopeKey -> tabs[]
  for (const t of tabs) {
    if (t.pinned) continue;
    if (t.id == null || !isRenamableUrl(t.url || "")) continue;

    const host = hostOf(t.url || "");
    if (!host) continue;
    const key = getGroupingKey(host);
    if (
      settings.excludedHosts.some(
        (e) => getGroupingKey(hostOf(`https://${e}`)) === key || e === host,
      )
    )
      continue;

    const sk = scopeKeyForTab(settings, t);
    if (!scopes.has(sk)) scopes.set(sk, []);
    scopes.get(sk).push(t);
  }

  const titleOps = [];

  for (const [, scopeTabs] of scopes.entries()) {
    const byDomain = new Map();
    for (const t of scopeTabs) {
      const host = hostOf(t.url || "");
      const key = getGroupingKey(host);
      if (!key) continue;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(t);
    }

    for (const [key, domTabs] of byDomain.entries()) {
      const sorted = [...domTabs].sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0),
      );

      if (sorted.length === 1) {
        titleOps.push({ tabId: sorted[0].id, title: domainLabel(key) });
        continue;
      }

      const regDom = registrableDomain(hostOf(sorted[0].url || "")) || key;
      const base = sorted.map((t) =>
        oneWordLabelForTab(t, regDom, hostOf(t.url || "")),
      );
      const uniq = shortestUniqueOneWord(base);

      for (let i = 0; i < sorted.length; i++) {
        const w = uniq[i] || "tab";
        const pretty = w.charAt(0).toUpperCase() + w.slice(1);
        titleOps.push({ tabId: sorted[i].id, title: pretty });
      }
    }
  }

  await Promise.allSettled(
    titleOps.map(({ tabId, title }) => applyTitle(tabId, title)),
  );

  if (pendingRecompute) {
    pendingRecompute = false;
    scheduleRecompute();
  }
}

/* ------------------------
   Scheduling + events
   ------------------------ */
let timer = null;
function scheduleRecompute() {
  clearTimeout(timer);
  timer = setTimeout(recomputeAll, 400);
}

chrome.tabs.onCreated.addListener(scheduleRecompute);
chrome.tabs.onRemoved.addListener(scheduleRecompute);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.title != null || changeInfo.status === "complete")
    scheduleRecompute();
});
chrome.tabs.onMoved.addListener(scheduleRecompute);
chrome.tabs.onActivated.addListener(scheduleRecompute);

chrome.tabGroups?.onCreated?.addListener(scheduleRecompute);
chrome.tabGroups?.onUpdated?.addListener(scheduleRecompute);
chrome.tabGroups?.onRemoved?.addListener(scheduleRecompute);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PAGE_TITLE_CHANGED") scheduleRecompute();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled) {
    const enabled = changes.enabled.newValue;
    if (!enabled) await restoreAll();
    else scheduleRecompute();
  } else {
    scheduleRecompute();
  }
});

scheduleRecompute();
