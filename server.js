const express = require('express');
const path = require('path');

const app = express();
const BASE = process.env.COC_API_BASE || 'https://cocproxy.royaleapi.dev/v1';
const TOKEN = process.env.COC_API_TOKEN;
const CLAN_TAG = process.env.CLAN_TAG || '#2JGLVQQCQ';
const TAG = encodeURIComponent(CLAN_TAG);
const TTL = 60 * 1000; // 1 minute cache para hindi maubos ang rate limit
const cache = new Map();

async function coc(endpoint) {
  const hit = cache.get(endpoint);
  if (hit && Date.now() - hit.t < TTL) return hit.data;

  const res = await fetch(BASE + endpoint, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.reason || 'CoC API error');
    err.status = res.status;
    throw err;
  }
  cache.set(endpoint, { t: Date.now(), data });
  return data;
}

app.get('/api/config', (req, res) => {
  res.json({
    clanTag: CLAN_TAG,
    joinUrl: `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${CLAN_TAG.replace('#', '')}`,
  });
});

app.get('/api/clan', async (req, res, next) => {
  try { res.json(await coc(`/clans/${TAG}`)); } catch (e) { next(e); }
});

app.get('/api/warlog', async (req, res, next) => {
  try {
    res.json(await coc(`/clans/${TAG}/warlog?limit=10`));
  } catch (e) {
    // 403 = naka-private ang war log sa in-game settings
    if (e.status === 403) return res.json({ items: [], private: true });
    next(e);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Clan Hub running on port ${PORT}`));
