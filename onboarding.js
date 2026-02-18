const DEFAULTS = {
  onboardingDone: false,
  browserMode: "CHROME",
  enabled: true,
};

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const id = (s.browserMode || "CHROME").toLowerCase();
  const el = document.getElementById(id);
  if (el) el.checked = true;
}

async function save() {
  const mode =
    document.querySelector('input[name="mode"]:checked')?.value || "CHROME";
  await chrome.storage.sync.set({
    browserMode: mode,
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
document.querySelectorAll('input[name="mode"]').forEach((radio) =>
  radio.addEventListener("change", resetSaveRow)
);
load();
