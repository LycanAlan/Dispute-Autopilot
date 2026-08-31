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

        # THE REFUSAL GATE. Verification that cannot change the outcome is
        # decoration. A claim the verifier could not tie back to the vault is
        # never transmitted -- the decision is downgraded to REVIEW and the
        # offending claims are recorded for a human.
        #
        # The second condition guards a subtler hole: EvidenceBundle.groundedness
        # is 1.0 for an empty claim list, so a bundle that asserts evidence
        # fields while making no attributable claims would otherwise score
        # perfectly and sail through. Asserting facts without attribution is
        # exactly what this system must not do.
        ungrounded = [c.text for c in bundle.claims if not c.grounded]
        if ungrounded or (bundle.fields and not bundle.claims):
            decision = decision.model_copy(
                update={"action": Action.REVIEW, "refused_claims": ungrounded}
            )
        decision.bundle = bundle

    return decision
