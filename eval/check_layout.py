"""
check_layout.py

Measures whether any section's content runs off the bottom of the viewport,
at three real screen sizes, in a real browser.

WHY THIS EXISTS

Every section on the site lives in a `.section__stage`, which is
`position: sticky; top: 0; overflow: hidden`. That has a consequence which is
easy to miss and was in fact missed: when the content inside a stage is taller
than the viewport, the overflow is not scrolled, it is unreachable. The stage
pins to the top of the screen and stays pinned for the whole of its runway, so
the part below the fold never comes into view at any scroll position. Nothing
looks broken. A paragraph is simply gone.

That is what the author reported on section 4:

    "fix the page actually being cut off at the bottom for graph as well as
     text box because left box actually loses some text and have to scroll"

Fixing that one section by hand would have left the same defect in five
others, which is what the first run of this script found. Reviewing a diff
cannot catch it, because nothing in the CSS says "too tall": it depends on the
viewport, the type scale, and how many lines a paragraph happens to wrap to.
So it is measured instead of reasoned about.

WHAT IT DOES

For each registered section, at each viewport size, it opens the section with
?still=1&section=<id> (which lands on the finished, fully revealed state, the
worst case for height), walks every element inside the stage, and takes the
largest bottom edge. If that is below the viewport, the section is clipped and
the check fails with the exact overflow in pixels.

?still=1 matters: a section mid-reveal is shorter than a section at rest, so
measuring during the animation would let a clipped layout pass.

USAGE

    python eval/check_layout.py                  # against a running dev server
    python eval/check_layout.py --url http://localhost:4173/Dispute-Autopilot/

Requires playwright (`pip install playwright && playwright install chromium`)
and a server already serving the site. Exits non-zero if anything is clipped,
and skips cleanly (exit 0) if playwright or the server is unavailable, so it
never fails a machine that simply cannot run it.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "http://localhost:5173/Dispute-Autopilot/"

# The order sections are registered in. Kept here rather than parsed out of
# registry.ts: this file is a check, and a check that derives its expectations
# from the thing it is checking cannot fail for the most interesting reason,
# which is a section going missing.
SECTIONS = (
    "hero",
    "label",
    "split",
    "model",
    "zoom",
    "gate1",
    "gate2",
    "refusal",
    "measured",
    "live",
    "pipeline",
    "colophon",
)

# 1920x1080 is what a screen recording is most likely to be made at. The other
# two are the common laptop panels, and are where the failures actually were.
VIEWPORTS = ((1920, 1080), (1440, 900), (1366, 768))

# A couple of pixels of slack. Sub-pixel layout rounding puts a bottom edge a
# fraction past the fold often enough that a zero tolerance would cry wolf,
# and two pixels of a paragraph being cut is not a defect anyone can see.
TOLERANCE_PX = 2

# NOTHING HERE READS THE SCROLL POSITION, and that is the whole design.
#
# Two earlier versions of this measurement did, through
# getBoundingClientRect(), which is viewport-relative. Both produced numbers
# that were not layout facts: the refusal section was reported as overflowing
# by 4,683px, which is not a defect, it is a stopwatch reading of how far a
# deep-link scroll had settled when the measurement happened to run. Measuring
# from the stage's own top instead was no better, because a sticky stage
# unpins at the end of its runway, so that origin moves too.
#
# scrollHeight is the answer and it is exact. A stage is overflow: hidden with
# min-height: 100svh, so its scrollHeight IS the height its content needs, no
# matter where the page is scrolled to or whether the stage is currently
# pinned. Comparing that against the viewport height asks precisely the
# question this file exists to ask, and gives the same answer every run.
#
# It also means every section can be measured from one page load, with no
# scrolling and no waiting for a scroll to settle.
MEASURE = """
(ids) => {
  return ids.map((id) => {
    const section = document.getElementById(id);
    if (!section) return { id, missing: true };
    const stage = section.querySelector('.section__stage');
    if (!stage) return { id, noStage: true };

    // The tallest thing inside, named only so a failure says what to look at.
    let deepest = 0;
    let culprit = '';
    const stageTop = stage.getBoundingClientRect().top;
    for (const el of stage.querySelectorAll('*')) {
      const box = el.getBoundingClientRect();
      if (box.height === 0 && box.width === 0) continue;
      const relative = box.bottom - stageTop;
      if (relative > deepest) {
        deepest = relative;
        const cls = el.className;
        culprit = (typeof cls === 'string' ? cls : (cls && cls.baseVal) || '')
          || el.tagName.toLowerCase();
      }
    }

    return {
      id,
      needed: stage.scrollHeight,
      viewport: window.innerHeight,
      culprit: culprit.slice(0, 60),
    };
  });
}
"""


def server_is_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=5) as res:
            return 200 <= res.status < 400
    except (urllib.error.URLError, OSError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL, help="base URL of the served site")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("SKIP  playwright is not installed, so no layout was measured.")
        print("      pip install playwright && playwright install chromium")
        return 0

    if not server_is_up(args.url):
        print("SKIP  nothing is serving " + args.url)
        print("      Start the site first, then re-run. Nothing was verified.")
        return 0

    print("LAYOUT: no section may run off the bottom of a sticky stage")
    print("        (measured at rest with ?still=1, the tallest a section gets)")

    failures: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height})
            clipped: list[str] = []

            # Each section is deep-linked so it renders the way a viewer
            # actually sees it, and only then measured.
            #
            # Measuring every section from one page load was tempting and
            # wrong. Section 8 draws SVG connectors between two columns from
            # their measured positions, and a section sitting thousands of
            # pixels below the viewport has not had those positions resolved
            # the way it will once it is on screen: it reported needing
            # 2,971px against a real height of about 860. The metric is
            # scroll-independent; the RENDERING is not, so the section has to
            # be in view before there is anything honest to measure.
            results = []
            for section in SECTIONS:
                page.goto(args.url + "?still=1&section=" + section,
                          wait_until="networkidle")
                # The engine re-asserts a deep-link scroll on a schedule out to
                # 1600ms. scrollHeight does not care where that lands, but the
                # section does need to have been laid out in view.
                page.wait_for_timeout(1700)
                results.extend(page.evaluate(MEASURE, [section]))

            for result in results:
                section = result["id"]
                if result.get("missing"):
                    clipped.append(section + " is not on the page at all")
                    continue
                if result.get("noStage"):
                    # Not every section has to use a stage. Nothing to measure.
                    continue

                over = result["needed"] - result["viewport"]
                if over > TOLERANCE_PX:
                    clipped.append(
                        "%s needs %dpx but has %dpx, so %dpx is unreachable "
                        "(deepest element .%s)"
                        % (section, result["needed"], result["viewport"], over,
                           result["culprit"])
                    )

            label = "%dx%d" % (width, height)
            if clipped:
                print("  FAIL  %s" % label)
                for line in clipped:
                    print("          " + line)
                failures.extend(label + ": " + line for line in clipped)
            else:
                print("  PASS  %s, all %d sections fit" % (label, len(SECTIONS)))
            page.close()
        browser.close()

    # ------------------------------------------------------------ landing
    #
    # The state a visitor actually gets: the bare URL, no query string, no
    # scrolling. It is checked separately because everything above uses
    # ?still=1, and ?still=1 is precisely what hid the bug this check exists
    # for.
    #
    # The hero's opacity was once a ramp over scroll progress starting at
    # 0.03. A page loads at scroll zero, so every ramp evaluated to 0 and the
    # first thing anyone saw was an empty charcoal screen. Every screenshot
    # looked right, because ?still=1 calls update(1) and drew the finished
    # title page. The state being verified was never the state being shipped.
    print()
    print("LANDING: the bare URL, unscrolled, is what a visitor actually gets")

    landing_failures: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.goto(args.url, wait_until="networkidle")
        page.wait_for_timeout(2500)
        seen = page.evaluate(
            """() => {
              const out = {scrollY: window.scrollY, items: []};
              for (const sel of ['.hero__title', '.hero__subtitle',
                                 '.hero__figures', '.hero__cue']) {
                const el = document.querySelector(sel);
                out.items.push({
                  sel,
                  found: !!el,
                  opacity: el ? +getComputedStyle(el).opacity : 0,
                  text: el ? el.textContent.trim().slice(0, 30) : '',
                });
              }
              return out;
            }"""
        )
        for item in seen["items"]:
            if not item["found"]:
                landing_failures.append("%s is not on the page" % item["sel"])
            elif item["opacity"] < 0.95:
                landing_failures.append(
                    "%s is at opacity %.2f with the page unscrolled, so it is invisible on load"
                    % (item["sel"], item["opacity"])
                )
        browser.close()

    if landing_failures:
        print("  FAIL  hero is not legible at rest")
        for line in landing_failures:
            print("          " + line)
        failures.extend(landing_failures)
    else:
        print("  PASS  hero is fully legible at scroll 0 with no query string")

    if failures:
        print()
        print("%d problem(s)." % len(failures))
        print("Content past the bottom of a sticky stage cannot be scrolled to,")
        print("and a hero that is transparent at scroll 0 is an empty landing page.")
        return 1

    print()
    print("Every section fits its viewport at every size measured.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
