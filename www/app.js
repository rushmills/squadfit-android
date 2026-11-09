import { createBackend, DEMO } from './data.js';
import { buildPlan, TIPS } from './mealplan.js';
import { ic, tile } from './icons.js';
import { createStepCounter } from './steps.js';

// ============ Version check: phones always get the newest app ============
const APP_VERSION = '202611091314';
async function checkForUpdate() {
  try {
    const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const live = (await r.text()).trim();
    // Don't reload in the middle of a walk
    // Reload once per new version (never loop), and not in the middle of a walk
    if (live && live !== APP_VERSION && !document.querySelector('.live') && sessionStorage.getItem('squadfit-updated') !== live) { sessionStorage.setItem('squadfit-updated', live); location.reload(); }
  } catch { }
}
setTimeout(checkForUpdate, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });

// ============ Helpers ============
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d) => d.toLocaleDateString('en-CA');
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const prettyDay = (s) => {
  if (s === today()) return 'Today';
  if (s === addDays(today(), -1)) return 'Yesterday';
  return new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
const fmt1 = (n) => (Math.round((n || 0) * 10) / 10).toString();
const fmtInt = (n) => Math.round(n || 0).toLocaleString();
const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const CFG = window.SQUADFIT_CONFIG || {};
const BG = CFG.backgroundImage || 'assets/squad-bg.jpg';
const SQUAD_PIC = { id: 'squad', label: 'The Squad', src: BG };
const MEMBER_PICS = CFG.memberPictures || {};
// A picture the person uploaded wins; otherwise the squad picture made for them
const ownPic = (p) => !p ? null : p.avatar_url ? { id: 'own', label: p.display_name, src: p.avatar_url } : MEMBER_PICS[p.username] ? { id: 'own', label: p.display_name, src: MEMBER_PICS[p.username] } : null;
const picFor = (p) => ownPic(p) || SQUAD_PIC;
const hasOwnPic = (p) => !!ownPic(p);
const avatar = (p, cls = '') => hasOwnPic(p)
  ? `<div class="avatar img ${cls}" style="background-image:url('${esc(ownPic(p).src)}');box-shadow:0 0 0 2px ${esc(p.color || '#555')}"></div>`
  : `<div class="avatar ${cls}" style="background:${esc(p?.color || '#555')}">${esc(initials(p?.display_name))}</div>`;
const COLORS = ['#ff2fa6', '#a855f7', '#ffc94d', '#38bdf8', '#22c55e', '#f97316', '#ec4899', '#14b8a6'];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function openSheet(html, mount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet"><div class="grab"></div>${html}</div></div>`;
  const bd = $('.sheet-backdrop', root);
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  mount && mount($('.sheet', root));
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

// ============ Exercise catalog ============
const CATALOG = {
  'Cardio': ['Walking', 'Running', 'Treadmill', 'Elliptical', 'Cycling / Spin', 'Stair climber', 'Rowing', 'Jump rope', 'HIIT', 'Dance / Zumba'],
  'Upper Body': ['Push-ups', 'Bench press', 'Shoulder press', 'Lat pulldown', 'Pull-ups', 'Seated row', 'Chest fly'],
  'Lower Body': ['Squats', 'Lunges', 'Deadlifts', 'Leg press', 'Hip thrusts', 'Step-ups', 'Calf raises'],
  'Chest': ['Bench press', 'Incline press', 'Chest fly', 'Push-ups', 'Cable crossover'],
  'Back': ['Lat pulldown', 'Pull-ups', 'Bent-over row', 'Seated row', 'Back extensions'],
  'Shoulders': ['Shoulder press', 'Lateral raises', 'Front raises', 'Rear delt fly', 'Arnold press'],
  'Biceps': ['Dumbbell curls', 'Hammer curls', 'Barbell curls', 'Preacher curls', 'Cable curls'],
  'Triceps': ['Tricep dips', 'Overhead extension', 'Cable pushdown', 'Skull crushers', 'Close-grip push-ups'],
  'Legs': ['Squats', 'Leg extensions', 'Hamstring curls', 'Bulgarian split squats', 'Wall sit', 'Calf raises'],
  'Glutes': ['Glute bridges', 'Hip thrusts', 'Kickbacks', 'Sumo squats', 'Abductor machine'],
  'Core / Abs': ['Plank', 'Crunches', 'Russian twists', 'Leg raises', 'Mountain climbers', 'Bicycle crunches'],
  'Full Body': ['Burpees', 'Circuit training', 'Kettlebell swings', 'Bootcamp class', 'CrossFit WOD'],
  'Stretching / Yoga': ['Yoga', 'Pilates', 'Stretching', 'Mobility work'],
  'Sports': ['Basketball', 'Football', 'Netball', 'Swimming', 'Tennis', 'Volleyball'],
  'Other': []
};
const MET = { 'Cardio': 7, 'Full Body': 8, 'Sports': 7, 'Stretching / Yoga': 2.5, 'Core / Abs': 4 };
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// ============ State ============
let api, me, privateStats = null, profiles = [], goals = {};
const state = { tab: 'today', viewUser: null, calMonth: today().slice(0, 7), foodDay: today(), trackMode: 'move' };
const byId = (id) => profiles.find(p => p.id === id);
const isMe = (id) => id === me?.id;

// ============ Calories ============
const weightLb = () => privateStats?.weight_lb || 170;
function moveCalories({ kind, duration_min, distance_mi, steps }) {
  const kg = weightLb() * 0.4536;
  if (duration_min) {
    let met = kind === 'run' ? 9.8 : 3.5;
    if (distance_mi && duration_min) {
      const mph = distance_mi / (duration_min / 60);
      met = kind === 'run' ? Math.max(6, mph * 1.6) : (mph > 3.8 ? 5 : mph > 3 ? 4.3 : 3.5);
    }
    return Math.round(met * kg * duration_min / 60);
  }
  const mi = distance_mi || (steps ? steps / (kind === 'run' ? 1600 : 2100) : 0);
  return Math.round(mi * weightLb() * (kind === 'run' ? 0.72 : 0.53));
}
function workoutCalories(category, duration_min) {
  if (!duration_min) return null;
  return Math.round((MET[category] || 5) * weightLb() * 0.4536 * duration_min / 60);
}

// ============ Boot ============
async function boot() {
  document.title = window.SQUADFIT_CONFIG?.appName || 'SquadFit';
  try {
    const minSplash = new Promise(r => setTimeout(r, 1200));
    api = await createBackend();
    const u = await api.init();
    await minSplash;
    if (u) { me = await api.me(); }
    if (me) await afterLogin(); else renderAuth();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="auth"><div class="logo-mark">SF</div><h1>Couldn't connect</h1><p class="sub">${esc(e.message)}</p><button class="btn primary block" onclick="location.reload()">Try again</button></div>`;
  }
}
// Phone step sync: an iPhone Shortcut opens the app with ?phonesteps=1234 (today's total from Apple Health)
(() => { try {
  const q = new URLSearchParams(location.search), raw = q.get('phonesteps'); const n = raw == null ? NaN : Math.round(parseFloat(String(raw).replace(/[^0-9.]/g, '')));
  if (n >= 0) { localStorage.setItem('squadfit-pending-phonesteps', JSON.stringify({ steps: n, day: q.get('day') || ymd(new Date()) })); history.replaceState(null, '', location.pathname); }
} catch { } })();
// Save the phone's own full-day step total for a day (replaces any earlier phone total for that day)
async function savePhoneSteps(day, steps, meters) {
  const old = (await api.list('activities', { userId: me.id, from: day, to: day })).filter(a => a.source === 'phone');
  if (old.length === 1 && old[0].steps === steps) return false;            // nothing new
  for (const a of old) await api.remove('activities', a.id);
  const distance_mi = +((meters ? meters / 1609.34 : steps * strideMiles('walk'))).toFixed(2);
  await api.insert('activities', { day, kind: 'walk', source: 'phone', steps, distance_mi, duration_min: null, calories: moveCalories({ kind: 'walk', distance_mi }) });
  return true;
}
async function syncPhoneSteps() {
  let p = null; try { p = JSON.parse(localStorage.getItem('squadfit-pending-phonesteps')); } catch { }
  if (p && p.steps >= 0) {
    try { await savePhoneSteps(p.day, p.steps); localStorage.removeItem('squadfit-pending-phonesteps'); toast(`Synced ${fmtInt(p.steps)} steps from your phone`); } catch (e) { console.warn(e); }
  }
  await syncHealthConnect();
}

// ---- Android app: read steps from Health Connect (Samsung Health / Google Fit data) ----
const nativeHealth = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.Health : null;
let lastHealthSync = 0;
async function syncHealthConnect(force) {
  const H = nativeHealth(); if (!H || !me) return;
  if (!force && Date.now() - lastHealthSync < 60000) return;
  lastHealthSync = Date.now();
  try {
    const av = await H.isAvailable();
    if (!av?.available) { if (force) toast('Health Connect isn\'t set up on this phone yet. See Me > Phone steps.'); return; }
    await H.requestAuthorization({ read: ['steps', 'distance'] });
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
    const range = { startDate: start.toISOString(), endDate: new Date().toISOString(), bucket: 'day', aggregation: 'sum' };
    const { samples = [] } = await H.queryAggregated({ dataType: 'steps', ...range });
    let dist = []; try { dist = (await H.queryAggregated({ dataType: 'distance', ...range })).samples || []; } catch { }
    let changed = 0, todaySteps = 0;
    for (const sm of samples) {
      const day = ymd(new Date(sm.startDate)), steps = Math.round(sm.value || 0);
      if (!steps) continue;
      const m = dist.find(d => ymd(new Date(d.startDate)) === day)?.value;
      if (await savePhoneSteps(day, steps, m)) changed++;
      if (day === today()) todaySteps = steps;
    }
    try { localStorage.setItem('squadfit-health-last', String(Date.now())); } catch { }
    if (changed && todaySteps) toast(`Phone steps today: ${fmtInt(todaySteps)}`);
    if (changed && document.querySelector('nav.tabs')) render();
  } catch (e) { console.warn('Health Connect', e); if (force) toast('Couldn\'t read Health Connect. Check permissions in Me > Phone steps.'); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncHealthConnect(); });

async function afterLogin() {
  try { localStorage.setItem('squadfit-logged-in-before', '1'); } catch { }
  me = await api.me();
  if (!me) { await api.signOut(); renderAuth('join'); throw new Error('Your profile was not finished. Please join again with the same name and PIN.'); }
  [profiles, privateStats, goals] = await Promise.all([api.listProfiles(), api.getPrivate(), api.goalProgress()]);
  state.viewUser = me.id;
  await syncPhoneSteps();
  render();
}
async function refreshGoals() { goals = await api.goalProgress(); }

// ============ Auth ============
// PIN boxes: plain number fields with dots, so iPhone/Android password managers don't autofill old PINs into them
const pinField = (name) => `<input name="${name}" class="pin" required type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-form-type="other" title="4 numbers">`;
const cleanPin = (v) => String(v || '').replace(/\D/g, '').slice(0, 4);
const slugName = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
async function renderAuth(mode) {
  const appName = esc(window.SQUADFIT_CONFIG?.appName || 'SquadFit');
  let members = [];
  try { members = await api.publicMembers(); } catch (e) { console.warn(e); }
  let seen = false; try { seen = localStorage.getItem('squadfit-logged-in-before') === '1'; } catch { }
  const SQUAD0 = CFG.squadNames || ['Jill', 'Rush', 'Toni', 'Tiffy'];
  const anyLeft = SQUAD0.some(n => !members.some(m => m.username === slugName(n)));
  // First time on this phone and spots still open: start on Register
  if (!mode) mode = members.length && (seen || !anyLeft) ? 'login' : 'join';
  const SQUAD = CFG.squadNames || ['Jill', 'Rush', 'Toni', 'Tiffy'];
  const taken = new Set(members.map(m => m.username));
  const available = SQUAD.filter(n => !taken.has(slugName(n)));
  const full = members.length >= 4 || !available.length;
  $('#app').innerHTML = `
  <div class="auth">
    <div class="auth-hero" style="background-image:url('${esc(BG)}')"></div>
    <div class="auth-body">
    ${DEMO ? `<div class="demo-banner">Test mode: everything is saved on this phone only until the database is connected.</div>` : ''}
    <div class="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button><button data-m="join" class="${mode === 'join' ? 'on' : ''}">Register</button></div>
    <form id="auth-form" autocomplete="off">
      ${mode === 'join' ? (full ? `<div class="empty">Everyone in the squad is registered. Tap Log in.</div>` : `
        <div class="eyebrow" style="margin-bottom:10px">Step 1 of 2 · Create your profile</div>
        <label class="field"><span>Your name</span><select name="display_name" required><option value="" selected disabled>Choose your name</option>${available.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
        <div class="grid2">
          <label class="field"><span>4-digit PIN</span>${pinField('pin')}</label>
          <label class="field"><span>Confirm PIN</span>${pinField('pin2')}</label>
        </div>
        <label class="field"><span>Your color</span><div class="colors">${COLORS.map((c, i) => `<button type="button" data-c="${c}" class="${i === 0 ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>
        <div class="notice lock"><div><b>Your personal info is private.</b> Height, weight, age and gender are optional, and only you can ever see them. Your friends see your workouts, walks, food diary and calories, plus your weight goal as a % only.</div></div>
        <div class="err" id="auth-err"></div>
        <button class="btn primary block" type="submit">Next</button>`) : (members.length ? `
        <label class="field"><span>Who are you?</span></label>
        <div class="who">${members.map(m => { const op = ownPic(m); return `<button type="button" class="who-tile" data-un="${esc(m.username)}" style="${op ? `background-image:url('${esc(op.src)}')` : `background:${esc(m.color || '#555')}`}">${op ? '' : `<em>${esc(initials(m.display_name))}</em>`}<span>${esc(m.display_name)}</span></button>`; }).join('')}</div>
        <label class="field"><span>PIN</span>${pinField('pin')}</label>
        <div class="err" id="auth-err"></div>
        <button class="btn primary block" type="submit">Log in</button>
        <p class="center small muted" style="margin-top:14px"><a href="#" id="forgot-pin" style="color:var(--lav);font-weight:600">Forgot your PIN?</a>${anyLeft ? ` · Don't see your name? <a href="#" id="go-reg" style="color:var(--accent);font-weight:700">Register first</a>` : ''}</p>` : `<div class="empty">No one has registered yet. Tap "Register" to be first.</div>`)}
    </form>
    </div>
  </div>`;
  $$('.seg button').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  $('#go-reg') && ($('#go-reg').onclick = (e) => { e.preventDefault(); renderAuth('join'); });
  $('#forgot-pin') && ($('#forgot-pin').onclick = (e) => { e.preventDefault(); openSheet(`<h3>Forgot your PIN?</h3>
    <p class="small" style="margin-top:0">No problem, and no email needed.</p>
    <ol class="small" style="line-height:1.7;padding-left:20px">
      <li>Message <b>${esc(CFG.adminName || 'Rush')}</b> (the squad admin) and ask for a PIN reset.</li>
      <li>She'll give you a <b>temporary PIN</b>.</li>
      <li>Log in with it, then go to <b>Me > Change PIN</b> and pick a new one.</li>
    </ol>
    <p class="muted small">Your workouts, walks and food diary are kept. Only the PIN changes.</p>
    <button class="btn primary block" id="fp-ok">Got it</button>`, (sh) => $('#fp-ok', sh).onclick = closeSheet); });
  let color = COLORS[0], picked = null;
  $$('.colors button').forEach(b => b.onclick = () => { $$('.colors button').forEach(x => x.classList.remove('on')); b.classList.add('on'); color = b.dataset.c; });
  $$('.who-tile').forEach(c => c.onclick = () => { $$('.who-tile').forEach(x => x.classList.remove('on')); c.classList.add('on'); picked = c.dataset.un; $('[name=pin]').focus(); });
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const err = $('#auth-err'); if (!err) return; err.textContent = '';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (mode === 'join') {
        if (!f.display_name) throw new Error('Choose your name.');
        const display_name = f.display_name.trim().replace(/\s+/g, ' ');
        const username = slugName(display_name);
        if (username.length < 2) throw new Error('Please use a name with at least 2 letters.');
        f.pin = cleanPin(f.pin); f.pin2 = cleanPin(f.pin2);
        if (f.pin.length !== 4) throw new Error('Your PIN must be exactly 4 numbers.');
        if (f.pin !== f.pin2) { e.target.pin.value = ''; e.target.pin2.value = ''; e.target.pin.focus(); throw new Error("The two PIN boxes didn't match. Type the same 4 numbers in both."); }
        if (members.some(m => m.username === username)) throw new Error(`${display_name} is already registered. Tap Log in instead.`);
        await api.signUp({ username, pin: f.pin, display_name, color });
        await afterLogin();
        openPrivateSheet(true);
      } else {
        if (!picked) throw new Error('Tap your picture first.');
        f.pin = cleanPin(f.pin);
        if (f.pin.length !== 4) throw new Error('Your PIN is 4 numbers.');
        await api.signIn(picked, f.pin);
        await afterLogin();
      }
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  };
}

// ============ Shell ============
const ICONS = { today: ic('home', 24), calendar: ic('calendar', 24), track: ic('plus', 26, { sw: 2.5 }), food: ic('utensils', 24), me: ic('user', 24) };
function render() {
  const tabs = [['today', 'Today'], ['calendar', 'Calendar'], ['track', ''], ['food', 'Food'], ['me', 'Me']];
  $('#app').innerHTML = `<div id="main"></div>
  <nav class="tabs">${tabs.map(([k, l]) => k === 'track'
    ? `<button data-tab="track" class="${state.tab === k ? 'on' : ''}" aria-label="Log"><div class="plus">${ICONS.track}</div></button>`
    : `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${ICONS[k]}${l}</button>`).join('')}</nav>`;
  $$('nav.tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });
  ({ today: renderToday, calendar: renderCalendar, track: renderTrack, food: renderFood, me: renderMe })[state.tab]();
}
const demoBanner = () => '';
function peopleChips(onPick) {
  return `<div class="chips">${profiles.map(p => `<div class="chip ${state.viewUser === p.id ? 'on' : ''}" data-u="${p.id}">${avatar(p, 'sm')}${isMe(p.id) ? 'Me' : esc(p.display_name)}</div>`).join('')}</div>`;
}
function bindChips(rerender) { $$('.chip[data-u]').forEach(c => c.onclick = () => { state.viewUser = c.dataset.u; rerender(); }); }

// ============ Data helpers ============
async function loadRange(from, to, userId) {
  const [acts, wos, meals] = await Promise.all([
    api.list('activities', { from, to, userId }), api.list('workouts', { from, to, userId }), api.list('meals', { from, to, userId })]);
  return { acts, wos, meals };
}
function streak(userId, acts, wos) {
  const days = new Set([...acts, ...wos].filter(r => r.user_id === userId).map(r => r.day));
  let d = today(); if (!days.has(d)) d = addDays(d, -1);
  let n = 0; while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
function dayTotals(userId, day, data) {
  const all = data.acts.filter(r => r.user_id === userId && r.day === day);
  const w = data.wos.filter(r => r.user_id === userId && r.day === day);
  const phone = all.filter(r => r.source === 'phone'), a = all.filter(r => r.source !== 'phone');
  const sum = (arr, k) => arr.reduce((s, r) => s + (+r[k] || 0), 0);
  // The phone's own count already includes walks tracked in the app, so take whichever is bigger (never add both)
  const steps = Math.max(sum(phone, 'steps'), sum(a, 'steps')), miles = Math.max(sum(phone, 'distance_mi'), sum(a, 'distance_mi'));
  const moveCal = Math.max(sum(phone, 'calories'), sum(a, 'calories'));
  return {
    steps,
    miles,
    cal: moveCal + sum(w, 'calories'),
    workouts: w.length,
    mins: [...a, ...w].reduce((s, r) => s + (+r.duration_min || 0), 0)
  };
}

// ============ TODAY ============
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function sparkline(vals, color) {
  const max = Math.max(1, ...vals), w = 120, h = 34;
  const pts = vals.map((v, i) => [i * (w / Math.max(1, vals.length - 1)), h - 4 - (v / max) * (h - 8)]);
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none"><path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}
const rankBadge = (i) => `<span class="rank r${i + 1}">${i + 1}</span>`;

async function renderToday() {
  const main = $('#main');
  const t = today(), weekStart = addDays(t, -6);
  const data = await loadRange(addDays(t, -60), t);
  const water = await api.listWater({ from: t, to: t });
  const mine = dayTotals(me.id, t, data);
  const myWater = water.find(w => w.user_id === me.id)?.glasses || 0;
  const weekSteps = (id) => Array.from({ length: 7 }, (_, i) => dayTotals(id, addDays(t, -i), data).steps).reduce((a, b) => a + b, 0);
  const ranked = [...profiles].sort((a, b) => weekSteps(b.id) - weekSteps(a.id));
  const hour = new Date().getHours();
  const goal = CFG.stepGoal || 10000, pct = Math.min(1, mine.steps / goal), C = 2 * Math.PI * 52;
  const myStreak = streak(me.id, data.acts, data.wos);
  const range = state.range || 7;

  // Activity trend (steps per day)
  const days = Array.from({ length: range }, (_, i) => addDays(t, i - (range - 1)));
  const totals = days.map(d => dayTotals(me.id, d, data));
  const steps = totals.map(x => x.steps);
  const W = 320, H = 130, top = 26, bot = 104;
  const max = Math.max(goal * 0.5, ...steps);
  const pts = steps.map((v, i) => [12 + i * ((W - 24) / Math.max(1, range - 1)), bot - (v / max) * (bot - top)]);
  const peak = steps.indexOf(Math.max(...steps));
  const pk = pts[peak];
  const labelEvery = range === 7 ? 1 : 5;
  const xLabels = days.map((d, i) => (i % labelEvery === 0 || i === range - 1) && (range === 7 || i % labelEvery === 0)
    ? `<text x="${pts[i][0]}" y="124" text-anchor="middle" font-size="10" fill="#b9a6d6">${range === 7 ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }) : new Date(d + 'T12:00:00').getDate()}</text>` : '').join('');
  const area = smoothPath(pts) + ` L${pts[pts.length - 1][0]},${bot} L${pts[0][0]},${bot} Z`;
  const periodCal = totals.reduce((s, x) => s + x.cal, 0);
  const periodWos = totals.reduce((s, x) => s + x.workouts, 0);

  // Today's focus
  const yWos = data.wos.filter(w => w.user_id === me.id && w.day === addDays(t, -1));
  const focus = mine.workouts ? { title: 'Workout done', sub: `${mine.workouts} logged today. Keep it going!`, tag: 'Completed', icon: 'check', act: null }
    : yWos.length ? { title: 'Same as yesterday?', sub: yWos.map(w => w.exercise).slice(0, 2).join(' + ') + (yWos.length > 2 ? ` +${yWos.length - 2}` : ''), tag: 'Copy workout', icon: 'copy', act: 'copy' }
    : { title: 'Move your body', sub: '30 min workout', tag: 'Start now', icon: 'dumbbell', act: 'log' };

  // Achievements
  const best = Math.max(0, ...Array.from({ length: 30 }, (_, i) => dayTotals(me.id, addDays(t, -i), data).steps));
  const wos30 = data.wos.filter(w => w.user_id === me.id && w.day >= addDays(t, -29)).length;
  const ach = [
    { icon: 'crown', title: 'Consistency Queen', sub: 'Work out 5 days in a row', done: myStreak >= 5, prog: `${Math.min(myStreak, 5)}/5` },
    { icon: 'shoe', title: 'Steps Goal', sub: `${fmtInt(goal)} steps in a day`, done: best >= goal, prog: `${fmtInt(best)}` },
    { icon: 'droplet', title: 'Hydrated', sub: '8 glasses of water today', done: myWater >= 8, prog: `${myWater}/8` },
    { icon: 'dumbbell', title: 'Gym Baddie', sub: '12 workouts in 30 days', done: wos30 >= 12, prog: `${Math.min(wos30, 12)}/12` },
    { icon: 'trophy', title: 'Squad Leader', sub: 'Most steps this week', done: ranked[0]?.id === me.id && weekSteps(me.id) > 0, prog: '' }
  ];

  main.innerHTML = `<div class="screen">
    ${demoBanner()}
    <div class="row between" style="margin-bottom:12px"><div class="wordmark">Squad<span>Fit</span></div>${avatar(me, 'sm')}</div>
    <div class="hero" style="background-image:url('${esc(picFor(me).src)}')">
      <div class="hero-txt"><div><div class="sub" style="color:#e9ddff">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
        <h1>${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${esc(me.display_name)}</h1></div>
</div>
    </div>

    <div class="card deep">
      <div class="row between" style="margin-bottom:14px"><span class="eyebrow">Daily summary</span>${myStreak > 1 ? `<span class="pill">${ic('flame', 13)} ${myStreak} day streak</span>` : ''}</div>
      <div class="summary">
        <div class="ring"><svg viewBox="0 0 120 120"><defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#ff2fa6"/></linearGradient></defs>
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="11"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#gr)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
          <div class="mid"><b>${Math.round(pct * 100)}<small>%</small></b><span>step goal</span></div></div>
        <ul>
          <li>${ic('shoe', 18)}<div><b>${fmtInt(mine.steps)}</b><small>Steps</small></div></li>
          <li>${ic('flame', 18)}<div><b>${fmtInt(mine.cal)}</b><small>Active cal</small></div></li>
          <li>${ic('timer', 18)}<div><b>${mine.mins >= 60 ? Math.floor(mine.mins / 60) + 'h ' + Math.round(mine.mins % 60) + 'm' : fmtInt(mine.mins) + 'm'}</b><small>Active time</small></div></li>
        </ul>
      </div>
    </div>

    <div class="section-title">Today's focus</div>
    <div class="card focus" id="focus">
      <div class="grow"><b>${esc(focus.title)}</b><div class="muted small">${esc(focus.sub)}</div><span class="pill soft">${ic(focus.icon, 13)} ${focus.tag}</span></div>
      <div class="focus-art">${ic(focus.icon === 'check' ? 'trophy' : 'dumbbell', 46, { sw: 1.6 })}</div>
    </div>

    <div class="section-title">Quick actions</div>
    <div class="quick">
      <button id="q-meal">${tile('utensils', 'gold', 20)}<span>Log meal</span></button>
      <button id="q-workout">${tile('dumbbell', 'pink', 20)}<span>Workout</span></button>
      <button id="q-live">${tile('shoe', 'purple', 20)}<span>Walk/Run</span></button>
      <button id="q-water">${tile('droplet', 'blue', 20)}<span>Water <em>${myWater}</em></span></button>
    </div>

    <div class="row between" style="margin:22px 4px 10px"><div class="section-title" style="margin:0">Your progress</div>
      <div class="seg mini" id="range">${[7, 30].map(r => `<button data-r="${r}" class="${range === r ? 'on' : ''}">${r}D</button>`).join('')}</div></div>
    <div class="card deep">
      <div class="eyebrow" style="margin-bottom:6px">Activity trend · steps</div>
      <svg class="trend" viewBox="0 0 ${W} ${H}">
        <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2fa6" stop-opacity=".35"/><stop offset="1" stop-color="#ff2fa6" stop-opacity="0"/></linearGradient>
          <linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#ff2fa6"/></linearGradient></defs>
        ${[top, (top + bot) / 2, bot].map(y => `<line x1="8" x2="${W - 8}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.07)"/>`).join('')}
        <path d="${area}" fill="url(#ga)"/>
        <path d="${smoothPath(pts)}" fill="none" stroke="url(#gl)" stroke-width="3" stroke-linecap="round"/>
        ${steps[peak] ? `<line x1="${pk[0]}" x2="${pk[0]}" y1="${pk[1]}" y2="${bot}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/>
        <circle cx="${pk[0]}" cy="${pk[1]}" r="5" fill="#fff" stroke="#ff2fa6" stroke-width="3"/>
        <g transform="translate(${Math.min(Math.max(pk[0], 34), W - 34)},${Math.max(pk[1] - 18, 10)})"><rect x="-30" y="-11" width="60" height="20" rx="10" fill="#ff2fa6"/><text y="3" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${fmtInt(steps[peak])}</text></g>` : ''}
        ${xLabels}
      </svg>
    </div>
    <div class="duo">
      <div class="card mini-stat"><div class="muted small">Calories burned</div><b>${fmtInt(periodCal)} <small>kcal</small></b>${sparkline(totals.map(x => x.cal), '#ff2fa6')}</div>
      <div class="card mini-stat"><div class="muted small">Workouts</div><b>${periodWos} <small>${range === 7 ? 'this week' : 'in 30 days'}</small></b>${sparkline(totals.map(x => x.workouts), '#b388ff')}</div>
    </div>

    <div class="section-title">Achievements</div>
    <div class="card">
      ${ach.map(a => `<div class="ach ${a.done ? 'done' : ''}">${tile(a.icon, a.done ? 'gold' : 'mute', 18)}<div class="grow"><b>${a.title}</b><div class="muted small">${a.sub}</div></div>
        ${a.done ? `<span class="okay">${ic('check', 14, { sw: 3 })}</span>` : `<span class="muted small">${a.prog}</span>`}</div>`).join('')}
    </div>

    <div class="section-title">The squad today</div>
    <div class="card">
      ${profiles.map(p => { const d = dayTotals(p.id, t, data); const s = streak(p.id, data.acts, data.wos); const g = goals[p.id];
        return `<div class="person" data-u="${p.id}">${avatar(p)}<div class="grow">
          <div class="row between"><div class="name">${esc(p.display_name)}${isMe(p.id) ? ' <span class="muted small">(you)</span>' : ''}</div>${s > 1 ? `<span class="pill">${ic('flame', 12)} ${s}</span>` : ''}</div>
          <div class="pmeta"><span>${ic('shoe', 13)}${fmtInt(d.steps)}</span><span>${ic('pin', 13)}${fmt1(d.miles)} mi</span><span>${ic('dumbbell', 13)}${d.workouts}</span><span>${ic('flame', 13)}${fmtInt(d.cal)}</span></div>
          ${g != null ? `<div class="row" style="gap:8px;margin-top:6px"><div class="bar grow" style="margin:0"><i style="width:${g}%"></i></div><span class="small muted">${g}% to goal</span></div>` : ''}
        </div>${ic('chevR', 18)}</div>`; }).join('')}
    </div>

    <div class="section-title">Steps leaderboard · this week</div>
    <div class="card">
      ${ranked.map((p, i) => `<div class="lb">${rankBadge(i)}${avatar(p, 'sm')}<div class="grow">${esc(p.display_name)}</div><b>${fmtInt(weekSteps(p.id))}</b></div>`).join('')}
    </div>
  </div>`;
  $('#q-live').onclick = () => openLive();
  $('#q-workout').onclick = () => { state.tab = 'track'; state.trackMode = 'workout'; render(); };
  $('#q-meal').onclick = () => { state.viewUser = me.id; state.foodDay = t; state.tab = 'food'; render(); openMealSheet(t); };
  $('#q-water').onclick = async () => { await api.setWater(t, myWater + 1); toast(`${myWater + 1} glass${myWater ? 'es' : ''} of water today`); renderToday(); };
  $('#focus').onclick = async () => {
    if (focus.act === 'copy') { await copyWorkouts(yWos); }
    else if (focus.act === 'log') { state.tab = 'track'; state.trackMode = 'workout'; render(); }
  };
  $$('#range button').forEach(b => b.onclick = () => { state.range = +b.dataset.r; renderToday(); });
  $$('.person[data-u]').forEach(el => el.onclick = () => { state.viewUser = el.dataset.u; state.tab = 'calendar'; render(); });
}

// ============ CALENDAR ============
function ringSvg(w, m, f) {
  const ring = (r, c, on) => `<circle cx="20" cy="20" r="${r}" fill="none" stroke="${c}" stroke-width="4" opacity="${on ? 1 : 0.09}"/>`;
  return `<svg viewBox="0 0 40 40">${ring(16, 'var(--workout)', w)}${ring(10.5, 'var(--move)', m)}${ring(5, 'var(--food)', f)}</svg>`;
}
async function renderCalendar() {
  const main = $('#main');
  const [y, mo] = state.calMonth.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), daysIn = new Date(y, mo, 0).getDate();
  const from = ymd(first), to = ymd(new Date(y, mo - 1, daysIn));
  const uidv = state.viewUser;
  const data = await loadRange(from, to, uidv);
  const has = (arr, d) => arr.some(r => r.day === d);
  const person = byId(uidv);
  const workoutDays = new Set(data.wos.map(r => r.day)).size;
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${state.calMonth}-${String(d).padStart(2, '0')}`;
    cells += `<button class="day ${ds === today() ? 'today' : ''}" data-d="${ds}"><span class="n">${d}</span>${ringSvg(has(data.wos, ds), has(data.acts, ds), has(data.meals, ds))}</button>`;
  }
  main.innerHTML = `<div class="screen">
    ${demoBanner()}
    <div class="topbar"><h1>Calendar</h1></div>
    ${peopleChips()}
    <div class="card">
      <div class="row between" style="margin-bottom:12px">
        <button class="icon-btn" id="prev">${ic('chevL', 18)}</button>
        <b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button class="icon-btn" id="next">${ic('chevR', 18)}</button>
      </div>
      <div class="cal-head">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<div>${x}</div>`).join('')}</div>
      <div class="cal">${cells}</div>
      <div class="legend"><span><i style="background:var(--workout)"></i>Workout</span><span><i style="background:var(--move)"></i>Walk/run</span><span><i style="background:var(--food)"></i>Food logged</span></div>
    </div>
    <div class="card center"><b>${esc(isMe(uidv) ? 'You' : person?.display_name)}</b> <span class="muted">worked out ${workoutDays} day${workoutDays === 1 ? '' : 's'} this month</span></div>
  </div>`;
  bindChips(renderCalendar);
  const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); state.calMonth = ymd(d).slice(0, 7); renderCalendar(); };
  $('#prev').onclick = () => shift(-1); $('#next').onclick = () => shift(1);
  $$('.cal .day').forEach(b => b.onclick = () => openDaySheet(uidv, b.dataset.d));
}

async function openDaySheet(userId, day) {
  const data = await loadRange(day, day, userId);
  const water = (await api.listWater({ from: day, to: day })).find(w => w.user_id === userId)?.glasses || 0;
  const person = byId(userId), mineView = isMe(userId);
  const canCopy = data.wos.length && !(mineView && day === today());
  const photos = await Promise.all(data.meals.map(m => api.photoUrl(m.photo_path)));
  openSheet(`
    <h3>${esc(mineView ? 'Your' : person.display_name + "'s")} ${esc(prettyDay(day).toLowerCase() === 'today' ? 'day today' : prettyDay(day))}</h3>
    <div class="row between" style="margin-bottom:8px"><b>Workouts</b>${canCopy ? `<button class="btn sm primary" id="copy-all">Copy all to my today</button>` : ''}</div>
    ${data.wos.length ? data.wos.map(w => workoutItem(w, mineView, !(mineView && day === today()))).join('') : '<div class="empty">No workouts</div>'}
    <hr><b>Walks & runs</b><div style="height:8px"></div>
    ${data.acts.length ? data.acts.map(a => activityItem(a, mineView)).join('') : '<div class="empty">No walks or runs</div>'}
    <hr><b>Food diary</b> <span class="muted small">· ${water} glasses of water</span><div style="height:8px"></div>
    ${data.meals.length ? data.meals.map((m, i) => mealItem(m, photos[i], mineView)).join('') : '<div class="empty">No meals logged</div>'}
  `, (sheet) => {
    const ca = $('#copy-all', sheet);
    if (ca) ca.onclick = async () => { await copyWorkouts(data.wos); closeSheet(); };
    $$('[data-copy]', sheet).forEach(b => b.onclick = async () => { await copyWorkouts([data.wos.find(w => w.id === b.dataset.copy)]); closeSheet(); });
    bindDeletes(sheet, () => { closeSheet(); render(); });
  });
}
async function copyWorkouts(list) {
  for (const w of list) {
    const { id, created_at, user_id, day, ...rest } = w;
    await api.insert('workouts', { ...rest, day: today(), calories: workoutCalories(rest.category, rest.duration_min) });
  }
  toast(`Copied ${list.length} workout${list.length === 1 ? '' : 's'} to today`);
  if (state.tab === 'track' || state.tab === 'today') render();
}
function workoutDetail(w) {
  const bits = [];
  if (w.weight) bits.push(`${fmt1(w.weight)} ${w.weight_unit || 'lb'}`);
  if (w.sets && w.reps) bits.push(`${w.sets} × ${w.reps}`); else if (w.sets) bits.push(`${w.sets} sets`); else if (w.reps) bits.push(`${w.reps} reps`);
  if (w.duration_min) bits.push(`${fmt1(w.duration_min)} min`);
  if (w.calories) bits.push(`~${w.calories} cal`);
  return bits.join(' · ');
}
function workoutItem(w, canDelete, canCopy) {
  return `<div class="item"><div class="grow"><span class="tag">${esc(w.category)}</span><div class="t">${esc(w.exercise)}</div>
    <div class="d">${esc(workoutDetail(w))}</div>${w.notes ? `<div class="d">${esc(w.notes)}</div>` : ''}
    ${canCopy ? `<button class="btn sm ghost" style="padding:6px 0" data-copy="${w.id}">${ic('copy', 14)} Copy to today</button>` : ''}</div>
    ${canDelete ? `<button class="x" data-del="workouts:${w.id}">${ic('x', 16)}</button>` : ''}</div>`;
}
function activityItem(a, canDelete) {
  const pace = a.distance_mi && a.duration_min ? paceStr(a.duration_min / a.distance_mi) + ' /mi' : null;
  return `<div class="item"><div class="grow"><span class="tag move">${a.source === 'phone' ? 'Phone steps · full day' : (a.kind === 'run' ? 'Run' : 'Walk') + (a.source === 'live' ? ' · tracked' : '')}</span>
    <div class="t">${a.steps ? fmtInt(a.steps) + ' steps' : ''}${a.steps && a.distance_mi ? ' · ' : ''}${a.distance_mi ? (+a.distance_mi < 10 ? (+a.distance_mi).toFixed(2) : fmt1(a.distance_mi)) + ' mi' : ''}</div>
    <div class="d">${[a.duration_min ? fmt1(a.duration_min) + ' min' : null, pace, a.calories ? '~' + a.calories + ' cal' : null].filter(Boolean).join(' · ')}</div>
    ${canDelete && a.source !== 'phone' ? `<button class="btn sm ghost" style="padding:6px 0" data-addto="${a.id}">${ic('plus', 14)} Add steps from watch / elsewhere</button>` : ''}</div>
    ${canDelete ? `<button class="x" data-del="activities:${a.id}">${ic('x', 16)}</button>` : ''}</div>`;
}
function mealItem(m, photo, canDelete) {
  return `<div class="item">${photo ? `<img class="thumb" src="${esc(photo)}" alt="" data-full="${esc(photo)}">` : ''}<div class="grow"><span class="tag food">${esc(m.meal_type)}</span>
    <div class="t">${esc(m.description)}</div>${m.calories ? `<div class="d">${m.calories} cal</div>` : ''}</div>
    ${canDelete ? `<button class="x" data-del="meals:${m.id}" data-photo="${esc(m.photo_path || '')}">${ic('x', 16)}</button>` : ''}</div>`;
}
function openAddTo(act, after) {
  openSheet(`<h3>Add to this ${act.kind}</h3>
    <p class="small" style="margin-top:0">Now: <b>${fmtInt(act.steps || 0)}</b> steps · ${fmt1(act.distance_mi || 0)} mi · ${fmt1(act.duration_min || 0)} min.<br>Enter what you did <b>extra</b> on your watch or another app. It gets added on top.</p>
    <div class="grid3">
      <label class="field"><span>+ Steps</span><input id="at-steps" type="number" inputmode="numeric" min="0"></label>
      <label class="field"><span>+ Miles</span><input id="at-mi" type="number" inputmode="decimal" step="0.01" min="0"></label>
      <label class="field"><span>+ Minutes</span><input id="at-min" type="number" inputmode="numeric" min="0"></label>
    </div>
    <div class="err" id="at-err"></div>
    <button class="btn primary block" id="at-save">Add to walk</button>`, (sh) => {
    $('#at-save', sh).onclick = async (e) => {
      const ds = num($('#at-steps', sh).value) || 0, dm = num($('#at-mi', sh).value) || 0, dt = num($('#at-min', sh).value) || 0;
      if (!ds && !dm && !dt) { $('#at-err', sh).textContent = 'Add steps, miles or minutes.'; return; }
      e.target.disabled = true;
      const patch = { steps: (act.steps || 0) + ds || null, distance_mi: +(((+act.distance_mi || 0) + dm).toFixed(2)) || null, duration_min: ((+act.duration_min || 0) + dt) || null };
      patch.calories = moveCalories({ kind: act.kind, ...patch });
      try { await api.update('activities', act.id, patch); closeSheet(); toast(`Added. Now ${fmtInt(patch.steps || 0)} steps`); after && after(); }
      catch (ex) { e.target.disabled = false; $('#at-err', sh).textContent = ex.message; }
    };
  });
}

function bindDeletes(root, after) {
  $$('[data-addto]', root).forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const id = b.dataset.addto;
    const act = (await api.list('activities', { userId: me.id })).find(a => a.id === id);
    if (act) openAddTo(act, after);
  });
  $$('[data-del]', root).forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirmDelete()) return;
    const [table, id] = b.dataset.del.split(':');
    await api.remove(table, id);
    if (b.dataset.photo) await api.removePhoto(b.dataset.photo);
    toast('Deleted'); after();
  });
  $$('[data-full]', root).forEach(img => img.onclick = () => window.open(img.dataset.full, '_blank'));
}
function confirmDelete() { return window.__skipConfirm || window.confirm('Delete this entry?'); }

// ============ TRACK ============
function renderTrack() {
  const main = $('#main');
  main.innerHTML = `<div class="screen">
    ${demoBanner()}
    <div class="topbar"><h1>Log</h1></div>
    <div class="seg"><button data-tm="move" class="${state.trackMode === 'move' ? 'on' : ''}">Walk / Run</button><button data-tm="workout" class="${state.trackMode === 'workout' ? 'on' : ''}">Workout</button></div>
    <div id="track-body"></div></div>`;
  $$('[data-tm]').forEach(b => b.onclick = () => { state.trackMode = b.dataset.tm; renderTrack(); });
  state.trackMode === 'move' ? renderMoveForm() : renderWorkoutForm();
}

function todayWalksCard(todays) {
  return `<div class="card"><h2>${tile('shoe', 'purple')} Today's walks & runs</h2>
      <p class="muted small" style="margin-top:0">Keep going on a walk, or add steps you did on your watch or another app.</p>
      <div id="today-acts">${todays.map(a => activityItem(a, true) + (a.source !== 'phone' ? `<button class="btn sm block" style="margin:-2px 0 10px" data-cont="${a.id}">${ic('play', 14)} Continue this ${a.kind}</button>` : '')).join('')}</div>
    </div>`;
}

async function renderMoveForm() {
  const t = today();
  const todays = (await api.list('activities', { userId: me.id, from: t, to: t }));
  $('#track-body').innerHTML = `
    <div class="card"><h2>${tile('nav', 'purple')} Live tracking</h2>
      <p class="muted small" style="margin-top:0">Tracks pace and miles with GPS and counts steps from your phone's motion sensor. Keep the app open with the screen on while you go.</p>
      <button class="btn green block" id="start-live">${ic('play', 16)} Start walk or run</button></div>
    ${todays.length ? todayWalksCard(todays) : ''}
    <div class="card"><h2>${tile('pencil', 'pink')} Enter manually</h2>
      <p class="muted small" style="margin-top:0">Copy your totals from Apple Health or Google Fit.</p>
      <form id="move-form">
        <div class="seg" id="kind-seg"><button type="button" data-k="walk" class="on">Walk</button><button type="button" data-k="run">Run</button></div>
        <label class="field"><span>Date</span><input type="date" name="day" value="${today()}" max="${today()}" required></label>
        <div class="grid3">
          <label class="field"><span>Steps</span><input name="steps" inputmode="numeric" type="number" min="0"></label>
          <label class="field"><span>Miles</span><input name="distance_mi" inputmode="decimal" type="number" step="0.01" min="0"></label>
          <label class="field"><span>Minutes</span><input name="duration_min" inputmode="numeric" type="number" min="0"></label>
        </div>
        <div class="err" id="move-err"></div>
        <button class="btn primary block">Save</button>
      </form></div>`;
  $('#today-acts') && bindDeletes($('#today-acts'), renderMoveForm);
  $$('[data-cont]').forEach(b => b.onclick = () => openLive({ continueAct: todays.find(a => a.id === b.dataset.cont) }));
  let kind = 'walk';
  $$('#kind-seg button').forEach(b => b.onclick = () => { $$('#kind-seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); kind = b.dataset.k; });
  $('#start-live').onclick = () => openLive();
  $('#move-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const row = { day: f.day, kind, source: 'manual', steps: num(f.steps), distance_mi: num(f.distance_mi), duration_min: num(f.duration_min) };
    if (!row.steps && !row.distance_mi) { $('#move-err').textContent = 'Add steps or miles.'; return; }
    row.calories = moveCalories(row);
    await api.insert('activities', row);
    toast('Saved! Nice work'); renderMoveForm();
  };
}

async function renderWorkoutForm() {
  const t = today();
  const [todays, yest] = await Promise.all([
    api.list('workouts', { userId: me.id, from: t, to: t }), api.list('workouts', { userId: me.id, from: addDays(t, -1), to: addDays(t, -1) })]);
  const cats = Object.keys(CATALOG);
  $('#track-body').innerHTML = `
    ${yest.length ? `<div class="card row between"><div><b>Same as yesterday?</b><div class="muted small">${yest.length} workout${yest.length === 1 ? '' : 's'}: ${esc(yest.map(w => w.exercise).slice(0, 3).join(', '))}${yest.length > 3 ? '…' : ''}</div></div><button class="btn sm primary" id="copy-yest">Copy</button></div>` : ''}
    <div class="card"><h2>${tile('dumbbell', 'pink')} Add a workout</h2>
      <form id="wo-form">
        <label class="field"><span>Date</span><input type="date" name="day" value="${t}" max="${t}" required></label>
        <label class="field"><span>Category</span><select name="category" id="wo-cat">${cats.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label class="field" id="ex-wrap"><span>Exercise</span><select name="exercise" id="wo-ex"></select></label>
        <label class="field" id="other-wrap" style="display:none"><span>What did you do?</span><input name="other" id="wo-other" maxlength="60" placeholder="Type the exercise"></label>
        <div class="grid2">
          <label class="field"><span>Weight <span class="opt">optional</span></span><input name="weight" type="number" step="0.5" min="0" inputmode="decimal"></label>
          <label class="field"><span>Unit</span><select name="weight_unit"><option>lb</option><option>kg</option></select></label>
        </div>
        <div class="grid3">
          <label class="field"><span>Sets <span class="opt">opt.</span></span><input name="sets" type="number" min="0" inputmode="numeric"></label>
          <label class="field"><span>Reps <span class="opt">opt.</span></span><input name="reps" type="number" min="0" inputmode="numeric"></label>
          <label class="field"><span>Minutes</span><input name="duration_min" type="number" min="0" inputmode="numeric"></label>
        </div>
        <label class="field"><span>Notes <span class="opt">optional</span></span><input name="notes" maxlength="120"></label>
        <div class="err" id="wo-err"></div>
        <button class="btn primary block">Add workout</button>
      </form></div>
    <div class="card"><h2>Today's workouts</h2><div id="today-wos">${todays.length ? todays.map(w => workoutItem(w, true, false)).join('') : '<div class="empty">Nothing logged yet today</div>'}</div></div>`;
  const cat = $('#wo-cat'), ex = $('#wo-ex');
  const syncEx = () => {
    const list = CATALOG[cat.value];
    ex.innerHTML = [...list, 'Other'].map(x => `<option>${esc(x)}</option>`).join('');
    $('#ex-wrap').style.display = list.length ? '' : 'none';
    syncOther();
  };
  const syncOther = () => { const show = !CATALOG[cat.value].length || ex.value === 'Other'; $('#other-wrap').style.display = show ? '' : 'none'; };
  cat.onchange = syncEx; ex.onchange = syncOther; syncEx();
  bindDeletes($('#today-wos'), renderWorkoutForm);
  if ($('#copy-yest')) $('#copy-yest').onclick = async () => { await copyWorkouts(yest); renderWorkoutForm(); };
  $('#wo-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const isOther = !CATALOG[f.category].length || f.exercise === 'Other';
    const exercise = isOther ? (f.other || '').trim() : f.exercise;
    if (!exercise) { $('#wo-err').textContent = 'Tell us what you did.'; return; }
    const row = { day: f.day, category: f.category, exercise, weight: num(f.weight), weight_unit: f.weight_unit, sets: num(f.sets), reps: num(f.reps), duration_min: num(f.duration_min), notes: f.notes.trim() || null };
    row.calories = workoutCalories(row.category, row.duration_min);
    await api.insert('workouts', row);
    toast('Workout added');
    const keepCat = f.category; await renderWorkoutForm(); $('#wo-cat').value = keepCat; $('#wo-cat').onchange();
  };
}

// ============ LIVE TRACKER ============
const paceStr = (minPerMile) => { if (!isFinite(minPerMile) || minPerMile <= 0 || minPerMile > 60) return '--:--'; const m = Math.floor(minPerMile), s = Math.round((minPerMile - m) * 60); return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}`; };
const clock = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
function haversine(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const SENS_KEY = 'squadfit-step-sensitivity-v3'; // v3: rhythm-checked counter on the raw motion sensor
function openCalibrate(done) {
  const rec = [];
  const mag = (v) => v && v.x != null ? Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) : null;
  const onM = (e) => { const r = mag(e.accelerationIncludingGravity), l = mag(e.acceleration); const m = r ?? l; if (m == null) return; rec.push([m, e.timeStamp || performance.now(), l]); };
  const stop = () => window.removeEventListener('devicemotion', onM);
  openSheet(`<h3>Calibrate your step counter</h3>
    <p class="small" style="margin-top:0">Hold or carry your phone the way you will on your walk (hand or pocket). Tap <b>Start</b>, walk <b>exactly 20 steps</b> counting in your head, then tap <b>Done</b>.</p>
    <div class="big center" id="cal-n" style="font-size:44px;font-weight:800;margin:10px 0">20 steps</div>
    <div class="err" id="cal-err"></div>
    <button class="btn green block" id="cal-go">${ic('play', 16)} Start</button>`, (sheet) => {
    let started = false;
    $('#cal-go', sheet).onclick = async () => {
      if (!started) {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') { try { await DeviceMotionEvent.requestPermission(); } catch { } }
        started = true; rec.length = 0; window.addEventListener('devicemotion', onM);
        $('#cal-n', sheet).textContent = 'Walking…'; $('#cal-go', sheet).innerHTML = `${ic('check', 16)} Done (I walked 20)`; return;
      }
      stop();
      if (rec.length < 30) { $('#cal-err', sheet).textContent = "The phone didn't send any motion. Check Motion access is allowed, then try again."; started = false; $('#cal-go', sheet).innerHTML = `${ic('play', 16)} Try again`; $('#cal-n', sheet).textContent = '20 steps'; return; }
      // Try a range of sensitivities on the recording and keep the one that counts closest to 20
      let best = null;
      for (let sv = 0.15; sv <= 4; sv *= 1.12) {
        const c = createStepCounter({ sensitivity: sv }); let n = 0;
        for (const [m, t] of rec) n = c.push(m, t);
        const err = Math.abs(n - 20);
        if (!best || err < best.err || (err === best.err && Math.abs(Math.log(sv / 0.6)) < Math.abs(Math.log(best.sv / 0.6)))) best = { sv, n, err };
      }
      // Share the recording so the counter can be tuned to real phones
      try { const t0 = rec[0][1]; await api.logMotion?.({ steps: 20, counted: best.n, sensitivity: best.sv, ua: navigator.userAgent, samples: rec.map(([m, t, l]) => [Math.round((t - t0)), +m.toFixed(2), l == null ? null : +l.toFixed(2)]) }); } catch (e) { console.warn(e); }
      if (best.n < 10) { $('#cal-err', sheet).textContent = `Only picked up ${best.n} steps. Try again holding the phone more firmly, or put it in your pocket.`; started = false; $('#cal-go', sheet).innerHTML = `${ic('play', 16)} Try again`; $('#cal-n', sheet).textContent = '20 steps'; return; }
      try { localStorage.setItem(SENS_KEY, String(best.sv)); } catch { }
      closeSheet(); toast(`Calibrated! Counted ${best.n} of 20`); done && done();
    };
  });
  const bd = $('.sheet-backdrop'); bd && bd.addEventListener('click', stop);
}
const savedSensitivity = () => { try { const v = +localStorage.getItem(SENS_KEY); return v > 0 ? v : 0.28; } catch { return 0.28; } };
// Stride length in miles, from height if we have it (walk ~0.414 x height, run ~0.65 x height)
const strideMiles = (kind) => {
  const h = privateStats?.height_in;
  const inches = h ? h * (kind === 'run' ? 0.65 : 0.414) : (kind === 'run' ? 39.6 : 30.2);
  return inches / 63360;
};

function openLive(opts = {}) {
  const L = { kind: 'walk', running: false, started: false, elapsed: 0, lastTick: 0, meters: 0, steps: 0, last: null, watch: null, timer: null, wake: null,
    counter: createStepCounter({ sensitivity: savedSensitivity() }), motionOk: false, motionWarned: false, motionN: 0,
    indoor: (() => { try { return localStorage.getItem('squadfit-indoor') === '1'; } catch { return false; } })() };
  const root = document.createElement('div'); root.className = 'live';
  root.innerHTML = `
    <div class="row between"><button class="btn ghost sm" id="l-close">${ic('x', 16)} Close</button><div class="seg" style="margin:0;width:170px" id="l-kind"><button data-k="walk" class="on">Walk</button><button data-k="run">Run</button></div></div>
    <div class="seg mini" id="l-where" style="margin:16px auto 0;width:max-content"><button data-w="out">Outdoors (GPS)</button><button data-w="in">Indoors</button></div>
    <div class="big" id="l-time">0:00</div><div class="center muted">duration</div>
    <div class="lstats">
      <div><span class="lic">${ic('pin', 18)}</span><b id="l-dist">0.00</b><span>miles</span></div>
      <div><span class="lic">${ic('zap', 18)}</span><b id="l-pace">--:--</b><span>pace /mi</span></div>
      <div><span class="lic">${ic('shoe', 18)}</span><b id="l-steps">0</b><span>steps</span></div>
      <div><span class="lic">${ic('flame', 18)}</span><b id="l-cal">0</b><span>calories</span></div>
    </div>
    <div class="status" id="l-status">Tap Start when you're ready. Keep this screen open.</div>
    <div class="sensor-row">
      <span class="small muted" id="l-sensor">${ic('activity', 13)} Step sensor: waiting</span>
      <button class="btn ghost sm" id="l-cal-btn" style="padding:4px 8px">${ic('target', 14)} Calibrate</button>
      <button class="btn ghost sm" id="l-add-btn" style="padding:4px 8px">${ic('plus', 14)} Add from watch</button>
    </div>
    <div class="controls" id="l-controls"><button class="btn green block" id="l-start" >${ic('play', 18)} Start</button></div>`;
  document.body.appendChild(root);
  const status = (s) => $('#l-status', root).textContent = s;
  // Continue a saved walk: start from its numbers and update the same entry when you finish
  if (opts.continueAct) {
    const c = opts.continueAct;
    Object.assign(L, { kind: c.kind || 'walk', steps: c.steps || 0, meters: (+c.distance_mi || 0) * 1609.34, elapsed: (+c.duration_min || 0) * 60000, contId: c.id, baseSteps: c.steps || 0, baseMi: +c.distance_mi || 0, baseMin: +c.duration_min || 0 });
    L.counter.steps = L.steps;
    $$('#l-kind button', root).forEach(x => x.classList.toggle('on', x.dataset.k === L.kind));
    setTimeout(() => { update(); status(`Continuing your ${L.kind}: ${fmtInt(L.steps)} steps so far. Tap Start to keep going.`); }, 0);
  }
  $$('#l-kind button', root).forEach(b => b.onclick = () => { $$('#l-kind button', root).forEach(x => x.classList.remove('on')); b.classList.add('on'); L.kind = b.dataset.k; update(); });
  const syncWhere = () => $$('#l-where button', root).forEach(x => x.classList.toggle('on', (x.dataset.w === 'in') === L.indoor));
  syncWhere();
  $$('#l-where button', root).forEach(b => b.onclick = () => {
    if (L.started) { toast('Pick indoors/outdoors before you start'); return; }
    L.indoor = b.dataset.w === 'in'; syncWhere();
    try { localStorage.setItem('squadfit-indoor', L.indoor ? '1' : '0'); } catch { }
    status(L.indoor ? 'Indoors: miles come from your steps (GPS off). Keep the phone in your pocket or hand, not on the treadmill.' : 'Outdoors: GPS tracks miles and pace.');
  });
  $('#l-add-btn', root).onclick = () => {
    if (L.running) { toast('Pause first, then add'); return; }
    openSheet(`<h3>Add steps from your watch or another app</h3>
      <p class="small" style="margin-top:0">These get added to this walk. Then keep tracking or tap Finish to save.</p>
      <div class="grid3">
        <label class="field"><span>+ Steps</span><input id="aw-steps" type="number" inputmode="numeric" min="0"></label>
        <label class="field"><span>+ Miles</span><input id="aw-mi" type="number" inputmode="decimal" step="0.01" min="0"></label>
        <label class="field"><span>+ Minutes</span><input id="aw-min" type="number" inputmode="numeric" min="0"></label>
      </div>
      <button class="btn primary block" id="aw-ok">Add</button>`, (sh) => {
      $('#aw-ok', sh).onclick = () => {
        const ds = num($('#aw-steps', sh).value) || 0, dm = num($('#aw-mi', sh).value) || 0, dt = num($('#aw-min', sh).value) || 0;
        L.extraSteps = (L.extraSteps || 0) + ds; L.steps += ds; L.counter.steps = L.steps;
        L.extraMi = (L.extraMi || 0) + dm; L.meters += dm * 1609.34; L.elapsed += dt * 60000;
        if (ds || dm || dt) L.started = true;
        closeSheet(); update(); controls(); toast('Added to this walk');
      };
    });
  };
  $('#l-cal-btn', root).onclick = () => { if (L.running) { toast('Pause first, then calibrate'); return; } openCalibrate(() => { L.counter = createStepCounter({ sensitivity: savedSensitivity() }); L.counter.steps = L.steps; }); };

  // Indoors: distance comes from steps. Outdoors: from GPS.
  const miles = () => L.indoor ? (L.steps - (L.extraSteps || 0) - (L.baseSteps || 0)) * strideMiles(L.kind) + (L.extraMi || 0) + (L.contId ? (L.baseMi || 0) : 0) : L.meters / 1609.34;
  const update = () => {
    const min = L.elapsed / 60000;
    $('#l-time', root).textContent = clock(L.elapsed);
    $('#l-dist', root).textContent = miles().toFixed(2);
    $('#l-pace', root).textContent = miles() > 0.02 ? paceStr(min / miles()) : '--:--';
    $('#l-steps', root).textContent = fmtInt(L.steps);
    $('#l-cal', root).textContent = fmtInt(moveCalories({ kind: L.kind, duration_min: min, distance_mi: miles(), steps: L.steps }));
  };
  const onPos = (p) => {
    const { latitude: lat, longitude: lon, accuracy } = p.coords;
    if (accuracy > 35) { status(`Waiting for a better GPS signal (±${Math.round(accuracy)}m)…`); return; }
    status('GPS locked. Go go go!');
    const pt = { lat, lon, t: p.timestamp };
    if (L.last) {
      const d = haversine(L.last, pt), dt = (pt.t - L.last.t) / 1000;
      if (d < 3) return;                       // ignore jitter
      if (dt > 0 && d / dt > 12) { L.last = pt; return; } // ignore impossible jumps
      L.meters += d;
    }
    L.last = pt; update();
  };
  const onMotion = (e) => {
    // Prefer motion without gravity; fall back to raw motion (the counter adapts either way)
    const lin = e.acceleration, raw = e.accelerationIncludingGravity;
    const a = (raw && raw.x != null) ? raw : lin;
    if (!a || a.x == null) return;
    if (!L.motionOk) { L.motionOk = true; $('#l-sensor', root).innerHTML = `${ic('check', 13)} Step sensor: working`; $('#l-sensor', root).style.color = 'var(--move)'; }
    const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    // Keep the first 3 minutes of motion so the counter can be tuned to real phones
    if (!L.rec) L.rec = [];
    if (L.rec.length < 10800) L.rec.push([Math.round(e.timeStamp || performance.now()), +m.toFixed(2)]);
    const before = L.counter.steps;
    L.steps = L.counter.push(m, e.timeStamp || performance.now());
    if (L.steps !== before) { $('#l-steps', root).textContent = fmtInt(L.steps); if (L.indoor) update(); }
  };
  const LIVE_KEY = 'squadfit-live-' + me.id;
  const persist = () => { try { localStorage.setItem(LIVE_KEY, JSON.stringify({ kind: L.kind, elapsed: L.elapsed, meters: L.meters, steps: L.steps, extraSteps: L.extraSteps || 0, extraMi: L.extraMi || 0, contId: L.contId || null, autoCreated: !!L.autoCreated, baseSteps: L.baseSteps || 0, baseMi: L.baseMi || 0, baseMin: L.baseMin || 0, indoor: L.indoor, segs: L.segs || [], at: Date.now(), day: today() })); } catch { } };
  const clearSaved = () => { try { localStorage.removeItem(LIVE_KEY); } catch { } };
  const tick = () => {
    const n = Date.now(); L.elapsed += n - L.lastTick; L.lastTick = n; update(); persist();
    // Auto-save every minute while walking, so the squad sees steps as they happen
    if (L.running && n - (L.lastAuto || n) >= 60000) { L.lastAuto = n; if ((L.steps || null) !== L.savedSteps) saveProgress().catch(() => {}); }
  };
  const onVis = async () => {
    if (!L.running) return;
    if (document.visibilityState === 'hidden') { L.hiddenAt = Date.now(); return; }
    if (L.hiddenAt && nativeHealth()) { L.hiddenAt = 0; if (await syncWalkFromPhone()) status('Welcome back! Steps caught up from your phone\'s step counter.'); }
    else if (L.hiddenAt) {
      const gone = Date.now() - L.hiddenAt; L.hiddenAt = 0; L.hiddenMs = (L.hiddenMs || 0) + gone;
      if (gone > 15000) status(`Steps paused for ${Math.round(gone / 60000) || '<1'} min while the screen was off. Keep the screen on for the best count. You can add the missing steps when you finish.`);
    }
    if (!L.wake) { try { L.wake = await navigator.wakeLock?.request('screen'); L.wake?.addEventListener?.('release', () => { L.wake = null; }); } catch { } }
  };
  document.addEventListener('visibilitychange', onVis);
  const resume = async () => {
    if (!L.started) {
      L.started = true;
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        let r = 'denied';
        try { r = await DeviceMotionEvent.requestPermission(); } catch { }
        if (r !== 'granted') { L.motionWarned = true; status('Step counting needs Motion access. Close and reopen the app, tap Start and choose Allow. Miles and time still count.'); }
      }
      // If the phone sends no motion at all, say so instead of silently showing 0 steps
      setTimeout(() => { if (L.running && !L.motionOk && !L.motionWarned) { L.motionWarned = true; $('#l-sensor', root).innerHTML = `${ic('x', 13)} Step sensor: not working`; $('#l-sensor', root).style.color = 'var(--danger)'; status('Your phone isn\'t sending motion to the app. iPhone: Settings > Apps > Safari > Motion & Orientation Access ON, then reopen the app.'); } }, 4000);
    }
    L.running = true; L.lastTick = Date.now(); L.lastAuto = Date.now();
    (L.segs = L.segs || []).push([Date.now(), null]);  // walking time windows (for the phone's step counter)
    if (nativeHealth()) status('Counting with your phone\'s step counter, so steps still count if you lock the screen or leave the app.');
    L.timer = setInterval(tick, 1000);
    window.addEventListener('devicemotion', onMotion);
    if (L.indoor) status('Indoors: counting steps. Miles are worked out from your steps.');
    else if ('geolocation' in navigator) {
      L.last = null;
      L.watch = navigator.geolocation.watchPosition(onPos, (err) => status(err.code === 1 ? 'Location is blocked. Allow location for this site to track miles.' : 'GPS unavailable right now. Steps and time still count.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    } else status('No GPS on this device. Steps and time still count.');
    try { L.wake = await navigator.wakeLock?.request('screen'); L.wake?.addEventListener?.('release', () => { L.wake = null; }); } catch { }
    controls();
  };
  const pause = () => {
    L.running = false; clearInterval(L.timer); tick();
    if (L.segs?.length && !L.segs[L.segs.length - 1][1]) L.segs[L.segs.length - 1][1] = Date.now();
    window.removeEventListener('devicemotion', onMotion);
    if (L.watch != null) navigator.geolocation.clearWatch(L.watch);
    L.wake?.release?.(); L.wake = null;
    status('Paused'); controls();
  };
  // Save the walk so far, so steps show everywhere (home, calendar, leaderboard) right away
  // Android app: ask the phone's own step counter (Health Connect) how many steps were taken during this walk.
  // This counts even while the screen was locked or the app was closed.
  const syncWalkFromPhone = async () => {
    const H = nativeHealth(); if (!H || !L.segs?.length) return false;
    try {
      let total = 0;
      for (const [a, b] of L.segs) {
        const end = b || Date.now(); if (end - a < 5000) continue;
        const { samples = [] } = await H.queryAggregated({ dataType: 'steps', startDate: new Date(a).toISOString(), endDate: new Date(end).toISOString(), bucket: 'hour', aggregation: 'sum' });
        total += samples.reduce((x, sm) => x + (sm.value || 0), 0);
      }
      total = Math.round(total);
      if (!total) return false;
      L.steps = (L.baseSteps || 0) + (L.extraSteps || 0) + total; L.counter.steps = L.steps; update();
      return true;
    } catch (e) { console.warn('walk steps from phone', e); return false; }
  };
  const rowNow = () => {
    const row = { kind: L.kind, steps: L.steps || null, distance_mi: +miles().toFixed(2) || null, duration_min: Math.round(L.elapsed / 600) / 100 || null };
    row.calories = moveCalories(row); return row;
  };
  const saveProgress = async () => {
    const row = rowNow();
    if (!row.steps && !row.distance_mi && (row.duration_min || 0) < 0.2) return false;
    if (L.contId) await api.update('activities', L.contId, row);
    else { const r = await api.insert('activities', { day: today(), source: 'live', ...row }); L.contId = r.id; L.autoCreated = true; }
    L.savedSteps = row.steps; persist(); return true;
  };
  // Send the motion recording with counted vs saved steps (helps tune the counter). Never blocks saving.
  const sendRecording = (savedSteps) => {
    if (!L.rec || L.rec.length < 120) return;
    const t0 = L.rec[0][0], sensorSteps = (L.steps || 0) - (L.extraSteps || 0) - (L.baseSteps || 0);
    try { api.logMotion?.({ type: 'walk', counted: sensorSteps, saved: (savedSteps || 0) - (L.baseSteps || 0) - (L.extraSteps || 0), indoor: !!L.indoor, kind: L.kind, sensitivity: savedSensitivity(), ua: navigator.userAgent, samples: L.rec.map(([t, m]) => [t - t0, m]) }); } catch { }
    L.rec = [];
  };
  const pauseAndSave = async () => {
    pause(); await syncWalkFromPhone(); sendRecording(L.steps);
    try { if (await saveProgress()) { status(`Paused and saved: ${fmtInt(L.steps)} steps. Tap Resume to keep going.`); toast('Saved'); } }
    catch (e) { status('Paused. Couldn\'t save (no connection?). Tap Finish & save when you\'re back online.'); }
  };
  const finish = async () => {
    if (L.running) pause();
    await syncWalkFromPhone();
    const duration_min = Math.round(L.elapsed / 600) / 100;
    const mi = +miles().toFixed(2);
    const est = !L.indoor && mi >= 0.05 ? Math.round(mi / strideMiles(L.kind)) : 0;
    if (!L.steps && !est && duration_min < 0.2) { toast('Nothing recorded yet'); return; }
    const suggested = L.steps || est;
    if (L.hiddenAt) { L.hiddenMs = (L.hiddenMs || 0) + (Date.now() - L.hiddenAt); L.hiddenAt = 0; }
    const activeMin = Math.max(0.1, (L.elapsed - (L.hiddenMs || 0)) / 60000), offMin = (L.hiddenMs || 0) / 60000;
    const cadence = Math.min(190, L.steps / activeMin); // steps per minute while counting
    const missing = offMin >= 0.5 && L.steps >= 30 ? Math.round(cadence * offMin) : 0;
    // Let them check the numbers before saving (e.g. against Apple Health / Google Fit)
    openSheet(`<h3>Save your ${L.kind}</h3>
      <p class="muted small" style="margin-top:0">Check your steps before saving. You can fix them if they look off.</p>
      <label class="field"><span>Steps <span class="opt">fix this if you counted your steps</span></span><input id="sv-steps" type="number" inputmode="numeric" min="0" value="${suggested || ''}"></label>
      ${missing ? `<div class="notice"><div>The screen was off for about <b>${Math.round(offMin)} min</b>, so steps weren't counted then. At your pace that's about <b>${fmtInt(missing)}</b> more. <button type="button" class="btn sm" id="sv-fill" style="margin-top:6px">Add ${fmtInt(missing)} steps</button></div></div>` : ''}
      ${est && L.steps && Math.abs(est - L.steps) / Math.max(est, 1) > 0.25 ? `<div class="notice"><div>Your phone counted <b>${fmtInt(L.steps)}</b> steps. Your ${mi} mi suggests about <b>${fmtInt(est)}</b>. <button type="button" class="btn sm" id="sv-est" style="margin-top:6px">Use ${fmtInt(est)}</button></div></div>` : ''}
      <label class="field"><span>Miles</span><input id="sv-mi" type="number" inputmode="decimal" step="0.01" min="0" value="${mi || ''}"></label>
      <div class="muted small" style="margin-bottom:12px">Time: ${clock(L.elapsed)}</div>
      <button class="btn primary block" id="sv-save">Save</button>`, (sheet) => {
      $('#sv-est', sheet) && ($('#sv-est', sheet).onclick = () => { $('#sv-steps', sheet).value = est; });
      $('#sv-fill', sheet) && ($('#sv-fill', sheet).onclick = (ev) => { $('#sv-steps', sheet).value = L.steps + missing; ev.target.disabled = true; ev.target.textContent = 'Added'; if (L.indoor) $('#sv-mi', sheet).value = +((L.steps + missing) * strideMiles(L.kind)).toFixed(2); });
      $('#sv-save', sheet).onclick = async (e) => {
        e.target.disabled = true;
        const row = { day: today(), kind: L.kind, source: 'live', steps: num($('#sv-steps', sheet).value), distance_mi: num($('#sv-mi', sheet).value), duration_min };
        row.calories = moveCalories(row);
        try { if (L.contId) { const { day, source, ...patch } = row; await api.update('activities', L.contId, patch); } else await api.insert('activities', row); } catch (ex) { e.target.disabled = false; throw ex; }
        sendRecording(row.steps);
        L.contId = null;
        clearSaved(); document.removeEventListener('visibilitychange', onVis);
        closeSheet(); root.remove(); toast('Saved! Great job'); render();
      };
    });
  };
  const restart = async () => {
    if (!window.__skipConfirm && !confirm('Start over? This clears the time, miles and steps you just tracked.')) return;
    if (L.running) pause();
    try {
      if (L.contId && L.autoCreated) await api.remove('activities', L.contId);                     // walk started in this session: remove it
      else if (L.contId) { const base = { steps: L.baseSteps || null, distance_mi: L.baseMi || null, duration_min: L.baseMin || null }; base.calories = moveCalories({ kind: L.kind, ...base }); await api.update('activities', L.contId, base); } // continued walk: back to how it was
    } catch (e) { console.warn(e); }
    Object.assign(L, { elapsed: 0, meters: 0, steps: 0, last: null, started: false, hiddenMs: 0, hiddenAt: 0, extraSteps: 0, extraMi: 0, contId: null, autoCreated: false, baseSteps: 0, baseMi: 0, baseMin: 0, segs: [] });
    L.counter = createStepCounter({ sensitivity: savedSensitivity() });
    clearSaved(); update(); controls(); status('Cleared. Tap Start when you\'re ready.');
  };
  const controls = () => {
    const c = $('#l-controls', root);
    c.innerHTML = L.running
      ? `<button class="btn block" id="l-pause" >${ic('pause', 18)} Pause & save</button><button class="btn primary block" id="l-finish" >${ic('stop', 18)} Finish & save</button>`
      : `<button class="btn green block" id="l-resume" >${ic('play', 18)} ${L.started ? 'Resume' : 'Start'}</button>${L.started ? `<button class="btn primary block" id="l-finish" >${ic('stop', 18)} Finish & save</button>` : ''}`;
    if (L.started) { c.insertAdjacentHTML('beforeend', `<button class="btn ghost sm restart" id="l-restart">${ic('activity', 14)} Start over</button>`); $('#l-restart', root).onclick = restart; }
    $('#l-pause', root) && ($('#l-pause', root).onclick = pauseAndSave);
    $('#l-resume', root) && ($('#l-resume', root).onclick = resume);
    $('#l-finish', root) && ($('#l-finish', root).onclick = finish);
  };
  // Recover a session that was cut off (app closed, phone restarted)
  try {
    const saved = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    if (!opts.continueAct && saved && saved.day === today() && Date.now() - saved.at < 6 * 3600e3 && saved.elapsed > 5000) {
      Object.assign(L, { kind: saved.kind, elapsed: saved.elapsed, meters: saved.meters, steps: saved.steps, started: true, extraSteps: saved.extraSteps || 0, extraMi: saved.extraMi || 0, contId: saved.contId || null, autoCreated: !!saved.autoCreated, baseSteps: saved.baseSteps || 0, baseMi: saved.baseMi || 0, baseMin: saved.baseMin || 0, indoor: !!saved.indoor, segs: saved.segs || [] });
      syncWhere();
      L.counter.steps = saved.steps || 0;
      $$('#l-kind button', root).forEach(x => x.classList.toggle('on', x.dataset.k === L.kind));
      update(); status('We saved your unfinished session. Resume or finish & save.');
    } else if (!opts.continueAct) clearSaved();
  } catch { }
  if (opts.continueAct) L.started = true;
  controls();
  $('#l-close', root).onclick = () => {
    const unsaved = L.started && L.elapsed > 5000 && (!L.contId || L.savedSteps !== (L.steps || null));
    if (unsaved && !window.__skipConfirm && !confirm('You have steps that aren\'t saved yet. Close without saving them?')) return;
    if (L.running) pause();
    clearSaved(); document.removeEventListener('visibilitychange', onVis);
    root.remove(); render();
  };
}

// ============ FOOD ============
async function renderFood() {
  const main = $('#main'), day = state.foodDay, uidv = state.viewUser, mineView = isMe(uidv);
  const [meals, waterRows] = await Promise.all([api.list('meals', { userId: uidv, from: day, to: day }), api.listWater({ from: day, to: day })]);
  const glasses = waterRows.find(w => w.user_id === uidv)?.glasses || 0;
  const photos = await Promise.all(meals.map(m => api.photoUrl(m.photo_path)));
  const totalCal = meals.reduce((s, m) => s + (m.calories || 0), 0);
  main.innerHTML = `<div class="screen">
    ${demoBanner()}
    <div class="topbar"><h1>Food diary</h1>${mineView ? '<button class="btn primary sm" id="add-meal">+ Add meal</button>' : ''}</div>
    ${peopleChips()}
    <div class="card row between">
      <button class="icon-btn" id="d-prev">${ic('chevL', 18)}</button>
      <div class="center"><b>${esc(prettyDay(day))}</b>${totalCal ? `<div class="muted small">${fmtInt(totalCal)} cal logged</div>` : ''}</div>
      <button class="icon-btn" id="d-next" ${day >= today() ? 'disabled' : ''}>${ic('chevR', 18)}</button>
    </div>
    <div class="card"><h2>${tile('droplet', 'blue')} Water <span class="muted small" style="font-weight:400">${glasses} of 8 glasses</span></h2>
      <div class="water">${Array.from({ length: Math.max(8, glasses) }, (_, i) => `<button ${mineView ? '' : 'disabled'} data-g="${i + 1}" class="${i < glasses ? 'on' : ''}">${ic('droplet', 18)}</button>`).join('')}
      ${mineView ? `<button data-g="${glasses + 1}" title="Add">${ic('plus', 16)}</button>` : ''}</div>
      ${mineView ? '<div class="muted small" style="margin-top:8px">Tap a glass to set your count.</div>' : ''}
    </div>
    ${MEALS.map(type => { const list = meals.map((m, i) => [m, photos[i]]).filter(([m]) => m.meal_type === type);
      return `<div class="card"><h2>${type}</h2>${list.length ? list.map(([m, p]) => mealItem(m, p, mineView)).join('') : `<div class="empty">${mineView ? 'Nothing yet' : 'Nothing logged'}</div>`}</div>`; }).join('')}
  </div>`;
  bindChips(renderFood);
  $('#d-prev').onclick = () => { state.foodDay = addDays(day, -1); renderFood(); };
  $('#d-next').onclick = () => { if (day < today()) { state.foodDay = addDays(day, 1); renderFood(); } };
  if (mineView) {
    $('#add-meal').onclick = () => openMealSheet(day);
    $$('.water [data-g]').forEach(b => b.onclick = async () => { let g = +b.dataset.g; if (g === glasses && b.classList.contains('on')) g--; await api.setWater(day, g); renderFood(); });
  }
  bindDeletes(main, renderFood);
}
function guessMeal() { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack'; }
async function resizeImage(file, max = 1000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.75));
  } finally { URL.revokeObjectURL(url); }
}
function openMealSheet(day) {
  const g = guessMeal();
  openSheet(`<h3>Add a meal · ${esc(prettyDay(day))}</h3>
    <form id="meal-form">
      <label class="field"><span>Meal</span><select name="meal_type">${MEALS.map(m => `<option ${m === g ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field"><span>What did you eat?</span><textarea name="description" required maxlength="200" placeholder="e.g. Ackee and saltfish with 2 boiled dumplings"></textarea></label>
      <label class="field"><span>Calories <span class="opt">optional</span></span><input name="calories" type="number" min="0" inputmode="numeric"></label>
      <label class="field"><span>Photo of your meal <span class="opt">optional</span></span>
        <div class="photo-drop" id="photo-drop">${ic('camera', 26)}<b>Add a photo</b><small>Take one or choose from your gallery</small>
          <img id="meal-preview" alt=""><button type="button" class="photo-x" id="photo-x" aria-label="Remove photo">${ic('x', 16)}</button></div>
        <input name="photo" type="file" accept="image/*" hidden></label>
      <div class="err" id="meal-err"></div>
      <button class="btn primary block">Save meal</button>
    </form>`, (sheet) => {
    const fileIn = $('input[type=file]', sheet);
    const drop = $('#photo-drop', sheet), pv = $('#meal-preview', sheet);
    drop.onclick = (e) => { if (!e.target.closest('#photo-x')) fileIn.click(); };
    fileIn.onchange = () => { const f = fileIn.files[0]; if (f) { pv.src = URL.createObjectURL(f); drop.classList.add('has'); } };
    $('#photo-x', sheet).onclick = (e) => { e.preventDefault(); e.stopPropagation(); fileIn.value = ''; pv.removeAttribute('src'); drop.classList.remove('has'); };
    $('#meal-form', sheet).onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const f = new FormData(e.target);
        let photo_path = null;
        const file = fileIn.files[0];
        if (file) {
          let blob;
          try { blob = await resizeImage(file); } catch { throw new Error("Couldn't read that photo. Try a different one or save without it."); }
          if (!blob) throw new Error("Couldn't read that photo. Try a different one or save without it.");
          photo_path = await api.uploadPhoto(blob);
        }
        await api.insert('meals', { day, meal_type: f.get('meal_type'), description: f.get('description').trim(), calories: num(f.get('calories')), photo_path });
        closeSheet(); toast('Meal logged'); renderFood();
      } catch (ex) { $('#meal-err', sheet).textContent = ex.message; btn.disabled = false; btn.textContent = 'Save meal'; }
    };
  });
}

// ============ ME ============
function renderMe() {
  const main = $('#main'), ps = privateStats || {};
  const g = goals[me.id];
  const lost = ps.start_weight_lb && ps.weight_lb ? ps.start_weight_lb - ps.weight_lb : null;
  main.innerHTML = `<div class="screen">
    ${demoBanner()}
    <div class="topbar"><h1>Me</h1></div>
    <div class="card"><div class="row">${avatar(me)}<div><div style="font-weight:700;font-size:18px">${esc(me.display_name)}</div></div></div></div>
    <div class="card"><h2>Profile <span class="muted small" style="font-weight:400">visible to the squad</span></h2>
      <form id="prof-form">
        <label class="field"><span>Name</span><input name="display_name" value="${esc(me.display_name)}" required maxlength="24"></label>
        <label class="field"><span>Color</span><div class="colors">${COLORS.map(c => `<button type="button" data-c="${c}" class="${c === me.color ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>
        <button class="btn block">Save profile</button>
      </form></div>
    ${phoneStepsCard()}
    <div class="card"><h2>${tile('lock', 'purple')} Private stats</h2>
      <div class="notice lock"><div>Only you can see this section. Friends only ever see your weight goal progress as a %.</div></div>
      ${g != null ? `<div style="margin-bottom:14px"><div class="row between"><b>Goal progress</b><b>${g}%</b></div><div class="bar"><i style="width:${g}%"></i></div>${lost != null ? `<div class="muted small" style="margin-top:6px">${lost >= 0 ? fmt1(lost) + ' lb lost' : fmt1(-lost) + ' lb gained'} · ${fmt1(Math.max(0, ps.weight_lb - ps.goal_weight_lb))} lb to go</div>` : ''}</div>` : ''}
      <button class="btn block" id="edit-private">Edit height, weight, age & goal</button>
      <button class="btn primary block" id="open-plan" style="margin-top:10px">${ic('clipboard', 16)} My plan & meal plan</button>
    </div>
    <div class="card">
      <button class="btn block" id="change-pic">${ic('camera', 16)} Change profile picture</button>
      ${me.avatar_url ? `<button class="btn ghost block" id="reset-pic">Use my original picture</button>` : ''}
      ${me.is_admin ? `<button class="btn block" id="admin-reset">${ic('users', 16)} Reset someone's PIN</button>` : ''}
      <button class="btn block" id="change-pin">${ic('lock', 16)} Change PIN</button>
      <button class="btn block danger" id="logout" style="margin-top:6px">${ic('logout', 16)} Log out</button>
      ${DEMO ? '<button class="btn block ghost" id="reset-demo">Reset test data</button>' : ''}
    </div>
  </div>`;
  let color = me.color;
  $$('#prof-form .colors button').forEach(b => b.onclick = () => { $$('#prof-form .colors button').forEach(x => x.classList.remove('on')); b.classList.add('on'); color = b.dataset.c; });
  $('#prof-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const name = f.display_name.trim().replace(/\s+/g, ' ');
    if (slugName(name).length < 2) { toast('Please use at least 2 letters'); return; }
    const squadSlugs = (CFG.squadNames || ['Jill', 'Rush', 'Toni', 'Tiffy']).map(slugName).filter(x => x !== me.username);
    if (squadSlugs.includes(slugName(name)) || profiles.some(p => p.id !== me.id && (slugName(p.display_name) === slugName(name) || p.username === slugName(name)))) { toast(`${name} belongs to someone else in the squad`); return; }
    await api.updateProfile({ display_name: name, color });
    me = await api.me(); profiles = await api.listProfiles(); toast('Profile saved'); renderMe();
  };
  $('#edit-private').onclick = () => openPrivateSheet(false);
  $('#open-plan').onclick = openPlanSheet;
  $('#change-pin').onclick = openPinSheet;
  $('#change-pic').onclick = openPicUpload;
  $('#reset-pic') && ($('#reset-pic').onclick = async () => { await api.updateProfile({ avatar_url: null }); me = await api.me(); profiles = await api.listProfiles(); toast('Back to your original picture'); renderMe(); });
  $('#admin-reset') && ($('#admin-reset').onclick = openAdminReset);
  $('#hc-sync') && ($('#hc-sync').onclick = async () => { await syncHealthConnect(true); renderMe(); });
  $('#hc-settings') && ($('#hc-settings').onclick = () => nativeHealth()?.openHealthConnectSettings?.().catch(() => toast('Open Health Connect from your phone settings')));
  $('#clear-walks') && ($('#clear-walks').onclick = () => openSheet(`<h3>Clear my data</h3>
    <p class="small" style="margin-top:0">Choose what to delete. Only your own data is affected.</p>
    ${[['activities', 'Walks & runs (steps, miles)'], ['workouts', 'Workouts'], ['meals', 'Food diary & water'], ['private', 'Private details (height, weight, age, goal)']].map(([k, l]) =>
      `<label class="row" style="padding:10px 0;border-bottom:1px solid var(--line);gap:12px"><input type="checkbox" data-clr="${k}" style="width:22px;height:22px;accent-color:#ff2fa6"><span>${l}</span></label>`).join('')}
    <div class="row" style="gap:8px;margin:14px 0"><span class="small muted">From:</span>
      <select id="clr-when" style="flex:1"><option value="today">Today only</option><option value="all">All time</option></select></div>
    <div class="err" id="clr-err"></div>
    <button class="btn block" id="clr-next" style="background:var(--danger);color:#fff">Continue</button>
    <button class="btn ghost block" id="clr-no">Cancel</button>`, (sh) => {
    $('#clr-no', sh).onclick = closeSheet;
    $('#clr-next', sh).onclick = async () => {
      const picks = $$('[data-clr]', sh).filter(x => x.checked).map(x => x.dataset.clr);
      if (!picks.length) { $('#clr-err', sh).textContent = 'Tick at least one thing to clear.'; return; }
      const when = $('#clr-when', sh).value, rng = when === 'today' ? { from: today(), to: today() } : {};
      const found = {};
      for (const t of picks.filter(p => p !== 'private')) found[t] = await api.list(t, { userId: me.id, ...rng });
      const water = picks.includes('meals') ? (await api.listWater(when === 'today' ? rng : { from: '2000-01-01', to: '2100-01-01' })).filter(w => w.user_id === me.id && w.glasses) : [];
      const lines = [];
      if (found.activities) lines.push(`Walks & runs: ${found.activities.length}`);
      if (found.workouts) lines.push(`Workouts: ${found.workouts.length}`);
      if (found.meals) lines.push(`Meals: ${found.meals.length}, plus water for ${water.length} day${water.length === 1 ? '' : 's'}`);
      if (picks.includes('private')) lines.push('your private details and weight goal');
      // Step 2: confirm exactly what will go
      openSheet(`<h3>Are you sure?</h3>
        <p class="small" style="margin-top:0">You're about to permanently delete${when === 'today' ? ' from <b>today</b>' : ' from <b>all time</b>'}:</p>
        <ul class="small" style="line-height:1.7">${lines.map(l => `<li><b>${esc(l)}</b></li>`).join('')}</ul>
        <p class="small" style="color:var(--danger)">This can't be undone.</p>
        <div class="err" id="clr2-err"></div>
        <button class="btn block" id="clr-yes" style="background:var(--danger);color:#fff">Yes, delete it</button>
        <button class="btn ghost block" id="clr-back">No, keep my data</button>`, (sh2) => {
        $('#clr-back', sh2).onclick = closeSheet;
        $('#clr-yes', sh2).onclick = async (e) => {
          e.target.disabled = true; e.target.textContent = 'Deleting…';
          try {
            for (const [t, rows] of Object.entries(found)) for (const r of rows) { if (r.photo_path) await api.removePhoto(r.photo_path); await api.remove(t, r.id); }
            for (const w of water) await api.setWater(w.day, 0);
            if (picks.includes('private')) { await api.clearPrivate(); privateStats = null; await refreshGoals(); }
            closeSheet(); toast('Cleared'); render();
          } catch (ex) { $('#clr2-err', sh2).textContent = ex.message; e.target.disabled = false; e.target.textContent = 'Yes, delete it'; }
        };
      });
    };
  }));

  $('#logout').onclick = async () => { await api.signOut(); me = null; renderAuth(); };
  if ($('#reset-demo')) $('#reset-demo').onclick = () => { localStorage.removeItem('squadfit-demo-v4'); location.reload(); };
}
function phoneStepsCard() {
  const isAndroid = /android/i.test(navigator.userAgent), isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (nativeHealth()) {
    let last = 0; try { last = +localStorage.getItem('squadfit-health-last') || 0; } catch { }
    return `<div class="card"><h2>${tile('shoe', 'green')} Phone steps</h2>
      <p class="small" style="margin-top:0">Your all-day steps come from <b>Health Connect</b> (the same count as Samsung Health or Google Fit), even when the app is closed or your phone is in your bag. They sync each time you open the app.</p>
      <div class="muted small" style="margin-bottom:10px">${last ? 'Last synced ' + new Date(last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not synced yet'}</div>
      <button class="btn primary block" id="hc-sync">${ic('activity', 16)} Sync steps now</button>
      <button class="btn ghost block" id="hc-settings">Health Connect settings</button>
      <p class="muted small">No steps showing? In Samsung Health: Settings > Health Connect > allow sharing Steps. Or install Google Fit and connect it to Health Connect.</p></div>`;
  }
  if (isAndroid && CFG.androidAppUrl) return `<div class="card"><h2>${tile('shoe', 'green')} Get accurate all-day steps</h2>
      <p class="small" style="margin-top:0">Install the SquadFit Android app to count steps automatically, even with the screen off or the phone in your bag.</p>
      <a class="btn primary block" href="${esc(CFG.androidAppUrl)}" style="text-decoration:none">Download the Android app</a></div>`;
  if (isIOS) return `<div class="card"><h2>${tile('shoe', 'green')} Get accurate all-day steps</h2>
      <p class="small" style="margin-top:0">Set up the free <b>SquadFit Steps</b> iPhone Shortcut to send your Apple Health step count here automatically. Ask Rush for the 5-minute setup steps.</p></div>`;
  return '';
}

function openPicUpload() {
  openSheet(`<h3>Change profile picture</h3>
    <p class="small" style="margin-top:0">This shows on your home screen, your login tile and next to your name for the squad.</p>
    <div class="photo-drop" id="pp-drop">${ic('camera', 26)}<b>Choose a photo</b><small>Take one or pick from your gallery</small><img id="pp-prev" alt=""></div>
    <input type="file" id="pp-file" accept="image/*" hidden>
    <div class="err" id="pp-err"></div>
    <button class="btn primary block" id="pp-save" disabled>Save picture</button>`, (sh) => {
    const fileIn = $('#pp-file', sh), drop = $('#pp-drop', sh);
    drop.onclick = () => fileIn.click();
    fileIn.onchange = () => { const f = fileIn.files[0]; if (f) { $('#pp-prev', sh).src = URL.createObjectURL(f); drop.classList.add('has'); $('#pp-save', sh).disabled = false; } };
    $('#pp-save', sh).onclick = async (e) => {
      const f = fileIn.files[0]; if (!f) return;
      e.target.disabled = true; e.target.textContent = 'Saving…';
      try {
        const url = await api.uploadAvatar(await resizeImage(f, 900));
        await api.updateProfile({ avatar_url: url });
        me = await api.me(); profiles = await api.listProfiles();
        closeSheet(); toast('Picture updated'); render();
      } catch (ex) { $('#pp-err', sh).textContent = ex.message; e.target.disabled = false; e.target.textContent = 'Save picture'; }
    };
  });
}

function openAdminReset() {
  const others = profiles.filter(p => p.id !== me.id);
  openSheet(`<h3>Reset someone's PIN</h3>
    <p class="small" style="margin-top:0">Give them a temporary PIN. They log in with it, then change it in Me > Change PIN.</p>
    <label class="field"><span>Who?</span><select id="ar-who">${others.map(p => `<option value="${esc(p.username)}">${esc(p.display_name)}</option>`).join('')}</select></label>
    <label class="field"><span>Temporary PIN</span>${pinField('ar-pin')}</label>
    <div class="err" id="ar-err"></div>
    <button class="btn primary block" id="ar-save">Reset PIN</button>`, (sh) => {
    $('#ar-save', sh).onclick = async (e) => {
      const who = $('#ar-who', sh).value, pin = cleanPin($('[name=ar-pin]', sh).value), name = $('#ar-who', sh).selectedOptions[0]?.textContent;
      if (pin.length !== 4) { $('#ar-err', sh).textContent = 'The PIN must be 4 numbers.'; return; }
      e.target.disabled = true;
      try { await api.adminResetPin(who, pin); closeSheet(); toast(`${name}'s PIN is now ${pin}`); }
      catch (ex) { $('#ar-err', sh).textContent = ex.message; e.target.disabled = false; }
    };
  });
}

function openPinSheet() {
  openSheet(`<h3>Change PIN</h3>
    <form id="pin-form" autocomplete="off">
      <label class="field"><span>Current PIN</span>${pinField('old')}</label>
      <div class="grid2">
        <label class="field"><span>New PIN</span>${pinField('pin')}</label>
        <label class="field"><span>Confirm new PIN</span>${pinField('pin2')}</label>
      </div>
      <div class="err" id="pin-err"></div>
      <button class="btn primary block">Save new PIN</button>
    </form>`, (sheet) => {
    $('#pin-form', sheet).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const err = $('#pin-err', sheet); err.textContent = '';
      f.old = cleanPin(f.old); f.pin = cleanPin(f.pin); f.pin2 = cleanPin(f.pin2);
      if (f.pin.length !== 4) { err.textContent = 'Your new PIN must be exactly 4 numbers.'; return; }
      if (f.pin !== f.pin2) { err.textContent = "New PINs don't match."; return; }
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try { await api.changePin(f.old, f.pin); closeSheet(); toast('PIN changed'); }
      catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    };
  });
}
async function openPlanSheet() {
  const t = today(), from = addDays(t, -13);
  const data = await loadRange(from, t, me.id);
  const mins = [...data.acts, ...data.wos].reduce((s, r) => s + (+r.duration_min || 0), 0) / 14;
  const p = buildPlan(privateStats, mins);
  const lock = `<div class="notice lock"><div>Only you can see your plan. It's worked out on your phone from your private stats and never shared.</div></div>`;
  if (p.missing) {
    openSheet(`<h3>My plan</h3>${lock}<p>To build your plan, add your <b>${p.missing.join(', ')}</b>.</p><button class="btn primary block" id="plan-edit">Add my details</button>`,
      (s) => $('#plan-edit', s).onclick = () => openPrivateSheet(false));
    return;
  }
  if (p.reached) {
    openSheet(`<h3>My plan</h3>${lock}<p>You've reached your goal weight! To maintain, aim for about <b>${fmtInt(p.tdee)} calories a day</b>. Set a new goal any time.</p>`);
    return;
  }
  let dayIdx = 0;
  const dayHtml = () => { const d = p.days[dayIdx];
    return d.meals.map(m => `<div class="item"><div class="grow"><span class="tag food">${m.type}</span><div class="t" style="font-weight:500">${esc(m.text)}</div></div><div class="muted small" style="white-space:nowrap">~${m.cal}</div></div>`).join('')
      + `<div class="row between small muted" style="padding:4px 2px"><span>Day total</span><b>~${fmtInt(d.total)} cal</b></div>`; };
  openSheet(`<h3>My plan</h3>${lock}
    ${p.goalTooLow ? `<div class="notice" style="background:#3b2a12;border-color:#7c5a1c;color:#fde68a"><div>Heads up: your goal is below the healthy range for your height (about ${p.minHealthy} lb or more). Consider adjusting it.</div></div>` : ''}
    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><b>${fmtInt(p.target)}</b><span>calories / day</span></div>
      <div class="stat"><b>${p.rate} lb</b><span>per week</span></div>
      <div class="stat"><b>${p.weeks} wks</b><span>to lose ${p.toLose} lb</span></div>
    </div>
    ${p.timelineNote ? `<div class="notice" style="background:#3a2c12;border-color:#7c5a1c;color:#ffe3a3"><div>${esc(p.timelineNote)}</div></div>` : ''}
    <p class="small" style="margin-top:0">At this pace you could reach your goal around <b>${p.goalDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b>. Based on your stats and your logged activity (${esc(p.activityLabel)}). Your body burns about ${fmtInt(p.tdee)} cal a day.${p.hitFloor ? ' Your target is set at the safe minimum, so moving more will speed things up more than eating less.' : ''}</p>
    <hr><b>7-day Jamaican meal plan</b>
    <div class="seg" id="plan-days" style="margin-top:10px">${p.days.map((_, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
    <div id="plan-day">${dayHtml()}</div>
    <hr><b>Simple swaps</b><ul class="small" style="padding-left:18px;line-height:1.5">${TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="muted small">Calories and dates are estimates. Most people see faster drops in the first weeks, then a steadier pace. If you have a health condition, are pregnant or take medication, check with your doctor before changing your diet.</p>`,
    (s) => $$('#plan-days button', s).forEach(b => b.onclick = () => { dayIdx = +b.dataset.i; $$('#plan-days button', s).forEach(x => x.classList.toggle('on', x === b)); $('#plan-day', s).innerHTML = dayHtml(); }));
}
function openPrivateSheet(isOnboarding) {
  const ps = privateStats || {};
  const ft = ps.height_in ? Math.floor(ps.height_in / 12) : '', inch = ps.height_in ? Math.round(ps.height_in % 12) : '';
  openSheet(`<h3>${isOnboarding ? 'Step 2 of 2 · Your private details' : 'Private stats'}</h3>
    <div class="notice lock"><div><b>Only you can see these.</b> Everything here is optional. Your weight is used to estimate calories burned. Friends see your goal progress as a % only, never your actual numbers.</div></div>
    <form id="priv-form">
      <div class="grid2">
        <label class="field"><span>Height (ft)</span><input name="ft" type="number" min="3" max="8" inputmode="numeric" value="${ft}"></label>
        <label class="field"><span>Height (in)</span><input name="in" type="number" min="0" max="11" inputmode="numeric" value="${inch}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Current weight (lb)</span><input name="weight_lb" type="number" step="0.1" min="50" inputmode="decimal" value="${ps.weight_lb ?? ''}"></label>
        <label class="field"><span>Age</span><input name="age" type="number" min="13" max="110" inputmode="numeric" value="${ps.age ?? ''}"></label>
      </div>
      <label class="field"><span>Gender</span><select name="gender">${['', 'Female', 'Male', 'Non-binary', 'Prefer not to say'].map(x => `<option value="${x}" ${x === (ps.gender || '') ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select></label>
      <hr><b>Weight loss goal</b><div style="height:8px"></div>
      <div class="grid2">
        <label class="field"><span>Starting weight (lb)</span><input name="start_weight_lb" type="number" step="0.1" min="50" inputmode="decimal" value="${ps.start_weight_lb ?? ''}" placeholder="Same as current"></label>
        <label class="field"><span>Goal weight (lb)</span><input name="goal_weight_lb" type="number" step="0.1" min="50" inputmode="decimal" value="${ps.goal_weight_lb ?? ''}"></label>
      </div>
      <label class="field"><span>How long to reach your goal?</span><select name="goal_months">${[['', 'No deadline'], ['1', '1 month'], ['2', '2 months'], ['3', '3 months'], ['4', '4 months'], ['6', '6 months'], ['9', '9 months'], ['12', '1 year'], ['18', '18 months']].map(([v, l]) => `<option value="${v}" ${String(ps.goal_months ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="muted small" style="margin-top:0">Update your current weight whenever you weigh in and your % updates.</p>
      <div class="err" id="priv-err"></div>
      <button class="btn primary block">${isOnboarding ? 'Finish' : 'Save'}</button>
      ${isOnboarding ? '<button type="button" class="btn ghost block" id="priv-skip">Skip for now</button>' : ''}
    </form>`, (sheet) => {
    $('#priv-skip', sheet) && ($('#priv-skip', sheet).onclick = closeSheet);
    $('#priv-form', sheet).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const ftv = num(f.ft), inv = num(f.in);
      const obj = {
        height_in: ftv != null ? ftv * 12 + (inv || 0) : null,
        weight_lb: num(f.weight_lb), age: num(f.age), gender: f.gender || null,
        goal_weight_lb: num(f.goal_weight_lb), goal_months: num(f.goal_months),
        start_weight_lb: num(f.start_weight_lb) ?? (num(f.goal_weight_lb) ? num(f.weight_lb) : null)
      };
      if (obj.goal_weight_lb && !obj.weight_lb) { $('#priv-err', sheet).textContent = 'Add your current weight to track a goal.'; return; }
      if (obj.goal_weight_lb && obj.start_weight_lb && obj.goal_weight_lb >= obj.start_weight_lb) { $('#priv-err', sheet).textContent = 'Goal weight should be below your starting weight.'; return; }
      await api.savePrivate(obj);
      privateStats = await api.getPrivate(); await refreshGoals();
      closeSheet(); toast('Saved privately'); render();
    };
  });
}

// Safety net: never fail silently (e.g. no signal while saving)
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  const msg = String(e.reason?.message || e.reason || '');
  toast(/fetch|network|load failed|offline/i.test(msg) || !navigator.onLine ? 'No connection. Check your signal and try again.' : 'Something went wrong. Please try again.');
});
window.addEventListener('offline', () => toast('You are offline. Changes won\'t save until you reconnect.'));

boot();
