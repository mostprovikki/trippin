// Shared WCAG contrast audit, injected into the page by the scheme gates.
//
// This was written for the dark-mode gate and lived inside it. The light-mode
// gate needs exactly the same maths — effective-background resolution, alpha
// compositing, size-aware AA thresholds, the aria-hidden exemption — and two
// copies of contrast code that are supposed to agree is how they stop agreeing.
// So it lives here, and each gate parameterises the one part that is genuinely
// scheme-specific.
//
// `detectLightSurfaces` is that part: a near-white opaque background is a
// tokenization leak when the page is dark, and utterly normal when it is light.

export function auditSource({ detectLightSurfaces = false } = {}) {
  return `(function () {
  var DETECT_LIGHT_SURFACES = ${detectLightSurfaces ? 'true' : 'false'}

  function parse(c) {
    var m = String(c).match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?/)
    if (!m) return null
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
  }
  function lum(c) {
    var s = [c.r, c.g, c.b].map(function (v) {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
  }
  function over(fg, bg) {
    // Composite a translucent colour onto an opaque one.
    var a = fg.a
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
  }
  function ratio(fg, bg) {
    var l1 = lum(fg), l2 = lum(bg)
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
  }
  // Most elements have a transparent background, so the colour a user actually
  // sees behind the text comes from an ancestor. Walk up compositing as we go.
  function effectiveBg(el) {
    var stack = []
    var node = el
    while (node && node.nodeType === 1) {
      var bg = parse(getComputedStyle(node).backgroundColor)
      if (bg && bg.a > 0) {
        stack.push(bg)
        if (bg.a >= 1) break
      }
      node = node.parentElement
    }
    var base = { r: 255, g: 255, b: 255, a: 1 }
    for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base)
    return base
  }
  function visible(el) {
    var s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false
    var r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  function hex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) {
      return Math.round(v).toString(16).padStart(2, '0')
    }).join('')
  }
  function describe(el) {
    var id = el.id ? '#' + el.id : ''
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''
    return el.tagName.toLowerCase() + id + cls
  }

  // WCAG 1.4.3 exempts "incidental" content — decoration that conveys nothing.
  // aria-hidden="true" is the author asserting exactly that, so such subtrees are
  // exempt from the contrast rule (this mirrors axe-core). Counted, not silently
  // dropped, so the exemption cannot quietly grow into a hole in the gate.
  function decorative(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return true
    }
    return false
  }

  var pageBg = effectiveBg(document.body)
  var lightSurfaces = []
  var lowContrast = []
  var exempt = 0

  // Native form-control chrome lives in shadow DOM, so the element sweep below
  // cannot reach it — a light-grey file-picker button sat on the dark participant
  // page through an entirely green run of this gate. getComputedStyle CAN read
  // the pseudo-element, so check it explicitly.
  var nativeParts = []
  var fileInputs = document.querySelectorAll('input[type="file"]')
  for (var fi = 0; fi < fileInputs.length; fi++) {
    if (!visible(fileInputs[fi])) continue
    var fb = parse(getComputedStyle(fileInputs[fi], '::file-selector-button').backgroundColor)
    var ff = parse(getComputedStyle(fileInputs[fi], '::file-selector-button').color)
    if (!fb || !ff) continue
    var fr = ratio(ff.a < 1 ? over(ff, fb) : ff, fb)
    // Contrast alone does NOT catch this one: the unstyled OS button measured
    // rgb(107,107,107) with white text, which is ~5.3:1 and passes AA. The defect
    // is that it is a NEUTRAL grey sitting among warm stone surfaces — the same
    // mismatch the surface ramp exists to remove. So the binding assertion is
    // "is it warm" (r > b), which every --app-surface* token satisfies and OS
    // grey does not.
    nativeParts.push({
      part: '::file-selector-button',
      bg: hex(fb), fg: hex(ff),
      ratio: +fr.toFixed(2),
      warm: fb.r - fb.b > 0
    })
  }

  var all = document.querySelectorAll('body *')
  for (var i = 0; i < all.length; i++) {
    var el = all[i]
    if (!visible(el)) continue
    var cs = getComputedStyle(el)

    // An opaque near-white background while the page is dark = a surface someone
    // forgot to tokenize. Meaningless in light mode, so the caller switches it off.
    if (DETECT_LIGHT_SURFACES) {
      var ownBg = parse(cs.backgroundColor)
      if (ownBg && ownBg.a >= 0.9) {
        var L = lum(ownBg)
        if (L > 0.75 && el.getBoundingClientRect().width > 24 && el.getBoundingClientRect().height > 8) {
          lightSurfaces.push({ sel: describe(el), bg: hex(ownBg), lum: +L.toFixed(3) })
        }
      }
    }

    // Contrast for elements that actually render their own text.
    var text = ''
    for (var n = 0; n < el.childNodes.length; n++) {
      if (el.childNodes[n].nodeType === 3) text += el.childNodes[n].nodeValue
    }
    text = text.trim()
    if (!text) continue
    var fg = parse(cs.color)
    if (!fg) continue
    if (decorative(el)) { exempt++; continue }
    var bg = effectiveBg(el)
    var composed = fg.a < 1 ? over(fg, bg) : fg
    var r = ratio(composed, bg)
    var size = parseFloat(cs.fontSize) || 15
    var weight = +cs.fontWeight || 400
    // WCAG AA: 3.0 for large text (>=24px, or >=18.66px bold), else 4.5.
    var large = size >= 24 || (size >= 18.66 && weight >= 700)
    var need = large ? 3.0 : 4.5
    if (r < need) {
      lowContrast.push({
        sel: describe(el),
        text: text.slice(0, 40),
        fg: hex(composed), bg: hex(bg),
        ratio: +r.toFixed(2), need: need, size: size
      })
    }
  }
  // Dedupe by selector+colour pair so a 30-row table reports once.
  function dedupe(list, keyFn) {
    var seen = {}, out = []
    list.forEach(function (x) {
      var k = keyFn(x)
      if (!seen[k]) { seen[k] = 1; out.push(x) }
    })
    return out
  }
  return {
    pageBg: hex(pageBg),
    pageLum: +lum(pageBg).toFixed(3),
    darkClass: document.documentElement.classList.contains('app-dark'),
    colorScheme: document.documentElement.style.colorScheme,
    exempt: exempt,
    nativeParts: nativeParts,
    lightSurfaces: dedupe(lightSurfaces, function (x) { return x.sel + x.bg }).slice(0, 8),
    lowContrast: dedupe(lowContrast, function (x) { return x.sel + x.fg + x.bg }).slice(0, 12)
  }
})()`
}
