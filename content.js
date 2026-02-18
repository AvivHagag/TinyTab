(() => {
  const KEY = "__tabrenamer_original_title__";
  let _lastApplied = null;

  function ensureOriginal() {
    if (window[KEY] == null) window[KEY] = document.title || "";
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "APPLY_TITLE") {
      ensureOriginal();
      _lastApplied = String(msg.title ?? "");
      document.title = _lastApplied;
    }
    if (msg?.type === "RESTORE_TITLE") {
      if (window[KEY] != null) {
        _lastApplied = null;
        document.title = window[KEY];
      }
    }
  });

  const titleEl = document.querySelector("title");
  if (titleEl) {
    const obs = new MutationObserver(() => {
      // Ignore changes the extension itself made to avoid a feedback loop
      if (document.title === _lastApplied) return;
      _lastApplied = null;
      chrome.runtime.sendMessage({ type: "PAGE_TITLE_CHANGED" });
    });
    obs.observe(titleEl, { childList: true });
  }
})();
