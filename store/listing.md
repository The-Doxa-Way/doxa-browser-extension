# Chrome Web Store listing — DoxaBot

Everything the developer console asks for, in order. Copy-paste from here.
CEO sign-off required before submission (public Doxa surface; see the
`chrome-web-store-publish` action at insight.doxa.app/actions).

## Product details

**Name:** DoxaBot

**Summary** (132 chars max):

> Bible verses and Christ-centered encouragement on any webpage. Select text, right-click, receive Scripture that speaks to it.

**Category:** Lifestyle (pick the closest religion/well-being subcategory the console offers)

**Language:** English

## Description

> DoxaBot brings the encouragement of Scripture to wherever you already are on the web.
>
> Select any text on any page — a hard email, a discouraging headline, a message from a friend — right-click, and choose "Encourage me with this". DoxaBot responds with a short word of encouragement anchored in the Bible (Berean Standard Bible), written in the voice of Doxa: warm, scriptural, and free of hype.
>
> Select a Bible reference like "John 14:6" and choose "Look up in Doxa" to read the verse instantly, with a link to keep reading in Doxa's Bible reader.
>
> Or click the DoxaBot icon in your toolbar and describe what you are facing in your own words.
>
> Every response is tagged to one of the nine movements of The Doxa Way — hear, discern, test, record, remember, engage, trust, fight, endure — a simple map for holding on to what God has said and done.
>
> FREE TO USE
> DoxaBot includes a free tier so you can start right away. Power users can add their own Anthropic API key in Settings for unlimited use.
>
> PRIVACY FIRST
> DoxaBot talks to exactly one server: doxa.app. No analytics, no tracking, no ads, no data sold — ever. Only the text you select or type is sent, only when you ask. Full details: https://doxa.app/privacy
>
> DoxaBot is made by Doxa (https://doxa.app), the app for recording and remembering God's encouragement across your whole faith journey.

## Graphic assets

- Store icon 128x128: `src/icons/icon-128.png`
- Screenshots (1280x800, at least 1, up to 5): `store/screenshots/`
- Small promo tile (440x280): `store/promo/tile-440x280.png`
- Marquee (1400x560, optional): skip for v1

## Privacy tab answers

**Single purpose:** DoxaBot provides Bible verse lookup and Scripture-based encouragement for text the user selects or types.

**Permission justifications:**

- `contextMenus` — adds the two right-click actions ("Encourage me with this", "Look up in Doxa") that are the extension's core interface.
- `activeTab` — grants temporary access to the page the user right-clicked on, only on that user gesture, so the result toast can be shown there.
- `scripting` — injects the result toast into the active tab after a right-click action. Runs only on user gesture, only on the active tab.
- `storage` — stores the user's optional Anthropic API key and a random per-install identifier used for free-tier quota. Nothing else.
- Host permission `https://doxa.app/*` — the single API endpoint (doxa.app/mcp/v1) every request goes to.

**Remote code:** No. All code ships in the package; the only network traffic is JSON to doxa.app.

**Data usage disclosures:**

- Collects: "Website content" (the text the user selects, sent to doxa.app only when the user invokes an action) and "Authentication information" (the optional user-supplied Anthropic API key, stored locally, sent only to doxa.app as a request header).
- Not collected: browsing history, location, personal communications, financial info, health info, user activity.
- Certify: data is not sold, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:** https://doxa.app/privacy

## Distribution

- Visibility: Public
- Regions: All
- Pricing: Free

## Publish flow

1. `npm run build`, then `cd dist && zip -r ../doxabot-chrome.zip .`
2. Upload at https://chrome.google.com/webstore/devconsole (one-time USD 5 developer fee on first use)
3. Fill the tabs from this file, submit for review (typical 1–5 days)
