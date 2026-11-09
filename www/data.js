// Data layer: Supabase backend when configured, local demo backend otherwise.
const cfg = window.SQUADFIT_CONFIG || {};
export const DEMO = !(cfg.supabaseUrl && cfg.supabaseAnonKey);

const toEmail = (u) => `${u.toLowerCase().trim()}@squadfit.app`;
const toPassword = (pin) => `sf-${pin}-squad`;
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

// ---------------- Supabase backend ----------------
async function supabaseBackend() {
  // Supabase library is bundled in /vendor so the app doesn't depend on an outside CDN
  if (!window.supabase) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/supabase.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the app. Check your connection.')); document.head.appendChild(s); });
  const sb = window.supabase.createClient(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim());
  let user = null;
  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const urlCache = {};

  return {
    async init() { const { data } = await sb.auth.getSession(); user = data.session?.user || null; return user; },
    get userId() { return user?.id; },
    async publicMembers() { return check(await sb.rpc('public_members')) || []; },
    async signUp({ username, pin, display_name, color }) {
      let res = await sb.auth.signUp({ email: toEmail(username), password: toPassword(pin) });
      if (res.error && /registered|exists/i.test(res.error.message)) {
        // Only continue if this login exists but never finished joining
        res = await sb.auth.signInWithPassword({ email: toEmail(username), password: toPassword(pin) });
        if (res.error) throw new Error('That name is already registered. Tap Log in instead.');
        user = res.data.user;
        const prof = check(await sb.from('profiles').select('id').eq('id', user.id).maybeSingle());
        if (prof) { await sb.auth.signOut(); user = null; throw new Error('That name is already registered. Tap Log in instead.'); }
      } else if (res.error) throw new Error(res.error.message);
      user = res.data.user;
      if (!res.data.session) throw new Error('Email confirmation is still ON in Supabase. Turn it off (see setup guide).');
      const { error } = await sb.rpc('join_group', { p_username: username, p_display_name: display_name, p_color: color });
      if (error) { await sb.auth.signOut(); user = null; throw new Error(error.message); }
    },
    async signIn(username, pin) {
      const res = await sb.auth.signInWithPassword({ email: toEmail(username), password: toPassword(pin) });
      if (res.error) throw new Error(/rate|many/i.test(res.error.message) ? 'Too many tries. Wait a few minutes and try again.' : 'Wrong PIN. Try again.');
      user = res.data.user;
    },
    async changePin(oldPin, newPin) {
      const me = (await sb.from('profiles').select('username').eq('id', user.id).single()).data;
      const chk = await sb.auth.signInWithPassword({ email: toEmail(me.username), password: toPassword(oldPin) });
      if (chk.error) throw new Error('Your current PIN is wrong.');
      const { error } = await sb.auth.updateUser({ password: toPassword(newPin) });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); user = null; },
    async me() { return check(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()); },
    async listProfiles() { return check(await sb.from('profiles').select('*').order('created_at')); },
    async updateProfile(patch) { check(await sb.from('profiles').update(patch).eq('id', user.id)); },
    async getPrivate() {
      const r = check(await sb.from('private_stats').select('*').eq('user_id', user.id).maybeSingle());
      if (r) for (const k of ['height_in', 'weight_lb', 'age', 'start_weight_lb', 'goal_weight_lb', 'goal_months']) if (r[k] != null) r[k] = Number(r[k]);
      return r;
    },
    async savePrivate(obj) { check(await sb.from('private_stats').upsert({ ...obj, user_id: user.id, updated_at: new Date().toISOString() })); },
    async goalProgress() {
      const rows = check(await sb.rpc('goal_progress')) || [];
      return Object.fromEntries(rows.map(r => [r.user_id, r.percent]));
    },
    async list(table, { userId, from, to } = {}) {
      let q = sb.from(table).select('*');
      if (userId) q = q.eq('user_id', userId);
      if (from) q = q.gte('day', from);
      if (to) q = q.lte('day', to);
      return check(await q.order('created_at'));
    },
    async insert(table, row) { return check(await sb.from(table).insert({ ...row, user_id: user.id }).select().single()); },
    async remove(table, id) { check(await sb.from(table).delete().eq('id', id)); },
    async update(table, id, patch) { return check(await sb.from(table).update(patch).eq('id', id).eq('user_id', user.id).select().single()); },
    async clearPrivate() { check(await sb.from('private_stats').delete().eq('user_id', user.id)); },
    async adminResetPin(username, pin) { check(await sb.rpc('admin_reset_pin', { p_username: username, p_pin: pin })); },
    async uploadAvatar(blob) {
      const path = `${user.id}/${uid()}.jpg`;
      check(await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' }));
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },
    async logMotion(data) { try { await sb.from('motion_logs').insert({ user_id: user.id, data }); } catch (e) { console.warn(e); } },
    async listWater({ from, to }) { return check(await sb.from('water').select('*').gte('day', from).lte('day', to)); },
    async setWater(day, glasses) { check(await sb.from('water').upsert({ user_id: user.id, day, glasses })); },
    async uploadPhoto(blob) {
      const path = `${user.id}/${uid()}.jpg`;
      check(await sb.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg' }));
      return path;
    },
    async photoUrl(path) {
      if (!path) return null;
      const c = urlCache[path];
      if (c && c.exp > Date.now()) return c.url;
      const { data } = await sb.storage.from('meal-photos').createSignedUrl(path, 3600);
      urlCache[path] = { url: data?.signedUrl || null, exp: Date.now() + 50 * 60 * 1000 };
      return urlCache[path].url;
    },
    async removePhoto(path) { if (path) await sb.storage.from('meal-photos').remove([path]); }
  };
}

// ---------------- Demo backend (localStorage) ----------------
function demoBackend() {
  const KEY = 'squadfit-demo-v4';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  let db = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn(e); } };
  if (!db) { db = seed(); save(); }
  let user = db.session ? { id: db.session } : null;

  return {
    async init() { return user; },
    get userId() { return user?.id; },
    async publicMembers() { return db.profiles.map(({ username, display_name, color, avatar_url }) => ({ username, display_name, color, avatar_url })); },
    async signUp({ username, pin, display_name, color }) {
      const u = username.toLowerCase().trim();
      if (db.profiles.some(p => p.username === u)) throw new Error('That name is already registered. Tap Log in instead.');
      if (db.profiles.length >= 4) throw new Error('The group is full');
      const id = uid();
      db.profiles.push({ id, username: u, display_name, color, is_admin: u === 'rush', created_at: new Date().toISOString() });
      db.pins[u] = pin; db.session = id; user = { id }; save();
    },
    async signIn(username, pin) {
      const u = username.toLowerCase().trim();
      const p = db.profiles.find(x => x.username === u);
      if (!p || db.pins[u] !== pin) throw new Error('Wrong PIN. Try again.');
      db.session = p.id; user = { id: p.id }; save();
    },
    async signOut() { db.session = null; user = null; save(); },
    async changePin(oldPin, newPin) {
      const p = db.profiles.find(x => x.id === user.id);
      if (db.pins[p.username] !== oldPin) throw new Error('Your current PIN is wrong.');
      db.pins[p.username] = newPin; save();
    },
    async me() { return db.profiles.find(p => p.id === user.id) || null; },
    async listProfiles() { return [...db.profiles]; },
    async updateProfile(patch) { Object.assign(db.profiles.find(p => p.id === user.id), patch); save(); },
    async getPrivate() { return db.private[user.id] || null; },
    async savePrivate(obj) { db.private[user.id] = { ...obj, user_id: user.id }; save(); },
    async goalProgress() {
      const out = {};
      for (const [id, s] of Object.entries(db.private)) {
        if (s.goal_weight_lb && s.start_weight_lb && s.weight_lb && s.start_weight_lb > s.goal_weight_lb)
          out[id] = Math.max(0, Math.min(100, Math.round((s.start_weight_lb - s.weight_lb) / (s.start_weight_lb - s.goal_weight_lb) * 100)));
      }
      return out;
    },
    async list(table, { userId, from, to } = {}) {
      return db[table].filter(r => (!userId || r.user_id === userId) && (!from || r.day >= from) && (!to || r.day <= to));
    },
    async insert(table, row) { const r = { id: uid(), created_at: new Date().toISOString(), ...row, user_id: user.id }; db[table].push(r); save(); return r; },
    async remove(table, id) { db[table] = db[table].filter(r => !(r.id === id && r.user_id === user.id)); save(); },
    async update(table, id, patch) { const r = db[table].find(x => x.id === id && x.user_id === user.id); if (r) Object.assign(r, patch); save(); return r; },
    async clearPrivate() { delete db.private[user.id]; save(); },
    async adminResetPin(username, pin) { const me = db.profiles.find(p => p.id === user.id); if (!me?.is_admin) throw new Error('Only the squad admin can reset PINs'); if (!db.pins[username]) throw new Error('No account for that name'); db.pins[username] = pin; save(); },
    async uploadAvatar(blob) { return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); },
    async listWater({ from, to }) { return db.water.filter(w => w.day >= from && w.day <= to); },
    async setWater(day, glasses) {
      const w = db.water.find(x => x.user_id === user.id && x.day === day);
      if (w) w.glasses = glasses; else db.water.push({ user_id: user.id, day, glasses });
      save();
    },
    async uploadPhoto(blob) {
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      const path = 'demo-' + uid(); db.photos[path] = dataUrl; save(); return path;
    },
    async photoUrl(path) { return db.photos[path] || null; },
    async removePhoto(path) { delete db.photos[path]; save(); }
  };
}

function seed() {
  return { profiles: [], pins: {}, private: {}, activities: [], workouts: [], meals: [], water: [], photos: {}, session: null };
}

export async function createBackend() { return DEMO ? demoBackend() : supabaseBackend(); }
