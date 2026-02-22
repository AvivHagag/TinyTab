<p align="center">
  <img width="962" height="1181" alt="TinyTab screenshot" src="https://github.com/user-attachments/assets/4bed5d61-8c9a-465e-be7f-7fa513720f6f" />
</p>

# TinyTab — Domain Tab Renamer + Auto Groups (Chrome)

TinyTab is a lightweight Chrome extension that automatically:

- Shortens tab titles to the minimum useful form
- Keeps tabs from the same domain easy to distinguish with one-word labels
- In Chrome mode: reorders tabs by domain and creates real Chrome Tab Groups with colors

No LLM, no cloud calls, no accounts.

---

## Features

### Title rules (always enabled when the extension is ON)

- **If there is only 1 tab for a domain** → rename the tab to the **domain label** (e.g., `Google`, `Github`).
- **If there are 2+ tabs for the same domain** → rename each tab to a **unique one-word label** derived from the tab title/URL.

### Smart naming (examples)

- **Gmail**
  - One Gmail tab → `Google`
  - Multiple Gmail tabs → `Inbox`, `Sent`, `Drafts`, `Search`, `LabelX`, etc.
- **GitHub**
  - One GitHub tab → `Github`
  - Multiple GitHub tabs → repo names like `frontend`, `backend`, etc.
- **YouTube**
  - `Watch`, `Shorts`, `Search`, `Channel`, etc.

### Browser modes

#### Dia mode (rename only)

- Uses your **existing tab groups**.
- Does **not** reorder tabs.
- Does **not** create groups.
- Uniqueness is scoped **inside each existing group**.

#### Chrome mode (reorder + real Chrome groups)

- Reorders tabs so same-domain tabs are **side-by-side**.
- Creates **real Chrome Tab Groups** (only for domains with 2+ tabs).
- Group title = domain label (e.g., `Google`).
- Group color = deterministic per domain.

---

## Installation (Developer Mode)

1. Download / clone this repo.
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the extension folder.

On first install, TinyTab opens a setup page where you choose **Dia** or **Chrome** mode.

---

## Settings

Open the extension popup:

- **Enabled** — turn the extension on/off
- **Auto arrange (Chrome)** — reorder tabs by domain
- **Auto group (Chrome)** — create Chrome Tab Groups by domain
- **Ungroup before regroup (Chrome)** — if enabled, the extension clears existing groups (non-pinned tabs) before rebuilding domain groups

---

## Permissions (Why they are needed)

- `tabs`  
  Needed to read tab titles/URLs and reorder/group tabs.

- `tabGroups`  
  Needed in **Chrome mode** to create and update real Chrome tab groups.

- `storage`  
  Stores your selected mode and settings.

- `host_permissions: <all_urls>`  
  Needed so the content script can apply the renamed title on pages you visit.
  (Restricted pages like `chrome://` cannot be modified.)

---

## Privacy

TinyTab runs fully locally.

- No analytics
- No tracking
- No data sent anywhere
- No external network requests required

---

## Known limitations

- Tabs like `chrome://` and some internal pages cannot be renamed (Chrome restriction).
- Some websites constantly update their title; TinyTab will re-apply the short label automatically.

---

## Development notes

Main files:

- `service_worker.js` — grouping/reordering logic + naming rules
- `content.js` — applies the computed title via `document.title`
- `public_suffixes.js` — multi-part TLD list for better domain grouping

---

## License

MIT (recommended). Replace this section with your preferred license.
