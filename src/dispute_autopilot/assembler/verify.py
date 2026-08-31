"""Deterministic groundedness verification.

No model judges the model. A claim is grounded only if:
  1. it names a source key,
  2. that key exists in the case file, and
  3. every identifier-like token in the claim (AWB numbers, order refs, amounts)
     also appears in that source's value.

Rule 3 is what catches a plausible-sounding invented tracking number, which is
the failure mode that matters for a system that must not fabricate evidence.

WHAT THIS DOES NOT CATCH, stated plainly because the README claims a safety
property and the claim must be honest: rule 3 compares identifier-like tokens.
Invented PROSE carrying no identifier -- "the customer confirmed receipt by
phone" -- passes if it cites a real source key. The defence against that is
Task 7.2's refusal gate combined with a narrow source vocabulary, not this
function. Do not describe this verifier as preventing all fabrication.
"""
import re

from dispute_autopilot.contracts import CaseFile, EvidenceBundle

# Tokens that look like identifiers or quantities: things a model can invent.
IDENTIFIER = re.compile(r"\b(?=[A-Za-z]*\d)[A-Za-z0-9][A-Za-z0-9\-/]{3,}\b")


def _identifiers(text: str) -> set[str]:
    return {m.group(0).upper() for m in IDENTIFIER.finditer(text)}


def verify(bundle: EvidenceBundle, casefile: CaseFile) -> EvidenceBundle:
    by_source = {item.source: item.value for item in casefile.items.values()}
    out = bundle.model_copy(deep=True)

    for claim in out.claims:
        if not claim.source_field or claim.source_field not in by_source:
            claim.grounded = False
            continue
        source_ids = _identifiers(by_source[claim.source_field])
        claim.grounded = _identifiers(claim.text) <= source_ids

    return out
