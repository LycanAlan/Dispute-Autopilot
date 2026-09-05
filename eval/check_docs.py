"""Verify the documentation against the artifacts it cites.

Every figure in the README is supposed to come from eval/reports/*.json. This
checks that it does, rather than trusting that it does. Run it after any change
to the evaluation or the docs:

    python -m eval.check_docs

Exits non-zero on any mismatch, so it can gate a commit.

A note on why the prohibition handling exists: an earlier version of this check
flagged the phrase "submits to Razorpay" as an overclaim. The phrase appears in
exactly two places, both of which are instructions NOT to say it. A substring
search cannot distinguish a claim from a warning against that claim, and a
checker that cries wolf gets ignored, which is worse than not having one.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = [ROOT / "README.md"] + sorted((ROOT / "docs").glob("*.md")) + sorted(
    (ROOT / "docs" / "gates").glob("*.md")
)

# A line that forbids a phrase is not an instance of that phrase.
PROHIBITION = re.compile(
    r"never say|must not say|do not say|rather than|instead of|that version",
    re.IGNORECASE,
)


def _asserting_lines(text: str, phrase: str) -> list[str]:
    return [
        ln.strip()
        for ln in text.splitlines()
        if phrase.lower() in ln.lower() and not PROHIBITION.search(ln)
    ]


def main() -> int:
    metrics = json.loads((ROOT / "eval/reports/metrics.json").read_text())
    gen = json.loads((ROOT / "eval/reports/generation_metrics.json").read_text())
    a, b = metrics["family_a"], metrics["family_b"]
    c, adv, usage = gen["contestable"], gen["adverse"], gen["actual_usage"]
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    everything = "\n".join(p.read_text(encoding="utf-8") for p in DOCS)

    failures: list[str] = []

    def check(name: str, ok: bool) -> None:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures.append(name)

    print("FIGURES: README against eval/reports/*.json")
    for label, value in [
        ("n_test", f"{a['n_test']:,}"),
        ("pr_auc", f"{a['pr_auc']:.4f}"),
        ("pr_auc uncalibrated", f"{a['pr_auc_uncalibrated']:.4f}"),
        ("roc_auc", f"{a['roc_auc']:.4f}"),
        ("brier", f"{a['brier']:.4f}"),
        ("precision", f"{a['precision_at_threshold']:.4f}"),
        ("recall", f"{a['recall_at_threshold']:.4f}"),
        ("model uplift", f"{b['model_uplift_vs_flag_all_inr']:,.0f}"),
        ("family C cost", f"{usage['usd']:.4f}"),
        ("family C input tokens", f"{usage['input_tokens']:,}"),
        ("contestable claims/bundle", str(c["mean_claims_per_bundle"])),
        ("adverse claims/bundle", str(adv["mean_claims_per_bundle"])),
        ("ungrounded upper bound", str(c["ungrounded_upper_bound_95"])),
    ]:
        check(f"{label} = {value}", value in readme)

    print("\nCLAIMS: things that must not be overstated")
    check(
        "no assertion that payloads are submitted to Razorpay",
        not _asserting_lines(everything, "submits to Razorpay"),
    )
    check("family C is not described as unmeasured", "NOT YET MEASURED" not in everything)
    check("gate G2 records DRY RUN", "DRY RUN" in everything)
    check("EV threshold boundary disclosed", "boundary" in readme.lower())
    check("rule-of-three bound reported", "upper bound" in readme.lower())
    check("verifier limitation stated", "identifier" in readme)
    check("USD to INR declared an assumption", "usd_to_inr" in readme)
    check("prior art section present", "## Prior art" in readme)
    check("findings log linked", "docs/FINDINGS.md" in readme)

    print("\nHYGIENE")
    # Matches a home directory PATH, not the author's name.
    #
    # This used to be `"lycan" not in everything.lower()`, which is the author's
    # own alias, so it fired on the byline, the GitHub URL and the contact
    # address in the site copy: every legitimate attribution in the project
    # failed a hygiene check about leaked local paths. A check that cannot tell
    # an author's name from a filesystem path is not checking what its label
    # says, and the fix for it is not to delete the byline.
    #
    # What actually matters is that no document quotes a machine-specific
    # absolute path, so that is what is matched: a home root, on either
    # platform, with something after it.
    home_paths = re.findall(
        r"(?:[A-Za-z]:\\Users\\|/home/|/Users/)[A-Za-z0-9._-]+",
        everything,
    )
    if home_paths:
        print("          " + ", ".join(sorted(set(home_paths))[:5]))
    check("no absolute home directories", not home_paths)
    check(
        "one model named across the docs",
        "claude-sonnet-5" in everything and "claude-opus-5" not in everything,
    )

    print()
    if failures:
        print(f"{len(failures)} PROBLEM(S):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"All {len(DOCS)} documents consistent with the artifacts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
