"""Score -> gate -> decide -> assemble -> verify. One entry point for API and UI."""
import pandas as pd

from dispute_autopilot.assembler.assemble import assemble as default_assembler
from dispute_autopilot.assembler.verify import verify
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.contracts import Action, CaseFile, Decision, Dispute, Posture
from dispute_autopilot.economics.decision import decide


def triage(
    dispute: Dispute,
    txn_row: pd.DataFrame,
    scorer,
    vault,
    assembler=None,
) -> Decision:
    assembler = assembler or default_assembler

    score = scorer.score_one(txn_row)
    casefile = vault.get(dispute.transaction_id) or CaseFile(
        transaction_id=dispute.transaction_id, posture=Posture.NONE, items={}
    )
    w, missing = assess(casefile, dispute.reason_code)
    decision = decide(dispute, score.p_chargeback, w, missing)

    # The assembler runs ONLY on a contest decision. On REVIEW or ACCEPT it is
    # never invoked, so the system cannot draft a representment it has no
    # evidence for. This is the defense-only guarantee in code.
    if decision.action is Action.CONTEST:
        bundle = verify(assembler(dispute, casefile), casefile)

        # THE REFUSAL GATE. A CONTEST only survives if the bundle is
        # attributable AND non-empty. Three ways it fails:
        #
        #   1. a claim the verifier could not tie back to the vault
        #   2. fields asserted with no attributable claims at all
        #      (EvidenceBundle.groundedness returns 1.0 for an empty claim
        #      list, so this would otherwise score perfectly)
        #   3. an empty bundle -- the assembler declined to argue
        #
        # Case 3 was measured, not imagined: on genuinely adverse evidence
        # (a recorded AVS mismatch) the model correctly returns nothing at all,
        # because its instructions tell it to omit unsupported arguments. The
        # old condition `bundle.fields and not bundle.claims` could not fire on
        # an empty bundle, so a declined assembly became a CONTEST decision
        # carrying nothing. The model refusing to build a case IS a refusal,
        # and discarding that signal is exactly the mistake this gate exists to
        # prevent.
        ungrounded = [c.text for c in bundle.claims if not c.grounded]
        if ungrounded or not bundle.claims or not bundle.fields:
            decision = decision.model_copy(
                update={"action": Action.REVIEW, "refused_claims": ungrounded}
            )
        decision.bundle = bundle

    return decision
