// Team flags and comments for the Market & Competitor Watch.
// Storage: Netlify Blobs (no external database). Endpoint: /api/notes
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const sha = (s) => createHash('sha256').update(s).digest('hex');
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const ITEM_RE = /^[a-z0-9-]{1,40}$/;
const MAX_NOTES = 5000;

export default async (req) => {
  const store = getStore({ name: 'team-notes', consistency: 'strong' });

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const notes = (await Promise.all(blobs.slice(0, MAX_NOTES).map((b) => store.get(b.key, { type: 'json' }))))
      .filter(Boolean)
      .map(({ tokenHash, ...pub }) => pub);
    return json(200, { notes });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }

  if (req.method === 'POST') {
    const item = clean(body.item, 40);
    const kind = body.kind === 'flag' ? 'flag' : body.kind === 'comment' ? 'comment' : null;
    const name = clean(body.name, 40);
    const text = clean(body.text, 500);
    if (!ITEM_RE.test(item) || !kind || !name) return json(400, { error: 'Missing name or item' });
    if (kind === 'comment' && !text) return json(400, { error: 'Comment is empty' });
    const { blobs } = await store.list();
    if (blobs.length >= MAX_NOTES) return json(507, { error: 'Notes store is full' });
    const id = Date.now().toString(36) + randomBytes(4).toString('hex');
    const token = randomBytes(16).toString('hex');
    const note = { id, item, kind, name, text: kind === 'comment' ? text : '', at: new Date().toISOString() };
    await store.setJSON(id, { ...note, tokenHash: sha(token) });
    return json(201, { note, token });
  }

  if (req.method === 'DELETE') {
    const id = clean(body.id, 40);
    const token = clean(body.token, 64);
    if (!/^[a-z0-9]{6,40}$/.test(id) || !token) return json(400, { error: 'Invalid request' });
    const note = await store.get(id, { type: 'json' });
    if (!note) return json(404, { error: 'Not found' });
    if (note.tokenHash !== sha(token)) return json(403, { error: 'Only the person who posted this can remove it' });
    await store.delete(id);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
};

export const config = { path: '/api/notes' };
