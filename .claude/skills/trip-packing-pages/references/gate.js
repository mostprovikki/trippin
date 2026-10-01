/* Verification gate for a trip packing page.
   Paste into the browser console with the page open, or run via a driver:
     await page.evaluate(fs.readFileSync('gate.js','utf8'))
   Prints one line per check and returns {passed, failed, results}.

   Check 2 ticks the row before incrementing. Skip that and an unselected item legitimately
   adds nothing to the total, which reads as a frozen meter and manufactures a false bug —
   a mistake this gate was written after making. Check 5 is the one that finds real defects:
   contrast failures hide in whichever theme you are not currently looking at. */
(function () {
  var out = [], pass = 0, fail = 0;
  function t(name, ok, detail) {
    out.push({ check: name, ok: !!ok, detail: detail || "" });
    if (ok) { pass++; } else { fail++; }
    console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  — " + detail : ""));
  }
  var q = function (s) { return document.querySelector(s); };

  /* Works on template-built pages and on hand-written ones, which is the point:
     check 2 exists to catch a hand-rolled counter. Falls back to any button
     labelled + when the template's own classes are absent. */
  function findIncrement() {
    var el = q(".step .inc");
    if (el) return el;
    var btns = [].slice.call(document.querySelectorAll('button, [role=button], a'));
    return btns.filter(function (b) {
      return /^[+＋]$/.test((b.textContent || "").trim()) ||
             /incr|plus|\badd\b/i.test(b.className + " " + (b.getAttribute("aria-label") || ""));
    })[0] || null;
  }
  function findTotal() {
    var el = q("#total") || q("#weightTotal") || q("#weightCurrent");
    if (el) return el;
    /* smallest leaf element whose text looks like a weight and sits near the top */
    return [].slice.call(document.querySelectorAll("*")).filter(function (e) {
      return !e.children.length && /\d+(\.\d+)?\s*(kg|g|lb)\b/i.test(e.textContent) &&
             e.textContent.trim().length < 24;
    })[0] || null;
  }

  /* 1 — did the list render at all */
  var rows = document.querySelectorAll(".row, li, tr").length;
  var steppers = document.querySelectorAll(".step").length ||
                 [].slice.call(document.querySelectorAll("button")).filter(function (b) {
                   return /^[+＋]$/.test((b.textContent || "").trim()); }).length;
  t("1 list rendered", rows > 0, rows + " rows, " + steppers + " counters");

  /* 2 — the DERIVED total must move, not just the item you clicked */
  var inc = findIncrement();
  var totalEl = findTotal();
  if (!inc || !totalEl) {
    t("2 total tracks the counter", false, "no counter or no total element found");
  } else {
    var row = inc.closest(".row") || inc.parentElement;
    var itemEl = row && row.querySelector(".g, [class*=weight]");
    /* On layouts where a checkbox selects the item and the counter only sets how many,
       an unselected row legitimately adds nothing — tick it first, or check 2 reports a
       false failure. In the template, count > 0 IS selection and there is no checkbox. */
    var box = row && row.querySelector('input[type=checkbox]');
    if (box && !box.checked) { box.click(); }
    var t0 = totalEl.textContent.trim();
    var i0 = itemEl ? itemEl.textContent.trim() : null;
    var fillEl = q("#fill") || q("[class*=fill]");
    var f0 = fillEl ? fillEl.style.width : null;
    inc.click();
    var t1 = totalEl.textContent.trim();
    var i1 = itemEl ? itemEl.textContent.trim() : null;
    t("2 total tracks the counter", t1 !== t0,
      "total " + t0 + " -> " + t1 + (i0 !== null ? " | item " + i0 + " -> " + i1 : ""));
    if (fillEl) {
      t("2b progress bar tracks", fillEl.style.width !== f0, f0 + " -> " + fillEl.style.width);
    }
  }

  /* 3 — focus survives a press (fails when the handler re-renders the list) */
  var b = findIncrement();
  if (!b) { t("3 focus survives a press", false, "no counter found"); }
  else {
    b.focus(); b.click();
    t("3 focus survives a press",
      document.activeElement === b && document.body.contains(b),
      document.body.contains(b) ? "" : "button was destroyed by a re-render");
  }

  /* 4 — the page itself must not scroll sideways (wide content scrolls in its own box) */
  t("4 no sideways page scroll",
    document.documentElement.scrollWidth <= window.innerWidth + 1,
    "scrollWidth " + document.documentElement.scrollWidth + " vs viewport " + window.innerWidth);

  /* 5 — nothing invisible, in BOTH themes. Re-run after flipping OS appearance;
         data-theme is only honoured by pages that implement it. */
  function lum(c) {
    var p = c && c.match(/[\d.]+/g); if (!p) return null;
    var v = p.slice(0, 3).map(Number).map(function (x) {
      x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function bgOf(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  }
  function unreadable() {
    return [].filter.call(document.querySelectorAll("body *"), function (el) {
      if (!el.textContent.trim() || el.children.length) return false;
      var cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      var a = lum(cs.color), c = lum(bgOf(el));
      if (a === null || c === null) return false;
      return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05) < 3;
    });
  }
  var bad = unreadable();
  var worst = bad.map(function (el) {
    var a = lum(getComputedStyle(el).color), c = lum(bgOf(el));
    return { r: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2),
             text: el.textContent.trim().slice(0, 28) };
  }).sort(function (x, y) { return x.r - y.r; })[0];
  t("5 contrast (current theme)", bad.length === 0,
    bad.length ? bad.length + " element(s) under 3:1, worst " + worst.r + ":1 on \"" +
      worst.text + "\"" : "");

  /* 6 — the template's own data audit, if present */
  var banner = q("[role=status]");
  if (banner) {
    t("6 template self-check", false,
      [].map.call(banner.querySelectorAll("li"), function (li) {
        return li.textContent.trim().slice(0, 70);
      }).join(" / "));
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail) console.log("Also check by hand: every toggle combination lands under the allowance, " +
                        "and one category subtotal equals the sum of unit weight x quantity.");
  return { passed: pass, failed: fail, results: out };
})();
