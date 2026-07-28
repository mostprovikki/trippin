/* ==========================================================================
   app.js — the only script any page loads. Vanilla, no build step.

   Four jobs:
     1. The review state switcher (§7.2 of the brief).
     2. The currency viewing lens — a read-only display filter (§3.13).
     3. Overlays: modal + drawer + command palette, with focus traps.
     4. Small product behaviours: row clicks, tabs, reveal, ticks, dirty state.

   ---------------------------------------------------------------------------
   STATE SWITCHER CONTRACT

   The strip declares axes and values:
     <div class="rev__grp" data-axis="state">
       <button class="rev__b" data-v="populated">Populated</button>

   Content declares when it exists:
     data-when="state:loading state:failed"     visible only in those
     data-when-not="state:loading"              hidden in those
     data-when="lens:vnd"                       a second, independent axis

   A bare token with no colon means the "state" axis, so data-when="empty" is
   shorthand for data-when="state:empty".

   Deep-linkable: #state=empty&lens=eur

   ---------------------------------------------------------------------------
   MONEY CONTRACT

     <span class="money" data-m data-inr="₹80,000" data-eur="≈ €734" data-vnd="">

   The base-currency attribute (data-inr) is authoritative. A missing or empty
   attribute for the active lens means "no rate for this currency" — the base
   value keeps showing, and the page's lens:<code> notice explains why. Nothing
   is ever computed from a converted value; these are strings, deliberately,
   because that is exactly what a display filter is.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------- axes ---- */

  var axes = Object.create(null);

  function tokenAxis(t) {
    var i = t.indexOf(':');
    return i < 0 ? 'state' : t.slice(0, i);
  }
  function tokenValue(t) {
    var i = t.indexOf(':');
    return i < 0 ? t : t.slice(i + 1);
  }
  function matches(list) {
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (axes[tokenAxis(t)] === tokenValue(t)) return true;
    }
    return false;
  }
  function tokens(el, attr) {
    var v = el.getAttribute(attr);
    return v ? v.trim().split(/\s+/) : null;
  }

  function applyVisibility() {
    var all = document.querySelectorAll('[data-when], [data-when-not]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var show = tokens(el, 'data-when');
      var hide = tokens(el, 'data-when-not');
      var vis = true;
      if (show && !matches(show)) vis = false;
      if (vis && hide && matches(hide)) vis = false;
      // [hidden] is set as an attribute; system.css makes it !important so a
      // class with its own display value cannot beat it (a real bug this
      // system has been burned by before).
      if (vis) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
  }

  function applyStripPressed() {
    var groups = document.querySelectorAll('.rev__grp[data-axis]');
    for (var i = 0; i < groups.length; i++) {
      var axis = groups[i].getAttribute('data-axis');
      var bs = groups[i].querySelectorAll('.rev__b[data-v]');
      for (var j = 0; j < bs.length; j++) {
        bs[j].setAttribute('aria-pressed', String(bs[j].getAttribute('data-v') === axes[axis]));
      }
    }
  }

  function writeHash() {
    var parts = [];
    for (var k in axes) parts.push(k + '=' + axes[k]);
    if (parts.length) history.replaceState(null, '', '#' + parts.join('&'));
  }

  function setAxis(axis, value, opts) {
    axes[axis] = value;
    applyVisibility();
    applyStripPressed();
    if (axis === 'lens') applyLens(value);
    if (!opts || !opts.silent) writeHash();
    announce(axis, value);
  }

  var live;
  function announce(axis, value) {
    if (!live) return;
    live.textContent = (axis === 'lens' ? 'Viewing amounts in ' : 'Showing state ') + value;
  }

  /* ------------------------------------------------------- currency lens -- */

  var BASE = 'inr';

  /* Some lens values name a *condition* rather than a currency — "vndlive" is
     the dong via the 161-currency source, "stale"/"failed" are rate problems.
     The app bar must show the currency the reader is in, never the internal
     token, so uppercasing the raw value is not good enough. */
  var LENS_LABEL = {
    inr: 'INR', eur: 'EUR', gbp: 'GBP', usd: 'USD',
    vnd: 'VND', vndlive: 'VND',
    stale: 'EUR', zero: 'EUR', loading: 'EUR',
    failed: 'INR'
  };

  function applyLens(lens) {
    var els = document.querySelectorAll('[data-m]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var base = el.getAttribute('data-' + BASE);
      if (base === null) continue;
      var v = lens === BASE ? null : el.getAttribute('data-' + lens);
      if (v) {
        el.textContent = v;
        el.setAttribute('data-converted', '');
      } else {
        el.textContent = base;
        el.removeAttribute('data-converted');
      }
    }
    var shown = LENS_LABEL[lens] || lens.toUpperCase();
    var labels = document.querySelectorAll('[data-lens-label]');
    for (var j = 0; j < labels.length; j++) labels[j].textContent = shown;
    document.documentElement.toggleAttribute('data-lens-converted', lens !== BASE);
  }

  /* ------------------------------------------------------------ overlays -- */

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
                  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var openStack = [];

  function trapKeys(e) {
    var top = openStack[openStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); closeTop(); return; }
    if (e.key !== 'Tab') return;
    var f = top.el.querySelectorAll(FOCUSABLE);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openOverlay(el) {
    if (!el) return;
    var scrim = document.getElementById('scrim');
    openStack.push({ el: el, returnTo: document.activeElement });
    el.removeAttribute('hidden');
    el.setAttribute('data-open', '');
    if (scrim) scrim.setAttribute('data-open', '');
    document.body.style.overflow = 'hidden';
    var f = el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE);
    if (f) f.focus();
  }

  function closeTop() {
    var top = openStack.pop();
    if (!top) return;
    top.el.removeAttribute('data-open');
    if (top.el.classList.contains('modal') || top.el.classList.contains('pal')) {
      top.el.setAttribute('hidden', '');
    }
    if (!openStack.length) {
      var scrim = document.getElementById('scrim');
      if (scrim) scrim.removeAttribute('data-open');
      document.body.style.overflow = '';
    }
    if (top.returnTo && top.returnTo.focus) top.returnTo.focus();
  }

  /* ------------------------------------------------------------- palette -- */

  function paletteNav(dir) {
    var pal = document.querySelector('.pal[data-open]');
    if (!pal) return;
    var rows = [].filter.call(pal.querySelectorAll('.pal__r'), function (r) {
      return !r.disabled && !r.closest('[hidden]');
    });
    if (!rows.length) return;
    var cur = rows.findIndex(function (r) { return r.getAttribute('aria-selected') === 'true'; });
    var next = cur < 0 ? 0 : (cur + dir + rows.length) % rows.length;
    rows.forEach(function (r, i) { r.setAttribute('aria-selected', String(i === next)); });
    rows[next].scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------ clipboard - */

  function copy(text, btn) {
    function ok() {
      var was = btn.innerHTML;
      btn.innerHTML = 'Copied to clipboard';
      btn.setAttribute('data-copied', '');
      setTimeout(function () { btn.innerHTML = was; btn.removeAttribute('data-copied'); }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();

    // Clipboard access denied — show the link as selectable text instead of
    // failing silently. The link is unrecoverable, so this path matters.
    function fallback() {
      var box = btn.closest('[data-copy-scope]');
      var f = box && box.querySelector('[data-copy-fallback]');
      if (f) { f.removeAttribute('hidden'); var i = f.querySelector('input'); if (i) i.select(); }
    }
  }

  /* -------------------------------------------------------------- wiring -- */

  document.addEventListener('DOMContentLoaded', function () {
    live = document.getElementById('live');

    /* Seed axes from the strip, then from the hash.
       One axis is often split across several .rev__grp boxes purely to group the
       buttons visually. So an EXPLICIT aria-pressed always wins, and the
       first-button fallback only applies if nothing has claimed the axis yet —
       otherwise the last group in the DOM would silently override the marked
       default (which is how trip-dates.html came to open on "Bad input"). */
    var groups = document.querySelectorAll('.rev__grp[data-axis]');
    for (var i = 0; i < groups.length; i++) {
      var axis = groups[i].getAttribute('data-axis');
      var pressed = groups[i].querySelector('.rev__b[aria-pressed="true"]');
      if (pressed) {
        axes[axis] = pressed.getAttribute('data-v');
      } else if (!(axis in axes)) {
        var first = groups[i].querySelector('.rev__b[data-v]');
        if (first) axes[axis] = first.getAttribute('data-v');
      }
    }
    if (!('lens' in axes)) axes.lens = BASE;

    var h = location.hash.replace(/^#/, '');
    if (h) h.split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv.length === 2) axes[kv[0]] = kv[1];
    });

    applyVisibility();
    applyStripPressed();
    applyLens(axes.lens);

    document.addEventListener('click', function (e) {
      var t = e.target;

      /* review strip */
      var sb = t.closest && t.closest('.rev__b[data-v]');
      if (sb) {
        var g = sb.closest('.rev__grp[data-axis]');
        setAxis(g ? g.getAttribute('data-axis') : 'state', sb.getAttribute('data-v'));
        return;
      }

      /* anything that sets an axis from inside the product UI (the currency
         lens menu, a "show me the failure" link, a tab that is really a state) */
      var setter = t.closest && t.closest('[data-set]');
      if (setter) {
        var pair = setter.getAttribute('data-set').split(':');
        setAxis(pair[0], pair.slice(1).join(':'));
        if (setter.closest('.pal, .modal, .drawer')) closeTop();
        if (!setter.hasAttribute('data-keep-default')) e.preventDefault();
        // The two are composable: "switch to this state AND open its dialog" is a
        // legitimate control. Returning early here silently swallowed the second
        // half, so a button carrying both attributes only ever did one of them.
        var alsoOpens = setter.getAttribute('data-open-modal');
        if (alsoOpens) openOverlay(document.getElementById(alsoOpens));
        return;
      }

      /* overlays */
      var op = t.closest && t.closest('[data-open-modal]');
      if (op) { e.preventDefault(); openOverlay(document.getElementById(op.getAttribute('data-open-modal'))); return; }
      if (t.closest && t.closest('[data-close]')) { e.preventDefault(); closeTop(); return; }
      if (t.id === 'scrim') { closeTop(); return; }
      var panel = t.closest && t.closest('.modal__panel, .drawer, .pal');
      if (!panel && t.closest && t.closest('.modal')) { closeTop(); return; }

      /* copy */
      var cp = t.closest && t.closest('[data-copy]');
      if (cp) { e.preventDefault(); copy(cp.getAttribute('data-copy'), cp); return; }

      /* reveal an obscured document thumbnail */
      var rv = t.closest && t.closest('[data-reveal]');
      if (rv) {
        e.preventDefault();
        var scope = rv.getAttribute('data-reveal') === 'all'
          ? document
          : (rv.closest('[data-doc]') || document);
        var hidden = scope.querySelectorAll('.thumb--hide');
        if (hidden.length) {
          for (var k = 0; k < hidden.length; k++) hidden[k].classList.remove('thumb--hide');
          rv.setAttribute('data-revealed', '');
          if (rv.hasAttribute('data-reveal-label')) rv.lastChild.textContent = ' Hide again';
        } else {
          var shown = scope.querySelectorAll('.thumb:not(.thumb--none):not(.thumb--pending)');
          for (var m = 0; m < shown.length; m++) shown[m].classList.add('thumb--hide');
          rv.removeAttribute('data-revealed');
          if (rv.hasAttribute('data-reveal-label')) rv.lastChild.textContent = ' Reveal';
        }
        return;
      }

      /* tabs and segmented controls */
      var tabish = t.closest && t.closest('.tab, .seg');
      if (tabish && tabish.parentElement) {
        var sibs = tabish.parentElement.querySelectorAll('.tab, .seg');
        for (var n = 0; n < sibs.length; n++) {
          sibs[n].setAttribute('aria-selected', String(sibs[n] === tabish));
        }
        var pid = tabish.getAttribute('aria-controls');
        if (pid) {
          var panes = document.querySelectorAll('[data-panel-group="' + tabish.closest('[data-panel-group]')?.getAttribute('data-panel-group') + '"]');
          for (var p = 0; p < panes.length; p++) panes[p].toggleAttribute('data-active', panes[p].id === pid);
        }
      }

      /* rows that navigate. Never an <a>: an <a> inside an <a> makes the
         parser close the outer one and the row's grid collapses. */
      var row = t.closest && t.closest('.row--link[data-href], .wait[data-href]');
      if (row && !(t.closest('a, button, input, label, .check'))) {
        var href = row.getAttribute('data-href');
        if (href && href !== '#') location.href = href;
      }
    });

    /* ticking a checklist item */
    document.addEventListener('change', function (e) {
      var tick = e.target.closest && e.target.closest('.tick');
      if (tick && e.target.type === 'checkbox') {
        tick.toggleAttribute('data-done', e.target.checked);
        var counter = document.querySelector('[data-tick-count]');
        if (counter) {
          var scope = tick.closest('[data-tick-scope]') || document;
          var boxes = scope.querySelectorAll('.tick input[type=checkbox]');
          var done = scope.querySelectorAll('.tick[data-done] input[type=checkbox]');
          counter.textContent = done.length + ' of ' + boxes.length;
        }
      }
    });

    /* one dirty-state policy: any input marks its section and the save bar */
    document.addEventListener('input', function (e) {
      var sect = e.target.closest && e.target.closest('[data-section]');
      if (sect) {
        var mark = sect.querySelector('[data-dirty-mark]');
        if (mark) mark.removeAttribute('hidden');
        var saved = sect.querySelector('[data-saved-mark]');
        if (saved) saved.setAttribute('hidden', '');
      }
      var bar = document.querySelector('[data-savebar]');
      if (bar) {
        bar.removeAttribute('hidden');
        var n = document.querySelectorAll('[data-section] [data-dirty-mark]:not([hidden])').length;
        var c = bar.querySelector('[data-dirty-count]');
        if (c) c.textContent = String(n);
      }
      window.__tripperDirty = true;
    });

    /* keyboard */
    document.addEventListener('keydown', function (e) {
      if (openStack.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); paletteNav(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); paletteNav(-1); return; }
        trapKeys(e);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        var pal = document.getElementById('palette');
        if (pal) { e.preventDefault(); openOverlay(pal); }
      }
    });

    /* itinerary reorder via keyboard as well as the grab handle */
    document.addEventListener('keydown', function (e) {
      var g = e.target.closest && e.target.closest('.it__grab');
      if (!g) return;
      var item = g.closest('.it');
      if (e.key === 'ArrowUp' && item.previousElementSibling &&
          item.previousElementSibling.classList.contains('it')) {
        e.preventDefault();
        item.parentElement.insertBefore(item, item.previousElementSibling);
        g.focus();
      } else if (e.key === 'ArrowDown' && item.nextElementSibling &&
                 item.nextElementSibling.classList.contains('it')) {
        e.preventDefault();
        item.parentElement.insertBefore(item.nextElementSibling, item);
        g.focus();
      }
    });

    /* the navigation guard, demonstrated rather than described */
    window.addEventListener('beforeunload', function (e) {
      if (window.__tripperDirty) { e.preventDefault(); e.returnValue = ''; }
    });
  });

  /* Let a page drive the switcher itself (e.g. a "retry" button that moves
     from failed to loading to populated). */
  window.Tripper = {
    set: setAxis,
    get: function (a) { return axes[a]; },
    open: openOverlay,
    close: closeTop
  };
})();
