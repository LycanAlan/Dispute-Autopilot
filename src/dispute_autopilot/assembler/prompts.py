"""Prompt construction for evidence assembly.

The prompt is deliberately restrictive: the model may use ONLY vault contents.
Task 6.3 verifies compliance deterministically, so this is enforced, not trusted.
"""
from dispute_autopilot.contracts import CaseFile, Dispute

SYSTEM = (
    "You are a payments dispute analyst preparing a chargeback representment. "
    "You may use ONLY the facts in the provided case file. Do not invent order "
    "numbers, tracking numbers, dates, amounts, or communications. If a fact "
    "needed for an argument is absent, omit the argument and say what is missing. "
    "Every claim you make must name the case-file source key it came from."
)


def build_prompt(dispute: Dispute, casefile: CaseFile) -> str:
    lines = [
        f"Dispute {dispute.dispute_id} for INR {dispute.amount_inr:.2f}, "
        f"reason code: {dispute.reason_code}.",
        "",
        "CASE FILE (the only facts you may use):",
    ]
    for field, item in sorted(casefile.items.items()):
        lines.append(f"- evidence_field={field} | source_key={item.source} | value={item.value}")
    lines += [
        "",
        "Available source keys: " + ", ".join(sorted(i.source for i in casefile.items.values())),
        "",
        "Produce the evidence bundle. For each Razorpay evidence field you can "
        "support, write the value using only the facts above. Then write an "
        "explanation_letter.",
        "",
        # Measured, not guessed: at claude-sonnet-5 / effort=medium, 7 of 10
        # bundles came back with populated `fields` and an EMPTY `claims` list
        # when this instruction was a trailing clause. The refusal gate caught
        # every one of them -- an unattributed bundle is refused -- but a
        # correct system that refuses 70% of its own output is not much use.
        # Attribution is stated here as a hard requirement with the consequence
        # spelled out, because the model complied with everything that was
        # phrased as a requirement and skipped what was phrased as an aside.
        "REQUIRED: `claims` must not be empty. Every factual statement you put "
        "in any field must also appear as a separate entry in `claims`, each "
        "naming the source_key it came from. A bundle with populated fields and "
        "no claims is automatically REFUSED and never filed, because an "
        "assertion nobody can trace to a source is exactly what this system "
        "must not send. If you can support N facts, emit N claims.",
        "",
        # Restated here, not only in SYSTEM: the deviation note in this task's
        # commit explains why -- the plan's own test checks build_prompt()'s
        # return value alone, so the constraint has to be readable there too.
        "Do not invent facts. Use only the values listed above.",
    ]
    return "\n".join(lines)
