# Read Aloud

A tiny mobile-friendly web app that reads text aloud using your phone's built-in text-to-speech. No accounts, no servers, no API keys.

## Use it on your phone

1. In GitHub, go to **Settings → Pages**.
2. Set **Source** to `Deploy from a branch`, **Branch** to `main` (or whichever branch this is on), folder `/ (root)`. Save.
3. Wait ~1 minute, then open the URL GitHub shows you (looks like `https://<username>.github.io/EDP-Master-System/`).
4. Add it to your phone's home screen for one-tap access.

## Features

- Paste or type any text, tap **Play** to hear it
- **Paste & Play** reads your clipboard in one tap
- **Auto-read on paste** speaks immediately when you paste
- **Share Target (Android)**: long-press any text → Share → *Read Aloud* → it speaks instantly. No copy/paste step.
- **iOS Shortcut workaround**: create a Shortcut that opens `https://<your-pages-url>/?text=<Selected Text>` — same one-tap experience from the iOS share sheet.
- Voice picker, speed and pitch sliders
- Installable as a PWA, works offline

## Share-to-speak setup

After you install the page (Add to Home Screen):

- **Android (Chrome / Edge)**: it automatically appears in the system share sheet. Long-press a message in any app → **Share** → **Read Aloud** → it speaks.
- **iOS (Safari)**: iOS doesn't support web share targets, so use a Shortcut:
  1. Shortcuts app → `+` → name it "Read Aloud"
  2. Add action **Get Text from Input** (set "Receive: Text from Share Sheet")
  3. Add action **URL** with `https://<your-github-pages-url>/?text=`
  4. Add action **Combine Text** to append the input to the URL (URL-encoded)
  5. Add action **Open URLs**
  6. In the Shortcut details, enable **Show in Share Sheet**, accept Text
  7. Now from any app: select text → Share → Read Aloud → speaks.

## Files

- `index.html` — the app (HTML + CSS + JS)
- `manifest.webmanifest` — PWA manifest with `share_target` declaration
- `sw.js` — service worker for offline + installability
- `icon-192.png`, `icon-512.png` — app icons
