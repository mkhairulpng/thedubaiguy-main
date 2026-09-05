// /api/chat.js
// Vercel serverless function. Deploy alongside your existing /api functions
// (same pattern as your Stripe analytics endpoint).
//
// Env var required: ANTHROPIC_API_KEY
// Optional: ORDER_LOOKUP_URL — an internal endpoint/function you already have
//           for reading order status, so the bot can answer "where's my order".

const knowledgeBase = require('../knowledge-base.json');

// Check docs.claude.com/en/docs/about-claude/models for the current model id
// before deploying — model names are updated periodically.
const MODEL = 'claude-sonnet-4-6';

function buildSystemPrompt() {
  const categories = knowledgeBase.categories
    .map((cat) => {
      const qas = cat.qa
        .map((item) => `- Q: ${item.q}\n  A: ${item.a}`)
        .join('\n');
      return `## ${cat.title}\n${qas}`;
    })
    .join('\n\n');

  return `You are the customer service assistant for The Dubai Guy (thedubaiguy.shop), a modest wear brand.

Tone: ${knowledgeBase.brand.tone}
Brand: ${knowledgeBase.brand.positioning}

Answer customer questions using the knowledge base below. If an answer is marked "REPLACE:", treat the text after it as the real policy (the store owner has filled it in) — never mention the word REPLACE to a customer.

If an answer is marked "ESCALATE_TO_HUMAN", follow its instruction, keep your reply short and reassuring, and set "escalate": true in your response.

If an answer is marked "LIVE_LOOKUP" and order data has been provided separately in this conversation, use that data. If no order data is available, tell the customer you're flagging it for a status check and set "escalate": true.

If a customer asks something not covered here, say you're not certain and that a team member will follow up — set "escalate": true rather than guessing.

KNOWLEDGE BASE:
${categories}

Respond ONLY with a JSON object, no other text, no markdown fences:
{"reply": "your reply to the customer", "escalate": true or false, "reason": "short internal note on why you escalated, or null"}`;
}

async function lookupOrder(orderNumber) {
  if (!orderNumber || !process.env.ORDER_LOOKUP_URL) return null;
  try {
    const res = await fetch(`${process.env.ORDER_LOOKUP_URL}?order=${encodeURIComponent(orderNumber)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], sessionId, orderNumber } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  let orderContext = '';
  if (orderNumber) {
    const order = await lookupOrder(orderNumber);
    orderContext = order
      ? `\n\nORDER DATA for ${orderNumber}: ${JSON.stringify(order)}`
      : `\n\nNo order data could be found for ${orderNumber}.`;
  }

  const messages = [
    ...history
      .filter((m) => m && m.role && m.content)
      .slice(-20) // cap context sent per call
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message + orderContext }
  ];

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: buildSystemPrompt(),
        messages
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({
        reply: "Sorry, I'm having trouble responding right now — please try again shortly.",
        escalate: true
      });
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    let parsed;
    try {
      const clean = (textBlock?.text || '').replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = { reply: textBlock?.text || "Sorry, could you rephrase that?", escalate: false };
    }

    // TODO: persist { sessionId, message, reply: parsed.reply, escalate: parsed.escalate,
    // reason: parsed.reason, timestamp } to your DB here so escalated chats show up
    // in admin.thedubaiguy.shop for review.

    return res.status(200).json({
      reply: parsed.reply,
      escalated: !!parsed.escalate
    });
  } catch (err) {
    console.error('Chat function error:', err);
    return res.status(500).json({
      reply: "Sorry, something went wrong on our end — please try again.",
      escalate: true
    });
  }
};
