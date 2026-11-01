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
  if (cache.size > 500) cache.clear();
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

// Tag validation: CoC tags only use these characters
const TAG_RE = /^#?[0289PYLQGRJCUV]{3,15}$/i;
function cleanTag(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (!TAG_RE.test(t)) return null;
  return encodeURIComponent(t.startsWith('#') ? t : '#' + t);
}

// Player details (trimmed down so the page loads fast)
app.get('/api/player/:tag', async (req, res, next) => {
  const tag = cleanTag(req.params.tag);
  if (!tag) return res.status(400).json({ error: 'Invalid player tag' });
  try {
    const p = await coc(`/players/${tag}`);
    res.json({
      tag: p.tag, name: p.name, role: p.role, warPreference: p.warPreference,
      townHallLevel: p.townHallLevel, townHallWeaponLevel: p.townHallWeaponLevel,
      expLevel: p.expLevel, trophies: p.trophies, bestTrophies: p.bestTrophies,
      warStars: p.warStars, attackWins: p.attackWins, defenseWins: p.defenseWins,
      donations: p.donations, donationsReceived: p.donationsReceived,
      clanCapitalContributions: p.clanCapitalContributions,
      builderHallLevel: p.builderHallLevel, builderBaseTrophies: p.builderBaseTrophies,
      league: p.league ? { name: p.league.name } : null,
      clan: p.clan ? { tag: p.clan.tag, name: p.clan.name } : null,
      heroes: (p.heroes || []).map(h => ({ name: h.name, level: h.level, maxLevel: h.maxLevel, village: h.village })),
      troops: (p.troops || []).map(t => ({ name: t.name, level: t.level, maxLevel: t.maxLevel, village: t.village, superTroopIsActive: !!t.superTroopIsActive })),
      spells: (p.spells || []).map(t => ({ name: t.name, level: t.level, maxLevel: t.maxLevel, village: t.village })),
    });
  } catch (e) { next(e); }
});

// Any clan (used by the war details to show each clan's member count)
app.get('/api/clans/:tag', async (req, res, next) => {
  const tag = cleanTag(req.params.tag);
  if (!tag) return res.status(400).json({ error: 'Invalid clan tag' });
  try {
    const c = await coc(`/clans/${tag}`);
    if (req.query.brief) return res.json({ tag: c.tag, name: c.name, members: c.members, clanLevel: c.clanLevel });
    res.json(c);
  } catch (e) { next(e); }
});

// War log of any clan (private logs return an empty list)
app.get('/api/clans/:tag/warlog', async (req, res, next) => {
  const tag = cleanTag(req.params.tag);
  if (!tag) return res.status(400).json({ error: 'Invalid clan tag' });
  try {
    res.json(await coc(`/clans/${tag}/warlog?limit=10`));
  } catch (e) {
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
