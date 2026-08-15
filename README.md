# Doxa for Chrome (and Edge)

Encouragement from Scripture on any webpage.

Doxa for Chrome adds two right-click items to your browser:

- **Encourage me with this**: select any text, get a Doxa-voice encouragement back in a corner toast
- **Look up in Doxa**: select a Bible reference (e.g. `John 14:6`), get the verse plus a deep link into Doxa's Bible reader

Click the toolbar icon for a free-form prompt.

The extension talks straight to [doxa.app/mcp/v1](https://doxa.app/mcp). No analytics. No tracking. No backend server of its own.

## Tiers

- **Free trial**: a small server-enforced quota (currently counted per source IP). The popup shows your used/limit as the server reports it. 250-token responses.
- **Doxa subscription**: sign in with your Doxa account in Settings (any provider — the flow runs through doxa.app). An active subscription unlocks ongoing use under a daily fair-use cap, the same way Claude in Chrome gates on a Claude plan. Design: `specs/subscription-gate.md`.

## Build

```bash
npm install
npm run build
```

That writes everything you need into `dist/`. Load that folder as an unpacked extension.

`npm test` builds and runs the unit tests (node test runner, no extra deps).
`npm run typecheck` checks types without emitting.
`npm run dev` runs `tsc --watch` if you want incremental compile while you change files. Re-run `node scripts/copy-static.mjs` (or `npm run build`) after manifest or HTML changes.

## Load unpacked (development)

### Chrome and Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Toggle **Developer mode** on
3. Click **Load unpacked**
4. Pick the `dist/` folder

### Firefox

Not supported yet. Release Firefox runs MV3 backgrounds as event pages
(`background.scripts`), not service workers, so this manifest would install
but never register its context menus. A Firefox port needs a per-browser
manifest (plus the `browser_specific_settings.gecko` block) and a real
smoke test in Firefox before any AMO listing.

## Publish

### Chrome Web Store

1. Pay the one-time USD 5 developer fee at https://chrome.google.com/webstore/devconsole
2. Zip the contents of `dist/` (not the folder itself): `cd dist && zip -r ../doxa-for-chrome.zip .`
3. Upload the zip in the developer console
4. Fill out store listing (description, screenshots at 1280x800 or 640x400, promo tile 440x280, small tile 920x680)
5. Submit for review. Typical turnaround: 3 to 5 days

The current `host_permissions` is restricted to `https://doxa.app/*`. Combined with `activeTab`, this means the store reviewer should not flag a broad-host warning. The right-click handler uses `activeTab` to inject the result toast into the page the user clicked on, which is a temporary permission granted only on user gesture.

### Microsoft Edge Add-ons

1. Sign up at https://partner.microsoft.com/dashboard/microsoftedge. Free.
2. Upload the Chrome zip after swapping the manifest name to "Doxa for Edge" (browser-specific name; everything else is unchanged)
3. Typical review: 1 to 2 weeks

## File layout

```
manifest.json            (lives in static/, copied into dist/ by the build)
src/
  background.ts          service worker: context menus, MCP calls, toast injection
  popup.ts               toolbar-icon popup
  options.ts             settings page (Doxa account sign-in)
  lib/                   chrome-free pure logic (ref detection, caller id, error mapping)
  utils/doxa.ts          thin wrapper around @thedoxaway/mcp-client
  utils/auth.ts          Doxa session (connect-page sign-in, token refresh)
  icons/
    doxa-logo.svg        source SVG
    icon-16.png          generated
    icon-32.png          generated
    icon-48.png          generated
    icon-128.png         generated
static/
  manifest.json
  popup.html
  popup.css
  options.html
scripts/
  copy-static.mjs        post-tsc bundler: copies static + vendors mcp-client into dist/
dist/                    build output (gitignored)
```

## Regenerating icons

The icons come from `src/icons/doxa-logo.svg` (the Doxa mountains logo, dark background, white mountains). To regenerate at the four required sizes:

```bash
cd src/icons
for size in 16 32 48 128; do
  magick -background none -density 600 doxa-logo.svg -resize ${size}x${size} icon-${size}.png
done
```

Requires ImageMagick (`brew install imagemagick`).

## Privacy

The extension talks to two hosts, both ours to operate: `https://doxa.app/mcp/v1` (selected text and free-form prompts, sent only when you ask; your session token rides along when you are signed in) and Supabase auth (session refresh when signed in). Nothing is logged client-side. A random per-install caller id identifies the install, not you, and is only ever sent to `doxa.app`.
