# The Dubai Guy — Chat Widget

A customer-facing chat bot for thedubaiguy.shop: answers sizing, shipping, returns,
and order questions from a knowledge base, and flags anything it can't confidently
handle for you to follow up on personally.

## Files

```
chat-widget.js      Embeddable widget (vanilla JS, no build step)
chat-widget.css      Widget styling — matches admin.thedubaiguy.shop palette
knowledge-base.json  The bot's answers — EDIT THIS with your real policies
api/chat.js          Serverless function that calls Claude
api/status.js         Online/offline flag the widget checks
demo.html             Standalone preview page
```

## 1. Fill in the knowledge base

Open `knowledge-base.json` and replace every `"REPLACE: ..."` value with your
actual policy. Leave the `ESCALATE_TO_HUMAN` and `LIVE_LOOKUP` markers as-is —
those tell the bot when to hand off instead of guessing.

## 2. Deploy the API functions

Drop `api/chat.js` and `api/status.js` into your existing Vercel project
(same place as your `/api/stripe-analytics.js`), and add `knowledge-base.json`
at the project root — `chat.js` reads it directly.

In Vercel → Project Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
| `OWNER_ONLINE` | `true` or `false` — toggle manually for now (see below) |
| `ORDER_LOOKUP_URL` | optional — an endpoint that returns order status by order number |

Before going live, check docs.claude.com for the current model id and update
the `MODEL` constant at the top of `api/chat.js` if needed.

## 3. Embed the widget

Add to any page on thedubaiguy.shop, right before `</body>`:

```html
<link rel="stylesheet" href="/chat-widget.css">
<script src="/chat-widget.js" defer></script>
```

Preview the look first by opening `demo.html` locally.

## 4. Availability toggle

Right now, "online/offline" is a manual environment variable
(`OWNER_ONLINE`) — flip it in Vercel and redeploy, or move it to a KV/DB
value you can toggle from `admin.thedubaiguy.shop` without a redeploy
(recommended once you're using this daily — Vercel KV is a natural fit
alongside your existing serverless setup).

When offline, the widget shows an "away" banner but keeps functioning —
the bot answers what it can from the knowledge base and marks anything
uncertain as escalated.

## 5. What still needs wiring up (next steps)

- **Order lookup** — `api/chat.js` calls `ORDER_LOOKUP_URL` if you set it.
  Point it at whatever already powers order status in your admin dashboard.
- **Escalation queue** — there's a `TODO` in `api/chat.js` where escalated
  conversations should be saved to a DB. Right now they're only flagged to
  the customer, not stored anywhere you'll see them. Worth prioritizing
  this before launch so complaints don't get missed.
- **Conversation history across sessions** — currently stored in the
  visitor's browser (`sessionStorage`), so it resets if they clear it or
  switch devices. Fine to start, but tie it to phone/email (like your Aura
  membership lookup) if you want persistent history later.
- **Notifications when you're online** — nothing currently pings you in
  real time when a customer messages while `OWNER_ONLINE=true`. Consider
  a webhook to WhatsApp/Slack/email from `api/chat.js`.
