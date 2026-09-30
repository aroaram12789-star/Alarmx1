const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRE = { once: [], daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
const REP_NAME = { once: 'Once', daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', custom: 'Custom' };

let alarms = [], newId = null;
let rep = 'once', cdays = [], ap = 'AM';
let S = { h24: false, sec: false, defRep: 'once' }; // settings
try { Object.assign(S, JSON.parse(localStorage.getItem('alarmx.settings') || '{}')); } catch (e) {}
const saveS = () => { try { localStorage.setItem('alarmx.settings', JSON.stringify(S)); } catch (e) {} };

/* ---------- Loading screen ---------- */
const steps = [[0, 'INITIALIZING'], [20, 'LOADING ENGINE'], [45, 'PREPARING ALARMS'], [70, 'SYNCING TIME'], [90, 'ALMOST READY'], [100, 'READY']];
let p = 0;
const iv = setInterval(() => {
  p = Math.min(100, p + (1 + Math.random() * 2 | 0));
  $('bar').style.width = p + '%';
  $('pct').textContent = p + '%';
  $('status').textContent = steps.filter(s => p >= s[0]).pop()[1];
  if (p >= 100) {
    clearInterval(iv);
    setTimeout(() => {
      $('splash').classList.add('fade');
      $('app').classList.remove('pre');
      setTimeout(() => $('splash').remove(), 700);
    }, 500);
  }
}, 35);

/* ---------- Time helpers ---------- */
const fmt = t => { const h = Math.floor(t / 60), m = pad(t % 60); return S.h24 ? [pad(h) + ':' + m, ''] : [pad(h % 12 || 12) + ':' + m, h >= 12 ? 'PM' : 'AM']; }; // [time, suffix]
const daysOf = a => a.rep === 'custom' ? a.days : PRE[a.rep];
const repText = a => a.rep === 'custom' ? (a.days.length ? [...a.days].sort().map(d => DN[d]).join(', ') : 'Custom') : REP_NAME[a.rep];

// Next moment this alarm rings (respects Repeat days). "Once" = the next time the clock hits that time.
function nextTs(a, now) {
  const days = daysOf(a);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, Math.floor(a.t / 60), a.t % 60, 0, 0);
    if (d <= now) continue;
    if (!days.length || days.includes(d.getDay())) return d;
  }
  return null;
}

/* ---------- Home screen ---------- */
function renderNext() {
  const now = new Date();
  let best = null, ba = null;
  alarms.forEach(a => {
    if (!a.on) return;
    const d = nextTs(a, now);
    if (d && (!best || d < best)) { best = d; ba = a; }
  });
  $('nextTime').textContent = ba ? fmt(ba.t).join(' ').trim() : '--:--';
  $('nextLabel').textContent = ba ? ba.label : 'No active alarms';
  if (!ba) { $('nextDay').textContent = ''; return; }
  const diff = Math.round((new Date(best.getFullYear(), best.getMonth(), best.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  $('nextDay').textContent = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : DN[best.getDay()];
}

function render() {
  $('count').textContent = alarms.length;
  $('empty').hidden = alarms.length > 0;
  $('list').innerHTML = alarms.map(a => {
    const [tm, pm] = fmt(a.t);
    return `<div class="card${a.on ? '' : ' off'}${a.id === newId ? ' in' : ''}">
      <div><b class="t">${tm}<small>${pm}</small></b><span>${a.label}</span><em>${repText(a)}</em></div>
      <div class="r">
        <button class="del" data-del="${a.id}">Delete</button>
        <button class="sw${a.on ? ' on' : ''}" data-tg="${a.id}">${a.on ? 'ON' : 'OFF'}</button>
      </div></div>`;
  }).join('');
  newId = null;
  renderNext();
}

$('list').addEventListener('click', e => {
  const d = e.target.closest('[data-del]'), g = e.target.closest('[data-tg]');
  if (d) alarms = alarms.filter(a => a.id != d.dataset.del);
  else if (g) { const a = alarms.find(a => a.id == g.dataset.tg); a.on = !a.on; }
  else return;
  render();
});

/* ---------- Wheel time picker ---------- */
const IH = 48; // item height in px (must match .it in style.css)
function wheel(el, vals) {
  el.innerHTML = vals.map((v, i) => `<div class="it" data-i="${i}">${pad(v)}</div>`).join('');
  const its = [...el.children];
  let idx = 0;
  const paint = () => {
    idx = Math.max(0, Math.min(vals.length - 1, Math.round(el.scrollTop / IH)));
    its.forEach((n, k) => { const d = Math.abs(k - idx); n.className = 'it' + (d === 0 ? ' sel' : d === 1 ? ' near' : ''); });
  };
  el.addEventListener('scroll', () => requestAnimationFrame(paint));
  el.addEventListener('click', e => { const n = e.target.closest('.it'); if (n) el.scrollTo({ top: n.dataset.i * IH, behavior: 'smooth' }); });
  return { get: () => vals[idx], set: i => { el.scrollTop = i * IH; paint(); } };
}
const hW = wheel($('hourW'), Array.from({ length: 12 }, (_, i) => i + 1));
const mW = wheel($('minW'), Array.from({ length: 12 }, (_, i) => i * 5));

function setAp(v) {
  ap = v;
  document.querySelectorAll('.ap button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
document.querySelector('.ap').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setAp(b.dataset.v); });

/* ---------- Repeat ---------- */
$('presets').innerHTML = Object.keys(REP_NAME).map(r => `<button class="chip" data-r="${r}">${REP_NAME[r]}</button>`).join('');
$('dayChips').innerHTML = 'SMTWTFS'.split('').map((c, i) => `<button class="day" data-d="${i}" aria-label="${DN[i]}">${c}</button>`).join('');

function syncRep() {
  document.querySelectorAll('#presets .chip').forEach(b => b.classList.toggle('on', b.dataset.r === rep));
  document.querySelectorAll('#dayChips .day').forEach(b => b.classList.toggle('on', cdays.includes(+b.dataset.d)));
  $('dayChips').hidden = rep !== 'custom';
  $('repeatVal').textContent = repText({ rep, days: cdays });
}
$('repeatBtn').onclick = () => $('repBox').classList.toggle('open');
$('presets').onclick = e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  rep = b.dataset.r;
  if (rep === 'custom' && !cdays.length) cdays = [new Date().getDay()]; // start with today selected
  syncRep();
};
$('dayChips').onclick = e => {
  const b = e.target.closest('.day');
  if (!b) return;
  const d = +b.dataset.d;
  cdays = cdays.includes(d) ? cdays.filter(x => x !== d) : [...cdays, d];
  syncRep();
};

/* ---------- New Alarm sheet ---------- */
function openSheet() {
  const d = new Date(Math.round(Date.now() / 3e5) * 3e5), h = d.getHours(); // now, rounded to 5 min
  rep = S.defRep; cdays = [];
  syncRep();
  $('repBox').classList.remove('open');
  setAp(h >= 12 ? 'PM' : 'AM');
  $('sheet').classList.add('open');
  requestAnimationFrame(() => { hW.set((h % 12 || 12) - 1); mW.set(Math.round(d.getMinutes() / 5) % 12); });
}
const closeSheet = () => $('sheet').classList.remove('open');

$('newBtn').onclick = openSheet;
$('cancelBtn').onclick = closeSheet;
$('sheet').onclick = e => { if (e.target === $('sheet')) closeSheet(); };

$('createBtn').onclick = () => {
  if (rep === 'custom' && !cdays.length) {
    $('dayChips').classList.add('warn');
    setTimeout(() => $('dayChips').classList.remove('warn'), 600);
    return;
  }
  const t = ((hW.get() % 12) + (ap === 'PM' ? 12 : 0)) * 60 + mW.get();
  const a = { id: Date.now(), t, on: true, label: 'Alarm', rep, days: rep === 'custom' ? [...cdays].sort() : [] };
  alarms.push(a);
  alarms.sort((x, y) => x.t - y.t);
  newId = a.id;
  render();
  closeSheet();
};

/* ---------- Live clock ---------- */
function tick() {
  const n = new Date(), h = n.getHours(), mm = pad(n.getMinutes()), s = S.sec ? ':' + pad(n.getSeconds()) : '';
  const time = S.h24 ? pad(h) + ':' + mm + s : pad(h % 12 || 12) + ':' + mm + s + ' ' + (h >= 12 ? 'PM' : 'AM');
  const date = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelectorAll('.lt').forEach(e => e.textContent = time);
  document.querySelectorAll('.ld').forEach(e => e.textContent = date);
}

/* ---------- Settings (saved on this device) ---------- */
$('defRep').innerHTML = ['once', 'daily', 'weekdays', 'weekends'].map(r => `<button class="chip" data-r="${r}">${REP_NAME[r]}</button>`).join('');
function syncSet() {
  [['s24', 'h24'], ['sSec', 'sec']].forEach(([id, k]) => { $(id).classList.toggle('on', S[k]); $(id).textContent = S[k] ? 'ON' : 'OFF'; });
  document.querySelectorAll('#defRep .chip').forEach(b => b.classList.toggle('on', b.dataset.r === S.defRep));
  tick();
  render();
}
$('s24').onclick = () => { S.h24 = !S.h24; saveS(); syncSet(); };
$('sSec').onclick = () => { S.sec = !S.sec; saveS(); syncSet(); };
$('defRep').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.defRep = b.dataset.r; saveS(); syncSet(); };

let ct;
$('clearBtn').onclick = e => {
  const b = e.currentTarget;
  clearTimeout(ct);
  if (b.classList.toggle('arm')) { // first tap arms, second tap clears
    b.textContent = 'Tap again to clear all';
    ct = setTimeout(() => { b.classList.remove('arm'); b.textContent = 'Clear all alarms'; }, 3000);
  } else {
    b.textContent = 'Clear all alarms';
    alarms = [];
    render();
  }
};

const closeSet = () => $('setSheet').classList.remove('open');
$('setBtn').onclick = () => $('setSheet').classList.add('open');
$('doneBtn').onclick = closeSet;
$('setSheet').onclick = e => { if (e.target === $('setSheet')) closeSet(); };

/* ---------- Start ---------- */
syncSet();
setInterval(tick, 1000);
setInterval(renderNext, 30000);