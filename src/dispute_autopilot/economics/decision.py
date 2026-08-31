"""Expected-value contest/accept/review engine.

Formulation follows US Patent 10,839,394 (representment selection by expected
value). Cited, not reinvented — see README Prior Art.

METRIC FAMILY B (simulated). The win-probability model rests on the spec 8.1
inference, which this dataset cannot validate.
"""
from dispute_autopilot.config import ASSUMPTION_NOTICE, CostConfig, load_costs
from dispute_autopilot.contracts import Action, Decision, Dispute


def _lift(p: float, clip: tuple[float, float]) -> float:
    """Bounded, monotone decreasing in p.

    A low chargeback-risk score raises the win estimate (spec 8.1: it looks like
    first-party misuse); a high score lowers it. Clipped so an unvalidated model
    score cannot overwhelm a published base rate that was actually measured.
    """
    lo, hi = clip
    return max(lo, min(hi, lo + (hi - lo) * (1.0 - p)))


def decide(
    dispute: Dispute,
    p_chargeback: float,
    w: float,
    missing_required: list[str],
    costs: CostConfig | None = None,
) -> Decision:
    costs = costs or load_costs()

    p_win = min(1.0, costs.base_win_rate_fraud_coded * _lift(p_chargeback, costs.lift_clip) * w)

    # delta_ev is CONTEST *relative to* ACCEPT, so only costs that differ
    # between the two belong here.
    #
    # contest_fee_inr is deliberately ABSENT. config/costs.yaml documents it as
    # charged win or lose once a dispute is raised, and cost_model.py subtracts
    # it on both TP and FN for exactly that reason. A cost incurred identically
    # under both branches cancels out of a differential; including it would bias
    # every low-value dispute toward ACCEPT by roughly the fee.
    #
    # ops_cost_inr is the true marginal cost of contesting: staff time we spend
    # only if we actually contest.
    #
    # If a merchant agreement adds a separate penalty for a LOST representment,
    # that is a real term -- but it is a different, currently unsourced number
    # and needs its own constant. Do not reuse contest_fee_inr for it.
    delta_ev = p_win * dispute.amount_inr - costs.ops_cost_inr

    # The evidence gate is absolute. Economics never override it.
    if missing_required:
        action = Action.REVIEW
    elif delta_ev > costs.decision_margin_inr:
        action = Action.CONTEST
    elif delta_ev < -costs.decision_margin_inr:
        action = Action.ACCEPT
    else:
        action = Action.REVIEW

    return Decision(
        dispute_id=dispute.dispute_id,
        action=action,
        p_chargeback=p_chargeback,
        p_win=p_win,
        delta_ev_inr=delta_ev,
        w_completeness=w,
        missing_required=missing_required,
        assumption_notice=ASSUMPTION_NOTICE,
    )
