"""Guard the guard: prove eval/check_site.py can actually fail.

This file exists because of a specific defect. The kill switch check matched a
quoted flag name against `uncommented()` output, which strips quote characters
out of string tokens. The pattern therefore matched nothing on any input, so
both switch checks reported PASS on every frontend, including one with the
switches deleted. It printed green for as long as it existed.

A check nobody has watched fail is a claim, not a check. Every test below
removes the thing being checked for and asserts the checker notices.
"""
import re

import pytest

from eval import check_site


def _write(tmp_path, name: str, body: str):
    path = tmp_path / name
    path.write_text(body, encoding="utf-8")
    return path


# --------------------------------------------------------------- kill switches

QUERY_READER = """
export const flags = (() => {
  const q = new URLSearchParams(window.location.search);
  return { flat: q.get('flat') === '1', still: q.get('still') === '1' };
})();
"""

# The exact shape that used to pass while proving nothing: the file reads the
# query string and the word appears, but never as a quoted parameter name.
PROSE_ONLY = """
/* Supports ?flat=1 and ?still=1 for filming. */
export const flags = (() => {
  const q = new URLSearchParams(window.location.search);
  return { flat: false, still: false };
})();
"""


def _switch_present(path, switch: str) -> bool:
    """The predicate check_site uses, applied the way check_site applies it."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    return bool(re.search(r"""['"]""" + switch + r"""['"]""", raw))


@pytest.mark.parametrize("switch", ["flat", "still"])
def test_kill_switch_check_passes_when_the_switch_is_really_read(tmp_path, switch):
    path = _write(tmp_path, "engine.ts", QUERY_READER)
    assert _switch_present(path, switch)


@pytest.mark.parametrize("switch", ["flat", "still"])
def test_kill_switch_check_FAILS_when_the_switch_is_gone(tmp_path, switch):
    """The case the original implementation could not detect."""
    path = _write(tmp_path, "engine.ts", PROSE_ONLY)
    assert not _switch_present(path, switch)


def test_the_pattern_is_run_against_raw_text_not_tokenised_text(tmp_path):
    """Naming the regression directly, so it cannot come back quietly.

    uncommented() drops the quotes, so a quote-anchored pattern run over its
    output matches nothing. If someone reroutes this check through the
    tokeniser again, this test goes red.
    """
    path = _write(tmp_path, "engine.ts", QUERY_READER)
    tokenised = "\n".join(t for _, t in check_site.uncommented(path))
    assert "flat" in tokenised, "sanity: the word survives tokenisation"
    assert not re.search(r"""['"]flat['"]""", tokenised), (
        "tokenised text still carries quotes; if this ever becomes true the "
        "original bug is no longer reproducible and this guard is misleading"
    )
    assert _switch_present(path, "flat"), "raw text must still match"


# --------------------------------------------------------------------- tone

def test_em_dash_in_a_visible_string_is_caught(tmp_path):
    path = _write(tmp_path, "bad.ts", 'const t = "Delivered, signature captured — see AWB";\n')
    assert check_site.dash_hits(path), "an em dash in visible copy must be reported"


def test_a_plain_hyphen_is_not_mistaken_for_an_em_dash(tmp_path):
    path = _write(tmp_path, "ok.ts", 'const t = "card-absent fraud, well-formed";\n')
    assert not check_site.dash_hits(path)


# ------------------------------------------------------------------- design

def test_purple_is_caught(tmp_path):
    path = _write(tmp_path, "bad.css", ":root { --accent: #7C3AED; }\n")
    assert check_site.purple_hits(path), "indigo 262deg must be reported"


def test_the_projects_own_palette_is_not_flagged(tmp_path):
    path = _write(
        tmp_path,
        "tokens.css",
        ":root { --contest:#1F6F4A; --review:#B5822B; --accept:#A54334; --ink:#17150F; }\n",
    )
    assert not check_site.purple_hits(path), "the real palette must pass its own check"
