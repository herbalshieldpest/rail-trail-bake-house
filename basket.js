/* Rail Trail Bakehouse — menu data and basket, shared by the homepage and the menu page. */
(function () {
  'use strict';
  var SUPA_URL = 'https://rjkwrvmhermwdkgekcto.supabase.co/rest/v1/';
  var SUPA_KEY = 'sb_publishable_3uMAgWtXcYXgEhh6pl5KXg_-9S7_OST';
  var TZ = 'America/New_York';
  var STORE = 'rt-basket-v1';
  var MAX_QTY = 24;

  var ICONS = {
    wheat: ['#o-wheat', '0 0 40 120', 14, 40],
    trefoil: ['#o-trefoil', '0 0 60 60', 28, 28],
    rosette: ['#o-rosette', '0 0 100 100', 30, 30],
    lattice: ['#o-lattice', '0 0 100 100', 32, 32],
    swirl: ['#o-swirl', '0 0 100 100', 28, 28]
  };

  var RT = window.RT = {
    ready: null, week: null, items: [], bySlug: {}, minCents: 4000, failed: false,
    basket: { week_id: null, items: {} },
    listeners: []
  };

  // ---------- helpers ----------
  function money(c) { return c == null ? '' : '$' + (c % 100 ? (c / 100).toFixed(2) : String(c / 100)); }
  RT.money = money;
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  RT.el = el;
  RT.icon = function (name) {
    var ic = ICONS[name] || ICONS.rosette;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', ic[2]); svg.setAttribute('height', ic[3]); svg.setAttribute('viewBox', ic[1]); svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(NS, 'use'); use.setAttribute('href', ic[0]); svg.appendChild(use);
    return svg;
  };
  function fmt(ts, opts) { return new Date(ts).toLocaleString('en-US', Object.assign({ timeZone: TZ }, opts)); }
  function fmtDay(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
  RT.fmt = fmt; RT.fmtDay = fmtDay;
  function timeWord(ts) { // "6 pm", "7:30 am"
    return fmt(ts, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' AM', ' am').replace(' PM', ' pm');
  }
  RT.timeWord = timeWord;

  // ---------- state ----------
  RT.status = function () {
    var w = RT.week, now = Date.now();
    if (!w) return { state: RT.failed ? 'error' : 'none' };
    var o = new Date(w.opens_at).getTime(), c = new Date(w.closes_at).getTime();
    if (now < o) return { state: 'upcoming', ms: o - now };
    if (now < c) return { state: 'open', ms: c - now };
    return { state: 'closed' };
  };
  RT.isOpen = function () { return RT.status().state === 'open'; };
  RT.leftWords = function (ms) {
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d >= 1) return d + (d === 1 ? ' day, ' : ' days, ') + h + (h === 1 ? ' hour' : ' hours');
    if (h >= 1) return h + (h === 1 ? ' hour, ' : ' hours, ') + mm + ' min';
    return Math.max(mm, 1) + ' min';
  };
  RT.statusLine = function () {
    var st = RT.status(), w = RT.week;
    if (st.state === 'open') return 'Orders close ' + fmt(w.closes_at, { weekday: 'long' }) + ' at ' + timeWord(w.closes_at) + ' · ' + RT.leftWords(st.ms) + ' left';
    if (st.state === 'upcoming') return 'This menu opens for orders ' + fmt(w.opens_at, { weekday: 'long', month: 'short', day: 'numeric' }) + ' at ' + timeWord(w.opens_at);
    if (st.state === 'closed') return 'Ordering is closed for this week. The next menu goes up Wednesday.';
    if (st.state === 'error') return 'The menu could not load. Please refresh the page.';
    return 'The next menu goes up Wednesday.';
  };

  function load() {
    try { var b = JSON.parse(localStorage.getItem(STORE) || 'null'); if (b && b.items) RT.basket = b; } catch (e) { /* storage unavailable */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(RT.basket)); } catch (e) { /* storage unavailable */ }
    emit();
  }
  function emit() { RT.listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  RT.onChange = function (f) { RT.listeners.push(f); };

  RT.lines = function () {
    var out = [];
    Object.keys(RT.basket.items).forEach(function (slug) {
      var it = RT.bySlug[slug], q = RT.basket.items[slug];
      if (it && q > 0) out.push({ item: it, qty: q, total: it.price_cents * q });
    });
    out.sort(function (a, b) { return (a.item.sort || 0) - (b.item.sort || 0); });
    return out;
  };
  RT.count = function () { return RT.lines().reduce(function (s, l) { return s + l.qty; }, 0); };
  RT.subtotal = function () { return RT.lines().reduce(function (s, l) { return s + l.total; }, 0); };
  RT.qty = function (slug) { return RT.basket.items[slug] || 0; };

  RT.setQty = function (slug, q) {
    var it = RT.bySlug[slug];
    if (!it) return;
    q = Math.max(0, Math.min(MAX_QTY, q | 0));
    if (it.remaining != null) q = Math.min(q, it.remaining);
    if (q) RT.basket.items[slug] = q; else delete RT.basket.items[slug];
    RT.basket.week_id = RT.week && RT.week.week_id;
    save();
  };
  RT.add = function (slug, n) {
    var it = RT.bySlug[slug];
    if (!it) { toast('That item is not on this week’s menu.'); return false; }
    var st = RT.status();
    if (st.state !== 'open') { toast(st.state === 'upcoming' ? RT.statusLine() + '.' : RT.statusLine()); return false; }
    if (it.remaining === 0) { toast(it.name + ' is sold out this week.'); return false; }
    RT.setQty(slug, RT.qty(slug) + (n || 1));
    toast('Added ' + it.name, true);
    return true;
  };

  // ---------- fetch ----------
  function get(path) {
    return fetch(SUPA_URL + path, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  load();
  RT.ready = Promise.all([
    get('current_menu?select=*&order=sort'),
    get('settings?select=min_order_cents').catch(function () { return []; })
  ]).then(function (rs) {
    var rows = rs[0] || [];
    if (rs[1] && rs[1][0] && rs[1][0].min_order_cents != null) RT.minCents = rs[1][0].min_order_cents;
    RT.items = rows.filter(function (r) { return r.price_cents != null; });
    RT.items.forEach(function (r) { RT.bySlug[r.slug] = r; });
    if (rows.length) {
      var r = rows[0];
      RT.week = { week_id: r.week_id, opens_at: r.opens_at, closes_at: r.closes_at, bake_date: r.bake_date, delivery_date: r.delivery_date, delivery_window: r.delivery_window };
    }
    if (RT.basket.week_id && RT.week && RT.basket.week_id !== RT.week.week_id) RT.basket = { week_id: RT.week.week_id, items: {} };
    Object.keys(RT.basket.items).forEach(function (s) { if (!RT.bySlug[s]) delete RT.basket.items[s]; });
    save();
  }).catch(function (e) {
    RT.failed = true; console.warn('Menu unavailable', e); emit();
  });

  // ---------- styles ----------
  var css = [
    '.rtb-ov{position:fixed;inset:0;background:rgba(13,25,27,.45);opacity:0;pointer-events:none;transition:opacity .25s;z-index:60}',
    '.rtb-ov.on{opacity:1;pointer-events:auto}',
    '.rtb{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:#f1ebe0;color:#2a1c13;z-index:61;transform:translateX(100%);transition:transform .3s ease;display:flex;flex-direction:column;font-family:"EB Garamond",Georgia,serif;font-size:17px;line-height:1.45;box-shadow:-10px 0 40px rgba(13,25,27,.25)}',
    '.rtb.on{transform:none}',
    '.rtb-hd{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #c3b5a0}',
    '.rtb-hd h2{margin:0;font-family:"Marcellus SC",serif;font-weight:400;font-size:24px;letter-spacing:.07em;text-transform:uppercase}',
    '.rtb-x{background:none;border:none;width:40px;height:40px;margin-right:-10px;cursor:pointer;color:inherit;display:flex;align-items:center;justify-content:center}',
    '.rtb-when{padding:12px 24px;font-style:italic;color:#5e4f42;font-size:15px;border-bottom:1px solid #e6d9c6}',
    '.rtb-list{flex:1;overflow:auto;padding:4px 24px}',
    '.rtb-line{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:14px 0;border-bottom:1px solid #e6d9c6}',
    '.rtb-name{font-weight:600}.rtb-unit{font-style:italic;font-size:15px;color:#6b5a4b}',
    '.rtb-amt{text-align:right;font-weight:600}',
    '.rtb-ctl{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;margin-top:6px}',
    '.rt-step{display:inline-flex;align-items:center;border:1px solid #2a1c13;border-radius:999px;height:36px}',
    '.rt-step button{width:36px;height:34px;border:none;background:none;cursor:pointer;font-size:18px;color:inherit;display:flex;align-items:center;justify-content:center;border-radius:999px}',
    '.rt-step button:disabled{opacity:.3;cursor:default}',
    '.rt-step span{min-width:26px;text-align:center;font-weight:600}',
    '.rtb-rm{background:none;border:none;color:#6b5a4b;font-style:italic;cursor:pointer;text-decoration:underline;text-underline-offset:3px;font-size:15px;padding:6px 0}',
    '.rtb-empty{padding:40px 0;text-align:center;color:#6b5a4b;font-style:italic}',
    '.rtb-ft{border-top:1px solid #c3b5a0;padding:16px 24px 22px;background:#ece4d6}',
    '.rtb-row{display:flex;justify-content:space-between;align-items:baseline}',
    '.rtb-sub{font-size:20px;font-weight:600}',
    '.rtb-note{font-size:15px;color:#5e4f42;margin:4px 0 12px}',
    '.rtb-bar{height:4px;background:#ddd0bc;border-radius:2px;overflow:hidden;margin:2px 0 12px}.rtb-bar i{display:block;height:100%;background:#2f4a37;transition:width .3s}',
    '.rtb-go{display:block;width:100%;border:none;border-radius:4px;padding:14px 18px 15px;cursor:pointer;background:#2f4a37;color:#e2cf9f;font:inherit;font-weight:700;font-variant:small-caps;letter-spacing:.1em;font-size:18px;box-shadow:inset 0 0 0 1px #24392a;outline:1px dashed rgba(226,207,159,.75);outline-offset:-5px}',
    '.rtb-go:disabled{opacity:.55;cursor:default}',
    '.rtb-msg{font-size:14px;color:#5e4f42;margin:10px 0 0;text-align:center}',
    '.rt-toast{position:fixed;left:50%;bottom:24px;width:max-content;transform:translateX(-50%) translateY(20px);opacity:0;transition:all .25s;background:#1b2e31;color:#f1ebe0;padding:10px 12px 10px 18px;border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.28);z-index:70;display:flex;align-items:center;gap:14px;font-family:"EB Garamond",Georgia,serif;font-size:16px;max-width:calc(100% - 32px)}',
    '.rt-toast.on{opacity:1;transform:translateX(-50%)}',
    '.rt-toast button{background:none;border:1px solid rgba(226,207,159,.6);color:#e2cf9f;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit;font-size:14px;white-space:nowrap}',
    '.rt-mi-add.on{background:#2f4a37!important;border-color:#2f4a37!important}.rt-mi-add.on path{stroke:#e2cf9f}',
    '.rt-mi-qty{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#9a3b2b;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;padding:0 4px;font-family:"EB Garamond",serif}',
    '.rt-count.has{color:#e2cf9f}',
    'body.rtb-lock{overflow:hidden}',
    '@media (max-width:900px){body.rt-has-bar .rt-toast{bottom:84px}}'
  ].join('\n');
  document.head.appendChild(el('style', { text: css }));

  // ---------- toast ----------
  var toastEl, toastTimer;
  function toast(msg, withView) {
    if (toastEl) toastEl.remove();
    toastEl = el('div', { class: 'rt-toast', role: 'status' }, el('span', { text: msg }),
      withView ? el('button', { type: 'button', text: 'View basket', onclick: function () { RT.open(); } }) : null);
    document.body.appendChild(toastEl);
    requestAnimationFrame(function () { toastEl.classList.add('on'); });
    clearTimeout(toastTimer);
    var t = toastEl;
    toastTimer = setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 300); }, withView ? 3200 : 4200);
  }
  RT.toast = toast;

  // ---------- drawer ----------
  var ov, dr, listEl, whenEl, ftEl, lastFocus;
  function stepper(slug) {
    var q = RT.qty(slug), it = RT.bySlug[slug];
    var max = Math.min(MAX_QTY, it && it.remaining != null ? it.remaining : MAX_QTY);
    return el('span', { class: 'rt-step' },
      el('button', { type: 'button', 'aria-label': 'One fewer ' + (it ? it.name : ''), onclick: function () { RT.setQty(slug, q - 1); } }, '−'),
      el('span', { 'aria-live': 'polite', text: String(q) }),
      el('button', { type: 'button', 'aria-label': 'One more ' + (it ? it.name : ''), disabled: q >= max, onclick: function () { RT.setQty(slug, q + 1); } }, '+'));
  }
  RT.stepper = stepper;

  function buildDrawer() {
    ov = el('div', { class: 'rtb-ov', onclick: function () { RT.close(); } });
    listEl = el('div', { class: 'rtb-list' });
    whenEl = el('div', { class: 'rtb-when' });
    ftEl = el('div', { class: 'rtb-ft' });
    dr = el('aside', { class: 'rtb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your basket', tabindex: '-1' },
      el('div', { class: 'rtb-hd' }, el('h2', { text: 'Your basket' }),
        el('button', { type: 'button', class: 'rtb-x', 'aria-label': 'Close basket', onclick: function () { RT.close(); },
          html: '<svg width="22" height="22" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l14 14M20 6L6 20"/></svg>' })),
      whenEl, listEl, ftEl);
    document.body.appendChild(ov); document.body.appendChild(dr);
    dr.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') RT.close();
      if (e.key === 'Tab') {
        var f = dr.querySelectorAll('button:not([disabled]),a[href]'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function renderDrawer() {
    if (!dr) return;
    var w = RT.week, st = RT.status();
    whenEl.textContent = w ? 'For delivery ' + fmtDay(w.delivery_date) + ', ' + (w.delivery_window || '') : RT.statusLine();
    listEl.replaceChildren();
    var lines = RT.lines();
    if (!lines.length) listEl.appendChild(el('div', { class: 'rtb-empty' }, st.state === 'open' ? 'Your basket is empty.' : RT.statusLine()));
    lines.forEach(function (l) {
      listEl.appendChild(el('div', { class: 'rtb-line' },
        el('div', {}, el('div', { class: 'rtb-name', text: l.item.name }), el('div', { class: 'rtb-unit', text: l.item.unit + ' · ' + money(l.item.price_cents) + ' each' })),
        el('div', { class: 'rtb-amt', text: money(l.total) }),
        el('div', { class: 'rtb-ctl' }, stepper(l.item.slug),
          el('button', { type: 'button', class: 'rtb-rm', text: 'Remove', onclick: function () { RT.setQty(l.item.slug, 0); } }))));
    });
    var sub = RT.subtotal(), min = RT.minCents, short = Math.max(min - sub, 0);
    var canGo = st.state === 'open' && lines.length && short === 0;
    var msg = el('p', { class: 'rtb-msg', hidden: true });
    ftEl.replaceChildren.apply(ftEl, [
      el('div', { class: 'rtb-row' }, el('span', { text: 'Subtotal' }), el('span', { class: 'rtb-sub', text: money(sub) })),
      el('p', { class: 'rtb-note', text: short > 0 && lines.length ? 'Add ' + money(short) + ' more to reach the ' + money(min) + ' minimum. Delivery is included.' : 'Delivery is included in every price.' }),
      lines.length && short > 0 ? el('div', { class: 'rtb-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.min(100, Math.round(sub / min * 100)) + '%' })) : null,
      el('button', { type: 'button', class: 'rtb-go', disabled: !canGo, text: st.state !== 'open' ? 'Ordering closed' : (short > 0 ? 'Minimum order ' + money(min) : 'Check out · ' + money(sub)),
        onclick: function () { if (typeof RT.checkout === 'function') return RT.checkout(); msg.hidden = false; msg.textContent = 'Checkout is the next piece being built. Your basket will be kept until then.'; } }),
      msg].filter(Boolean));
  }
  RT.open = function () {
    if (toastEl) { toastEl.remove(); toastEl = null; }
    if (!dr) buildDrawer();
    renderDrawer();
    lastFocus = document.activeElement;
    ov.classList.add('on'); dr.classList.add('on'); document.body.classList.add('rtb-lock');
    setTimeout(function () { dr.focus(); }, 50);
  };
  RT.close = function () {
    if (!dr) return;
    ov.classList.remove('on'); dr.classList.remove('on'); document.body.classList.remove('rtb-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  // ---------- header + homepage wiring ----------
  function paintCounts() {
    var n = RT.count();
    document.querySelectorAll('.rt-count').forEach(function (c) { c.textContent = '(' + n + ')'; c.classList.toggle('has', n > 0); });
    document.querySelectorAll('[data-rt-basket]').forEach(function (a) { a.setAttribute('aria-label', 'Basket, ' + n + (n === 1 ? ' item' : ' items')); });
  }
  function fillHomeMenu() {
    var rows = document.querySelectorAll('.rt-mi');
    if (!rows.length || !RT.items.length) return;
    var items = RT.items.filter(function (i) { return i.category !== 'gifts'; });
    var tpl = rows[0], parent = tpl.parentNode, after = rows[rows.length - 1].nextSibling;
    for (var i = 0; i < rows.length; i++) rows[i].remove();
    items.forEach(function (it) {
      var row = tpl.cloneNode(true);
      row.dataset.slug = it.slug;
      row.querySelector('.rt-mi-name').textContent = it.name;
      row.querySelector('.rt-mi-unit').textContent = it.unit;
      row.querySelector('.rt-mi-price').textContent = it.remaining === 0 ? 'Sold out' : money(it.price_cents);
      var old = row.querySelector('.rt-mi-icon');
      if (old) { var ic = RT.icon(it.icon); ic.setAttribute('class', 'rt-mi-icon'); old.replaceWith(ic); }
      parent.insertBefore(row, after);
    });
  }
  function paintHomeButtons() {
    document.querySelectorAll('.rt-mi').forEach(function (row) {
      var b = row.querySelector('.rt-mi-add'); if (!b) return;
      var slug = row.dataset.slug, q = RT.qty(slug), it = RT.bySlug[slug];
      b.style.position = 'relative';
      b.classList.toggle('on', q > 0);
      var badge = b.querySelector('.rt-mi-qty');
      if (q > 0) { if (!badge) { badge = el('span', { class: 'rt-mi-qty', 'aria-hidden': 'true' }); b.appendChild(badge); } badge.textContent = q; }
      else if (badge) badge.remove();
      b.setAttribute('aria-label', 'Add ' + (it ? it.name : 'item') + ' to basket' + (q ? ' (' + q + ' in basket)' : ''));
      if (it && it.remaining === 0) { b.disabled = true; b.style.opacity = '0.35'; }
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rt-basket],.rt-mi-add,[data-add]');
    if (!t) return;
    if (t.hasAttribute('data-rt-basket')) { e.preventDefault(); RT.open(); return; }
    e.preventDefault();
    var slug = t.getAttribute('data-add') || (t.closest('.rt-mi') && t.closest('.rt-mi').dataset.slug);
    RT.ready.then(function () { if (RT.failed) toast('The menu could not load. Please refresh the page.'); else RT.add(slug); });
  });
  document.addEventListener('click', function (e) { // close the phone menu after following a link
    var a = e.target.closest && e.target.closest('.rt-nav a'); var cb = document.getElementById('nav-open');
    if (a && cb) cb.checked = false;
  });

  RT.onChange(function () { paintCounts(); paintHomeButtons(); renderDrawer(); });
  RT.ready.then(function () { fillHomeMenu(); emit(); });
  setInterval(emit, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintCounts); else paintCounts();
})();
