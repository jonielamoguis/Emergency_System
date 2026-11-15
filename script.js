
const S = document.getElementById('screen'), wrap = document.getElementById('wrap');
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let cfg = store.get('sos_cfg', { name: '', phone: '', pin: '1234' });
let log = store.get('sos_log', []);
const GROUP = 'Group: Tempura';
let presses = [], timers = [], state = 'lock', type = null, pin = '', loc = null;

function clr() { timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; }
function buzz(p) {
  wrap.classList.remove('pulse'); void wrap.offsetWidth; wrap.classList.add('pulse');
  try { navigator.vibrate && navigator.vibrate(p); } catch (e) {}
}
function toast(m) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = m;
  S.appendChild(d); setTimeout(() => d.remove(), 2500);
}
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const today = () => new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

/* ---------- Alert log (real, saved in the browser) ---------- */
function addLog(ev) {
  log.unshift({ t: new Date().toLocaleTimeString(), ev });
  log = log.slice(0, 30); store.set('sos_log', log); renderLog();
}
function renderLog() {
  $('log').innerHTML = log.length ? log.map(l => '<li><b>' + l.t + '</b> ' + l.ev + '</li>').join('') : '<li>No events yet.</li>';
}

/* ---------- Real GPS (falls back to simulated) ---------- */
function getLocation() {
  return new Promise(res => {
    const fake = { lat: 14.5995, lng: 120.9842, acc: null, real: false };
    if (!navigator.geolocation) return res(fake);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), real: true }),
      () => res(fake), { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 });
  });
}
const mapLink = l => 'https://maps.google.com/?q=' + l.lat.toFixed(5) + ',' + l.lng.toFixed(5);

/* ---------- Real message to emergency contact ---------- */
function buildMsg() {
  return '🆘 EMERGENCY' + (cfg.name ? ' from ' + cfg.name : '') + '. I need ' + (type || 'help') + '. ' +
    (loc ? 'My location: ' + mapLink(loc) + (loc.acc ? ' (accuracy ~' + loc.acc + ' m)' : '') + '. ' : 'Location unavailable. ') +
    'Sent ' + new Date().toLocaleString() + '.';
}
function sendAlert() {
  const msg = buildMsg();
  addLog('Message prepared for ' + (cfg.phone || 'share/copy'));
  if (cfg.phone) {
    const sep = /iPhone|iPad/.test(navigator.userAgent) ? '&' : '?';
    location.href = 'sms:' + cfg.phone + sep + 'body=' + encodeURIComponent(msg);
  } else if (navigator.share) {
    navigator.share({ text: msg }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => toast('Message copied'));
  } else toast('Set an emergency contact first');
}

/* ---------- Screens ---------- */
function lock() {
  clr(); state = 'lock'; type = null; pin = ''; presses = []; loc = null;
  S.innerHTML = '<div class="lock"><div class="time">' + clock() + '</div><div class="date">' + today() +
    '</div><div class="group">' + GROUP + '</div><div style="opacity:.6;font-size:13px">Swipe up to unlock</div></div>';
}

function countdown() {
  clr(); state = 'count'; let n = 5; buzz([80]); addLog('Triple press detected, countdown started');
  getLocation().then(l => { loc = l; if (state === 'active') showLoc(); });
  S.innerHTML = '<div class="dot"></div><div class="lock"><div class="time">' + clock() + '</div><div class="date">' + today() +
    '</div><div class="group">' + GROUP + '</div><div style="font-size:12px;opacity:.7" id="cn">Alert in 5</div><button class="cancel" id="hold"><i></i>Hold 2 seconds to cancel</button></div>';
  const hold = $('hold'), bar = hold.querySelector('i'); let ht;
  function start(e) { e.preventDefault(); bar.style.transition = 'width 2s linear'; bar.style.width = '100%'; ht = setTimeout(() => cancelled('Alert cancelled', 'Cancelled during countdown'), 2000); }
  function stop() { clearTimeout(ht); bar.style.transition = 'none'; bar.style.width = '0'; }
  hold.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => hold.addEventListener(ev, stop));
  const iv = setInterval(() => {
    n--; const c = $('cn');
    if (n <= 0) { clearInterval(iv); active(); } else if (c) c.textContent = 'Alert in ' + n;
  }, 1000);
  timers.push(iv);
}

function showLoc() {
  if (!$('locTxt') || !loc) return;
  $('locTxt').innerHTML = loc.real
    ? '<b>📍 Live location</b><div style="opacity:.8">' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + ' (±' + loc.acc + ' m)</div><a href="' + mapLink(loc) + '" target="_blank" rel="noopener" style="color:#93c5fd">Open in Maps</a>'
    : '<b>📍 Location (simulated)</b><div style="opacity:.8">GPS unavailable, using sample location</div>';
  const e = $('s1'); if (e && !e.classList.contains('on')) { e.classList.add('on'); buzz([50]); addLog(loc.real ? 'Real GPS location acquired' : 'GPS unavailable, simulated location used'); }
}

function active() {
  clr(); state = 'active'; buzz([200, 100, 200]); addLog('Emergency request initiated');
  S.innerHTML = '<div class="app"><h2>🆘 Help request active</h2>' +
    '<div class="card"><div id="locTxt"><b>📍 Locating…</b></div><div class="map"><div class="pin">📍</div></div></div>' +
    '<div class="card"><b>What help do you need?</b> <span style="opacity:.6">(optional)</span><div class="types" style="margin-top:8px">' +
    '<button class="t p" data-t="Police">👮 Police</button><button class="t m" data-t="Medical">🚑 Medical</button>' +
    '<button class="t b" data-t="Police and Medical">Police + Medical</button><button class="t u" data-t="Unsure">Can’t choose</button></div></div>' +
    '<button class="btn send" id="send">📩 Send to emergency contact</button>' +
    '<div class="card"><ul class="steps"><li id="s0">Request initiated</li><li id="s1">Location ready</li>' +
    '<li id="s2">Received by responders <span class="sim">simulated</span></li><li id="s3">Responder on the way <span class="sim">simulated</span></li></ul></div>' +
    '<button class="btn" id="cx">Cancel request (PIN)</button></div>';
  S.querySelectorAll('.t').forEach(b => b.onclick = () => {
    type = b.dataset.t; S.querySelectorAll('.t').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    buzz([60]); addLog('Assistance type chosen: ' + type);
  });
  $('send').onclick = sendAlert; $('cx').onclick = pinScreen;
  const on = i => { const e = $('s' + i); if (e) { e.classList.add('on'); buzz(i == 2 ? [100, 60, 100] : [50]); if (i > 1) addLog(i == 2 ? 'Request received (simulated)' : 'Responder on the way (simulated)'); } };
  on(0); showLoc();
  timers.push(setTimeout(() => on(2), 3500), setTimeout(() => on(3), 7500));
}

function pinScreen() {
  state = 'pin'; pin = '';
  S.innerHTML = '<div class="app"><h2>Enter PIN to cancel</h2><div class="dots" id="dots"></div><div class="err" id="err"></div><div class="pad">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, '✓'].map(k => '<button data-k="' + k + '">' + k + '</button>').join('') +
    '</div><button class="btn" id="bk">Keep alert active</button></div>';
  S.querySelectorAll('.pad button').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === '←') pin = pin.slice(0, -1);
    else if (k === '✓') {
      if (pin === cfg.pin) return cancelled('Request cancelled', 'Cancelled with correct PIN');
      pin = ''; addLog('Wrong PIN entered'); $('err').textContent = 'Wrong PIN. Alert remains active.';
    } else if (pin.length < 4) pin += k;
    $('dots').textContent = '●'.repeat(pin.length);
  });
  $('bk').onclick = () => { state = 'active'; active(); };
}

function cancelled(msg, why) {
  clr(); state = 'cancelled'; buzz([100]); addLog(why || msg);
  S.innerHTML = '<div class="app" style="justify-content:center;text-align:center"><div style="font-size:48px">✅</div><h2>' + msg +
    '</h2><div class="card">Marked as a false alarm.</div><button class="btn" id="ok">Done</button></div>';
  $('ok').onclick = lock;
}

/* ---------- Triple-press trigger (side button, or press "S" 3 times) ---------- */
function press() {
  if (state !== 'lock') return;
  const t = Date.now(); presses = presses.filter(p => t - p < 1500); presses.push(t);
  if (presses.length >= 3) { presses = []; countdown(); }
}
$('side').onclick = press;
document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 's' && !/INPUT/.test(e.target.tagName)) press(); });

/* ---------- Settings panel ---------- */
$('cName').value = cfg.name; $('cPhone').value = cfg.phone; $('cPin').value = cfg.pin;
$('saveCfg').onclick = () => {
  const p = $('cPin').value.trim();
  if (!/^\d{4}$/.test(p)) { $('cfgMsg').textContent = 'PIN must be 4 digits.'; return; }
  cfg = { name: $('cName').value.trim(), phone: $('cPhone').value.trim(), pin: p };
  store.set('sos_cfg', cfg); $('cfgMsg').textContent = 'Saved.'; addLog('Settings updated');
};
$('askLoc').onclick = () => getLocation().then(l => { $('cfgMsg').textContent = l.real ? 'Location permission granted.' : 'Location blocked or unavailable (simulated will be used).'; });
$('clearLog').onclick = () => { log = []; store.set('sos_log', log); renderLog(); };
$('reset').onclick = lock;
renderLog(); lock();