# Chrome Web Store listing — Doxa for Chrome

> **READY (2026-08-15).** The sign-in + subscription gate is merged and deployed end to
> end (mcp-server subscriber tier live; doxa.app/app/extension/connect live; extension
> main has the gate and the pinned id). Developer account verified as "The Doxa Way";
> CEO go-ahead given 2026-08-15.
>
> **Store item id: `jcknciaelbpfchpmmmijclpkipgcdcni`** (assigned by the store, not
> chosen by us). The manifest `key` is a copy of the store item's public key so
> unpacked dev builds share that id, and `doxa.app/app/extension/connect` pins it.
> All three must move together, or store sign-in breaks with no dev symptom.

Everything the developer console asks for, in order. Copy-paste from here.
CEO sign-off required before submission (public Doxa surface; see the
`chrome-web-store-publish-doxabot` action at insight.doxa.app/actions).

## Product details

**Name:** Doxa for Chrome

**Summary** (132 chars max):

> Encouragement from Scripture on any webpage. Select text, right-click, and know the God who speaks.

**Category:** Lifestyle (pick the closest religion/well-being subcategory the console offers)

**Language:** English

## Description

Aligned to the knowing-God re-tier (doxa-shared PR #26, merged 2026-08-15):
the promise leads, record-and-remember is the practice that serves it. Opens
with the canonical elevator pitch verbatim and closes on the master line. No
em dashes, no antithesis framing (voice-of-doxa Hard Rules 1 and 2).

> Know the God who speaks. Remembering on purpose what God has said and done, so you can know Him more deeply for your whole journey.
>
> Doxa for Chrome brings Scripture and God's encouragement to wherever you already are on the web. The Doxa app is where you record and remember what God has said and done. This extension is Doxa meeting you in the middle of your day.
>
> HOW IT WORKS
>
> Select any text on any page: a hard email, a discouraging headline, a message from a friend. Right-click and choose "Encourage me with this". Doxa responds with a short word of encouragement anchored in Scripture, written in the voice of Doxa: warm, biblical, and free of hype.
>
> Select a Bible reference like "John 14:6" and choose "Look up in Doxa" to read the verse instantly (Berean Standard Bible), with a link to keep reading in Doxa's Bible reader.
>
> Or click the Doxa icon in your toolbar and describe what you are facing in your own words.
>
> Every response is tagged to one of nine movements of the journey: hear, discern, test, record, remember, engage, trust, fight, endure. A simple map for holding on to what God has said and done.
>
> TRY IT FREE
>
> Your first encouragements are free, no account needed. To keep going, sign in with your Doxa account and an active Doxa subscription. Start yours at https://doxa.app
>
> PRIVACY FIRST
>
> The extension talks to exactly one server: doxa.app. No analytics, no tracking, no ads, no data sold. Only the text you select or type is sent, and only when you ask. Full details: https://doxa.app/privacy
>
> Doxa for Chrome is made by Doxa (https://doxa.app). Know the God who speaks.

## Graphic assets

- Store icon 128x128: `src/icons/icon-128.png`
- Screenshots (1280x800, at least 1, up to 5): `store/screenshots/`
- Small promo tile (440x280): `store/promo/tile-440x280.png`
- Marquee (1400x560, optional): skip for v1

## Privacy tab answers

**Single purpose:** Doxa for Chrome provides Bible verse lookup and Scripture-based encouragement for text the user selects or types.

**Permission justifications:**

- `contextMenus` — adds the two right-click actions ("Encourage me with this", "Look up in Doxa") that are the extension's core interface.
- `activeTab` — grants temporary access to the page the user right-clicked on, only on that user gesture, so the result toast can be shown there.
- `scripting` — injects the result toast into the active tab after a right-click action. Runs only on user gesture, only on the active tab.
- `storage` — stores the user's Doxa sign-in session and a random per-install identifier used for trial quota. Nothing else.
- `identity` — powers the Sign in with Doxa flow (chrome.identity.launchWebAuthFlow to doxa.app). No Google account data is read.
- Host permission `https://doxa.app/*` — the single API endpoint (doxa.app/mcp/v1) every request goes to.

**Remote code:** No. All code ships in the package; the only network traffic is JSON to doxa.app.

**Data usage disclosures:**

- Collects: "Website content" (the text the user selects, sent to doxa.app only when the user invokes an action), "Personal communications" (a selection the user chooses to send may itself be an email or message excerpt — same user-initiated path, nothing is read passively), and "Authentication information" (the user's Doxa account session after they sign in, stored locally, sent only to doxa.app).
- Not collected: browsing history, location, financial info, health info, user activity.
- Certify: data is not sold, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:** https://doxa.app/privacy

## Distribution

- Visibility: Public
- Regions: All
- Pricing: Free

## Publish flow

1. `npm run build`, then `cd dist && zip -r ../doxa-for-chrome.zip .`
2. Upload at https://chrome.google.com/webstore/devconsole (one-time USD 5 developer fee on first use)
3. Fill the tabs from this file, submit for review (typical 1–5 days)
