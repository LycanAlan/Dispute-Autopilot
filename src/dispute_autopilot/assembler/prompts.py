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
        # A SPECIFICATION, not an argument. Two earlier revisions piled on
        # shouty REQUIRED paragraphs -- one of which leaked engineering
        # commentary about the model's own past failures straight into the
        # prompt -- and the output got worse each time: five claims and zero
        # fields, then nothing at all. The model was being told a story instead
        # of given a task. Keep this mechanical.
        #
        # No explanation_letter is requested. It is a real Razorpay evidence
        # field, but nothing in the vault supports free prose, and the
        # groundedness verifier cannot catch fabricated prose carrying no
        # identifier. Asking for it would manufacture the exact failure mode
        # this system claims to prevent.
        "Return the evidence bundle with exactly two keys.",
        "",
        "`fields`: one entry per evidence_field listed above, mapping that "
        "evidence_field name to its value, copied from the case file.",
        "",
        "`claims`: one entry per fact you rely on, with `text` set to the fact "
        "and `source_field` set to that fact's source_key.",
        "",
        "Both must be non-empty. Use only the case file above. Do not invent "
        "order numbers, tracking numbers, dates, amounts, or communications.",
    ]
    return "\n".join(lines)
