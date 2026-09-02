---
name: pretty-popups
description: Use whenever building or editing a popup, dialog, confirmation, or alert in this repo's web apps (e.g. gas-crm/Index.html, index.html). Never use the browser's native confirm()/alert()/prompt() — always build a styled modal that matches the app's own theme.
---

# Pretty popups only — no native browser dialogs

The user explicitly rejected the native browser `confirm()`/`alert()`/`prompt()` popups
(they render as an ugly unstyled browser chrome dialog, e.g. showing the raw
`...script.googleusercontent.com` host, ignore the site's fonts/colors, and can't
be restyled). **Never call `confirm()`, `alert()`, or `prompt()` in any web UI in
this repo.** Every dialog — confirmations, warnings, alerts, prompts for input —
must be a custom-built modal that matches the app's existing visual style
(same font, colors, rounded corners, spacing as the rest of the page).

## Standard pattern

Reuse the app's existing `.modal-overlay` / `.modal` CSS classes (see
`gas-crm/Index.html` for the reference implementation) and follow this shape:

1. A hidden `<div class="modal-overlay" id="...Overlay" hidden>` containing a
   `.modal` with a short icon/title, a message, and action buttons
   (Cancel = `.btn.outline`, destructive confirm = `.btn.danger`).
2. A JS helper that shows the overlay and returns a Promise resolving to the
   user's choice, so call sites read almost like the native API did:

```js
function confirmDialog(message, title) {
  var overlay = document.getElementById('confirmModalOverlay');
  document.getElementById('confirmModalTitle').textContent = title || 'ยืนยันการลบ';
  document.getElementById('confirmModalMessage').textContent = message;
  overlay.hidden = false;
  return new Promise(function (resolve) {
    var yesBtn = document.getElementById('confirmModalYes');
    var noBtn = document.getElementById('confirmModalNo');
    function cleanup(result) {
      overlay.hidden = true;
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
  });
}
```

Call sites become:

```js
confirmDialog('ต้องการลบรายการนี้ใช่หรือไม่?', 'ลบรายการ').then(function (ok) {
  if (!ok) return;
  // proceed with the destructive action
});
```

For a simple one-button acknowledgement (replacing `alert()`), reuse the same
overlay pattern but with a single "ตกลง" button, or add a lightweight
`alertDialog(message, title)` variant that resolves with no value.

## When adding a new popup type

- Match the existing color tokens (`var(--red)` for destructive actions,
  `var(--gm)`/`var(--gd)` for the theme accent) — never introduce new ad-hoc
  colors for a dialog.
- Keep the same rounded-corner `.modal` shell, spacing, and button styles as
  every other modal in the page, so dialogs feel like part of the app, not a
  browser interruption.
- Prefer a Promise-returning helper (as above) over scattering bespoke show/hide
  logic per dialog, so new confirmations stay a one-line call at the point of use.
