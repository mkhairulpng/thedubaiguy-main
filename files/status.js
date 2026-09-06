// /api/status.js
// Returns whether Khail is currently "online". For now this reads an env
// var / simple flag — swap in a DB read once you wire this into the
// admin.thedubaiguy.shop dashboard (e.g. a toggle that writes to the same
// store your promo codes / products live in).

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Quick manual control for now: set OWNER_ONLINE=true in Vercel env vars
  // when you're actively watching chats, false otherwise. Replace this with
  // a real DB/KV read (e.g. Vercel KV) so you can flip it from the dashboard
  // without redeploying.
  const online = process.env.OWNER_ONLINE === 'true';

  return res.status(200).json({ online });
};
