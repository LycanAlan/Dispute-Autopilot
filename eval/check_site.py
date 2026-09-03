"""Verify the standalone frontend against the artifacts and rules it claims to obey.

The README is checked against eval/reports/*.json by eval/check_docs.py. The site
makes the same argument to a different audience, so it gets the same treatment:

    python -m eval.check_site

Exits non-zero on any failure, so it can gate a commit.

What is checked, and why each one is here:

  HONESTY  Every figure on the page has to come from frontend/data/snapshot.json,
           the snapshot has to match the reports verbatim, and the point count the
           page prints has to match the file it is drawn from. A site whose whole
           argument is that measurement beats assertion cannot type a number in by
           hand.

  TONE     No em dashes, no en dashes, no hollow intensifiers. The author's
           requirement is that the page does not read as generated, and these are
           the two loudest tells.

  DESIGN   No purple and no indigo. Banned explicitly by the author.
           Both kill switches, ?flat=1 and ?still=1, still read from the URL. They
           are the floor the whole site was designed against; if they stop being
           wired up, the fallback story is gone and nothing else would say so.

  SAFETY   No key, secret, or .env value under frontend/. That directory is
           committed and deployed to GitHub Pages, so anything in it is public.

frontend/ is being built in parallel with this file. Every check that needs a file
that does not exist yet prints SKIP and does not fail the run, and the summary says
how many were skipped, so a missing directory is visible rather than silent.

A note on prohibitions, following the precedent set in eval/check_docs.py. An
earlier checker in this repository flagged the phrase "submits to Razorpay" as an
overclaim; both occurrences were instructions never to say it. A substring search
cannot tell a claim from a warning against that claim, and a checker that cries
wolf gets ignored, which is worse than not having one. So a line that forbids a
word is not an instance of that word, here as well.
"""
import json
import pathlib
import re
import sys
from typing import Iterable, NamedTuple

ROOT = pathlib.Path(__file__).resolve().parent.parent

# node_modules is other people's code, dist is generated from src, and .vite is a
# cache. Nothing in any of them is authored here, so nothing in them is evidence.
SKIP_DIRS = {"node_modules", "dist", ".vite", ".git", "__pycache__"}

# Source extensions this file knows how to pull user-visible text out of.
SCRIPT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"}

# points.bin is a flat Float32Array of [x, y, z, label]: four values per point,
# four bytes per value.
POINT_STRIDE = 4
FLOAT_BYTES = 4


# ---------------------------------------------------------------- prohibitions

# A line that forbids a word is not an instance of that word. See the module
# docstring for the false positive that made this necessary the first time.
PROHIBITION = re.compile(
    r"never|must not|do not|don't|cannot|avoid|forbid|prohibit|ban(?:ned|s)?|"
    r"rather than|instead of|\bno\b|\bnot\b",
    re.IGNORECASE,
)


# ------------------------------------------------------------------- tokenising

class Token(NamedTuple):
    line: int
    kind: str   # 'code' | 'string' | 'comment'
    text: str


# A '/' starts a regular expression rather than a division when the last
# significant character cannot end an expression. Standard heuristic, and enough
# for this codebase: without it a pattern such as /['"]/ would open a string
# literal that never closes and swallow the rest of the file.
_REGEX_PRECEDERS = set("(,=:[!&|?{};+-*%~^<>\n")


def tokenize_script(src: str) -> list[Token]:
    """Split TypeScript or JavaScript into code, comment and string runs.

    Template literals contribute their literal text as strings and their
    ${...} interpolations as code, which is the distinction the honesty check
    rests on: a number inside ${} came from the snapshot at runtime, and a
    number in the surrounding text was typed in by hand.
    """
    out: list[Token] = []
    buf: list[str] = []
    kind = "code"
    line = 1
    buf_line = 1
    i = 0
    n = len(src)
    prev_sig = "\n"
    # Each entry is the brace depth of the interpolation we suspended to enter.
    tmpl_stack: list[int] = []
    depth = 0

    def flush() -> None:
        nonlocal buf, buf_line
        if buf:
            out.append(Token(buf_line, kind, "".join(buf)))
        buf = []
        buf_line = line

    def switch(new_kind: str) -> None:
        nonlocal kind
        flush()
        kind = new_kind

    while i < n:
        ch = src[i]

        if kind == "code":
            if ch == "/" and i + 1 < n and src[i + 1] == "/":
                switch("comment")
                while i < n and src[i] != "\n":
                    buf.append(src[i])
                    i += 1
                switch("code")
                continue
            if ch == "/" and i + 1 < n and src[i + 1] == "*":
                switch("comment")
                while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                    if src[i] == "\n":
                        line += 1
                    buf.append(src[i])
                    i += 1
                buf.append("*/")
                i += 2
                switch("code")
                continue
            if ch == "/" and prev_sig in _REGEX_PRECEDERS:
                # Regular expression literal. Consumed as code; its contents must
                # not be mistaken for a string.
                buf.append(ch)
                i += 1
                in_class = False
                while i < n:
                    c = src[i]
                    buf.append(c)
                    i += 1
                    if c == "\\" and i < n:
                        buf.append(src[i])
                        i += 1
                        continue
                    if c == "[":
                        in_class = True
                    elif c == "]":
                        in_class = False
                    elif c == "/" and not in_class:
                        break
                    elif c == "\n":
                        line += 1
                        break
                prev_sig = "/"
                continue
            if ch in "'\"":
                quote = ch
                switch("string")
                i += 1
                while i < n:
                    c = src[i]
                    if c == "\\" and i + 1 < n:
                        buf.append(src[i + 1])
                        i += 2
                        continue
                    if c == quote:
                        i += 1
                        break
                    if c == "\n":
                        line += 1
                    buf.append(c)
                    i += 1
                switch("code")
                prev_sig = quote
                continue
            if ch == "`":
                switch("string")
                i += 1
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                if depth == 0 and tmpl_stack:
                    depth = tmpl_stack.pop()
                    switch("string")
                    i += 1
                    continue
                depth = max(0, depth - 1)
            if ch == "\n":
                line += 1
            if not ch.isspace():
                prev_sig = ch
            buf.append(ch)
            i += 1
            continue

        # Inside a template literal.
        if ch == "\\" and i + 1 < n:
            buf.append(src[i + 1])
            i += 2
            continue
        if ch == "$" and i + 1 < n and src[i + 1] == "{":
            tmpl_stack.append(depth)
            depth = 0
            switch("code")
            buf.append("${")
            i += 2
            prev_sig = "{"
            continue
        if ch == "`":
            switch("code")
            i += 1
            prev_sig = "`"
            continue
        if ch == "\n":
            line += 1
        buf.append(ch)
        i += 1

    flush()
    return out


def tokenize_css(src: str) -> list[Token]:
    """Split CSS into code, comment and string runs. No regexes, no templates."""
    out: list[Token] = []
    buf: list[str] = []
    kind = "code"
    line = 1
    buf_line = 1
    i = 0
    n = len(src)

    def flush() -> None:
        nonlocal buf, buf_line
        if buf:
            out.append(Token(buf_line, kind, "".join(buf)))
        buf = []
        buf_line = line

    def switch(new_kind: str) -> None:
        nonlocal kind
        flush()
        kind = new_kind

    while i < n:
        ch = src[i]
        if kind == "code" and ch == "/" and i + 1 < n and src[i + 1] == "*":
            switch("comment")
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                if src[i] == "\n":
                    line += 1
                buf.append(src[i])
                i += 1
            buf.append("*/")
            i += 2
            switch("code")
            continue
        if kind == "code" and ch in "'\"":
            quote = ch
            switch("string")
            i += 1
            while i < n:
                c = src[i]
                if c == "\\" and i + 1 < n:
                    buf.append(src[i + 1])
                    i += 2
                    continue
                if c == quote:
                    i += 1
                    break
                if c == "\n":
                    line += 1
                buf.append(c)
                i += 1
            switch("code")
            continue
        if ch == "\n":
            line += 1
        buf.append(ch)
        i += 1

    flush()
    return out


def _blank(src: str, pattern: re.Pattern[str]) -> str:
    """Erase matches but keep every newline, so line numbers stay truthful."""
    return pattern.sub(lambda m: "\n" * m.group(0).count("\n"), src)


_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_RAW_BLOCK = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_HTML_TAG = re.compile(r"<[^>]*>", re.DOTALL)
_HTML_CONTENT_ATTR = re.compile(r"""\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'""")


def html_visible(src: str) -> list[tuple[int, str]]:
    """Text nodes a visitor reads, plus <meta content="..."> values."""
    body = _blank(_blank(src, _HTML_COMMENT), _HTML_RAW_BLOCK)
    found: list[tuple[int, str]] = []

    for match in _HTML_CONTENT_ATTR.finditer(body):
        value = match.group(1) if match.group(1) is not None else match.group(2)
        if value and value.strip():
            found.append((1 + body.count("\n", 0, match.start()), value))

    cursor = 0
    for tag in _HTML_TAG.finditer(body):
        chunk = body[cursor:tag.start()]
        if chunk.strip():
            found.append((1 + body.count("\n", 0, cursor), chunk))
        cursor = tag.end()
    tail = body[cursor:]
    if tail.strip():
        found.append((1 + body.count("\n", 0, cursor), tail))

    return found


_MD_FENCE = re.compile(r"^\s*(```|~~~)")


def markdown_visible(src: str) -> list[tuple[int, str]]:
    """Every prose line. Fenced code blocks are examples, not copy."""
    found: list[tuple[int, str]] = []
    fenced = False
    for number, raw in enumerate(src.splitlines(), 1):
        if _MD_FENCE.match(raw):
            fenced = not fenced
            continue
        if not fenced and raw.strip():
            found.append((number, raw))
    return found


def visible_strings(path: pathlib.Path) -> list[tuple[int, str]]:
    """Every run of text in one file that a visitor could end up reading.

    For scripts that is string and template literals; for CSS the quoted values
    that reach `content:`; for HTML the text nodes; for Markdown the prose.
    Comments and code are deliberately excluded: a comment is written for the
    next maintainer, not for the page.
    """
    src = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()

    if suffix in SCRIPT_SUFFIXES:
        return [(t.line, t.text) for t in tokenize_script(src) if t.kind == "string"]
    if suffix == ".css":
        return [(t.line, t.text) for t in tokenize_css(src) if t.kind == "string"]
    if suffix in {".html", ".htm"}:
        return html_visible(src)
    if suffix in {".md", ".markdown"}:
        return markdown_visible(src)
    return []


def uncommented(path: pathlib.Path) -> list[tuple[int, str]]:
    """The file with its comments removed, as (line, text) runs.

    Used by the colour check. `No purple, no indigo` appears in tokens.css as a
    comment stating the rule; stripping comments is what keeps the rule from
    being reported as a violation of itself.
    """
    src = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    if suffix in SCRIPT_SUFFIXES:
        toks = tokenize_script(src)
    elif suffix == ".css":
        toks = tokenize_css(src)
    elif suffix in {".html", ".htm"}:
        body = _blank(src, _HTML_COMMENT)
        return [(n, ln) for n, ln in enumerate(body.splitlines(), 1) if ln.strip()]
    else:
        return [(n, ln) for n, ln in enumerate(src.splitlines(), 1) if ln.strip()]
    return [(t.line, t.text) for t in toks if t.kind != "comment"]


def _lines_of(start_line: int, text: str) -> Iterable[tuple[int, str]]:
    """Split one multi-line run back into numbered lines, for reporting."""
    for offset, line in enumerate(text.splitlines() or [text]):
        yield start_line + offset, line


def source_files(root: pathlib.Path, suffixes: set[str]) -> list[pathlib.Path]:
    if not root.exists():
        return []
    found = [
        p
        for p in sorted(root.rglob("*"))
        if p.is_file()
        and p.suffix.lower() in suffixes
        and not SKIP_DIRS.intersection(p.parts)
    ]
    return found


# -------------------------------------------------------------- honesty checks

# Three shapes that a metric takes when it is rendered:
#
#   0.4243        a probability or a rate, printed the way eval/check_docs.py
#                 prints one, with four or more decimal places
#   590,540       a count, grouped in threes, the way toLocaleString writes it
#   Rs 542,539    a money figure
#
# Four decimal places is the threshold rather than two because two-place decimals
# are everywhere in CSS and in ordinary prose, and no figure in eval/reports is
# quoted to fewer than four.
#
# A bare unseparated integer is deliberately NOT matched. Seeds, years, pixel
# budgets and timeouts are all four-or-more digits, and every real figure on this
# page goes through toLocaleString, so a genuine metric always arrives grouped.
METRIC_PATTERNS = [
    ("decimal", re.compile(r"(?<![\d.])0\.\d{4,}")),
    ("grouped", re.compile(r"(?<![\d,.])\d{1,3}(?:,\d{3})+(?![\d,])")),
    ("currency", re.compile(r"(?:₹|Rs\.?\s?|INR\s?|USD\s?|\$)\s?\d")),
]

# What a number that looks like a metric can legitimately be instead.
#
#   0.001ms, 0.0625rem, 12.5000%   a CSS length, duration or percentage: the
#                                  number carries a unit immediately after it
#   #1F6F4A, rgba(23, 21, 15, .12) a colour value
#
# Array indices, loop bounds and arithmetic are excluded already, because only
# string literals are scanned and those are code.
_CSS_UNIT = re.compile(
    r"\s*(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|svh|svw|dvh|lvh|%|ms|s|deg|rad|turn|"
    r"fr|pt|pc|cm|mm|in|q)\b",
    re.IGNORECASE,
)
_COLOUR_CALL = re.compile(r"(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\([^)]*\)", re.IGNORECASE)
_HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
_URLISH = re.compile(r"https?://|^[./]|^[a-z0-9-]+/[a-z0-9-]", re.IGNORECASE)


def metric_hits(path: pathlib.Path) -> list[tuple[int, str, str]]:
    """Numbers that look like metrics, typed into user-visible text by hand."""
    hits: list[tuple[int, str, str]] = []
    for start_line, run in visible_strings(path):
        for line_no, line in _lines_of(start_line, run):
            if _URLISH.search(line.strip()):
                continue
            # Blank out the spans a metric-shaped number is allowed to sit in,
            # keeping the length so the remaining offsets still line up.
            masked = _COLOUR_CALL.sub(lambda m: " " * len(m.group(0)), line)
            masked = _HEX_COLOUR.sub(lambda m: " " * len(m.group(0)), masked)
            for label, pattern in METRIC_PATTERNS:
                for match in pattern.finditer(masked):
                    if _CSS_UNIT.match(masked, match.end()):
                        continue
                    hits.append((line_no, line.strip()[:100], f"{label} {match.group(0)}"))
    return hits


def _first_difference(left: object, right: object, trail: str = "") -> str | None:
    """Where two report blocks stop agreeing, as a readable path."""
    if isinstance(left, dict) and isinstance(right, dict):
        for key in sorted(set(left) | set(right)):
            if key not in left:
                return f"{trail}.{key} missing from the snapshot"
            if key not in right:
                return f"{trail}.{key} is in the snapshot but not the report"
            deeper = _first_difference(left[key], right[key], f"{trail}.{key}")
            if deeper:
                return deeper
        return None
    if isinstance(left, list) and isinstance(right, list):
        if len(left) != len(right):
            return f"{trail} has {len(left)} entries, the report has {len(right)}"
        for index, (a, b) in enumerate(zip(left, right)):
            deeper = _first_difference(a, b, f"{trail}[{index}]")
            if deeper:
                return deeper
        return None
    if left != right:
        return f"{trail} is {left!r} in the snapshot and {right!r} in the report"
    return None


# ------------------------------------------------------------------ tone checks

EM_DASH = "—"
EN_DASH = "–"

# Interpreted as "anywhere a visitor reads them". There is no non-punctuation use
# of either character in this codebase, so no exemption is needed and none is
# offered: an exemption is where a tone check goes to die.
DASHES = {EM_DASH: "em dash", EN_DASH: "en dash"}

HOLLOW = [
    "seamless", "robust", "leverage", "cutting-edge", "delve", "elevate",
    "unlock", "game-changing", "revolutionise", "revolutionize", "tapestry",
    "realm", "testament",
]


def _hollow_pattern(word: str) -> re.Pattern[str]:
    """Match the word and its ordinary inflections, and nothing shorter.

    A trailing 'e' is dropped from the stem so that leveraging and delving are
    caught alongside leverage and delve.
    """
    stem = word[:-1] if word.endswith("e") else word
    return re.compile(r"\b" + re.escape(stem) + r"\w*", re.IGNORECASE)


HOLLOW_PATTERNS = [(w, _hollow_pattern(w)) for w in HOLLOW]


def dash_hits(path: pathlib.Path) -> list[tuple[int, str, str]]:
    hits: list[tuple[int, str, str]] = []
    for start_line, run in visible_strings(path):
        for line_no, line in _lines_of(start_line, run):
            for char, name in DASHES.items():
                if char in line:
                    hits.append((line_no, line.strip()[:100], name))
    return hits


def hollow_hits(path: pathlib.Path) -> list[tuple[int, str, str]]:
    hits: list[tuple[int, str, str]] = []
    for start_line, run in visible_strings(path):
        for line_no, line in _lines_of(start_line, run):
            if PROHIBITION.search(line):
                continue   # a line forbidding a word is not a use of it
            for word, pattern in HOLLOW_PATTERNS:
                match = pattern.search(line)
                if match:
                    hits.append((line_no, line.strip()[:100], match.group(0)))
    return hits


# ---------------------------------------------------------------- design checks

# The banned window, from the design spec. 260 to 300 degrees is violet through
# magenta; indigo sits at 275 and purple at 300.
HUE_LOW, HUE_HIGH = 260.0, 300.0

# Below this saturation a hue is arithmetic, not a colour. #14161A computes to a
# hue of 220 with a saturation of 0.13 and is a near-black; without a floor,
# rounding noise in a grey would be reported as a design violation.
MIN_SATURATION = 0.10

# Named colours in the purple and indigo family. The author banned these by name,
# so they are listed by name rather than run through the hue window.
BANNED_NAMES = {
    "purple", "rebeccapurple", "indigo", "violet", "darkviolet", "blueviolet",
    "mediumpurple", "darkorchid", "mediumorchid", "orchid", "darkmagenta",
    "magenta", "fuchsia", "plum", "thistle", "lavender", "slateblue",
    "darkslateblue", "mediumslateblue",
}
_NAMED_PATTERN = re.compile(r"\b(" + "|".join(sorted(BANNED_NAMES)) + r")\b", re.IGNORECASE)
_RGB_CALL = re.compile(r"\brgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})", re.IGNORECASE)


def hue_saturation(r: int, g: int, b: int) -> tuple[float | None, float]:
    """HSL hue in degrees and saturation. Hue is None for a pure grey."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    high, low = max(rf, gf, bf), min(rf, gf, bf)
    delta = high - low
    if delta == 0:
        return None, 0.0
    if high == rf:
        hue = 60.0 * (((gf - bf) / delta) % 6.0)
    elif high == gf:
        hue = 60.0 * (((bf - rf) / delta) + 2.0)
    else:
        hue = 60.0 * (((rf - gf) / delta) + 4.0)
    total = high + low
    saturation = delta / total if total <= 1.0 else delta / (2.0 - total)
    return hue, saturation


def _parse_hex(raw: str) -> tuple[int, int, int] | None:
    digits = raw.lstrip("#")
    if len(digits) in (3, 4):
        digits = "".join(c * 2 for c in digits[:3])
    elif len(digits) in (6, 8):
        digits = digits[:6]
    else:
        return None
    return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16)


def _is_banned_hue(rgb: tuple[int, int, int]) -> tuple[bool, float]:
    hue, saturation = hue_saturation(*rgb)
    if hue is None or saturation < MIN_SATURATION:
        return False, hue or 0.0
    return HUE_LOW <= hue <= HUE_HIGH, hue


def purple_hits(path: pathlib.Path) -> list[tuple[int, str, str]]:
    """Purple or indigo, by hex, by rgb() triple, or by name."""
    hits: list[tuple[int, str, str]] = []
    for start_line, run in uncommented(path):
        for line_no, line in _lines_of(start_line, run):
            for match in _HEX_COLOUR.finditer(line):
                rgb = _parse_hex(match.group(0))
                if rgb is None:
                    continue
                banned, hue = _is_banned_hue(rgb)
                if banned:
                    hits.append(
                        (line_no, line.strip()[:100], f"{match.group(0)} at hue {hue:.0f}")
                    )
            for match in _RGB_CALL.finditer(line):
                rgb = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
                if max(rgb) > 255:
                    continue
                banned, hue = _is_banned_hue(rgb)
                if banned:
                    hits.append(
                        (line_no, line.strip()[:100], f"{match.group(0)}) at hue {hue:.0f}")
                    )
            if PROHIBITION.search(line):
                continue   # "no purple, no indigo" states the rule, it does not break it
            named = _NAMED_PATTERN.search(line)
            if named:
                hits.append((line_no, line.strip()[:100], f"named colour {named.group(0)}"))
    return hits


# ----------------------------------------------------------------- safety check

# Shapes that are a secret whatever they are called.
SECRET_PATTERNS = [
    ("Anthropic API key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{12,}")),
    ("Razorpay live key", re.compile(r"rzp_live_[A-Za-z0-9]{8,}")),
    ("Razorpay test key", re.compile(r"rzp_test_(?!x{4})[A-Za-z0-9]{8,}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    (
        "assigned secret",
        re.compile(
            r"""(?ix) \b (?: api[_-]?key | secret | password | passwd | token )
                \b \s* [:=] \s* ["'][^"'\s]{16,}["']""",
        ),
    ),
]


def env_values(env_path: pathlib.Path) -> dict[str, str]:
    """Real values from .env, keyed by variable name. Never printed, only matched."""
    if not env_path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        value = value.strip().strip("'\"")
        # Short values and the .env.example placeholders are not secrets, and
        # matching on them would flag every file that happens to contain "xxxx".
        if len(value) < 12 or "xxxx" in value.lower():
            continue
        values[name.strip()] = value
    return values


def secret_hits(frontend: pathlib.Path, env: dict[str, str]) -> list[str]:
    """Anything under frontend/ that is, or contains, a credential.

    The finding names the file and the variable. It never prints the value: a
    checker that echoes the secret it found has published it into CI logs.
    """
    hits: list[str] = []
    for path in sorted(frontend.rglob("*")):
        if not path.is_file() or SKIP_DIRS.intersection(path.parts):
            continue
        try:
            body = path.read_bytes().decode("utf-8", errors="ignore")
        except OSError as err:
            hits.append(f"{path.relative_to(frontend.parent)} could not be read: {err}")
            continue
        rel = path.relative_to(frontend.parent).as_posix()
        for name, value in env.items():
            if value in body:
                hits.append(f"{rel} contains the value of {name} from .env")
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(body):
                hits.append(f"{rel} contains something shaped like a {label}")
    return hits


# ------------------------------------------------------------------------ main

def main(root: pathlib.Path = ROOT) -> int:
    frontend = root / "frontend"
    src = frontend / "src"
    data_dir = frontend / "data"
    snapshot_path = data_dir / "snapshot.json"
    points_path = data_dir / "points.bin"
    site_copy = root / "docs" / "site-copy.md"

    if not frontend.is_dir():
        print("SKIP  frontend/ does not exist yet, so there is no site to check.")
        print("      Nothing failed and nothing was verified. Re-run once it lands.")
        return 0

    failures: list[str] = []
    skipped: list[str] = []

    def check(name: str, ok: bool, details: Iterable[str] = ()) -> None:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures.append(name)
            for detail in details:
                print(f"          {detail}")

    def skip(name: str, why: str) -> None:
        print(f"  SKIP  {name}")
        print(f"          {why}")
        skipped.append(name)

    # Scripts, stylesheets and the page shell. index.html is included because the
    # masthead, the boot message and the noscript block are all copy a visitor
    # reads, and leaving them out would make the tone checks trivial to route
    # around.
    text_suffixes = SCRIPT_SUFFIXES | {".css", ".html", ".htm"}
    src_files = source_files(src, text_suffixes)
    index_html = frontend / "index.html"
    copy_files = list(src_files)
    if index_html.is_file():
        copy_files.append(index_html)
    if site_copy.is_file():
        copy_files.append(site_copy)

    def rel(path: pathlib.Path) -> str:
        try:
            return path.relative_to(root).as_posix()
        except ValueError:
            return path.as_posix()

    def report(hits: list[tuple[pathlib.Path, int, str, str]]) -> list[str]:
        return [f"{rel(p)}:{n}  {what}   {line}" for p, n, line, what in hits]

    # ------------------------------------------------------------- HONESTY
    print("HONESTY: every figure on the page comes from the artifacts")

    if not src_files:
        skip(
            "no metric figures typed into user-visible strings",
            f"{rel(src)} has no source files yet",
        )
    else:
        found = [
            (path, line, text, what)
            for path in src_files
            for line, text, what in metric_hits(path)
        ]
        check(
            "no metric figures typed into user-visible strings",
            not found,
            report(found),
        )

    if not snapshot_path.is_file():
        skip(
            "snapshot family blocks match eval/reports verbatim",
            f"{rel(snapshot_path)} has not been exported yet",
        )
        skip("point count on the page matches points.bin", "no snapshot to read it from")
    else:
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        metrics_path = root / "eval" / "reports" / "metrics.json"
        gen_path = root / "eval" / "reports" / "generation_metrics.json"
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        generation = json.loads(gen_path.read_text(encoding="utf-8"))

        # family_a and family_b are copied out of metrics.json; family_c is the
        # whole of generation_metrics.json, which is what the exporter writes and
        # what the design spec calls for.
        for family, expected, origin in [
            ("family_a", metrics.get("family_a"), rel(metrics_path)),
            ("family_b", metrics.get("family_b"), rel(metrics_path)),
            ("family_c", generation, rel(gen_path)),
        ]:
            actual = snapshot.get(family)
            difference = _first_difference(actual, expected, family)
            check(
                f"snapshot {family} equals {origin}",
                difference is None,
                [] if difference is None else [difference],
            )

        if not points_path.is_file():
            skip("point count on the page matches points.bin", f"{rel(points_path)} is missing")
        else:
            size = points_path.stat().st_size
            per_point = POINT_STRIDE * FLOAT_BYTES
            claimed = snapshot.get("n_sampled")
            whole = size % per_point == 0
            actual_points = size // per_point
            check(
                f"points.bin is a whole number of {POINT_STRIDE}-float points",
                whole,
                [f"{rel(points_path)} is {size:,} bytes, not a multiple of {per_point}"],
            )
            check(
                f"the page claims {claimed:,} points and points.bin holds {actual_points:,}"
                if isinstance(claimed, int)
                else "snapshot n_sampled is a point count",
                whole and claimed == actual_points,
                [
                    f"snapshot n_sampled is {claimed!r}; "
                    f"{rel(points_path)} is {size:,} bytes, which is "
                    f"{actual_points:,} points at {per_point} bytes each"
                ],
            )

    # ---------------------------------------------------------------- TONE
    print("\nTONE: the page must not read as generated")

    if not copy_files:
        skip("no em dashes or en dashes in user-visible strings", "no copy to read yet")
        skip("no hollow intensifiers in user-visible strings", "no copy to read yet")
    else:
        dashes = [
            (path, line, text, what)
            for path in copy_files
            for line, text, what in dash_hits(path)
        ]
        check("no em dashes or en dashes in user-visible strings", not dashes, report(dashes))

        hollow = [
            (path, line, text, what)
            for path in copy_files
            for line, text, what in hollow_hits(path)
        ]
        check("no hollow intensifiers in user-visible strings", not hollow, report(hollow))

    if not site_copy.is_file():
        skip("docs/site-copy.md is the source of the copy", "the file does not exist")

    # -------------------------------------------------------------- DESIGN
    print("\nDESIGN: the constraints the author set")

    colour_files = source_files(frontend, {".css"} | SCRIPT_SUFFIXES)
    if index_html.is_file():
        colour_files.append(index_html)
    if not colour_files:
        skip("no purple and no indigo anywhere in the CSS", "no stylesheets yet")
    else:
        purple = [
            (path, line, text, what)
            for path in colour_files
            for line, text, what in purple_hits(path)
        ]
        check("no purple and no indigo anywhere in the CSS", not purple, report(purple))

    scripts = source_files(src, SCRIPT_SUFFIXES)
    if not scripts:
        skip("both kill switches are read from the URL query", "no scripts yet")
    else:
        readers = [
            p
            for p in scripts
            if re.search(
                r"URLSearchParams|location\.search",
                "\n".join(t for _, t in uncommented(p)),
            )
        ]
        for switch in ("flat", "still"):
            # Matched against the RAW file, not against uncommented(), which
            # strips the quote characters out of string tokens. The pattern
            # below requires quotes, so run over the tokenised text it could
            # never match anything and both of these checks passed vacuously on
            # every input, including a frontend with the kill switches deleted.
            # Two agents reported this independently before it was believed.
            #
            # A comment reading "?flat=1" does not satisfy it: the quotes are
            # what distinguish naming the parameter in code from mentioning it
            # in prose, and the file must also read the query string at all.
            owners = [
                p
                for p in readers
                if re.search(
                    r"""['"]""" + switch + r"""['"]""",
                    p.read_text(encoding="utf-8", errors="replace"),
                )
            ]
            check(
                f"?{switch}=1 is read from the URL query"
                + (f" in {rel(owners[0])}" if owners else ""),
                bool(owners),
                [
                    f"no file under {rel(src)} both reads the query string and "
                    f"mentions '{switch}'. The kill switch is gone, and the "
                    f"fallback story goes with it."
                ],
            )

    # -------------------------------------------------------------- SAFETY
    print("\nSAFETY: frontend/ is committed and deployed, so it is public")

    env = env_values(root / ".env")
    leaks = secret_hits(frontend, env)
    check(
        "no key, secret, or .env value anywhere under frontend/"
        + (f" ({len(env)} .env values checked)" if env else " (no .env on this machine)"),
        not leaks,
        leaks,
    )

    # ------------------------------------------------------------- summary
    print()
    if failures:
        print(f"{len(failures)} PROBLEM(S):")
        for name in failures:
            print(f"  - {name}")
        return 1
    tail = f", {len(skipped)} check(s) skipped because the files do not exist yet" if skipped else ""
    print(f"The site is consistent with its artifacts and its copy rules{tail}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
