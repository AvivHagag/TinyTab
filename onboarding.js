import { THEMES } from "./themes.js";

const DEFAULTS = {
  onboardingDone: false,
  browserMode: "CHROME",
  colorTheme: "default",
  enabled: true,
};

function renderThemes() {
  const grid = document.getElementById("themesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  THEMES.forEach((theme) => {
    const opt = document.createElement("div");
    opt.className = "theme-option";

    const colorsHtml = theme.colors
      .map(
        (c) => `<div class="theme-color-dot" style="background: ${c}"></div>`,
      )
      .join("");

    opt.innerHTML = `
      <input type="radio" name="colorTheme" id="theme_${theme.id}" value="${theme.id}" />
      <label class="theme-label" for="theme_${theme.id}">
        <div class="theme-name">
          ${theme.name}
          <div class="theme-check"></div>
        </div>
        <div class="theme-colors">
          ${colorsHtml}
        </div>
      </label>
    `;
    grid.appendChild(opt);
  });

  document
    .querySelectorAll('input[name="colorTheme"]')
    .forEach((radio) => radio.addEventListener("change", resetSaveRow));
}

async function load() {
  renderThemes();
  const s = await chrome.storage.sync.get(DEFAULTS);
  const id = (s.browserMode || "CHROME").toLowerCase();
  const el = document.getElementById(id);
  if (el) el.checked = true;

  const themeEl = document.getElementById("theme_" + s.colorTheme);
  if (themeEl) themeEl.checked = true;
  else {
    const defTheme = document.getElementById("theme_default");
    if (defTheme) defTheme.checked = true;
  }
}

async function save() {
  const mode =
    document.querySelector('input[name="mode"]:checked')?.value || "CHROME";
  const theme =
    document.querySelector('input[name="colorTheme"]:checked')?.value ||
    "default";

  await chrome.storage.sync.set({
    browserMode: mode,
    colorTheme: theme,
    onboardingDone: true,
    enabled: true,
  });

  const btn = document.getElementById("save");
  const status = document.getElementById("status");

  btn.classList.add("hidden");
  status.textContent = "✓ Saved! You can close this tab.";
  status.classList.add("visible");
}

function resetSaveRow() {
  const btn = document.getElementById("save");
  const status = document.getElementById("status");

  btn.classList.remove("hidden");
  status.classList.remove("visible");
  setTimeout(() => (status.textContent = ""), 250);
}

document.getElementById("save").addEventListener("click", save);
document
  .querySelectorAll('input[name="mode"]')
  .forEach((radio) => radio.addEventListener("change", resetSaveRow));
load();
