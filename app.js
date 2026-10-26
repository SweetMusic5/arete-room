/* The Arete Room at Lavender's · app (plain JavaScript, no build step) */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  var CFG = window.ARETE_CONFIG || {};
  var DEMO = !/^https?:\/\//.test(CFG.SUPABASE_URL || '') || !CFG.SUPABASE_ANON_KEY || /YOUR_/.test(CFG.SUPABASE_ANON_KEY);
  var VAPID = (CFG.VAPID_PUBLIC_KEY && !/YOUR_/.test(CFG.VAPID_PUBLIC_KEY)) ? CFG.VAPID_PUBLIC_KEY : null;
  var TZ = 'America/Phoenix';             // Arizona: no daylight saving, always UTC-7
  var PREFIX = DEMO ? 'arete-demo:' : 'arete:';
  var MIND_HELP = 'Suggestions, questions, anything at all. About work, wellness, or how you\'re doing. The leadership team will see it.';
  var WHY_LINE = 'The passion and the purpose behind what we do.';
  var PUSH_ASK = 'Want a note on your phone when the Weekly goes up?';
  var KIND_NAMES = { weekly: 'The Weekly', why: 'The Why', try: "This Month's Share", meetup: 'Meetup' };
  var TRY_LABELS = ['Mental', 'Physical', 'Emotional', 'State'];
  var WEEKLY_PARTS = [['heads_ups', 'Heads-ups'], ['reminders', 'Reminders'], ['asked_did', 'You asked, we did']];

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(PREFIX + k); return v == null ? (d === undefined ? null : d) : JSON.parse(v); } catch (e) { return d === undefined ? null : d; } },
    set: function (k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
  };
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : null; }
  function fmt(iso, opts) { opts.timeZone = TZ; return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso)); }
  function fmtDay(iso) { return fmt(iso, { weekday: 'long', month: 'short', day: 'numeric' }); }
  function fmtTime(iso) {
    return fmt(iso, { hour: 'numeric', minute: '2-digit' }).replace(':00', '')
      .replace(/[\s ]?AM/, 'am').replace(/[\s ]?PM/, 'pm');
  }
  function fmtWhen(iso) { return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(iso); }
  function fmtShort(iso) { return fmt(iso, { month: 'short', day: 'numeric' }) + ', ' + fmtTime(iso); }
  // <input type="datetime-local"> values are read as Arizona time (UTC-7 all year)
  function toLocalInput(iso) { if (!iso) return ''; return new Date(new Date(iso).getTime() - 7 * 3600e3).toISOString().slice(0, 16); }
  function fromLocalInput(v) { return v ? new Date(v + ':00-07:00').toISOString() : null; }
  function nextWeeklySlot() {
    var az = new Date(Date.now() - 7 * 3600e3);                      // "Arizona clock" in UTC fields
    var day = az.getUTCDay();                                         // 0 Sun .. 1 Mon
    var add = (8 - day) % 7;
    var slot = Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate() + add, 8, 0) + 7 * 3600e3;
    if (slot <= Date.now()) slot += 7 * 864e5;
    return new Date(slot).toISOString();
  }
  // An Arizona clock time some days from today (demo data only)
  function azAt(days, hour) {
    var az = new Date(Date.now() - 7 * 3600e3);
    return new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate() + days, hour, 0) + 7 * 3600e3).toISOString();
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function joinNames(list) {
    var a = (list || []).map(firstName);
    if (a.length <= 1) return a.join('');
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  function linesOf(t) { return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }

  // ------------------------------------------------------------------
  // Icons (inline stroke SVG)
  // ------------------------------------------------------------------
  var ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
    talk: '<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 19.8l1.2-4.3a8 8 0 1 1 15.3-4z"/><path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.4 3.6-7.6.4 1.8 1.3 3 2.4 3.6-.2-3.1.9-5.6 3.2-7.8.3 3.2 1.6 5 3 6.9 1.1 1.5 1.8 3 1.8 4.9C19.5 18.4 16 21 12 21z"/><path d="M12 21c-1.7 0-2.9-1.2-2.9-2.9 0-1.6 1.2-2.6 2.1-3.7.6 1.6 1.9 1.8 2.6 3 .3.4.4.8.4 1.1 0 1.4-1 2.5-2.2 2.5z"/>',
    lead: '<path d="M12 21V9"/><path d="M12 14c-3.2 0-5.5-2.2-5.5-5.5 3.2 0 5.5 2.2 5.5 5.5zM12 11.5c3.2 0 5.5-2.2 5.5-5.5-3.2 0-5.5 2.2-5.5 5.5z"/><path d="M8 21h8"/>',
    sprig: '<path d="M12 21V6"/><path d="M12 16c-2.8 0-4.6-1.8-4.6-4.6 2.8 0 4.6 1.8 4.6 4.6zM12 16c2.8 0 4.6-1.8 4.6-4.6-2.8 0-4.6 1.8-4.6 4.6zM12 10.5c-2.3 0-3.8-1.5-3.8-3.8 2.3 0 3.8 1.5 3.8 3.8zM12 10.5c2.3 0 3.8-1.5 3.8-3.8-2.3 0-3.8 1.5-3.8 3.8z"/><path d="M12 6c0-1.6.6-2.6 1.6-3"/>',
    speaker: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/>',
    heart: '<path d="M12 20.5s-7.6-4.6-9.4-9.3C1.3 7.6 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.6 3.1 4.3 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    send: '<path d="M4 12 20 4.5 15.5 20l-3.7-6.3z"/><path d="M11.8 13.7 20 4.5"/>',
    check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M6.5 11H5v10h14V11h-1.5"/>',
    plusbox: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    book: '<path d="M3.5 5.5h6A2.5 2.5 0 0 1 12 8v12a2 2 0 0 0-2-2H3.5z"/><path d="M20.5 5.5h-6A2.5 2.5 0 0 0 12 8v12a2 2 0 0 1 2-2h6.5z"/>',
    megaphone: '<path d="M3.5 10v4h3l8 4.5v-13l-8 4.5z"/><path d="M18 9a4 4 0 0 1 0 6M6.5 14l1.5 5.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    edit: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="M13 6.5 17.5 11"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>'
  };
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  // A lavender field at sunrise, flat shapes only.
  function fieldSvg() {
    var W = 390, H = 118, vx = 282, vy = 54, out = [];
    out.push('<svg class="field" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" role="img" aria-label="A lavender field at sunrise">');
    out.push('<rect width="' + W + '" height="' + H + '" fill="#392D50"/>');
    out.push('<circle cx="' + vx + '" cy="' + vy + '" r="50" fill="#41345B"/>');
    out.push('<circle cx="' + vx + '" cy="' + vy + '" r="36" fill="#4B3D67"/>');
    out.push('<circle cx="' + vx + '" cy="' + vy + '" r="22" fill="#DCC48F"/>');
    out.push('<path d="M0 ' + (vy - 6) + ' Q 70 ' + (vy - 24) + ' 150 ' + (vy - 8) + ' T 300 ' + (vy - 4) + ' T ' + W + ' ' + (vy - 14) + ' V ' + (vy + 6) + ' H 0 Z" fill="#4A3D66"/>');
    out.push('<path d="M0 ' + (vy + 2) + ' Q 120 ' + (vy - 10) + ' 230 ' + (vy + 1) + ' T ' + W + ' ' + (vy - 2) + ' V ' + H + ' H 0 Z" fill="#54467A"/>');
    out.push('<rect x="0" y="' + vy + '" width="' + W + '" height="' + (H - vy) + '" fill="#5F4F82"/>');
    var n = 15;
    for (var i = 0; i < n; i++) {
      var xb = -300 + i * (W + 600) / (n - 1), w = 15;
      out.push('<path d="M' + vx + ' ' + vy + ' L' + (xb - w) + ' ' + H + ' L' + (xb + w) + ' ' + H + ' Z" fill="#7A67A5"/>');
      for (var t = 0.18; t <= 1.0; t += 0.11) {
        var x = vx + (xb - vx) * t, y = vy + (H - vy) * t, r = 0.6 + 3.2 * t * t;
        if (x < -6 || x > W + 6) continue;
        out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + (i % 2 ? '#A893D2' : '#9682C2') + '"/>');
      }
    }
    out.push('<path d="M0 ' + vy + ' H ' + W + '" stroke="#DCC48F" stroke-opacity=".35" stroke-width="1"/>');
    out.push('</svg>');
    return out.join('');
  }

  // ------------------------------------------------------------------
  // Talking to the database
  // ------------------------------------------------------------------
  function ApiError(code) { this.code = code; this.message = code; }
  ApiError.prototype = Object.create(Error.prototype);

  function rpc(fn, args) {
    args = args || {};
    if (DEMO) return Demo.call(fn, args);
    var key = CFG.SUPABASE_ANON_KEY;
    var headers = { 'Content-Type': 'application/json', apikey: key };
    if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key;   // classic anon key is a JWT; new "publishable" keys are not
    return fetch(CFG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: headers, body: JSON.stringify(args), cache: 'no-store'
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) throw new ApiError((data && (data.message || data.error)) || ('server_' + res.status));
        return data;
      });
    }, function () { throw new ApiError('offline'); });
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  function freshLead() {
    return { sub: 'posts', notes: null, posts: null, people: null, meet: null, nextSlot: null, showHandled: false, open: {}, who: {},
      approving: null, approveAt: '', form: null, pollForm: null, meetForm: { at: '', body: '' }, addName: '', addRole: 'team',
      newLink: null, loading: false, confirm: null, late: null, unanswered: 0, unfold: {}, looks: null, lookText: {} };
  }
  function startTab() {
    try { var t = new URL(location.href).searchParams.get('tab'); return t === 'talk' || t === 'why' ? t : 'home'; } catch (e) { return 'home'; }
  }
  var S = {
    token: store.get('token'),
    key: null,
    me: null,
    posts: [],
    poll: null,
    leaders: [],
    tab: startTab(),                      // every open starts at The Weekly (an alert can open Talk to us)
    noteDraft: store.get('noteDraft', ''),
    noteTo: store.get('noteTo', { mode: 'all', ids: [] }),
    noteSent: null,
    micHint: false,
    rec: null,
    speakingId: null,
    spoken: {},
    sheet: null,
    signOutAsk: false,
    gate: null,
    heroFull: !store.get('heroSeen'),     // the big header on the first open, a shorter one after that
    pushOn: !!store.get('pushOn'),
    lead: freshLead()
  };

  function saveCache() { store.set('cache', { me: S.me, posts: S.posts, poll: S.poll, leaders: S.leaders }); }
  function loadCache() {
    var c = store.get('cache');
    if (!c || !c.me) return false;
    S.me = c.me; S.posts = c.posts || []; S.poll = c.poll || null; S.leaders = c.leaders || [];
    return true;
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  var FRIENDLY = {
    offline: "You're offline right now. Try again in a moment.",
    leaders_only: 'That part is for the leadership team.',
    approver_only: 'Only Tiffany can do that.',
    title_required: 'Add a headline first.',
    bad_label: 'Pick one of the four kinds.',
    date_required: 'Add the date and time.',
    bad_url: 'Links need to start with https://',
    empty_note: 'Write a few words first.',
    slow_down: "That's a lot of notes in an hour. Try again a little later.",
    not_for_yourself: "You can't change your own link here.",
    pin_format: 'PINs are 4 to 6 numbers.',
    post_not_found: 'That one is no longer here.',
    already_published: 'That one is already out.',
    not_a_draft: 'Take it down first, then delete the draft.',
    already_draft: 'That one is already a draft.',
    bad_recipient: 'Please choose the names again.',
    two_to_four_times: 'Add 2 to 4 different times.',
    time_passed: 'That time has already passed. Choose a time ahead.',
    poll_closed: 'That poll is closed now.',
    poll_already_open: 'A poll is already open. Pick a time or close it first.',
    poll_locked: 'That poll is already open, so its times stay as they are.',
    name_required: 'Add a first name.',
    name_taken: 'Someone here already has that name. Add a last initial.',
    no_such_person: 'That person is no longer here.',
    too_long: 'That is a little long. Please shorten it.',
    look_closed: 'That one has gone out already, or it is back with Tiffany.'
  };
  function handleErr(e) {
    var code = (e && e.code) || 'error';
    if (code === 'not_signed_in') { signOutLocal(); gate(); return; }
    toast(FRIENDLY[code] || 'Something went wrong. Please try again.');
  }
  function signOutLocal() { S.token = null; store.del('token'); store.del('cache'); S.me = null; }

  // ------------------------------------------------------------------
  // Start-up and sign-in
  // ------------------------------------------------------------------
  // The private key travels in the address FRAGMENT (#k=...), which browsers never send to the web host.
  // ?k=... is still accepted. Once signed in, the key is taken out of the address bar, except in
  // iPhone Safari before the app is on the Home Screen: the Home Screen copy opens the exact address
  // it was added from, so the key has to stay there until then.
  function keyFromUrl() {
    var u = new URL(location.href);
    return new URLSearchParams(u.hash.replace(/^#/, '')).get('k') || u.searchParams.get('k');
  }
  function stripKeyFromUrl() {
    if (isIOS() && !isStandalone()) return;
    var u = new URL(location.href);
    if (!keyFromUrl()) return;
    u.searchParams.delete('k');
    try { history.replaceState(null, '', u.pathname + u.search); } catch (e) { /* ignore */ }
  }

  function boot() {
    var k = keyFromUrl();
    if (k) {
      if (store.get('tokenKey') && store.get('tokenKey') !== k) signOutLocal();   // a different person's link
      store.set('key', k);
    }
    S.key = k || store.get('key');
    if (!S.token) return gate();
    loadMain().then(showApp, function (e) {
      if (e.code === 'offline' && loadCache()) { showApp(); toast("You're offline. Showing what was saved on this phone."); return; }
      if (e.code === 'not_signed_in') signOutLocal();
      gate();
    });
  }

  function loadMain() {
    var tok = S.token;
    return rpc('feed', { p_token: tok }).then(function (r) {
      if (tok !== S.token) return;                 // signed in as someone else meanwhile: ignore
      S.me = r.me; S.posts = r.posts || []; S.poll = r.poll || null; S.leaders = r.leaders || [];
      if (S.tab === 'lead' && S.me.role !== 'leader') S.tab = 'home';
      saveCache();
      if (S.me.role === 'leader') loadLead(true);
    });
  }

  function showApp() {
    S.gate = null; stripKeyFromUrl(); render();
    store.set('heroSeen', true);                    // the next open shows the shorter header
    checkPushQuietly();
  }

  function gate() {
    S.gate = { step: 'loading' }; renderGate();
    if (!S.key) { S.gate = { step: S.signedOut ? 'signedout' : 'nolink' }; return renderGate(); }
    rpc('begin_with_key', { p_key: S.key }).then(function (r) {
      S.gate = { name: r.name };
      if (r.status === 'invalid') S.gate.step = 'invalid';
      else if (r.status === 'relink') S.gate.step = 'relink';
      else if (r.status === 'locked') { S.gate.step = 'locked'; S.gate.until = r.locked_until; }
      else {
        S.gate.next = r.status === 'new' ? 'newpin' : 'pin';
        var skipA2hs = sessionStorageGet('a2hs-skip');
        S.gate.step = (!isStandalone() && (isIOS() || S.demoPreview) && !skipA2hs) ? 'a2hs' : S.gate.next;
      }
      renderGate();
    }, function (e) {
      S.gate = { step: 'error', code: e.code }; renderGate();
    });
  }
  function sessionStorageGet(k) { try { return sessionStorage.getItem(PREFIX + k); } catch (e) { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(PREFIX + k, v); } catch (e) { /* ignore */ } }

  function phoneBtn() {
    return '<button type="button" class="phone-btn" data-act="phone-sheet" id="phone-btn" aria-label="This phone: alerts and sign out">' + icon('phone') + '</button>';
  }
  function headTools(withPhone) { return (DEMO ? demoTag() : '') + (withPhone ? phoneBtn() : ''); }
  // The big header (first open) or the shorter one (return visits). The gate screens always use the big one.
  function brandBlock(withDemo, compact) {
    var phone = S.gate ? '' : phoneBtn();
    return '<header class="hero' + (compact ? ' compact' : '') + (phone ? ' has-tools' : '') + '">' + (phone ? '<div class="head-tools">' + phone + '</div>' : '') +
      (DEMO && withDemo ? demoTag() : '') +
      '<div class="wrap"><h1 class="brand">The Arete Room <span class="at">at Lavender\'s</span></h1>' +
      (compact ? '' :
        '<p class="say">ah-reh-TAY · where legends grow</p>' +
        '<p class="meaning"><span class="greek" lang="grc">ἀρετή</span>, Greek for excellence: living up to your fullest potential</p>') +
      '</div>' + fieldSvg() + '</header>';
  }
  function demoTag() { return '<button type="button" class="demo-tag" data-act="demo-sheet" aria-label="Demo mode: tap for options">Demo</button>'; }

  function a2hsSteps() {
    return '<ol class="steps">' +
      '<li><div>Tap the <strong>Share</strong> button <span class="ico-inline">' + icon('share') + '</span>. It is at the bottom or the top of Safari. ' +
        'If you don\'t see it, tap the <strong>•••</strong> (More) button first, then <strong>Share</strong>.</div></li>' +
      '<li><div>Scroll down the list and tap <strong>Add to Home Screen</strong> <span class="ico-inline">' + icon('plusbox') + '</span>. ' +
        'If it isn\'t there, tap <strong>View More</strong> first.</div></li>' +
      '<li><div>If you see <strong>Open as Web App</strong>, leave it on. Tap <strong>Add</strong>.</div></li>' +
      '<li><div>Open The Arete Room from your Home Screen.</div></li>' +
      '</ol>';
  }

  function renderGate() {
    var g = S.gate, name = firstName(g.name), h = '';
    $('#toast').hidden = true;
    if (g.step === 'loading') h = '<p class="loading">One moment…</p>';
    else if (g.step === 'nolink') h = '<h2>Welcome</h2><p>Please open The Arete Room with the private link the leadership team sent you. It is just for you.</p>' + pasteForm(g);
    else if (g.step === 'signedout') h = '<h2>You\'re signed out of this phone</h2><p>Thank you for being here. To come back in, open your private link and enter your PIN.</p>' + pasteForm(g);
    else if (g.step === 'relink') h = '<h2>Let\'s get you a fresh link</h2><p>To keep your room private, this link closed after a lot of PIN tries. Ask the leadership team for a new link and you\'ll be right back in.</p>';
    else if (g.step === 'invalid') h = '<h2>This link is resting</h2><p>This link isn\'t turned on right now. Ask the leadership team for a fresh one and you\'ll be right in.</p>';
    else if (g.step === 'locked') h = '<h2>Let\'s take a short pause</h2><p>There were a few PIN tries in a row, so this link is resting until ' + esc(fmtTime(g.until)) + '. Then you can try again.</p><p class="hint">Forgot your PIN? Ask the leadership team for a new link.</p>';
    else if (g.step === 'error') h = '<h2>We couldn\'t connect</h2><p>' + esc(FRIENDLY[g.code] || 'Please check your connection and try again.') + '</p><button type="button" class="btn primary block" data-act="gate-retry">Try again</button>';
    else if (g.step === 'a2hs') {
      h = '<h2>Welcome, ' + esc(name) + '</h2><p>Put The Arete Room on your Home Screen so it opens like an app.</p>' + a2hsSteps() +
        '<button type="button" class="btn secondary block" data-act="gate-continue">Continue here for now</button>';
    } else if (g.step === 'newpin') {
      h = '<h2>Welcome, ' + esc(name) + '</h2><p>Choose a PIN of 4 to 6 numbers. You\'ll use it if you open The Arete Room on a new phone.</p>' +
        '<form data-form="newpin" novalidate>' +
        '<label class="lbl" for="pin1">Your new PIN</label>' +
        '<input id="pin1" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required>' +
        '<label class="lbl" for="pin2">Type it once more</label>' +
        '<input id="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required>' +
        (g.err ? '<p class="err" role="alert">' + esc(g.err) + '</p>' : '') +
        '<div class="actions"><button type="submit" class="btn primary block">Come on in</button></div></form>';
    } else if (g.step === 'pin') {
      h = '<h2>Welcome back, ' + esc(name) + '</h2><p>Enter your PIN.</p>' +
        '<form data-form="pin" novalidate>' +
        '<label class="lbl" for="pin">PIN</label>' +
        '<input id="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" required>' +
        (g.err ? '<p class="err" role="alert">' + esc(g.err) + '</p>' : '') +
        '<div class="actions"><button type="submit" class="btn primary block">Come on in</button></div></form>' +
        '<p class="hint">Forgot your PIN? Ask the leadership team for a new link.</p>';
    }
    $('#app').innerHTML = '<div class="gate">' + brandBlock(true, false) + '<section class="wrap panel">' + h + '</section></div>' + sheetHtml();
    var first = document.querySelector('.gate input');
    if (first && g.step !== 'a2hs' && g.step !== 'signedout') first.focus();
  }
  function pasteForm(g) {
    return '<form data-form="paste" novalidate><label class="lbl" for="paste-link">Or paste your private link here</label>' +
      '<input id="paste-link" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://">' +
      (g.err ? '<p class="err" role="alert">' + esc(g.err) + '</p>' : '') +
      '<div class="actions"><button type="submit" class="btn primary block">Open</button></div></form>';
  }

  function submitNewPin() {
    var a = $('#pin1').value.trim(), b = $('#pin2').value.trim();
    if (!/^[0-9]{4,6}$/.test(a)) { S.gate.err = 'Use 4 to 6 numbers.'; return renderGate(); }
    if (a !== b) { S.gate.err = "Those two PINs don't match. Try again."; return renderGate(); }
    rpc('set_pin', { p_key: S.key, p_pin: a }).then(signedIn, function (e) {
      if (e.code === 'pin_already_set') { S.gate.step = 'pin'; S.gate.err = null; return renderGate(); }
      S.gate.err = FRIENDLY[e.code] || 'Something went wrong. Please try again.'; renderGate();
    });
  }
  function submitPin() {
    var p = $('#pin').value.trim();
    if (!/^[0-9]{4,6}$/.test(p)) { S.gate.err = 'Your PIN is 4 to 6 numbers.'; return renderGate(); }
    rpc('sign_in', { p_key: S.key, p_pin: p }).then(function (r) {
      if (r.ok) return signedIn(r);
      if (r.status === 'locked') { S.gate.step = 'locked'; S.gate.until = r.locked_until; }
      else if (r.status === 'invalid') S.gate.step = 'invalid';
      else if (r.status === 'relink') S.gate.step = 'relink';
      else if (r.status === 'new') S.gate.step = 'newpin';
      else S.gate.err = "That PIN didn't match. " + r.tries_left + (r.tries_left === 1 ? ' try' : ' tries') + ' left.';
      renderGate();
    }, function (e) { S.gate.err = FRIENDLY[e.code] || 'Something went wrong. Please try again.'; renderGate(); });
  }
  function signedIn(r) {
    S.token = r.token; S.me = r.me; S.demoPreview = false; S.signedOut = false;
    store.set('token', r.token); store.set('tokenKey', S.key);
    S.tab = 'home';
    loadMain().then(showApp, handleErr);
  }

  // ------------------------------------------------------------------
  // Phone alerts (Web Push). Two kinds only: a new Weekly, and a meetup time being set.
  // Shown only where the phone supports it (iPhone: once on the Home Screen, iOS 16.4+).
  // ------------------------------------------------------------------
  function pushSupport() {
    if (DEMO) return 'yes';
    var has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!has) return isIOS() && !isStandalone() ? 'needs-home' : 'none';
    if (!VAPID) return 'none';
    if (Notification.permission === 'denied') return 'blocked';
    return 'yes';
  }
  function showPushAsk() { return !!S.me && pushSupport() === 'yes' && !S.pushOn && !store.get('pushAsked'); }
  function b64ToBytes(s) {
    var p = s.replace(/-/g, '+').replace(/_/g, '/'); p += '='.repeat((4 - p.length % 4) % 4);
    var bin = atob(p), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function swReady(ms) {
    return Promise.race([navigator.serviceWorker.ready, new Promise(function (res, rej) { setTimeout(function () { rej(new Error('no_sw')); }, ms || 6000); })]);
  }
  function currentSubscription() {
    if (DEMO || !('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve(null);
    return swReady(1500).then(function (reg) { return reg.pushManager.getSubscription(); }).catch(function () { return null; });
  }
  // Keep the database in step with this phone, quietly (a subscription can change on its own).
  function checkPushQuietly() {
    if (DEMO || !S.pushOn || pushSupport() !== 'yes') return;
    currentSubscription().then(function (sub) {
      if (sub) return rpc('push_subscribe', { p_token: S.token, p_sub: sub.toJSON() });
      S.pushOn = false; store.set('pushOn', false);
    }).catch(function () { /* fine: tried again next open */ });
  }
  function enablePush() {
    store.set('pushAsked', true);
    if (DEMO) { S.pushOn = true; store.set('pushOn', true); toast("You're all set. We'll send a note when the Weekly goes up."); render(); return; }
    var ask = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    Promise.resolve(ask).then(function (perm) {
      if (perm !== 'granted') { render(); toast('No problem. Everything is still right here when you open the app.'); return; }
      return swReady().then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) {
          return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
        });
      }).then(function (sub) {
        return rpc('push_subscribe', { p_token: S.token, p_sub: sub.toJSON() });
      }).then(function () {
        S.pushOn = true; store.set('pushOn', true); render();
        toast("You're all set. We'll send a note when the Weekly goes up.");
      });
    }).catch(function () { render(); toast("Alerts couldn't be turned on just now. You can try again under This phone."); });
  }
  function disablePush() {
    S.pushOn = false; store.set('pushOn', false);
    currentSubscription().then(function (sub) {
      if (!sub) return;
      var ep = sub.endpoint;
      return sub.unsubscribe().catch(function () {}).then(function () { return rpc('push_unsubscribe', { p_token: S.token, p_endpoint: ep }); });
    }).then(function () { render(); toast('Alerts are off on this phone.'); }, function () { render(); });
  }
  function pushAskCard() {
    if (!showPushAsk()) return '';
    return '<aside class="card soft push-ask" aria-labelledby="push-ask-title"><p class="kicker">' + icon('bell', 'sm') + 'Phone alerts</p>' +
      '<p class="push-q" id="push-ask-title">' + PUSH_ASK + '</p>' +
      '<p class="hint">Just two kinds: a new Weekly, and when a meetup time is set.</p>' +
      '<div class="actions"><button type="button" class="btn primary small" data-act="push-yes" id="push-yes">' + icon('bell', 'sm') + '<span>Yes, please</span></button>' +
      '<button type="button" class="btn small" data-act="push-later" id="push-later">Not now</button></div></aside>';
  }

  // "Sign out of this phone"
  function signOutPhone() {
    var tok = S.token;
    S.sheet = null; S.signOutAsk = false;
    if (S.rec) { try { S.rec.stop(); } catch (e) { /* ignore */ } }
    if (S.speakingId) stopSpeaking();
    currentSubscription().then(function (sub) {
      var ep = sub ? sub.endpoint : null;
      return rpc('sign_out', { p_token: tok, p_endpoint: ep }).catch(function () { /* offline: the session simply expires */ })
        .then(function () { if (sub) return sub.unsubscribe().catch(function () {}); });
    }).then(function () {
      signOutLocal();
      ['key', 'tokenKey', 'noteDraft', 'noteTo', 'pushOn', 'pushAsked'].forEach(store.del);
      S.noteDraft = ''; S.noteTo = { mode: 'all', ids: [] }; S.pushOn = false; S.lead = freshLead(); S.posts = []; S.poll = null;
      S.key = keyFromUrl(); S.signedOut = true;
      if (S.key) { store.set('key', S.key); gate(); } else { S.gate = { step: 'signedout' }; renderGate(); }
    });
  }

  // ------------------------------------------------------------------
  // Read it to me (on-device speech), on The Weekly only
  // ------------------------------------------------------------------
  function speechText(p) {
    var parts = ['The Weekly. ' + fmtDay(p.publish_at) + '.', p.title + '.'];
    linesOf(p.body).forEach(function (l) { parts.push(l); });
    WEEKLY_PARTS.forEach(function (s) {
      var ls = linesOf(p[s[0]]);
      if (ls.length) { parts.push(s[1] + '.'); ls.forEach(function (l) { parts.push(l); }); }
    });
    parts.push('From Team Lavender\'s.');
    return parts.map(function (t) { return /[.!?]$/.test(t) ? t : t + '.'; }).join(' ').replace(/\[|\]/g, '');
  }
  function chunk(text) {
    var bits = text.match(/[^.!?\n]+[.!?]*/g) || [text], out = [], cur = '';
    bits.forEach(function (b) {
      if ((cur + b).length > 180 && cur) { out.push(cur); cur = ''; }
      cur += b;
    });
    if (cur.trim()) out.push(cur);
    return out;
  }
  function speak(id) {
    var synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) { toast("Reading aloud isn't available on this phone."); return; }
    if (S.speakingId === id) { stopSpeaking(); return; }
    synth.cancel();
    var p = findPost(id);
    if (!p) return;
    var pieces = chunk(speechText(p));
    var voices = synth.getVoices() || [];
    // a British voice first (Tiffany, 2026-10-26), then any English voice
    var voice = voices.filter(function (v) { return /^en(-|_)GB/i.test(v.lang) && v.localService; })[0] ||
                voices.filter(function (v) { return /^en(-|_)GB/i.test(v.lang); })[0] ||
                voices.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
    S.speakingId = id; updateSpeakButtons();
    pieces.forEach(function (txt, i) {
      var u = new SpeechSynthesisUtterance(txt);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-GB'; u.rate = 1.1;
      if (i === pieces.length - 1) {
        u.onend = function () { if (S.speakingId === id) { S.speakingId = null; S.spoken[id] = true; updateSpeakButtons(); } };
      }
      u.onerror = function () { if (S.speakingId === id) { S.speakingId = null; updateSpeakButtons(); } };
      synth.speak(u);
    });
  }
  function stopSpeaking() {
    var id = S.speakingId;
    S.speakingId = null;
    if (id) S.spoken[id] = true;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    updateSpeakButtons();
  }
  function speakInner(id) {
    if (S.speakingId === id) return icon('stop') + '<span>Stop</span>';
    if (S.spoken[id]) return icon('replay') + '<span>Read it again</span>';
    return icon('speaker') + '<span>Read it to me</span>';
  }
  function readBtn(p) {
    return '<button type="button" class="btn primary read-btn" data-act="speak" data-id="' + esc(p.id) + '" id="speak-' + esc(p.id) + '">' + speakInner(p.id) + '</button>';
  }
  function updateSpeakButtons() {
    var btns = document.querySelectorAll('[data-act="speak"]');
    for (var i = 0; i < btns.length; i++) btns[i].innerHTML = speakInner(btns[i].getAttribute('data-id'));
  }

  // ------------------------------------------------------------------
  // Rendering the app
  // ------------------------------------------------------------------
  function findPost(id) {
    for (var i = 0; i < S.posts.length; i++) if (S.posts[i].id === id) return S.posts[i];
    var lp = (S.lead.posts || []).concat((S.lead.meet && S.lead.meet.meetups) || [], S.lead.looks || []);
    for (var j = 0; j < lp.length; j++) if (lp[j].id === id) return lp[j];
    return null;
  }
  function latest(kind) { return S.posts.filter(function (p) { return p.kind === kind; })[0]; }
  function has(p, kind) { return (p.my_taps || []).some(function (t) { return t.kind === kind; }); }
  function tapBtn(p, kind, text, doneText) {
    var on = has(p, kind);
    return '<button type="button" class="btn small" aria-pressed="' + on + '" data-act="tap" data-id="' + esc(p.id) + '" data-kind="' + kind + '" id="tap-' + esc(p.id) + '-' + kind + '">' +
      (on ? icon('check', 'sm') : '') + '<span>' + esc(on && doneText ? doneText : text) + '</span></button>';
  }

  // Background updates (refresh, loading leadership lists, finished taps) use softRender(): while a text
  // field has focus the screen is not rebuilt (that would move the caret and close the phone keyboard);
  // the update waits until no field is focused. Fields keep their text in state on every keystroke,
  // so a rebuild while not focused shows exactly what was typed.
  var pendingRender = false, pointerIsDown = false;
  function editingNow() {
    var a = document.activeElement;
    if (!a) return false;
    if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
    return a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset)$/i.test(a.type);
  }
  function softRender() {
    if (S.gate) return;
    if (editingNow() || pointerIsDown) { pendingRender = true; return; }
    render();
  }
  document.addEventListener('pointerdown', function () { pointerIsDown = true; }, true);
  document.addEventListener('pointerup', function () { pointerIsDown = false; }, true);
  document.addEventListener('pointercancel', function () { pointerIsDown = false; }, true);
  setInterval(function () { if (pendingRender && !editingNow() && !pointerIsDown && !S.gate) render(); }, 1200);

  function render() {
    if (S.gate) return renderGate();
    pendingRender = false;
    var focusId = document.activeElement && document.activeElement.id;
    var isLeader = S.me && S.me.role === 'leader';
    if (S.tab === 'lead' && !isLeader) S.tab = 'home';
    var body = S.tab === 'talk' ? viewTalk() : S.tab === 'why' ? viewWhy() : S.tab === 'lead' ? viewLead() : viewHome();
    $('#app').innerHTML = (S.tab === 'home' ? brandBlock(true, !S.heroFull) : barHeader()) +
      '<main id="main" tabindex="-1"><div class="wrap">' + body + '</div></main>' + navHtml(isLeader) + sheetHtml();
    if (focusId) { var el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
  }

  function barHeader() {
    var titles = { talk: 'Talk to us', why: 'The Why', lead: 'Leadership' };
    return '<header class="bar"><div class="wrap"><div class="bar-row">' + icon('sprig', 'sprig') + '<h1>' + esc(titles[S.tab]) + '</h1>' + headTools(true) + '</div>' +
      (S.tab === 'why' ? '<p class="bar-line">' + WHY_LINE + '</p>' : '') + '</div></header>';
  }

  function navHtml(isLeader) {
    var tabs = [['home', 'The Weekly', 'home'], ['talk', 'Talk to us', 'talk'], ['why', 'The Why', 'flame']];
    if (isLeader) tabs.push(['lead', 'Leadership', 'lead']);
    var unread = isLeader && S.lead.notes ? S.lead.notes.filter(function (n) { return !n.read_at; }).length : 0;
    var looks = isLeader && !isApprover() ? lookWaiting() : 0;          // JJ, Kade, Zoey: their notes + what waits for their look
    var count = unread + looks;
    var label = looks ? count + ' waiting for you' : unread + ' new notes';
    return '<nav class="tabs" aria-label="Main"><div class="row">' + tabs.map(function (t) {
      return '<button type="button" class="tab" data-act="tab" data-tab="' + t[0] + '" id="tab-' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' +
        icon(t[2]) + '<span>' + t[1] + '</span>' +
        (t[0] === 'lead' && count ? '<span class="badge" aria-label="' + label + '">' + count + '</span>' : '') + '</button>';
    }).join('') + '</div></nav>';
  }

  // ----- Page 1: The Weekly -----
  function lineList(ls) {
    return '<ul class="lines">' + ls.map(function (l) {
      var m = l.match(/^\s*shout[- ]?out:\s*(.*)$/i);
      return m ? '<li class="shout"><span class="shout-label">Shout-out:</span> ' + esc(m[1]) + '</li>' : '<li>' + esc(l) + '</li>';
    }).join('') + '</ul>';
  }
  function weeklyParts(p) {
    var h = '';
    var intro = linesOf(p.body);
    if (intro.length) h += lineList(intro);
    WEEKLY_PARTS.forEach(function (s) {
      var ls = linesOf(p[s[0]]);
      if (ls.length) h += '<section class="wk-part wk-' + s[0] + '"><h4>' + esc(s[1]) + '</h4>' + lineList(ls) + '</section>';
    });
    return h;
  }
  function viewHome() {
    var name = S.me ? firstName(S.me.name) : '';
    var weekly = latest('weekly');
    var h = '<div class="welcome"><h2>Welcome, ' + esc(name) + '</h2><p>Here is this week from Team Lavender\'s.</p></div>';
    if (!weekly) return h + '<div class="card"><p class="kicker">' + icon('sprig', 'sm') + 'The Weekly</p><p class="empty">The first Weekly arrives on a Monday morning.</p></div>' + pushAskCard();
    return h + weeklyCard(weekly, false) + pushAskCard();
  }
  // The Weekly card exactly as the team sees it. ro = read-only copy for leadership's Preview.
  function weeklyCard(weekly, ro) {
    var tid = ro ? 'weekly-title-preview' : 'weekly-title';
    return '<article class="card weekly" aria-labelledby="' + tid + '">' +
      '<p class="kicker">' + icon('sprig', 'sm') + 'The Weekly</p>' +
      '<p class="date-line">' + esc(fmtDay(weekly.publish_at || nextWeeklySlot())) + '</p>' +
      '<h3 id="' + tid + '">' + esc(weekly.title) + '</h3>' +
      '<div class="read-row">' + (ro ? '<button type="button" class="btn primary read-btn" disabled>' + speakInner('') + '</button>' : readBtn(weekly)) + '</div>' +
      weeklyParts(weekly) +
      (safeUrl(weekly.image_url) ? '<img class="post-img" src="' + esc(weekly.image_url) + '" alt="' + esc(weekly.title) + '" loading="lazy">' : '') +
      '<div class="weekly-foot"><p class="signed">Team Lavender\'s</p>' +
      (ro ? '<button type="button" class="btn icon-only heart" disabled aria-label="Love this">' + icon('heart') + '</button>'
          : '<button type="button" class="btn icon-only heart" data-act="tap" data-kind="heart" data-id="' + esc(weekly.id) + '" id="heart-' + esc(weekly.id) + '" aria-pressed="' + has(weekly, 'heart') + '" aria-label="Love this">' + icon('heart') + '</button>') +
      '</div></article>';
  }

  // ----- Page 2: Talk to us -----
  function nextMeetups() {
    var now = Date.now();
    return S.posts.filter(function (p) { return p.kind === 'meetup' && p.starts_at && new Date(p.starts_at).getTime() > now - 6 * 3600e3; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
  }
  function rsvpBlock(p) {
    var yes = has(p, 'rsvp_yes'), no = has(p, 'rsvp_no');
    return '<div class="choice-row">' + tapBtn(p, 'rsvp_yes', "I'll be there") + tapBtn(p, 'rsvp_no', "Can't make it") + '</div>' +
      (yes ? '<p class="done-note">Wonderful. See you there.</p>' : no ? '<p class="done-note">Thank you for letting us know.</p>' : '');
  }
  function meetupCard(m) {
    return '<article class="card meetup" aria-labelledby="meet-' + esc(m.id) + '"><p class="kicker">' + icon('calendar', 'sm') + 'Team Lab Meetup</p>' +
      '<h3 id="meet-' + esc(m.id) + '">' + esc(fmtDay(m.starts_at) + ' · ' + fmtTime(m.starts_at)) + '</h3>' +
      (m.body ? '<p class="body-text">' + esc(m.body) + '</p>' : '') +
      '<p>Optional, come if you can.</p>' + rsvpBlock(m) +
      '<p class="signed">Team Lavender\'s</p></article>';
  }
  function pollCard(pl) {
    var mine = pl.options.some(function (o) { return o.mine; });
    return '<article class="card poll" aria-labelledby="poll-title"><p class="kicker">' + icon('calendar', 'sm') + 'Next meetup time</p>' +
      '<h3 id="poll-title">When works for you?</h3>' +
      (pl.note ? '<p class="body-text">' + esc(pl.note) + '</p>' : '') +
      '<p class="hint" id="poll-help">Tap every time that works for you.</p>' +
      '<div class="poll-opts" role="group" aria-labelledby="poll-title" aria-describedby="poll-help">' + pl.options.map(function (o) {
        return '<button type="button" class="poll-opt" data-act="vote" data-id="' + esc(o.id) + '" id="vote-' + esc(o.id) + '" aria-pressed="' + !!o.mine + '">' +
          '<span class="tick" aria-hidden="true">' + (o.mine ? icon('check', 'sm') : '') + '</span>' +
          '<span class="when">' + esc(fmtWhen(o.starts_at)) + '</span>' +
          '<span class="count">' + (o.count ? o.count + ' can make it' : 'Tap if it works') + '</span></button>';
      }).join('') + '</div>' +
      (mine ? '<p class="done-note">Thank you. The leadership team will pick the time that works best.</p>' : '') +
      '<p class="signed">Team Lavender\'s</p></article>';
  }
  function toChoices() {
    var leaders = S.leaders.filter(function (l) { return !S.me || l.id !== S.me.id; });
    var some = S.noteTo.mode === 'some';
    return '<fieldset class="to-choice"><legend>Who should see this?</legend>' +
      '<label class="radio-row" for="to-all"><input type="radio" name="to" id="to-all" value="all" data-to="mode"' + (!some ? ' checked' : '') + '> The leadership team</label>' +
      '<label class="radio-row" for="to-some"><input type="radio" name="to" id="to-some" value="some" data-to="mode"' + (some ? ' checked' : '') + '> Just these people:</label>' +
      '<div class="to-names">' + leaders.map(function (l) {
        var on = some && S.noteTo.ids.indexOf(l.id) >= 0;
        return '<label class="check-row" for="to-' + esc(l.id) + '"><input type="checkbox" id="to-' + esc(l.id) + '" data-to="id" value="' + esc(l.id) + '"' + (on ? ' checked' : '') + '> ' + esc(l.name) + '</label>';
      }).join('') + '</div></fieldset>';
  }
  function viewTalk() {
    var ms = nextMeetups(), h = '';
    if (ms.length) h += meetupCard(ms[0]);
    if (S.poll && S.poll.options && S.poll.options.length) h += pollCard(S.poll);
    if (!ms.length && !(S.poll && S.poll.options && S.poll.options.length)) {
      h += '<article class="card"><p class="kicker">' + icon('calendar', 'sm') + 'Team Lab Meetup</p><p class="empty">The next meetup will show here.</p></article>';
    }

    h += '<section class="card mind" aria-labelledby="mind-title">';
    if (S.noteSent) {
      var who = S.noteSent.names && S.noteSent.names.length ? joinNames(S.noteSent.names) + ' will see this.' : 'The leadership team will see this.';
      h += '<div class="thanks" role="status"><div class="check">' + icon('check') + '</div>' +
        '<p class="big">Thank you.</p><p>' + esc(who) + '</p>' +
        '<div class="actions" style="justify-content:center"><button type="button" class="btn small" data-act="note-again" id="note-again">Write another</button></div></div>';
    } else {
      var listening = !!S.rec;
      h += '<h3 id="mind-title">What\'s on your mind?</h3>' +
        '<p id="mind-help" class="hint">' + esc(MIND_HELP) + '</p>' +
        '<label class="sr-only" for="note">Your note</label>' +
        '<textarea id="note" aria-describedby="mind-help" maxlength="4000" placeholder="Type here, or tap to talk">' + esc(S.noteDraft) + '</textarea>' +
        (S.micHint ? '<p class="hint" role="status">Tap in the box, then tap the microphone on your keyboard to talk.</p>' : '') +
        toChoices() +
        '<div class="actions">' +
        '<button type="button" class="btn' + (listening ? ' listening' : '') + '" data-act="talk" id="talk-btn" aria-pressed="' + listening + '">' + icon('mic') + '<span>' + (listening ? 'Listening… tap to stop' : 'Tap to talk') + '</span></button>' +
        '<button type="button" class="btn primary" data-act="send-note" id="send-note">' + icon('send') + '<span>Send</span></button>' +
        '</div>';
    }
    h += '</section>';
    return h;
  }

  // ----- Page 3: The Why -----
  function viewWhy() {
    var why = latest('why'), tr = latest('try'), h = '';
    if (why) {
      h += whyCard(why, false);
    } else {
      h += '<article class="card why-card"><p class="kicker">' + icon('flame', 'sm') + 'The why</p><p class="empty">The why behind what we do will show here.</p></article>';
    }
    if (tr) {
      h += tryCard(tr, false);
    } else {
      h += '<article class="card try-card"><p class="kicker">' + icon('star', 'sm') + 'This Month\'s Share</p><p class="empty">This month\'s share will show here.</p></article>';
    }
    return h;
  }

  function whyCard(why, ro) {
    var tid = ro ? 'why-title-preview' : 'why-title';
    return '<article class="card why-card" aria-labelledby="' + tid + '"><p class="kicker">' + icon('flame', 'sm') + 'The why</p>' +
      '<h3 id="' + tid + '" class="why-quote">' + esc(why.title) + '</h3>' +
      (safeUrl(why.image_url) ? '<img class="post-img" src="' + esc(why.image_url) + '" alt="' + esc(why.title) + '" loading="lazy">' : '') +
      (why.body ? '<p class="body-text">' + esc(why.body) + '</p>' : '') +
      '<p class="signed">Team Lavender\'s</p></article>';
  }
  function tryCard(tr, ro) {
    var tid = ro ? 'try-title-preview' : 'try-title';
    return '<article class="card try-card" aria-labelledby="' + tid + '"><p class="kicker">' + icon('star', 'sm') + 'This Month\'s Share</p>' +
      '<p class="meta">' + esc((tr.label ? tr.label + ' · ' : '') + fmt(tr.publish_at || new Date().toISOString(), { month: 'long' })) + '</p>' +
      '<h3 id="' + tid + '">' + esc(tr.title) + '</h3>' +
      (tr.body ? '<p class="body-text">' + esc(tr.body) + '</p>' : '') +
      '<p class="signed">Team Lavender\'s</p></article>';
  }

  // ----- Leadership -----
  // Tiffany (the approver) runs the leadership side. The other leaders only get their notes:
  // the database refuses them everything else, so the app doesn't even ask.
  function loadLead(quiet) {
    if (!S.me || S.me.role !== 'leader') return Promise.resolve();
    S.lead.loading = true;
    var tok = S.token, owner = isApprover();
    var calls = [rpc('leader_notes', { p_token: tok }), rpc('leader_unanswered_count', { p_token: tok })];
    if (owner) calls.push(rpc('leader_posts', { p_token: tok }), rpc('leader_people', { p_token: tok }), rpc('leader_meetups', { p_token: tok }));
    else calls.push(rpc('leader_for_look', { p_token: tok }));
    return Promise.all(calls).then(function (r) {
      if (tok !== S.token) return;
      S.lead.notes = r[0] || [];
      S.lead.unanswered = (r[1] && r[1].count) || 0;
      if (owner) {
        S.lead.posts = r[2].posts || []; S.lead.nextSlot = r[2].next_weekly_slot; S.lead.people = r[3] || [];
        S.lead.meet = r[4] || { meetups: [], polls: [] };
      } else S.lead.looks = r[2] || [];
      S.lead.loading = false;
      softRender();
    }, function (e) { S.lead.loading = false; if (!quiet) handleErr(e); });
  }
  function approverName() {
    var a = (S.lead.people || []).filter(function (p) { return p.approver; })[0];
    if (a) return firstName(a.name);
    return S.leaders && S.leaders[0] ? firstName(S.leaders[0].name) : 'Tiffany';   // the feed lists the approver first
  }
  function viewLead() {
    var L = S.lead;
    if (!isApprover()) {
      // JJ, Kade, Zoey: only the notes the team sends to them
      var hn = '<p class="callout plain" id="owner-line" style="margin:16px 0 6px">Notes the team sends to you. ' + esc(approverName()) + ' takes care of the rest.</p>';
      if (!L.notes) return hn + '<p class="loading">Loading…</p>';
      var lk = forLook();
      return hn + lk + (lk ? '<h2 class="section-title" id="notes-title">Notes</h2>' : '') + leadNotes();
    }
    var unread = (L.notes || []).filter(function (n) { return !n.read_at; }).length;
    var drafts = (L.posts || []).filter(function (p) { return p.status === 'draft'; }).length;
    var pollDrafts = L.meet ? L.meet.polls.filter(function (p) { return p.status === 'draft'; }).length : 0;
    var subs = [['posts', 'Posts', drafts], ['notes', 'Notes', unread], ['meetup', 'Meetup', pollDrafts], ['people', 'People', 0]];
    var cur = L.sub === 'form' ? 'posts' : L.sub;
    var h = '<p class="section-sub" style="margin-top:16px">Only the leadership team sees this tab.</p>' +
      '<div class="seg" role="group" aria-label="Leadership sections">' + subs.map(function (s) {
        return '<button type="button" data-act="lead-sub" data-sub="' + s[0] + '" id="sub-' + s[0] + '" aria-pressed="' + (cur === s[0]) + '">' + esc(s[1]) +
          (s[2] ? '<span class="dot" aria-hidden="true"></span><span class="sr-only"> (' + s[2] + ' waiting)</span>' : '') + '</button>';
      }).join('') + '</div>';
    if (!L.notes || !L.meet) return h + '<p class="loading">Loading…</p>';
    if (L.sub === 'notes') h += leadNotes();
    else if (L.sub === 'posts') h += leadPosts();
    else if (L.sub === 'form') h += leadForm();
    else if (L.sub === 'meetup') h += leadMeetup();
    else h += leadPeople();
    return h;
  }

  // "For your look": what Tiffany sent to JJ, Kade and Zoey before it goes to the team.
  function lookWaiting() { return (S.lead.looks || []).filter(function (p) { return !p.mine; }).length; }
  function lookSaid(m) {
    if (!m) return '';
    return m.looks_good ? 'Looks good' + (m.thought ? ', \u201c' + m.thought + '\u201d' : '') : '\u201c' + (m.thought || '') + '\u201d';
  }
  function forLook() {
    var L = S.lead, list = L.looks || [];
    if (!list.length) return '';
    var h = '<h2 class="section-title" id="look-title">For your look</h2><p class="section-sub">' + esc(approverName()) +
      ' would love your eyes on ' + (list.length === 1 ? 'this' : 'these') + ' before ' + (list.length === 1 ? 'it goes' : 'they go') + ' to the team.</p>';
    list.forEach(function (p) {
      var m = p.mine, txt = L.lookText[p.id] != null ? L.lookText[p.id] : (m && m.thought) || '';
      h += '<article class="card look-row' + (m ? '' : ' unread') + '" id="lookcard-' + p.id + '"><span class="pill' + (p.kind === 'weekly' ? '' : ' plum') + '">' + esc(KIND_NAMES[p.kind] + (p.label ? ' · ' + p.label : '')) + '</span>' +
        '<h4>' + esc(p.title) + '</h4>' +
        (m ? '<p class="look-mine" id="mine-' + p.id + '">' + icon('check', 'sm') + '<span>You said: ' + esc(lookSaid(m)) + '</span></p><p class="hint" style="margin-top:2px">You can change it until it goes out.</p>'
           : '<p class="meta"><span class="pill new">New</span> Waiting for your look</p>') +
        '<div class="actions"><button type="button" class="btn small" data-act="preview" data-id="' + p.id + '" id="preview-' + p.id + '">' + icon('eye', 'sm') + '<span>Open</span></button>' +
        '<button type="button" class="btn small primary" data-act="look-good" data-id="' + p.id + '" id="lookok-' + p.id + '" aria-pressed="' + !!(m && m.looks_good) + '">' + icon('check', 'sm') + '<span>Looks good</span></button></div>' +
        '<label class="lbl" for="look-' + p.id + '">A short thought (optional)</label>' +
        '<textarea id="look-' + p.id + '" class="short look-text" data-look="' + p.id + '" maxlength="500">' + esc(txt) + '</textarea>' +
        '<div class="actions"><button type="button" class="btn small" data-act="look-thought" data-id="' + p.id + '" id="lookthought-' + p.id + '">Send my thought</button></div>' +
        '</article>';
    });
    return h;
  }
  function sendLook(id, good) {
    var p = (S.lead.looks || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var t = S.lead.lookText[id] != null ? S.lead.lookText[id] : (p.mine && p.mine.thought) || '';
    if (!good && !t.trim()) { toast(FRIENDLY.empty_note); var ta = document.getElementById('look-' + id); if (ta) ta.focus(); return; }
    var lg = good ? true : !!(p.mine && p.mine.looks_good);
    rpc('leader_look', { p_token: S.token, p_post_id: id, p_looks_good: lg, p_thought: t }).then(function (r) {
      p.mine = r.mine; delete S.lead.lookText[id];
      toast(good ? 'Thank you. ' + approverName() + ' will see that it looks good.' : 'Thank you. ' + approverName() + ' will see your thought.');
      render();
    }, function (e) { handleErr(e); loadLead(true); });
  }

  // Notes
  function toLine(n) {
    if (n.audience !== 'chosen') return 'To the leadership team';
    var to = n.to || [];
    if (to.length === 1 && S.me && to[0] === S.me.name) return 'Just for you';
    return 'Just for ' + joinNames(to);
  }
  function leadNotes() {
    var L = S.lead, open = L.notes.filter(function (n) { return !n.handled_at; }), done = L.notes.filter(function (n) { return n.handled_at; });
    var list = L.showHandled ? done : open;
    var h = '<p class="hint" style="margin-top:10px">Answer one to one, in person or by text.</p>' +
      '<div class="filter" role="group" aria-label="Which notes">' +
      '<button type="button" class="btn small" data-act="notes-filter" data-v="open" id="nf-open" aria-pressed="' + !L.showHandled + '">Open (' + open.length + ')</button>' +
      '<button type="button" class="btn small" data-act="notes-filter" data-v="done" id="nf-done" aria-pressed="' + L.showHandled + '">Handled (' + done.length + ')</button></div>';
    if (L.unanswered && !L.showHandled) h += '<p class="callout plain" style="margin:6px 0 12px">' + L.unanswered + (L.unanswered === 1 ? ' note has' : ' notes have') + ' been waiting over a day.</p>';
    if (!list.length) return h + '<p class="empty">' + (L.showHandled ? 'Nothing handled yet.' : 'All caught up. New notes from the team show here.') + '</p>';
    list.forEach(function (n) {
      var expanded = !!L.open[n.id];
      h += '<article class="card note' + (n.read_at ? '' : ' unread') + (expanded ? '' : ' collapsed') + '">' +
        '<div class="note-head"><strong>' + esc(n.from) + '</strong><span class="meta">' + (n.read_at ? '' : '<span class="pill new">New</span> ') + esc(fmtShort(n.created_at)) + '</span></div>' +
        '<p class="to-line' + (n.audience === 'chosen' ? ' chosen' : '') + '">' + icon(n.audience === 'chosen' ? 'lock' : 'person', 'sm') + esc(toLine(n)) + '</p>' +
        '<p class="note-body">' + esc(n.body) + '</p><div class="actions">';
      if (!expanded) h += '<button type="button" class="btn small" data-act="note-open" data-id="' + n.id + '" id="open-' + n.id + '">Open</button>';
      h += '<button type="button" class="btn small" data-act="handled" data-id="' + n.id + '" data-v="' + (n.handled_at ? '0' : '1') + '" id="handled-' + n.id + '">' + (n.handled_at ? 'Move back to open' : icon('check', 'sm') + '<span>Mark handled</span>') + '</button></div>' +
        (n.handled_at ? '<p class="meta">Handled' + (n.handled_by ? ' by ' + esc(n.handled_by) : '') + ' · ' + esc(fmtShort(n.handled_at)) + '</p>' : '');
      h += '</article>';
    });
    return h;
  }

  // Posts
  function countsLine(p) {
    var c = p.counts || {}, bits = [];
    var names = { heart: 'hearts', tried: 'tried it', rsvp_yes: 'coming', rsvp_no: "can't make it" };
    Object.keys(names).forEach(function (k) { if (c[k]) bits.push(c[k] + ' ' + names[k]); });
    return bits.length ? '<p class="counts">' + esc(bits.join(' · ')) + '</p>' : '';
  }
  function isApprover() { return !!(S.me && S.me.approver); }
  function canEdit() { return isApprover(); }
  function canApprove(p) { return isApprover() && p.status !== 'published'; }
  function canTakeDown(p) { return isApprover() && p.status !== 'draft'; }
  function canDelete(p) { return isApprover() && p.status === 'draft'; }
  // An in-app "are you sure?" box (no browser pop-ups).
  function confirmBox(c, yesText, noText) {
    return '<div class="linkbox" role="group" aria-labelledby="confirm-text"><p id="confirm-text" style="margin:0 0 6px;font-weight:700">' + esc(c.text) + '</p>' +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn primary small" data-act="confirm-yes" id="confirm-yes">' + esc(yesText) + '</button>' +
      '<button type="button" class="btn small" data-act="confirm-no" id="confirm-no">' + esc(noText || 'Keep it') + '</button></div></div>';
  }
  function lateBox(p) {
    return '<div class="linkbox" role="group" aria-labelledby="late-text"><p id="late-text" style="margin:0 0 6px;font-weight:700">' +
      'This Weekly was planned for ' + esc(p.publish_at ? fmtShort(p.publish_at) : 'earlier') + ', and that time has passed. When should it go out?</p>' +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn primary small" data-act="late-now" data-id="' + p.id + '" id="late-now">Send now</button>' +
      '<button type="button" class="btn small" data-act="late-monday" data-id="' + p.id + '" id="late-monday">Next Monday 8am</button>' +
      '<button type="button" class="btn quiet small" data-act="late-cancel" id="late-cancel">Not yet</button></div></div>';
  }
  function whoBox(id) {
    var w = S.lead.who[id];
    if (w === 'loading') return '<p class="meta">Loading…</p>';
    if (!w) return '';
    var groups = {}, names = { rsvp_yes: "I'll be there", rsvp_no: "Can't make it", tried: 'I tried it', heart: 'Hearts' };
    w.taps.forEach(function (t) { var k = names[t.kind] || t.kind; (groups[k] = groups[k] || []).push(t.name); });
    return '<div class="who" role="region" aria-label="Who tapped">' + (Object.keys(groups).length ? Object.keys(groups).map(function (k) {
      return '<h5>' + esc(k) + '</h5><p>' + esc(groups[k].join(', ')) + '</p>';
    }).join('') : '<p>No taps yet.</p>') + (w.not_yet.length ? '<h5>Not yet</h5><p>' + esc(w.not_yet.join(', ')) + '</p>' : '') + '</div>';
  }
  // Everything a post says, line by line (headings for the Weekly's parts), for the folded card.
  function postLines(p) {
    var out = [];
    if (p.kind === 'weekly') {
      linesOf(p.body).forEach(function (l) { out.push({ text: l }); });
      WEEKLY_PARTS.forEach(function (s) { linesOf(p[s[0]]).forEach(function (l, i) { out.push({ text: l, head: i === 0 ? s[1] : null }); }); });
    } else linesOf(p.body).forEach(function (l) { out.push({ text: l }); });
    return out;
  }
  // Headline is shown above; here: the first two lines, and "Show all" opens the rest.
  function postPreview(p) {
    var all = postLines(p);
    if (!all.length) return '';
    var open = !!S.lead.unfold[p.id], shown = open ? all : all.slice(0, 2), h = '', inList = false;
    shown.forEach(function (l) {
      if (l.head) { if (inList) { h += '</ul>'; inList = false; } h += '<h4 class="fold-head">' + esc(l.head) + '</h4>'; }
      if (!inList) { h += '<ul class="lines">'; inList = true; }
      var m = l.text.match(/^\s*shout[- ]?out:\s*(.*)$/i);
      h += m ? '<li class="shout"><span class="shout-label">Shout-out:</span> ' + esc(m[1]) + '</li>' : '<li>' + esc(l.text) + '</li>';
    });
    if (inList) h += '</ul>';
    var more = all.length > 2;
    return '<div class="preview' + (open ? '' : ' folded') + '" id="fold-' + p.id + '">' + h + '</div>' +
      (more ? '<button type="button" class="link-btn fold-btn" data-act="fold" data-id="' + p.id + '" id="foldbtn-' + p.id + '" aria-expanded="' + open + '" aria-controls="fold-' + p.id + '">' +
        (open ? 'Show less' : 'Show all (' + all.length + ' lines)') + '</button>' : '');
  }
  function monthName(iso) { return fmt(iso, { month: 'long' }); }
  function draftWhen(p) {
    var future = p.publish_at && new Date(p.publish_at) > new Date();
    if (p.kind === 'weekly') return p.publish_at ? ' · planned ' + fmtShort(p.publish_at) : '';
    if (p.kind === 'try') return ' · for ' + monthName(future ? p.publish_at : new Date().toISOString());
    return future ? ' · planned ' + fmtShort(p.publish_at) : ' · goes out when approved';
  }
  // "JJ: Looks good · Kade: “a thought” · Zoey: not yet"
  function looksLine(p) {
    var ls = p.looks || [];
    if (!ls.length) return '';
    return '<p class="looks" id="looks-' + p.id + '">' + ls.map(function (l) {
      return '<span class="look' + (l.answered ? '' : ' waiting') + '"><strong>' + esc(firstName(l.name)) + ':</strong> ' +
        esc(l.answered ? lookSaid(l) : 'not yet') + '</span>';
    }).join('<span aria-hidden="true"> · </span>') + '</p>';
  }
  function postRow(p) {
    var L = S.lead, status;
    var by = p.created_by ? ' by ' + p.created_by : ' from Harmonia';
    if (p.status === 'draft') status = (p.kind === 'try' ? 'Suggestion' : 'Draft') + by + draftWhen(p);
    else if (p.status === 'leader_review') status = 'With the leadership team for a look' + draftWhen(p);
    else if (p.status === 'approved') status = 'Approved' + (p.approved_by ? ' by ' + p.approved_by : '') + ' · goes out ' + fmtShort(p.publish_at);
    else status = 'Out since ' + fmtShort(p.publish_at);
    var h = '<article class="card post-row"><span class="pill' + (p.kind === 'weekly' ? '' : ' plum') + '">' + esc(KIND_NAMES[p.kind] + (p.label ? ' · ' + p.label : '')) + '</span>' +
      '<h4>' + esc(p.title) + '</h4><p class="meta">' + esc(status) + '</p>' + countsLine(p);
    if (p.status === 'leader_review') h += looksLine(p);
    h += postPreview(p);
    h += '<div class="actions">';
    if (canApprove(p) && L.approving !== p.id) {
      h += '<button type="button" class="btn small primary" data-act="approve-open" data-id="' + p.id + '" id="approve-' + p.id + '">' + icon('check', 'sm') + '<span>' +
        (p.status === 'approved' ? 'Change time' : p.status === 'leader_review' ? 'Send to the team' : p.kind === 'try' ? 'Pick this one' : 'Approve') + '</span></button>';
    }
    if (isApprover() && p.status === 'draft') h += '<button type="button" class="btn small" data-act="send-look" data-id="' + p.id + '" id="sendlook-' + p.id + '">' + icon('person', 'sm') + '<span>Send to leadership first</span></button>';
    if (p.status === 'draft' || p.status === 'leader_review') h += '<button type="button" class="btn small" data-act="preview" data-id="' + p.id + '" id="preview-' + p.id + '">' + icon('eye', 'sm') + '<span>Preview</span></button>';
    if (canEdit(p)) h += '<button type="button" class="btn small" data-act="edit-post" data-id="' + p.id + '" id="edit-' + p.id + '">' + icon('edit', 'sm') + '<span>Edit</span></button>';
    if (p.status === 'published' && p.kind === 'weekly') h += '<button type="button" class="btn small" data-act="who" data-id="' + p.id + '" id="who-' + p.id + '" aria-expanded="' + !!L.who[p.id] + '">' + icon('eye', 'sm') + '<span>Who tapped</span></button>';
    if (canTakeDown(p)) h += '<button type="button" class="btn small" data-act="ask-takedown" data-id="' + p.id + '" id="takedown-' + p.id + '">' + (p.status === 'leader_review' ? 'Back to drafts' : 'Take down') + '</button>';
    if (canDelete(p)) h += '<button type="button" class="link-btn quiet-link" data-act="ask-delete" data-id="' + p.id + '" id="delete-' + p.id + '">Delete draft</button>';
    h += '</div>';
    if (L.confirm && L.confirm.id === p.id) h += L.confirm.kind === 'takedown' ? confirmBox(L.confirm, p.status === 'leader_review' ? 'Back to drafts' : 'Take it down') : confirmBox(L.confirm, 'Yes, delete', 'Keep it');
    if (L.late === p.id) h += lateBox(p);
    if (p.status === 'draft' && !isApprover()) h += '<p class="hint">Waiting for ' + esc(approverName()) + ' to approve.</p>';
    if (L.approving === p.id) {
      h += '<div class="linkbox"><label class="lbl" for="approve-at" style="margin-top:0">Goes out (Arizona time)</label>' +
        '<input type="datetime-local" id="approve-at" value="' + esc(L.approveAt) + '">' +
        '<p class="hint">' + (p.kind === 'weekly' ? 'The Weekly usually goes out Monday at 8:00am.' : 'Leave as is to post right now.') + '</p>' +
        '<div class="actions"><button type="button" class="btn primary small" data-act="approve" data-id="' + p.id + '" id="approve-go">' + (p.status === 'leader_review' ? 'Send to the team' : p.kind === 'try' ? 'Pick this one' : 'Approve') + '</button>' +
        '<button type="button" class="btn small" data-act="approve-cancel" id="approve-cancel">Cancel</button></div></div>';
    }
    h += whoBox(p.id);
    return h + '</article>';
  }
  // "Preview": the draft exactly as the team will see it, read-only, in a sheet with a clear Back.
  function previewSheet() {
    var p = findPost(S.previewId);
    if (!p) return '';
    var where = p.kind === 'weekly' ? 'on The Weekly' : 'on The Why';
    var card = p.kind === 'weekly' ? weeklyCard(p, true) : p.kind === 'why' ? whyCard(p, true) : tryCard(p, true);
    return '<div class="sheet-back" data-act="preview-close"><div class="sheet preview-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-stop="1">' +
      '<div class="preview-top"><button type="button" class="btn small" data-act="preview-close" id="preview-back">Back</button>' +
      '<h2 id="sheet-title">Preview</h2></div>' +
      '<p class="hint" style="margin-top:0">How the team will see it ' + where + '. Nothing is sent from here.</p>' +
      '<div class="preview-frame" inert>' + card + '</div>' +
      '<button type="button" class="btn primary block" data-act="preview-close" id="preview-done">Back</button></div></div>';
  }
  function leadPosts() {
    var ps = S.lead.posts;
    var h = !isApprover() ? '' : '<div class="actions new-row" style="margin-top:6px">' +
      '<button type="button" class="btn primary small" data-act="new-post" data-kind="weekly" id="new-weekly">' + icon('plusbox', 'sm') + '<span>New Weekly</span></button>' +
      '<button type="button" class="btn small" data-act="new-post" data-kind="why" id="new-why">' + icon('plusbox', 'sm') + '<span>New Why</span></button>' +
      '<button type="button" class="btn small" data-act="new-post" data-kind="try" id="new-try">' + icon('plusbox', 'sm') + '<span>New Share</span></button></div>';
    var drafts = ps.filter(function (p) { return p.status === 'draft'; });
    var main = drafts.filter(function (p) { return p.kind !== 'try'; }).sort(function (x, y) { return (x.kind === 'weekly' ? 0 : 1) - (y.kind === 'weekly' ? 0 : 1); }),   // the Weekly first
      tries = drafts.filter(function (p) { return p.kind === 'try'; });
    h += '<h2 class="section-title">' + (isApprover() ? 'Waiting for your OK' : 'Drafts') + '</h2>';
    if (!drafts.length) h += '<p class="empty">No drafts waiting.</p>';
    h += main.map(postRow).join('');
    if (tries.length) {
      h += '<h2 class="section-title" id="try-pick-title">This Month\'s Share: pick one</h2><p class="section-sub">' + (tries.length > 1 ? 'Harmonia\'s suggestions. Picking one clears the others.' : 'Picking it puts it on The Why.') + '</p>' + tries.map(postRow).join('');
    }
    var review = ps.filter(function (p) { return p.status === 'leader_review'; });
    if (review.length) {
      h += '<h2 class="section-title" id="review-title">With the leadership team</h2><p class="section-sub">Their answers show as they come in. Send it to the team whenever you\u2019re ready; you have the final say.</p>' +
        review.map(postRow).join('');
    }
    var sched = ps.filter(function (p) { return p.status === 'approved'; });
    if (sched.length) h += '<h2 class="section-title">Scheduled</h2>' + sched.map(postRow).join('');
    var out = ps.filter(function (p) { return p.status === 'published'; }).slice(0, 9);
    h += '<h2 class="section-title">Out now</h2>' + (out.length ? out.map(postRow).join('') : '<p class="empty">Nothing posted yet.</p>');
    return h;
  }

  function blankForm(kind) {
    return { kind: kind || 'weekly', label: '', title: '', body: '', heads_ups: '', reminders: '', asked_did: '', image_url: '', publish_at: '' };
  }
  function formFromPost(p) {
    return { id: p.id, status: p.status, kind: p.kind, label: p.label || '', title: p.title, body: p.body || '', heads_ups: p.heads_ups || '',
      reminders: p.reminders || '', asked_did: p.asked_did || '', image_url: p.image_url || '', publish_at: toLocalInput(p.publish_at) };
  }
  function field(id, label, html, hint) {
    return '<label class="lbl" for="f-' + id + '">' + label + '</label>' + html + (hint ? '<p class="hint" id="f-' + id + '-hint">' + hint + '</p>' : '');
  }
  function inputF(id, type, val, extra) { return '<input id="f-' + id + '" data-field="' + id + '" type="' + type + '" value="' + esc(val) + '"' + (extra || '') + '>'; }
  function areaF(id, val, extra) { return '<textarea id="f-' + id + '" data-field="' + id + '"' + (extra || '') + '>' + esc(val) + '</textarea>'; }
  function leadForm() {
    var L = S.lead;
    if (!L.form) L.form = blankForm();
    var f = L.form, k = f.kind, editing = !!f.id;
    var h = '<form class="card" data-form="post" novalidate>' +
      '<h3 style="margin-top:0">' + (editing ? 'Edit ' : 'New ') + esc({ weekly: 'Weekly', why: 'Why', try: "This Month's Share" }[k]) + '</h3>';
    if (!editing || f.status === 'draft') {
      h += field('kind', 'What is it?', '<select id="f-kind" data-field="kind">' + ['weekly', 'why', 'try'].map(function (key) {
        return '<option value="' + key + '"' + (k === key ? ' selected' : '') + '>' + KIND_NAMES[key] + '</option>';
      }).join('') + '</select>');
    }
    if (k === 'weekly') {
      h += field('title', 'Headline', inputF('title', 'text', f.title, ' maxlength="200"'));
      h += field('body', 'Our weekly in touch (one line each)', areaF('body', f.body, ' maxlength="8000"'), 'Start a line with "Shout-out:" to celebrate someone.');
      h += field('heads_ups', 'Heads-ups (one per line)', areaF('heads_ups', f.heads_ups, ' maxlength="4000" class="short"'));
      h += field('reminders', 'Reminders (one per line)', areaF('reminders', f.reminders, ' maxlength="4000" class="short"'), 'Include what we agreed at the last meetup.');
      h += field('asked_did', 'You asked, we did (one per line)', areaF('asked_did', f.asked_did, ' maxlength="4000" class="short"'), 'What came from the team\'s suggestions. No names.');
      h += field('image_url', 'Photo or drawing link (optional)', inputF('image_url', 'url', f.image_url, ' placeholder="https://"'));
    } else if (k === 'why') {
      h += field('title', 'The why, in one line', inputF('title', 'text', f.title, ' maxlength="200"'));
      h += field('body', 'A few words about it (optional)', areaF('body', f.body, ' maxlength="8000"'), 'The mission, a decision, what we want for our clients.');
      h += field('image_url', 'Photo or drawing link (optional)', inputF('image_url', 'url', f.image_url, ' placeholder="https://"'));
    } else {
      h += field('title', 'This month\'s share', inputF('title', 'text', f.title, ' maxlength="200"'));
      h += field('label', 'What kind?', '<select id="f-label" data-field="label"><option value="">Choose one (optional)</option>' + TRY_LABELS.map(function (l) {
        return '<option' + (f.label === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>');
      h += field('body', 'How to work it into your day', areaF('body', f.body, ' maxlength="8000"'));
    }
    if (!editing || f.status === 'draft' || f.status === 'leader_review') {
      h += field('publish_at', k === 'try' ? 'Which month is it for? Pick its first day (Arizona time)' : 'When should it go out? (Arizona time)',
        inputF('publish_at', 'datetime-local', f.publish_at || (k === 'weekly' ? toLocalInput(L.nextSlot || nextWeeklySlot()) : '')),
        k === 'weekly' ? 'The Weekly usually goes out Monday at 8:00am.' : k === 'try' ? 'Leave empty for this month, as soon as you pick it.' : 'Leave empty to post as soon as it is approved.');
    }
    h += '<div class="actions">';
    if (editing && f.status !== 'draft') {
      h += '<button type="button" class="btn primary" data-act="save-post" data-then="none" id="save-post">Save changes</button>';
    } else {
      h += '<button type="button" class="btn" data-act="save-post" data-then="none" id="save-post">Save draft</button>';
      if (isApprover()) h += '<button type="button" class="btn primary" data-act="save-post" data-then="approve" id="save-approve">' + icon('check', 'sm') + '<span>' + (k === 'weekly' ? 'Approve' : 'Approve and post') + '</span></button>';
      if (isApprover()) h += '<button type="button" class="btn" data-act="save-post" data-then="look" id="save-look">' + icon('person', 'sm') + '<span>Send to leadership first</span></button>';
    }
    h += '<button type="button" class="btn quiet" data-act="cancel-form" id="cancel-form">Cancel</button></div>';
    if (!isApprover()) h += '<p class="hint">' + esc(approverName()) + ' approves everything before the team sees it. It waits in drafts for her.</p>';
    h += '<p class="hint">Everything posts signed "Team Lavender\'s".</p></form>';
    return h;
  }

  // Meetup and time poll
  function leadMeetup() {
    var L = S.lead, M = L.meet, h = '';
    h += '<h2 class="section-title">Next meetup</h2>';
    if (!M.meetups.length) h += '<p class="empty">No meetup set yet. Pick a time from the poll, or set one below.</p>';
    M.meetups.forEach(function (m) {
      h += '<article class="card post-row"><span class="pill plum">' + icon('calendar', 'sm') + 'Team Lab Meetup</span>' +
        '<h4>' + esc(fmtDay(m.starts_at) + ' · ' + fmtTime(m.starts_at)) + '</h4>' + (m.body ? '<p class="body-text meta">' + esc(m.body) + '</p>' : '') + countsLine(m) +
        '<div class="actions"><button type="button" class="btn small" data-act="who" data-id="' + m.id + '" id="who-' + m.id + '" aria-expanded="' + !!L.who[m.id] + '">' + icon('eye', 'sm') + '<span>Who\'s coming</span></button>' +
        (isApprover() ? '<button type="button" class="btn small" data-act="ask-meet-down" data-id="' + m.id + '" id="meetdown-' + m.id + '">Take it down</button>' : '') + '</div>' +
        (L.confirm && L.confirm.id === m.id ? confirmBox(L.confirm, 'Take it down') : '') + whoBox(m.id) + '</article>';
    });

    h += '<h2 class="section-title">Time poll</h2><p class="section-sub">One round: post 2 to 4 times, everyone taps every time that works, then pick one.</p>';
    var open = M.polls.filter(function (p) { return p.status === 'open'; })[0];
    if (open) {
      h += '<article class="card poll-lead"><span class="pill">Open · ' + open.people_voted + (open.people_voted === 1 ? ' person has' : ' people have') + ' tapped</span>' +
        (open.note ? '<p class="body-text">' + esc(open.note) + '</p>' : '') +
        open.options.map(function (o) {
          return '<div class="opt-row"><div class="grow"><strong>' + esc(fmtWhen(o.starts_at)) + '</strong>' +
            '<p class="meta">' + (o.count ? o.count + ' can make it: ' + esc(o.names.join(', ')) : 'No taps yet') + '</p></div>' +
            (isApprover() ? '<button type="button" class="btn small primary" data-act="ask-pick" data-id="' + o.id + '" data-when="' + esc(o.starts_at) + '" id="pick-' + o.id + '">Pick this time</button>' : '') + '</div>' +
            (L.confirm && L.confirm.id === o.id ? confirmBox(L.confirm, 'Pick it', 'Not yet') : '');
        }).join('') +
        (isApprover() ? '<div class="actions"><button type="button" class="btn small quiet" data-act="ask-poll-close" data-id="' + open.id + '" id="pollclose-' + open.id + '">Close without picking</button></div>' +
          (L.confirm && L.confirm.id === open.id ? confirmBox(L.confirm, 'Close it') : '') : '') + '</article>';
    }
    M.polls.filter(function (p) { return p.status === 'draft'; }).forEach(function (d) {
      h += '<article class="card poll-lead"><span class="pill plum">Draft' + (d.created_by ? ' by ' + esc(d.created_by) : ' from Harmonia') + '</span>' +
        (d.note ? '<p class="body-text">' + esc(d.note) + '</p>' : '') +
        '<ul class="lines">' + d.options.map(function (o) { return '<li>' + esc(fmtWhen(o.starts_at)) + '</li>'; }).join('') + '</ul><div class="actions">' +
        (isApprover() ? '<button type="button" class="btn small primary" data-act="poll-open" data-id="' + d.id + '" id="pollopen-' + d.id + '"' + (open ? ' disabled' : '') + '>' + icon('check', 'sm') + '<span>Approve and open</span></button>' : '') +
        (isApprover() ? '<button type="button" class="btn small" data-act="poll-edit" data-id="' + d.id + '" id="polledit-' + d.id + '">' + icon('edit', 'sm') + '<span>Edit</span></button>' : '') +
        (isApprover() ? '<button type="button" class="btn small" data-act="ask-poll-delete" data-id="' + d.id + '" id="polldel-' + d.id + '">Delete draft</button>' : '') + '</div>' +
        (open && isApprover() ? '<p class="hint">Pick a time in the open poll first, then this one can open.</p>' : '') +
        (!isApprover() ? '<p class="hint">Waiting for ' + esc(approverName()) + ' to approve.</p>' : '') +
        (L.confirm && L.confirm.id === d.id ? confirmBox(L.confirm, 'Delete it') : '') + '</article>';
    });
    if (!open && !M.polls.length && !isApprover()) h += '<p class="empty">No time poll right now.</p>';
    if (!isApprover()) return h;
    if (L.pollForm) h += pollForm();
    else h += '<div class="actions"><button type="button" class="btn small" data-act="poll-new" id="poll-new">' + icon('plusbox', 'sm') + '<span>New time poll</span></button></div>';

    h += '<h2 class="section-title">Or set the time yourself</h2>' +
      '<div class="card"><label class="lbl" for="meet-at" style="margin-top:0">Date and time (Arizona)</label>' +
      '<input type="datetime-local" id="meet-at" value="' + esc(L.meetForm.at) + '">' +
      '<label class="lbl" for="meet-body">What we\'ll explore (optional)</label>' +
      '<input type="text" id="meet-body" maxlength="1000" value="' + esc(L.meetForm.body) + '">' +
      '<div class="actions"><button type="button" class="btn primary small" data-act="set-meetup" id="set-meetup">' + icon('calendar', 'sm') + '<span>Set the meetup</span></button></div>' +
      '<p class="hint">The team gets a note on their phones when a meetup time is set.</p></div>';
    return h;
  }
  function pollForm() {
    var f = S.lead.pollForm;
    var h = '<form class="card" data-form="poll" novalidate><h3 style="margin-top:0">' + (f.id ? 'Edit the time poll' : 'New time poll') + '</h3>' +
      '<label class="lbl" for="pf-note">What we\'ll explore (optional)</label>' +
      '<input type="text" id="pf-note" data-pfield="note" maxlength="1000" value="' + esc(f.note) + '">';
    f.times.forEach(function (t, i) {
      h += '<div class="time-head"><label class="lbl" for="pf-t' + i + '">Time ' + (i + 1) + ' (Arizona)</label>' +
        (f.times.length > 2 ? '<button type="button" class="btn small quiet" data-act="poll-del-time" data-i="' + i + '" id="pf-del' + i + '" aria-label="Remove time ' + (i + 1) + '">Remove</button>' : '') + '</div>' +
        '<input type="datetime-local" id="pf-t' + i + '" data-pfield="t" data-i="' + i + '" value="' + esc(t) + '">';
    });
    h += '<div class="actions">' + (f.times.length < 4 ? '<button type="button" class="btn small" data-act="poll-add-time" id="poll-add-time">' + icon('plusbox', 'sm') + '<span>Add another time</span></button>' : '') + '</div>' +
      '<div class="actions"><button type="button" class="btn" data-act="poll-save" data-then="none" id="poll-save">Save draft</button>' +
      (isApprover() ? '<button type="button" class="btn primary" data-act="poll-save" data-then="open" id="poll-save-open">' + icon('check', 'sm') + '<span>Save and open</span></button>' : '') +
      '<button type="button" class="btn quiet" data-act="poll-cancel" id="poll-cancel">Cancel</button></div>' +
      (!isApprover() ? '<p class="hint">' + esc(approverName()) + ' approves the poll before the team sees it.</p>' : '') + '</form>';
    return h;
  }

  // People
  function personStatus(p) {
    if (!p.active) return 'Link turned off';
    if (p.needs_new_link) return 'Needs a new link (many PIN tries)';
    if (p.locked) return 'Resting after PIN tries';
    if (!p.has_link) return 'No link yet';
    if (!p.has_pin) return 'Link ready, not opened yet';
    return p.last_seen ? 'Last in ' + fmt(p.last_seen, { month: 'short', day: 'numeric' }) : 'Signed up';
  }
  function canManage(p) { return isApprover() && p.id !== S.me.id; }   // only the approver manages links
  function canRemove(p) { return isApprover() && !p.approver && p.id !== S.me.id; }
  function leadPeople() {
    var L = S.lead, h = '';
    if (L.newLink) {
      var link = location.origin + location.pathname + '#k=' + L.newLink.key;
      h += '<div class="linkbox" role="status"><strong>' + (L.newLink.added ? esc(L.newLink.name) + ' is added. Here is their private link.' : 'New private link for ' + esc(L.newLink.name)) + '</strong>' +
        '<code id="newlink">' + esc(link) + '</code>' +
        '<p class="hint" style="margin-top:0">Send it to ' + esc(firstName(L.newLink.name)) + ' privately. This is the only time it is shown.' +
        (L.newLink.added ? ' They\'ll choose a PIN the first time they open it.' : ' Their old link no longer works, and they\'ll choose a new PIN.') + '</p>' +
        '<div class="actions"><button type="button" class="btn primary small" data-act="copy-link" id="copy-link">' + icon('copy', 'sm') + '<span>Copy link</span></button>' +
        '<button type="button" class="btn small" data-act="close-link" id="close-link">Done</button></div></div>';
    }
    if (isApprover()) h += '<form class="card add-person" data-form="add-person" novalidate><h3 style="margin-top:0">Add a person</h3>' +
      '<label class="lbl" for="add-name">First name</label><input type="text" id="add-name" maxlength="60" autocomplete="off" value="' + esc(L.addName) + '">' +
      (isApprover() ? '<label class="lbl" for="add-role">Part of</label><select id="add-role"><option value="team"' + (L.addRole !== 'leader' ? ' selected' : '') + '>The team</option>' +
        '<option value="leader"' + (L.addRole === 'leader' ? ' selected' : '') + '>The leadership team</option></select>' : '') +
      '<div class="actions"><button type="submit" class="btn primary small" id="add-person">' + icon('plusbox', 'sm') + '<span>Add</span></button></div>' +
      '<p class="hint">You\'ll get their private link to send them.</p></form>';
    if (!isApprover()) h += '<p class="hint" style="margin-top:12px">' + esc(approverName()) + ' adds people, makes new links and turns links off. Ask her if someone needs one.</p>';
    ['team', 'leader'].forEach(function (role) {
      h += '<h2 class="section-title">' + (role === 'team' ? 'Team' : 'Leadership') + '</h2>';
      var list = L.people.filter(function (p) { return p.role === role; });
      if (!list.length) h += '<p class="empty">' + (role === 'team' ? 'Add the team above. Each person gets their own private link.' : 'No one here yet.') + '</p>';
      list.forEach(function (p) {
        h += '<article class="card"><div class="person"><div><div class="who-name">' + esc(p.name) + (p.approver ? ' <span class="pill">Approves</span>' : '') + '</div>' +
          '<p class="meta" style="margin:0">' + esc(personStatus(p)) + '</p></div></div>';
        var btns = '';
        if (canManage(p)) {
          btns += '<button type="button" class="btn small" data-act="new-link" data-id="' + p.id + '" data-name="' + esc(p.name) + '" id="nl-' + p.id + '">' + icon('link', 'sm') + '<span>New link</span></button>' +
            '<button type="button" class="btn small" data-act="set-active" data-id="' + p.id + '" data-name="' + esc(p.name) + '" data-v="' + (p.active ? '0' : '1') + '" id="sa-' + p.id + '">' + icon('lock', 'sm') + '<span>' + (p.active ? 'Turn link off' : 'Turn link on') + '</span></button>';
        }
        if (canRemove(p)) btns += '<button type="button" class="btn small quiet" data-act="ask-remove" data-id="' + p.id + '" data-name="' + esc(p.name) + '" id="rm-' + p.id + '">Remove</button>';
        if (btns) h += '<div class="actions">' + btns + '</div>';
        if (L.confirm && L.confirm.id === p.id) {
          h += confirmBox(L.confirm, { newlink: 'Make the new link', off: 'Turn it off', remove: 'Remove' }[L.confirm.kind], 'Not now');
        }
        h += '</article>';
      });
    });
    return h;
  }

  // ------------------------------------------------------------------
  // Sheets: This phone, and the demo menu
  // ------------------------------------------------------------------
  function phoneSheet() {
    var sup = pushSupport(), alerts;
    if (sup === 'yes') {
      alerts = S.pushOn
        ? '<p>Alerts are on. You\'ll get a note when the Weekly goes up and when a meetup time is set.</p><button type="button" class="btn block" data-act="push-off" id="push-off">Turn alerts off</button>'
        : '<p>' + PUSH_ASK + '</p><button type="button" class="btn block" data-act="push-yes" id="push-on">' + icon('bell', 'sm') + '<span>Turn alerts on</span></button>';
    } else if (sup === 'needs-home') {
      alerts = '<p>Alerts work once The Arete Room is on your Home Screen.</p>';
    } else if (sup === 'blocked') {
      alerts = '<p>Alerts are turned off for this app in your phone\'s settings. Everything is still right here when you open it.</p>';
    } else {
      alerts = '<p>This phone doesn\'t offer alerts here. Everything is still right here when you open the app.</p>';
    }
    var out = S.signOutAsk
      ? '<div class="linkbox" role="group" aria-labelledby="so-text"><p id="so-text" style="margin:0 0 6px;font-weight:700">Sign out of this phone? To come back in, you\'ll open your private link and enter your PIN.</p>' +
        '<div class="actions" style="margin-top:8px"><button type="button" class="btn primary small" data-act="sign-out-yes" id="sign-out-yes">Sign out</button>' +
        '<button type="button" class="btn small" data-act="sign-out-no" id="sign-out-no">Stay signed in</button></div></div>'
      : '<button type="button" class="btn block" data-act="sign-out-ask" id="sign-out">Sign out of this phone</button>';
    return '<div class="sheet-back" data-act="sheet-close"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-stop="1">' +
      '<h2 id="sheet-title">This phone</h2>' + (S.me ? '<p class="meta" style="margin-top:0">Signed in as ' + esc(S.me.name) + '</p>' : '') +
      '<h3 class="group-title">' + icon('bell', 'sm') + 'Phone alerts</h3>' + alerts +
      '<h3 class="group-title">' + icon('lock', 'sm') + 'Signing out</h3><p>Use this if you are handing this phone to someone else.</p>' + out +
      '<button type="button" class="btn primary block" data-act="sheet-close" id="sheet-close">Close</button></div></div>';
  }
  function sheetHtml() {
    if (S.sheet === 'phone' && !S.gate) return phoneSheet();
    if (S.sheet === 'preview' && !S.gate) return previewSheet();
    if (S.sheet !== 'demo') return '';
    return '<div class="sheet-back" data-act="sheet-close"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-stop="1">' +
      '<h2 id="sheet-title">Practice version</h2><p>This is a demo with sample names and sample words in [brackets]. Nothing here is sent anywhere; it stays on this phone.</p>' +
      '<button type="button" class="btn block" data-act="demo-as" data-who="Sam" id="demo-team">See it as Sam (team)</button>' +
      '<button type="button" class="btn block" data-act="demo-as" data-who="Tiffany" id="demo-tiffany">See it as Tiffany (leadership)</button>' +
      '<button type="button" class="btn block" data-act="demo-as" data-who="JJ" id="demo-jj">See it as JJ (leadership)</button>' +
      '<button type="button" class="btn block" data-act="demo-first" id="demo-first">See the first-open screens</button>' +
      '<button type="button" class="btn block" data-act="demo-reset" id="demo-reset">Start the demo over</button>' +
      '<button type="button" class="btn primary block" data-act="sheet-close" id="sheet-close">Close</button></div></div>';
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  function setTab(t) {
    if (S.speakingId) stopSpeaking();
    S.tab = t;
    if (t === 'lead') loadLead();
    if (t === 'talk' || t === 'home' || t === 'why') refreshQuiet();
    render();
    window.scrollTo(0, 0);
    var m = $('#main'); if (m) m.focus({ preventScroll: true });
  }
  var lastRefresh = 0;
  function refreshQuiet() {
    if (Date.now() - lastRefresh < 20000) return;
    lastRefresh = Date.now();
    loadMain().then(softRender, function (e) { if (e.code === 'not_signed_in') handleErr(e); });
  }

  function doTap(id, kind) {
    var p = findPost(id); if (!p) return;
    var prev = (p.my_taps || []).slice();
    var next;
    if (kind === 'heart' || kind === 'tried') {
      next = has(p, kind) ? prev.filter(function (t) { return t.kind !== kind; }) : prev.concat([{ kind: kind, value: null }]);
    } else {
      next = prev.filter(function (t) { return t.kind !== 'rsvp_yes' && t.kind !== 'rsvp_no'; }).concat([{ kind: kind, value: null }]);
    }
    p.my_taps = next; render();
    rpc('tap', { p_token: S.token, p_post_id: id, p_kind: kind, p_value: null }).then(function (r) {
      var cur = findPost(id) || p;          // the feed may have refreshed meanwhile
      cur.my_taps = r.my_taps; saveCache(); softRender();
    }, function (e) { (findPost(id) || p).my_taps = prev; softRender(); handleErr(e); });
  }
  function doVote(optId) {
    var pl = S.poll; if (!pl) return;
    var o = pl.options.filter(function (x) { return x.id === optId; })[0]; if (!o) return;
    var on = !o.mine, before = JSON.parse(JSON.stringify(pl));
    o.mine = on; o.count += on ? 1 : -1; render();
    rpc('poll_vote', { p_token: S.token, p_option_id: optId, p_on: on }).then(function (r) {
      S.poll = r; saveCache(); softRender();
    }, function (e) {
      if (e.code === 'poll_closed') { S.poll = null; lastRefresh = 0; refreshQuiet(); }
      else S.poll = before;
      softRender(); handleErr(e);
    });
  }

  function sendNote() {
    var ta = $('#note');
    var body = (ta ? ta.value : S.noteDraft).trim();
    if (!body) { toast('Write a few words first.'); if (ta) ta.focus(); return; }
    var to = null;
    if (S.noteTo.mode === 'some') {
      var live = S.leaders.map(function (l) { return l.id; });
      to = S.noteTo.ids.filter(function (id) { return live.indexOf(id) >= 0; });
      if (!to.length) { toast('Choose at least one name, or pick The leadership team.'); return; }
    }
    if (S.rec) { try { S.rec.stop(); } catch (e) { /* ignore */ } }
    var btn = $('#send-note'); if (btn) btn.disabled = true;
    rpc('send_note', { p_token: S.token, p_body: body, p_to: to }).then(function (r) {
      S.noteDraft = ''; store.del('noteDraft');
      S.noteSent = { names: r && r.to ? r.to : null };
      S.noteTo = { mode: 'all', ids: [] }; store.del('noteTo');
      S.micHint = false; render();
      var t = $('#note-again'); if (t) t.focus({ preventScroll: true });
    }, function (e) { if (btn) btn.disabled = false; handleErr(e); });
  }

  function toggleTalk() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (S.rec) { try { S.rec.stop(); } catch (e) { /* ignore */ } return; }
    if (!SR) { S.micHint = true; render(); var ta = $('#note'); if (ta) ta.focus(); return; }
    var rec;
    try { rec = new SR(); } catch (e) { S.micHint = true; render(); return; }
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
    var base = S.noteDraft.trim() ? S.noteDraft.trim() + ' ' : '';
    rec.onresult = function (ev) {
      var t = '';
      for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      S.noteDraft = base + t; store.set('noteDraft', S.noteDraft);
      var ta = $('#note'); if (ta) ta.value = S.noteDraft;
    };
    rec.onerror = function (ev) { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') S.micHint = true; };
    rec.onend = function () { S.rec = null; softRender(); };
    try { rec.start(); S.rec = rec; } catch (e) { S.micHint = true; }
    render();
  }

  function reloadAll() { return Promise.all([loadLead(), loadMain()]); }
  function savePost(then) {
    var f = S.lead.form;
    var payload = {
      id: f.id || null, kind: f.kind, label: f.kind === 'try' ? (f.label || null) : null,
      title: f.title, body: f.body, heads_ups: f.heads_ups, reminders: f.reminders, asked_did: f.asked_did, image_url: f.image_url,
      publish_at: fromLocalInput(f.publish_at || (f.kind === 'weekly' ? toLocalInput(S.lead.nextSlot || nextWeeklySlot()) : ''))
    };
    if (!payload.title.trim()) { toast(FRIENDLY.title_required); var t = $('#f-title'); if (t) t.focus(); return; }
    rpc('leader_save_post', { p_token: S.token, p_post: payload }).then(function (saved) {
      if (then === 'approve' && saved.kind === 'weekly' && (!payload.publish_at || new Date(payload.publish_at) <= new Date())) {
        S.lead.late = saved.id;                        // same question as from the list: Send now or Next Monday 8am
        toast('Saved. Choose when it goes out.');
        return;
      }
      if (then === 'approve') {
        return rpc('leader_approve_post', { p_token: S.token, p_post_id: saved.id, p_publish_at: payload.publish_at }).then(function (ap) {
          toast(ap.status === 'published' ? 'Posted. The team can see it now.' : 'Approved. It goes out ' + fmtShort(ap.publish_at) + '.');
        });
      }
      if (then === 'look') {
        return rpc('leader_send_for_look', { p_token: S.token, p_post_id: saved.id }).then(function () { toast(LOOK_SENT); });
      }
      toast(f.id && f.status !== 'draft' ? 'Saved.' : 'Saved to drafts.');
    }).then(function () {
      S.lead.form = null; S.lead.sub = 'posts';
      return reloadAll();
    }).then(function () { softRender(); if (S.lead.late) { var b = $('#late-now'); if (b) b.scrollIntoView({ block: 'center' }); } }, handleErr);
  }
  var LOOK_SENT = 'Sent to the leadership team for a look. The team won\u2019t see it until you send it.';
  function sendForLook(id) {
    rpc('leader_send_for_look', { p_token: S.token, p_post_id: id }).then(function () { toast(LOOK_SENT); return reloadAll(); }).then(softRender, handleErr);
  }
  function approveAt(id, iso) {
    var p = findPost(id);
    rpc('leader_approve_post', { p_token: S.token, p_post_id: id, p_publish_at: iso }).then(function (r) {
      S.lead.approving = null; S.lead.late = null;
      toast(r.status === 'published' ? (p && p.kind === 'try' ? 'Picked. It is on The Why now.' : 'Posted. The team can see it now.')
        : (p && p.kind === 'try' ? 'Picked. It shows on The Why from ' + fmtShort(r.publish_at) + '.' : 'Approved. It goes out ' + fmtShort(r.publish_at) + '.'));
      return reloadAll();
    }).then(softRender, handleErr);
  }
  function savePoll(then) {
    var f = S.lead.pollForm;
    var times = f.times.map(fromLocalInput).filter(Boolean);
    if (times.length < 2) { toast(FRIENDLY.two_to_four_times); return; }
    rpc('leader_poll_save', { p_token: S.token, p_poll: { id: f.id || null, note: f.note, options: times } }).then(function (pl) {
      if (then === 'open') {
        return rpc('leader_poll_open', { p_token: S.token, p_poll_id: pl.id }).then(function () { toast('The poll is open. The team can tap their times now.'); },
          function (e) { toast(e.code === 'poll_already_open' ? 'Saved as a draft. ' + FRIENDLY.poll_already_open : FRIENDLY[e.code] || 'Saved as a draft.'); });
      }
      toast('Saved to drafts.');
    }).then(function () { S.lead.pollForm = null; return reloadAll(); }).then(softRender, handleErr);
  }
  function runConfirm() {
    var c = S.lead.confirm; if (!c) return;
    S.lead.confirm = null;
    var done = function (msg) { return function () { if (msg) toast(msg); return reloadAll(); }; };
    if (c.kind === 'takedown') {
      var was = findPost(c.id), back = was && was.status === 'leader_review';
      rpc('leader_unpublish_post', { p_token: S.token, p_post_id: c.id }).then(done(back ? 'Back in drafts.' : 'Taken down. It is back in drafts.')).then(softRender, handleErr);
    } else if (c.kind === 'delete') {
      rpc('leader_delete_draft', { p_token: S.token, p_post_id: c.id }).then(done('Draft deleted.')).then(softRender, handleErr);
    } else if (c.kind === 'newlink') {
      rpc('leader_new_link', { p_token: S.token, p_person_id: c.id }).then(function (r) {
        S.lead.newLink = r; window.scrollTo(0, 0); return loadLead();
      }).catch(handleErr);
    } else if (c.kind === 'off') {
      rpc('leader_set_active', { p_token: S.token, p_person_id: c.id, p_active: false }).then(function () {
        toast(c.name + '\'s link is off.'); return loadLead();
      }).catch(handleErr);
    } else if (c.kind === 'remove') {
      rpc('leader_remove_person', { p_token: S.token, p_person_id: c.id }).then(function () {
        toast(c.name + ' is no longer in The Arete Room. Their notes stay.'); return loadLead();
      }).catch(handleErr);
    } else if (c.kind === 'pick') {
      rpc('leader_poll_pick', { p_token: S.token, p_option_id: c.id }).then(done('Picked. It is the meetup now, and the team gets a note.')).then(softRender, handleErr);
    } else if (c.kind === 'poll-close' || c.kind === 'poll-delete') {
      rpc('leader_poll_remove', { p_token: S.token, p_poll_id: c.id }).then(done(c.kind === 'poll-close' ? 'The poll is closed.' : 'Draft deleted.')).then(softRender, handleErr);
    } else if (c.kind === 'meet-down') {
      rpc('leader_remove_meetup', { p_token: S.token, p_post_id: c.id }).then(done('Taken down.')).then(softRender, handleErr);
    }
    render();
  }
  function ask(kind, id, text, extra) {
    S.lead.confirm = { kind: kind, id: id, text: text };
    if (extra) Object.keys(extra).forEach(function (k) { S.lead.confirm[k] = extra[k]; });
    render(); var b = $('#confirm-yes'); if (b) b.focus();
  }

  function readFormField(el) {
    var f = S.lead.form; if (!f) return;
    var k = el.getAttribute('data-field');
    f[k] = el.value;
    if (k === 'kind') { f.publish_at = ''; render(); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.classList.contains('sheet-back') && e.target.closest('[data-stop]')) return;   // taps inside the sheet
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    switch (act) {
      case 'tab': setTab(el.getAttribute('data-tab')); break;
      case 'speak': speak(id); break;
      case 'tap': doTap(id, el.getAttribute('data-kind')); break;
      case 'vote': doVote(id); break;
      case 'talk': toggleTalk(); break;
      case 'send-note': sendNote(); break;
      case 'note-again': S.noteSent = null; render(); var n = $('#note'); if (n) n.focus(); break;
      case 'push-yes': enablePush(); break;
      case 'push-later': store.set('pushAsked', true); render(); toast('No problem. You can turn alerts on any time under This phone.'); break;
      case 'push-off': disablePush(); break;
      case 'phone-sheet': S.sheet = 'phone'; S.signOutAsk = false; render(); var pc = $('#sheet-close'); if (pc) pc.focus(); break;
      case 'sign-out-ask': S.signOutAsk = true; render(); var sy = $('#sign-out-yes'); if (sy) sy.focus(); break;
      case 'sign-out-no': S.signOutAsk = false; render(); break;
      case 'sign-out-yes': signOutPhone(); break;
      case 'gate-continue': sessionStorageSet('a2hs-skip', '1'); S.gate.step = S.gate.next; renderGate(); break;
      case 'gate-retry': gate(); break;
      case 'demo-sheet': S.sheet = 'demo'; S.gate ? renderGate() : render(); var b = $('#demo-team'); if (b) b.focus(); break;
      case 'sheet-close': S.sheet = null; S.signOutAsk = false; S.gate ? renderGate() : render(); break;
      case 'demo-as': S.sheet = null; Demo.signInAs(el.getAttribute('data-who')); break;
      case 'demo-first': S.sheet = null; Demo.firstOpen(); break;
      case 'demo-reset': S.sheet = null; Demo.reset(); break;
      // leadership
      case 'lead-sub': S.lead.confirm = null; S.lead.sub = el.getAttribute('data-sub'); render(); break;
      case 'notes-filter': S.lead.showHandled = el.getAttribute('data-v') === 'done'; render(); break;
      case 'note-open':
        S.lead.open[id] = true;
        var note = S.lead.notes.filter(function (x) { return x.id === id; })[0];
        if (note && !note.read_at) { note.read_at = new Date().toISOString(); rpc('leader_mark_read', { p_token: S.token, p_note_id: id }).catch(handleErr); }
        render();
        break;
      case 'handled':
        rpc('leader_mark_handled', { p_token: S.token, p_note_id: id, p_handled: el.getAttribute('data-v') === '1' }).then(function () {
          toast(el.getAttribute('data-v') === '1' ? 'Marked handled.' : 'Moved back to open.'); return loadLead();
        }).catch(handleErr);
        break;
      case 'new-post': S.lead.form = blankForm(el.getAttribute('data-kind')); S.lead.sub = 'form'; render(); window.scrollTo(0, 0); break;
      case 'edit-post': S.lead.form = formFromPost(findPost(id)); S.lead.sub = 'form'; render(); window.scrollTo(0, 0); break;
      case 'cancel-form': S.lead.form = null; S.lead.sub = 'posts'; render(); break;
      case 'save-post': savePost(el.getAttribute('data-then')); break;
      case 'approve-open':
        var ap = findPost(id);
        var notOut = ap.status === 'draft' || ap.status === 'leader_review';
        if (ap.kind === 'weekly' && notOut && ap.publish_at && new Date(ap.publish_at) <= new Date()) { S.lead.late = id; render(); break; }
        if (ap.kind === 'try' && notOut) { approveAt(id, null); break; }       // "Pick this one" / "Send to the team": on The Why right away
        S.lead.approving = id;
        S.lead.approveAt = toLocalInput(ap.kind === 'weekly' ? (ap.publish_at && new Date(ap.publish_at) > new Date() ? ap.publish_at : S.lead.nextSlot || nextWeeklySlot()) : (ap.publish_at && new Date(ap.publish_at) > new Date() ? ap.publish_at : null));
        render(); var inp = $('#approve-at'); if (inp) inp.focus();
        break;
      case 'approve-cancel': S.lead.approving = null; render(); break;
      case 'approve':
        var at = fromLocalInput($('#approve-at') ? $('#approve-at').value : '');
        var apost = findPost(id);
        if (apost && apost.kind === 'weekly' && (!at || new Date(at) <= new Date())) { S.lead.approving = null; S.lead.late = id; render(); break; }
        approveAt(id, at);
        break;
      case 'late-now': approveAt(id, new Date().toISOString()); break;
      case 'late-monday': approveAt(id, nextWeeklySlot()); break;
      case 'late-cancel': S.lead.late = null; render(); break;
      case 'ask-takedown':
        var tp = findPost(id);
        ask('takedown', id, tp && tp.status === 'leader_review' ? 'Take this back to drafts? The leadership team won\'t see it anymore, and their answers clear.'
          : 'Take this down? The team won\'t see it anymore. It goes back to drafts.');
        break;
      case 'send-look': sendForLook(id); break;
      case 'look-good': sendLook(id, true); break;
      case 'look-thought': sendLook(id, false); break;
      case 'ask-delete': ask('delete', id, 'Delete this draft?'); break;
      case 'fold': S.lead.unfold[id] = !S.lead.unfold[id]; render(); var fb = document.getElementById('foldbtn-' + id); if (fb) fb.focus({ preventScroll: true }); break;
      case 'preview': S.previewId = id; S.previewFrom = 'preview-' + id; S.sheet = 'preview'; render(); var pb = $('#preview-back'); if (pb) pb.focus(); break;
      case 'preview-close': S.sheet = null; render(); var back = S.previewFrom && document.getElementById(S.previewFrom); if (back) back.focus({ preventScroll: true }); break;
      case 'confirm-yes': runConfirm(); break;
      case 'confirm-no': S.lead.confirm = null; render(); break;
      case 'who':
        if (S.lead.who[id]) { delete S.lead.who[id]; render(); break; }
        S.lead.who[id] = 'loading'; render();
        rpc('leader_taps', { p_token: S.token, p_post_id: id }).then(function (r) { S.lead.who[id] = r; softRender(); }, function (err) { delete S.lead.who[id]; handleErr(err); });
        break;
      case 'new-link':
        var nm = el.getAttribute('data-name');
        ask('newlink', id, 'Make a new private link for ' + nm + '? Their old link stops working, and they choose a new PIN.', { name: nm });
        break;
      case 'set-active':
        var on = el.getAttribute('data-v') === '1', who = el.getAttribute('data-name');
        if (!on) { ask('off', id, 'Turn off ' + who + '\'s link? They\'re signed out until it is turned back on. Use this for a lost phone, then make a new link.', { name: who }); break; }
        rpc('leader_set_active', { p_token: S.token, p_person_id: id, p_active: on }).then(function () {
          toast(who + '\'s link is on.'); return loadLead();
        }).catch(handleErr);
        break;
      case 'ask-remove':
        var rn = el.getAttribute('data-name');
        ask('remove', id, 'Remove ' + rn + ' from The Arete Room? Their link stops working. Their notes stay.', { name: rn });
        break;
      case 'copy-link':
        var text = $('#newlink').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Link copied.'); }, function () {
          var r = document.createRange(); r.selectNodeContents($('#newlink')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast('Link selected. Tap Copy.');
        });
        break;
      case 'close-link': S.lead.newLink = null; render(); break;
      // meetup + poll
      case 'ask-pick': ask('pick', id, 'Pick ' + fmtWhen(el.getAttribute('data-when')) + '? It becomes the meetup, and the team gets a note on their phones.'); break;
      case 'ask-poll-close': ask('poll-close', id, 'Close this poll without picking a time?'); break;
      case 'ask-poll-delete': ask('poll-delete', id, 'Delete this poll draft for good?'); break;
      case 'ask-meet-down': ask('meet-down', id, 'Take this meetup down? It comes off Talk to us for everyone.'); break;
      case 'poll-new': S.lead.pollForm = { id: null, note: '', times: ['', ''] }; render(); var pn = $('#pf-note'); if (pn) pn.focus(); break;
      case 'poll-edit':
        var pd = S.lead.meet.polls.filter(function (x) { return x.id === id; })[0];
        S.lead.pollForm = { id: pd.id, note: pd.note || '', times: pd.options.map(function (o) { return toLocalInput(o.starts_at); }) };
        render(); break;
      case 'poll-add-time': if (S.lead.pollForm.times.length < 4) S.lead.pollForm.times.push(''); render(); var nt = $('#pf-t' + (S.lead.pollForm.times.length - 1)); if (nt) nt.focus(); break;
      case 'poll-del-time': S.lead.pollForm.times.splice(+el.getAttribute('data-i'), 1); render(); break;
      case 'poll-cancel': S.lead.pollForm = null; render(); break;
      case 'poll-save': savePoll(el.getAttribute('data-then')); break;
      case 'poll-open':
        rpc('leader_poll_open', { p_token: S.token, p_poll_id: id }).then(function () { toast('The poll is open. The team can tap their times now.'); return reloadAll(); }).then(softRender, handleErr);
        break;
      case 'set-meetup':
        var mat = fromLocalInput(S.lead.meetForm.at);
        if (!mat) { toast(FRIENDLY.date_required); var ma = $('#meet-at'); if (ma) ma.focus(); break; }
        rpc('leader_set_meetup', { p_token: S.token, p_meetup: { starts_at: mat, body: S.lead.meetForm.body } }).then(function () {
          S.lead.meetForm = { at: '', body: '' }; toast('The meetup is set. The team gets a note on their phones.'); return reloadAll();
        }).then(softRender, handleErr);
        break;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target, L = S.lead;
    if (el.id === 'note') { S.noteDraft = el.value; store.set('noteDraft', el.value); }
    else if (el.hasAttribute('data-field') && el.tagName !== 'SELECT' && L.form) L.form[el.getAttribute('data-field')] = el.value;
    else if (el.hasAttribute('data-pfield') && L.pollForm) {
      if (el.getAttribute('data-pfield') === 'note') L.pollForm.note = el.value; else L.pollForm.times[+el.getAttribute('data-i')] = el.value;
    }
    else if (el.id === 'add-name') L.addName = el.value;
    else if (el.id === 'meet-at') L.meetForm.at = el.value;
    else if (el.id === 'meet-body') L.meetForm.body = el.value;
    else if (el.id === 'approve-at') L.approveAt = el.value;
    else if (el.hasAttribute('data-look')) L.lookText[el.getAttribute('data-look')] = el.value;
    else if (el.classList.contains('pin-input')) {
      el.value = el.value.replace(/[^0-9]/g, '').slice(0, 6);
      if (S.gate && S.gate.err) { S.gate.err = null; var pe = document.querySelector('.gate .err'); if (pe) pe.remove(); }   // typing again clears the message
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, L = S.lead;
    if (el.hasAttribute('data-field')) readFormField(el);
    else if (el.hasAttribute('data-pfield') && L.pollForm) { if (el.getAttribute('data-pfield') === 't') L.pollForm.times[+el.getAttribute('data-i')] = el.value; }
    else if (el.id === 'approve-at') L.approveAt = el.value;
    else if (el.id === 'meet-at') L.meetForm.at = el.value;
    else if (el.id === 'add-role') L.addRole = el.value;
    else if (el.getAttribute('data-to') === 'mode') {
      S.noteTo = { mode: el.value === 'some' ? 'some' : 'all', ids: el.value === 'some' ? S.noteTo.ids : [] };
      store.set('noteTo', S.noteTo); render();
    } else if (el.getAttribute('data-to') === 'id') {
      var ids = S.noteTo.mode === 'some' ? S.noteTo.ids.slice() : [];
      if (el.checked) { if (ids.indexOf(el.value) < 0) ids.push(el.value); } else ids = ids.filter(function (x) { return x !== el.value; });
      var choices = S.leaders.filter(function (l) { return !S.me || l.id !== S.me.id; });
      if (choices.length > 1 && choices.every(function (l) { return ids.indexOf(l.id) >= 0; })) {
        // everyone ticked = the whole leadership team (Just these people is for one, two or three)
        S.noteTo = { mode: 'all', ids: [] }; store.set('noteTo', S.noteTo); render();
        toast('That is everyone, so it goes to the whole leadership team.');
        var ta2 = $('#to-all'); if (ta2) ta2.focus();
        return;
      }
      S.noteTo = { mode: 'some', ids: ids }; store.set('noteTo', S.noteTo); render();
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.getAttribute('data-form');
    if (!f) return;
    e.preventDefault();
    if (f === 'newpin') submitNewPin();
    else if (f === 'pin') submitPin();
    else if (f === 'add-person') {
      var nm = (S.lead.addName || '').trim();
      if (!nm) { toast(FRIENDLY.name_required); var an = $('#add-name'); if (an) an.focus(); return; }
      rpc('leader_add_person', { p_token: S.token, p_name: nm, p_role: isApprover() ? S.lead.addRole : 'team' }).then(function (r) {
        S.lead.addName = ''; S.lead.addRole = 'team'; S.lead.newLink = { name: r.name, key: r.key, added: true };
        if (document.activeElement) document.activeElement.blur();
        window.scrollTo(0, 0); return loadLead();
      }).catch(handleErr);
    }
    else if (f === 'paste') {
      var m = /[#?&]k=([A-Za-z0-9_-]{20,})/.exec($('#paste-link').value || '');
      if (!m) { S.gate.err = "That doesn't look like a private link. Copy the whole link from the message."; return renderGate(); }
      S.key = m[1]; store.set('key', m[1]); S.signedOut = false; gate();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.sheet) { S.sheet = null; S.signOutAsk = false; S.gate ? renderGate() : render(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.token && !S.gate) refreshQuiet();
  });

  // ------------------------------------------------------------------
  // DEMO MODE: same functions as the real database, kept on this phone only.
  // Sample names only (Sam, Riley, Jordan, Casey, Morgan); sample words in [brackets].
  // ------------------------------------------------------------------
  var Demo = (function () {
    var DBKEY = 'db-v2';
    function uid() { return 'd' + Math.random().toString(36).slice(2, 10); }
    function seed() {
      var people = [
        ['p-tiffany', 'Tiffany', 'leader', true], ['p-jj', 'JJ', 'leader', false], ['p-kade', 'Kade', 'leader', false], ['p-zoey', 'Zoey', 'leader', false],
        ['p-sam', 'Sam', 'team', false], ['p-riley', 'Riley', 'team', false], ['p-jordan', 'Jordan', 'team', false], ['p-casey', 'Casey', 'team', false], ['p-morgan', 'Morgan', 'team', false]
      ].map(function (r, i) { return { id: r[0], name: r[1], role: r[2], approver: r[3], active: true, removed: false, order: i, key: 'demo-key-' + r[0].slice(2), pin: '1234', failed: 0, locked_until: null, last_seen: null }; });
      var base = { label: null, body: '', heads_ups: '', reminders: '', asked_did: '', image_url: null, starts_at: null, status: 'published', created_by: 'p-tiffany', approved_by: 'p-tiffany' };
      function post(o) { var p = {}; Object.keys(base).forEach(function (k) { p[k] = base[k]; }); Object.keys(o).forEach(function (k) { p[k] = o[k]; }); p.created_at = p.publish_at || new Date().toISOString(); return p; }
      var lastMonday = new Date(new Date(nextWeeklySlot()).getTime() - 7 * 864e5).toISOString();
      var az = new Date(Date.now() - 7 * 3600e3), nextMonth = new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth() + 1, 1, 8, 0) + 7 * 3600e3).toISOString();   // 1st of next month, 8am Arizona
      var posts = [
        post({ id: 'w1', kind: 'weekly', title: 'Welcome to The Arete Room', publish_at: lastMonday,
          body: 'A warm hello from all of us. This is our weekly in touch.\nShout-out: a guest wrote that [first name] made her week.',
          heads_ups: 'Thursday evenings open Nov 12, 5 to 8pm.\n[A heads-up for the week ahead.]',
          reminders: 'From our last meetup: [what we agreed together].\n[A gentle reminder.]',
          asked_did: 'You asked for [an idea from the team]. It starts [when].' }),
        post({ id: 'm1', kind: 'meetup', label: 'Team Lab Meetup', title: 'Team Lab Meetup', body: '[What we will explore together]', starts_at: azAt(9, 18), publish_at: azAt(-2, 9) }),
        post({ id: 'y1', kind: 'why', title: 'Always create value, because currency chases value.', body: '[A few lines on the why behind it, from the leadership team.]', publish_at: azAt(-3, 9) }),
        post({ id: 't1', kind: 'try', label: 'Mental', title: 'One slow breath at the door before every guest.', body: '[A line on how to work it into your day.]', publish_at: azAt(-3, 9) }),
        post({ id: 'w2', kind: 'weekly', status: 'draft', created_by: null, approved_by: null, title: "[Next week's headline]", publish_at: nextWeeklySlot(),
          body: '[Our weekly in touch: a line about the week ahead.]\nShout-out: [first name] for [something kind].',
          heads_ups: '[A heads-up.]', reminders: 'From our last meetup: [what we agreed].', asked_did: 'You asked for [an idea]. [What happened.]' }),
        post({ id: 'y2', kind: 'why', status: 'draft', created_by: null, approved_by: null, title: "[Next month's why, in one line]", body: '[A few words about it.]', publish_at: nextMonth }),
        post({ id: 't2', kind: 'try', status: 'draft', created_by: null, approved_by: null, label: 'Physical', title: '[A two-minute stretch between guests]', body: '[How to work it into your day.]', publish_at: nextMonth }),
        post({ id: 't3', kind: 'try', status: 'draft', created_by: null, approved_by: null, label: 'Emotional', title: '[Name one thing that went well today]', body: '[How to work it into your day.]', publish_at: nextMonth })
      ];
      var notes = [
        { id: 'n1', from: 'p-sam', audience: 'leadership', to: [], body: '[A note from a team member: an idea, a question, anything.]', created_at: new Date(Date.now() - 3 * 3600e3).toISOString(), read_at: null, handled_at: null, handled_by: null },
        { id: 'n2', from: 'p-riley', audience: 'chosen', to: ['p-tiffany'], body: '[A note just for Tiffany.]', created_at: new Date(Date.now() - 26 * 3600e3).toISOString(), read_at: null, handled_at: null, handled_by: null },
        { id: 'n3', from: 'p-jordan', audience: 'chosen', to: ['p-jj'], body: '[A note just for JJ.]', created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), read_at: null, handled_at: null, handled_by: null },
        { id: 'n4', from: 'p-casey', audience: 'leadership', to: [], body: '[Something Casey wrote to the leadership team.]', created_at: new Date(Date.now() - 50 * 3600e3).toISOString(), read_at: new Date(Date.now() - 49 * 3600e3).toISOString(), handled_at: new Date(Date.now() - 48 * 3600e3).toISOString(), handled_by: 'p-tiffany' }
      ];
      var taps = [
        { post: 'w1', person: 'p-riley', kind: 'heart' }, { post: 'w1', person: 'p-jordan', kind: 'heart' },
        { post: 'm1', person: 'p-jordan', kind: 'rsvp_yes' }, { post: 'm1', person: 'p-casey', kind: 'rsvp_no' }
      ];
      var polls = [{ id: 'pl1', note: '[What we will explore at the meetup after that]', status: 'open', created_by: null, approved_by: 'p-tiffany', created_at: azAt(-1, 9),
        options: [{ id: 'o1', starts_at: azAt(23, 18) }, { id: 'o2', starts_at: azAt(24, 8) }, { id: 'o3', starts_at: azAt(26, 18) }] }];   // the meetup after the one already set
      var votes = [{ option: 'o1', person: 'p-jordan' }, { option: 'o1', person: 'p-riley' }, { option: 'o3', person: 'p-jordan' }, { option: 'o2', person: 'p-casey' }];
      return { people: people, posts: posts, notes: notes, taps: taps, polls: polls, votes: votes, looks: [] };
    }
    var db = store.get(DBKEY) || seed();
    if (!db.looks) db.looks = [];                     // demo data saved before "For your look"
    function save() { store.set(DBKEY, db); }
    function err(code) { return Promise.reject(new ApiError(code)); }
    function person(id) { return db.people.filter(function (p) { return p.id === id; })[0]; }
    function byKey(k) { return db.people.filter(function (p) { return p.key && p.key === k && !p.removed; })[0]; }
    function meOf(p) { return { id: p.id, name: p.name, role: p.role, approver: p.approver }; }
    function who(token) {
      var m = /^demo-token-(.+)$/.exec(token || ''); var p = m && person(m[1]);
      if (!p || !p.active || p.removed) throw new ApiError('not_signed_in');
      p.last_seen = new Date().toISOString();
      return p;
    }
    function leader(token) { var p = who(token); if (p.role !== 'leader') throw new ApiError('leaders_only'); return p; }
    function approver(token) { var p = leader(token); if (!p.approver) throw new ApiError('approver_only'); return p; }
    function publishDue() { var now = Date.now(); db.posts.forEach(function (p) { if (p.status === 'approved' && new Date(p.publish_at).getTime() <= now) p.status = 'published'; }); }
    function myTaps(post, pid) { return db.taps.filter(function (t) { return t.post === post && t.person === pid; }).map(function (t) { return { kind: t.kind, value: null }; }); }
    function pub(p, pid) {
      return { id: p.id, kind: p.kind, label: p.label, title: p.title, body: p.body, heads_ups: p.heads_ups, reminders: p.reminders, asked_did: p.asked_did,
        image_url: p.image_url, starts_at: p.starts_at, publish_at: p.publish_at, my_taps: myTaps(p.id, pid) };
    }
    function lead(p) {
      var o = pub(p, null); delete o.my_taps;
      o.status = p.status; o.created_at = p.created_at;
      o.created_by = p.created_by ? person(p.created_by).name : null;
      o.approved_by = p.approved_by ? person(p.approved_by).name : null;
      o.counts = {}; db.taps.forEach(function (t) { if (t.post === p.id) o.counts[t.kind] = (o.counts[t.kind] || 0) + 1; });
      return o;
    }
    function leadersList() {
      return db.people.filter(function (p) { return p.role === 'leader' && p.active && !p.removed; })
        .sort(function (a, b) { return (b.approver - a.approver) || (a.order - b.order); }).map(function (p) { return { id: p.id, name: p.name }; });
    }
    function votesOf(oid) { return db.votes.filter(function (v) { return v.option === oid; }); }
    function pollPub(pl, pid) {
      return { id: pl.id, note: pl.note, status: pl.status, options: pl.options.slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); }).map(function (o) {
        var vs = votesOf(o.id); return { id: o.id, starts_at: o.starts_at, count: vs.length, mine: vs.some(function (v) { return v.person === pid; }) };
      }) };
    }
    function pollLead(pl) {
      var o = pollPub(pl, null), voters = {};
      o.options.forEach(function (op) { op.names = votesOf(op.id).map(function (v) { voters[v.person] = 1; return person(v.person).name; }).sort(); delete op.mine; });
      o.created_by = pl.created_by ? person(pl.created_by).name : null; o.people_voted = Object.keys(voters).length;
      return o;
    }
    function looksOf(pid) {
      return db.people.filter(function (x) { return x.role === 'leader' && !x.approver && x.active && !x.removed; })
        .sort(function (x, y) { return x.order - y.order; }).map(function (x) {
          var l = db.looks.filter(function (k) { return k.post === pid && k.person === x.id; })[0];
          return { name: x.name, answered: !!l, looks_good: !!(l && l.looks_good), thought: l ? l.thought : null };
        });
    }
    function canSee(n, me) { return n.audience === 'leadership' || n.to.indexOf(me.id) >= 0; }
    function noteOf(id, me) { var n = db.notes.filter(function (x) { return x.id === id; })[0]; if (!n || !canSee(n, me)) throw new ApiError('note_not_found'); return n; }
    function postOf(id, kinds) { var p = db.posts.filter(function (x) { return x.id === id && kinds.indexOf(x.kind) >= 0; })[0]; if (!p) throw new ApiError('post_not_found'); return p; }
    function makeMeetup(at, body, by) {
      var m = { id: uid(), kind: 'meetup', label: 'Team Lab Meetup', title: 'Team Lab Meetup', body: body || '', heads_ups: '', reminders: '', asked_did: '', image_url: null,
        starts_at: at, status: 'published', publish_at: new Date().toISOString(), created_by: by, approved_by: by, created_at: new Date().toISOString() };
      db.posts.push(m); return m;
    }
    function checkTimes(times) {
      var uniq = {}; (times || []).forEach(function (t) { if (t) uniq[new Date(t).toISOString()] = 1; });
      var n = Object.keys(uniq).length;
      if (n < 2 || n > 4 || n !== times.length) throw new ApiError('two_to_four_times');
      if (times.some(function (t) { return new Date(t) <= new Date(); })) throw new ApiError('time_passed');
    }
    var F = {
      begin_with_key: function (a) {
        var p = byKey(a.p_key);
        if (!p || !p.active) return { status: 'invalid' };
        if (p.locked_until && new Date(p.locked_until) > new Date()) return { status: 'locked', name: p.name, locked_until: p.locked_until };
        return { status: p.pin ? 'needs_pin' : 'new', name: p.name };
      },
      set_pin: function (a) {
        if (!/^[0-9]{4,6}$/.test(a.p_pin || '')) throw new ApiError('pin_format');
        var p = byKey(a.p_key); if (!p || !p.active) throw new ApiError('invalid_link');
        if (p.pin) throw new ApiError('pin_already_set');
        p.pin = a.p_pin; p.failed = 0;
        return { ok: true, token: 'demo-token-' + p.id, me: meOf(p) };
      },
      sign_in: function (a) {
        var p = byKey(a.p_key);
        if (!p || !p.active) return { ok: false, status: 'invalid' };
        if (!p.pin) return { ok: false, status: 'new' };
        if (p.locked_until && new Date(p.locked_until) > new Date()) return { ok: false, status: 'locked', locked_until: p.locked_until };
        if (a.p_pin === p.pin) { p.failed = 0; p.locked_until = null; return { ok: true, token: 'demo-token-' + p.id, me: meOf(p) }; }
        p.failed += 1;
        if (p.failed >= 5) { p.failed = 0; p.locked_until = new Date(Date.now() + 30 * 60e3).toISOString(); return { ok: false, status: 'locked', locked_until: p.locked_until }; }
        return { ok: false, status: 'wrong_pin', tries_left: 5 - p.failed };
      },
      sign_out: function () { return { ok: true }; },
      me: function (a) { return meOf(who(a.p_token)); },
      feed: function (a) {
        var p = who(a.p_token); publishDue();
        var out = [], seen = {}, now = Date.now();
        db.posts.filter(function (x) { return x.status === 'published'; }).sort(function (x, y) { return new Date(y.publish_at) - new Date(x.publish_at); }).forEach(function (x) {
          if (x.kind === 'meetup') { if (new Date(x.starts_at).getTime() > now - 6 * 3600e3) out.push(x); }
          else if (!seen[x.kind]) { seen[x.kind] = 1; out.push(x); }
        });
        var open = db.polls.filter(function (x) { return x.status === 'open'; })[0];
        return { me: meOf(p), now: new Date().toISOString(), posts: out.map(function (x) { return pub(x, p.id); }), poll: open ? pollPub(open, p.id) : null, leaders: leadersList() };
      },
      tap: function (a) {
        var me = who(a.p_token);
        var post = db.posts.filter(function (x) { return x.id === a.p_post_id && x.status === 'published'; })[0];
        if (!post) throw new ApiError('post_not_found');
        var k = a.p_kind, mine = function (t) { return t.post === post.id && t.person === me.id; };
        if (k === 'heart' || k === 'tried') {
          var had = db.taps.some(function (t) { return mine(t) && t.kind === k; });
          db.taps = db.taps.filter(function (t) { return !(mine(t) && t.kind === k); });
          if (!had) db.taps.push({ post: post.id, person: me.id, kind: k });
        } else {
          db.taps = db.taps.filter(function (t) { return !(mine(t) && (t.kind === 'rsvp_yes' || t.kind === 'rsvp_no')); });
          db.taps.push({ post: post.id, person: me.id, kind: k });
        }
        return { post_id: post.id, my_taps: myTaps(post.id, me.id) };
      },
      poll_vote: function (a) {
        var me = who(a.p_token);
        var pl = db.polls.filter(function (x) { return x.options.some(function (o) { return o.id === a.p_option_id; }); })[0];
        if (!pl || pl.status !== 'open') throw new ApiError('poll_closed');
        db.votes = db.votes.filter(function (v) { return !(v.option === a.p_option_id && v.person === me.id); });
        if (a.p_on) db.votes.push({ option: a.p_option_id, person: me.id });
        return pollPub(pl, me.id);
      },
      send_note: function (a) {
        var me = who(a.p_token), b = String(a.p_body || '').trim();
        if (!b) throw new ApiError('empty_note');
        var to = (a.p_to || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
        if (to.some(function (id) { var p = person(id); return !p || p.role !== 'leader' || !p.active || p.removed; })) throw new ApiError('bad_recipient');
        if (to.length && leadersList().every(function (l) { return l.id === me.id || to.indexOf(l.id) >= 0; })) to = [];   // everyone = the leadership team
        var n = { id: uid(), from: me.id, audience: to.length ? 'chosen' : 'leadership', to: to, body: b, created_at: new Date().toISOString(), read_at: null, handled_at: null, handled_by: null };
        db.notes.push(n);
        return { ok: true, id: n.id, to: to.length ? leadersList().filter(function (l) { return to.indexOf(l.id) >= 0; }).map(function (l) { return l.name; }) : null };
      },
      push_subscribe: function (a) { who(a.p_token); return { ok: true }; },
      push_unsubscribe: function (a) { who(a.p_token); return { ok: true, removed: 0 }; },
      leader_notes: function (a) {
        var me = leader(a.p_token);
        return db.notes.filter(function (n) { return canSee(n, me); }).sort(function (x, y) { return new Date(y.created_at) - new Date(x.created_at); }).map(function (n) {
          return { id: n.id, from: person(n.from).name, from_id: n.from, body: n.body, audience: n.audience,
            to: n.audience === 'chosen' ? leadersList().filter(function (l) { return n.to.indexOf(l.id) >= 0; }).map(function (l) { return l.name; }) : null,
            created_at: n.created_at, read_at: n.read_at, handled_at: n.handled_at, handled_by: n.handled_by ? person(n.handled_by).name : null };
        });
      },
      leader_mark_read: function (a) { var me = leader(a.p_token), n = noteOf(a.p_note_id, me); n.read_at = n.read_at || new Date().toISOString(); return { ok: true }; },
      leader_mark_handled: function (a) {
        var me = leader(a.p_token), n = noteOf(a.p_note_id, me);
        n.handled_at = a.p_handled === false ? null : (n.handled_at || new Date().toISOString());
        n.handled_by = a.p_handled === false ? null : me.id; n.read_at = n.read_at || new Date().toISOString();
        return { ok: true };
      },
      leader_unanswered_count: function (a) {
        var me = leader(a.p_token), day = Date.now() - 24 * 3600e3;
        return { count: db.notes.filter(function (n) { return canSee(n, me) && new Date(n.created_at).getTime() < day && !n.handled_at; }).length };
      },
      leader_posts: function (a) {
        approver(a.p_token); publishDue();
        var order = { draft: 0, leader_review: 1, approved: 2, published: 3 };
        return { next_weekly_slot: nextWeeklySlot(), posts: db.posts.filter(function (x) { return x.kind !== 'meetup'; }).sort(function (x, y) {
          return (order[x.status] - order[y.status]) || (new Date(y.publish_at || y.created_at) - new Date(x.publish_at || x.created_at));
        }).map(function (x) { var o = lead(x); if (x.status === 'leader_review') o.looks = looksOf(x.id); return o; }) };
      },
      leader_send_for_look: function (a) {
        approver(a.p_token); var p = postOf(a.p_post_id, ['weekly', 'why', 'try']);
        if (p.status === 'draft') p.status = 'leader_review';
        else if (p.status !== 'leader_review') throw new ApiError('already_published');
        var o = lead(p); o.looks = looksOf(p.id); return o;
      },
      leader_for_look: function (a) {
        var me = leader(a.p_token), rank = { weekly: 0, why: 1, try: 2 };
        return db.posts.filter(function (x) { return x.status === 'leader_review'; }).sort(function (x, y) { return rank[x.kind] - rank[y.kind]; }).map(function (x) {
          var o = pub(x, null); delete o.my_taps; o.status = x.status;
          var l = db.looks.filter(function (k) { return k.post === x.id && k.person === me.id; })[0];
          o.mine = l ? { looks_good: l.looks_good, thought: l.thought } : null;
          return o;
        });
      },
      leader_look: function (a) {
        var me = leader(a.p_token);
        if (me.approver) throw new ApiError('not_for_yourself');
        var p = db.posts.filter(function (x) { return x.id === a.p_post_id && x.status === 'leader_review'; })[0];
        if (!p) throw new ApiError('look_closed');
        var t = String(a.p_thought || '').trim() || null, ok = !!a.p_looks_good;
        if (t && t.length > 500) throw new ApiError('too_long');
        if (!ok && !t) throw new ApiError('empty_note');
        db.looks = db.looks.filter(function (k) { return !(k.post === p.id && k.person === me.id); });
        db.looks.push({ post: p.id, person: me.id, looks_good: ok, thought: t });
        return { ok: true, mine: { looks_good: ok, thought: t } };
      },
      leader_save_post: function (a) {
        var me = approver(a.p_token), d = a.p_post, p;
        if (['weekly', 'why', 'try'].indexOf(d.kind) < 0) throw new ApiError('bad_kind');
        if (!d.title || !String(d.title).trim()) throw new ApiError('title_required');
        if (d.image_url && !safeUrl(d.image_url)) throw new ApiError('bad_url');
        if (d.id) {
          p = postOf(d.id, ['weekly', 'why', 'try']);
          if (p.status !== 'draft' && !me.approver) throw new ApiError('approver_only');
        } else {
          p = { id: uid(), status: 'draft', created_by: me.id, approved_by: null, created_at: new Date().toISOString(), starts_at: null }; db.posts.push(p);
        }
        ['kind', 'title', 'body', 'heads_ups', 'reminders', 'asked_did', 'image_url'].forEach(function (k) { p[k] = d[k] || (k === 'image_url' ? null : ''); });
        if (d.kind !== 'weekly') { p.heads_ups = ''; p.reminders = ''; p.asked_did = ''; }
        p.label = d.kind === 'try' ? (d.label || null) : null;
        if (p.status === 'draft' || p.status === 'leader_review') p.publish_at = d.publish_at || null;
        return lead(p);
      },
      leader_approve_post: function (a) {
        var me = approver(a.p_token), p = postOf(a.p_post_id, ['weekly', 'why', 'try']);
        if (p.status === 'published') throw new ApiError('already_published');
        p.status = 'approved'; p.approved_by = me.id;
        var planned = p.publish_at && new Date(p.publish_at) > new Date();
        p.publish_at = a.p_publish_at || (planned ? p.publish_at : p.kind === 'weekly' ? nextWeeklySlot() : new Date().toISOString());
        if (p.kind === 'try') db.posts = db.posts.filter(function (x) { return !(x.kind === 'try' && (x.status === 'draft' || x.status === 'leader_review') && x.id !== p.id); });
        publishDue(); return lead(p);
      },
      leader_taps: function (a) {
        approver(a.p_token);
        var p = postOf(a.p_post_id, ['weekly', 'why', 'try', 'meetup']);
        var ts = db.taps.filter(function (t) { return t.post === p.id; });
        return { post: { id: p.id, title: p.title }, taps: ts.map(function (t) { return { name: person(t.person).name, kind: t.kind }; })
            .sort(function (x, y) { return x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : x.name < y.name ? -1 : 1; }),
          not_yet: db.people.filter(function (x) { return x.active && !x.removed && x.role === 'team' && !ts.some(function (t) { return t.person === x.id; }); }).map(function (x) { return x.name; }).sort() };
      },
      leader_people: function (a) {
        approver(a.p_token);
        return db.people.filter(function (p) { return !p.removed; }).map(function (p) {
          return { id: p.id, name: p.name, role: p.role, approver: p.approver, active: p.active, has_link: !!p.key, has_pin: !!p.pin,
            locked: !!(p.locked_until && new Date(p.locked_until) > new Date()), last_seen: p.last_seen };
        });
      },
      leader_add_person: function (a) {
        var me = approver(a.p_token), n = String(a.p_name || '').trim(), role = a.p_role === 'leader' ? 'leader' : 'team';
        if (role === 'leader' && !me.approver) throw new ApiError('approver_only');
        if (!n || n.length > 60) throw new ApiError('name_required');
        if (db.people.some(function (p) { return !p.removed && p.name.toLowerCase() === n.toLowerCase(); })) throw new ApiError('name_taken');
        var p = { id: uid(), name: n, role: role, approver: false, active: true, removed: false, order: db.people.length, key: 'demo-' + uid() + uid(), pin: null, failed: 0, locked_until: null, last_seen: null };
        db.people.push(p); return { id: p.id, name: p.name, role: p.role, key: p.key };
      },
      leader_remove_person: function (a) {
        var me = approver(a.p_token), t = person(a.p_person_id);
        if (!t || t.removed) throw new ApiError('no_such_person');
        if (t.id === me.id) throw new ApiError('not_for_yourself');
        if (t.approver || (t.role === 'leader' && !me.approver)) throw new ApiError('approver_only');
        t.removed = true; t.active = false; t.key = null; t.pin = null; return { ok: true, name: t.name };
      },
      leader_unpublish_post: function (a) {
        approver(a.p_token); var p = postOf(a.p_post_id, ['weekly', 'why', 'try']);
        if (p.status === 'draft') throw new ApiError('already_draft');
        p.status = 'draft'; p.approved_by = null;
        db.looks = db.looks.filter(function (k) { return k.post !== p.id; });
        return lead(p);
      },
      leader_delete_draft: function (a) {
        approver(a.p_token); var p = postOf(a.p_post_id, ['weekly', 'why', 'try']);
        if (p.status !== 'draft') throw new ApiError('not_a_draft');
        db.posts = db.posts.filter(function (x) { return x.id !== p.id; });
        db.taps = db.taps.filter(function (t) { return t.post !== p.id; });
        return { ok: true };
      },
      leader_set_active: function (a) {
        var me = leader(a.p_token), t = person(a.p_person_id);
        if (!me.approver) throw new ApiError('approver_only');
        if (t.id === me.id) throw new ApiError('not_for_yourself');
        t.active = !!a.p_active; return { ok: true, active: t.active };
      },
      leader_new_link: function (a) {
        var me = leader(a.p_token), t = person(a.p_person_id);
        if (!me.approver) throw new ApiError('approver_only');
        if (t.id === me.id) throw new ApiError('not_for_yourself');
        t.key = 'demo-' + uid() + uid(); t.pin = null; t.active = true; t.locked_until = null;
        return { name: t.name, key: t.key };
      },
      leader_meetups: function (a) {
        approver(a.p_token);
        var now = Date.now();
        return { meetups: db.posts.filter(function (p) { return p.kind === 'meetup' && p.status === 'published' && new Date(p.starts_at).getTime() > now - 6 * 3600e3; })
            .sort(function (x, y) { return new Date(x.starts_at) - new Date(y.starts_at); }).map(lead),
          polls: db.polls.filter(function (p) { return p.status === 'open' || p.status === 'draft'; }).sort(function (x, y) { return (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1); }).map(pollLead) };
      },
      leader_poll_save: function (a) {
        var me = approver(a.p_token), d = a.p_poll, pl;
        checkTimes(d.options);
        if (d.id) {
          pl = db.polls.filter(function (x) { return x.id === d.id; })[0];
          if (!pl) throw new ApiError('poll_not_found');
          if (pl.status !== 'draft') throw new ApiError('poll_locked');
          db.votes = db.votes.filter(function (v) { return !pl.options.some(function (o) { return o.id === v.option; }); });
        } else {
          pl = { id: uid(), status: 'draft', created_by: me.id, created_at: new Date().toISOString() }; db.polls.push(pl);
        }
        pl.note = String(d.note || '').trim() || null;
        pl.options = d.options.map(function (t) { return { id: uid(), starts_at: new Date(t).toISOString() }; });
        return pollLead(pl);
      },
      leader_poll_open: function (a) {
        var me = approver(a.p_token), pl = db.polls.filter(function (x) { return x.id === a.p_poll_id; })[0];
        if (!pl) throw new ApiError('poll_not_found');
        if (pl.status !== 'draft') throw new ApiError('poll_locked');
        if (db.polls.some(function (x) { return x.status === 'open'; })) throw new ApiError('poll_already_open');
        pl.status = 'open'; pl.approved_by = me.id; return pollLead(pl);
      },
      leader_poll_pick: function (a) {
        var me = approver(a.p_token);
        var pl = db.polls.filter(function (x) { return x.options.some(function (o) { return o.id === a.p_option_id; }); })[0];
        if (!pl || pl.status !== 'open') throw new ApiError('poll_closed');
        var o = pl.options.filter(function (x) { return x.id === a.p_option_id; })[0];
        if (new Date(o.starts_at) <= new Date()) throw new ApiError('time_passed');
        var m = makeMeetup(o.starts_at, pl.note, me.id);
        pl.status = 'decided'; pl.meetup_post = m.id;
        return { ok: true, meetup: lead(m) };
      },
      leader_poll_remove: function (a) {
        approver(a.p_token);
        var pl = db.polls.filter(function (x) { return x.id === a.p_poll_id; })[0];
        if (!pl) throw new ApiError('poll_not_found');
        if (pl.status === 'draft') db.polls = db.polls.filter(function (x) { return x.id !== pl.id; });
        else if (pl.status === 'open') pl.status = 'closed';
        else throw new ApiError('poll_locked');
        return { ok: true };
      },
      leader_set_meetup: function (a) {
        var me = approver(a.p_token), at = a.p_meetup && a.p_meetup.starts_at;
        if (!at) throw new ApiError('date_required');
        if (new Date(at) <= new Date()) throw new ApiError('time_passed');
        return lead(makeMeetup(at, a.p_meetup.body, me.id));
      },
      leader_remove_meetup: function (a) {
        approver(a.p_token); var p = postOf(a.p_post_id, ['meetup']);
        db.posts = db.posts.filter(function (x) { return x.id !== p.id; }); db.taps = db.taps.filter(function (t) { return t.post !== p.id; });
        return { ok: true };
      }
    };
    return {
      call: function (fn, args) {
        if (!F[fn]) return err('unknown_function');
        try {
          var out = F[fn](JSON.parse(JSON.stringify(args)));
          save();
          return new Promise(function (res) { setTimeout(function () { res(JSON.parse(JSON.stringify(out))); }, 120); });
        } catch (e) { return Promise.reject(e instanceof ApiError ? e : new ApiError('error')); }
      },
      signInAs: function (name) {
        var p = db.people.filter(function (x) { return x.name === name && !x.removed; })[0];
        p.active = true; if (!p.pin) p.pin = '1234'; if (!p.key) p.key = 'demo-key-' + p.id.slice(2); save();
        S.key = p.key; store.set('key', p.key); S.lead = freshLead();
        S.noteSent = null;
        signedIn({ token: 'demo-token-' + p.id, me: meOf(p) });
      },
      firstOpen: function () {
        var p = person('p-sam'); p.pin = null; p.active = true; p.removed = false; p.key = 'demo-key-sam'; save();
        try { sessionStorage.removeItem(PREFIX + 'a2hs-skip'); } catch (e) { /* ignore */ }
        signOutLocal(); S.key = p.key; S.demoPreview = true; gate();
      },
      reset: function () {
        db = seed(); save(); store.del('noteDraft'); store.del('noteTo'); store.del('pushAsked'); store.del('pushOn');
        S.noteDraft = ''; S.noteTo = { mode: 'all', ids: [] }; S.pushOn = false; S.spoken = {};
        this.signInAs('Sam');
      },
      autoStart: function () {
        if (!S.token) { S.key = 'demo-key-sam'; this.signInAs('Sam'); return true; }
        return false;
      }
    };
  })();

  // ------------------------------------------------------------------
  // Go
  // ------------------------------------------------------------------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* fine without it */ }); });
  }
  if (window.speechSynthesis && window.speechSynthesis.getVoices) { try { window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ } }
  window.addEventListener('hashchange', function () { if (keyFromUrl() && keyFromUrl() !== S.key) location.reload(); });
  if (DEMO && !keyFromUrl() && Demo.autoStart()) { /* demo starts signed in as Sam */ }
  else boot();
})();
