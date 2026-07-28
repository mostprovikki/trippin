#!/usr/bin/env python3
"""
Gate: every state a page's review strip offers must actually RENDER something.

Why this exists. The obvious check — "does the strip declare this value, and do
index.html / states.md link to it" — passes even when nothing renders. Both of
these shipped and were caught only by this script:

  * a consequence dialog whose only markup was a `hidden` .modal that nothing
    un-hid, so selecting the state showed an empty page;
  * a state-specific card nested inside a wrapper whose own data-when excluded
    that very state, so it hid the thing it selected.

A mapping in states.md that points at a state rendering nothing is worse than no
mapping at all, which is why this is a gate and not a report.

Model (mirrors app.js): an element is visible for axis=value when
  - every data-when on it or an ancestor either names value or addresses another axis
  - no data-when-not on it or an ancestor names value

A state is reachable when at least one element whose OWN data-when names it is
visible.

KNOWN LIMIT — measured, not assumed, and deliberately not papered over.

This catches a *completely* dead state, which is the bug that actually shipped
(four of them in trip-dates.html). It does NOT catch a state whose main panel is
orphaned while its page header still names it.

Falsification runs, both performed:
  * removing data-when from a dialog, leaving only a hidden .modal  -> CAUGHT
  * re-nesting trip.html's ready block under data-when="active"     -> MISSED,
    because thead, tnav and the lifecycle strip still name "ready".

A "thin state" heuristic (flag any state showing far less content than its
siblings) was built for the second case and then removed: it produced 56
warnings on the healthy set and byte-identical output with and without the
planted bug, so it had no discriminating power. A gate that cannot tell broken
from working is worse than none, because people learn to ignore it.

So: screenshots remain the backstop. This narrows what they must catch; it does
not replace them.

Two deliberate exemptions, both verified by screenshot rather than assumed:

  lens=*   The currency lens acts by swapping [data-m] attributes, not by
           data-when, so it needs no gated element — only money on the page.
  default  A page's default state often renders through data-when-not exclusion
           with nothing naming it. Distinguished from a genuinely dead state by
           how much gated content stays visible.

Usage:  python3 _check-states.py            # every page, exit 1 on failure
        python3 _check-states.py trip.html  # one page
"""
import sys
import glob
import re
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}


def axis_of(tok):
    return tok.split(':', 1)[0] if ':' in tok else 'state'


def val_of(tok):
    return tok.split(':', 1)[1] if ':' in tok else tok


class Gated(HTMLParser):
    """Records every data-when element together with its ancestor conditions."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []    # [(tag, when, whennot)]
        self.records = []  # [(own_when, ancestor_chain)]

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        when = (a.get('data-when') or '').split()
        wnot = (a.get('data-when-not') or '').split()
        if when:
            self.records.append((when, list(self.stack)))
        if tag not in VOID:
            self.stack.append((tag, when, wnot))

    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        when = (a.get('data-when') or '').split()
        if when:
            self.records.append((when, list(self.stack)))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return


def visible(chain, own_when, axis, value):
    conds = [(w, n) for (_t, w, n) in chain] + [(own_when, [])]
    for when, wnot in conds:
        rel = [val_of(t) for t in when if axis_of(t) == axis]
        if rel and value not in rel:
            return False
        if value in [val_of(t) for t in wnot if axis_of(t) == axis]:
            return False
    return True


def offered_states(src):
    """The (axis, value) pairs the review strip puts in front of a reviewer."""
    # NB: [^>]* is load-bearing. Matching the literal `<div class="rev">` made
    # this silently return zero states for any page carrying an attribute on the
    # strip, i.e. it skipped the page instead of checking it.
    strip = re.search(r'<div class="rev"[^>]*>.*?(?=<header|<main|<div class="pshell")',
                      src, re.S)
    out = set()
    if not strip:
        return out
    for m in re.finditer(r'data-axis="([^"]+)"((?:(?!data-axis=).)*)',
                         strip.group(0), re.S):
        for b in re.finditer(r'data-v="([^"]+)"', m.group(2)):
            out.add((m.group(1), b.group(1)))
    return out


def declared_defaults(src):
    """States a page declares as rendering through data-when-not exclusion.

    An explicit, reviewable opt-out lives in the page (on .rev) rather than in
    this script, so an exemption is visible to whoever reads the markup and has
    to be justified there. Each one was confirmed by screenshot.
    """
    m = re.search(r'<div class="rev"[^>]*data-default-states="([^"]*)"', src)
    return set(m.group(1).split()) if m else set()


def check(path):
    src = re.sub(r'<!--.*?-->', '', open(path, encoding='utf-8').read(), flags=re.S)
    offered = offered_states(src)
    has_money = 'data-m' in src
    defaults = declared_defaults(src)

    p = Gated()
    p.feed(src)

    counts = {}
    for axis, value in offered:
        named = sum(1 for own, ch in p.records
                    if visible(ch, own, axis, value)
                    and value in [val_of(t) for t in own if axis_of(t) == axis])
        vis = sum(1 for own, ch in p.records if visible(ch, own, axis, value))
        counts[(axis, value)] = (named, vis)

    busiest = max((v for _n, v in counts.values()), default=0)
    problems = []
    for (axis, value), (named, vis) in sorted(counts.items()):
        if axis == 'lens':
            if not has_money:
                problems.append((f'lens={value}', 'page has no [data-m] money to convert'))
            continue
        if value in defaults:
            continue
        if named == 0 and vis < max(2, busiest * 0.25):
            problems.append((f'state={value}',
                             f'nothing names it; only {vis} gated elements visible '
                             f'(busiest state shows {busiest})'))
    return sorted(offered), problems


def main():
    files = sys.argv[1:] or sorted(f for f in glob.glob('*.html') if f != 'index.html')
    total_states = bad = 0
    for f in files:
        offered, problems = check(f)
        total_states += len(offered)
        for what, why in problems:
            if bad == 0:
                print('UNREACHABLE STATES\n')
            bad += 1
            print(f'  {f}  {what}\n      {why}')
    exempt = sum(len(declared_defaults(open(f).read())) for f in files)
    print(f'\n{len(files)} pages · {total_states} states offered · {bad} unreachable'
          f' · {exempt} declared as exclusion-rendered defaults')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
