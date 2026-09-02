"""Find one transaction row per decision action, without spending a rupee.

triage() calls the assembler the moment its decision is CONTEST, and with a
live key present that bills. So hunting for a CONTEST row by clicking through
the UI costs money and takes an unknown number of attempts.

decide() needs none of the assembler machinery to reach its verdict, so this
reproduces the UI's exact inputs and calls decide() directly. Zero API calls.
Run it before recording, then drive the demo straight to the indices it names.
"""
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.casefile.store import choose_posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.contracts import Action, Dispute, Posture
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.economics.decision import decide
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.model.predict import Scorer

REASON = "fraud_card_absent"


def main(n: int = 5000) -> dict[str, int]:
    scorer = Scorer.load()
    data = load_raw(sample_n=n)
    scores = scorer.score_batch(data)

    found: dict[str, dict] = {}
    for idx in range(len(data)):
        row = data.iloc[[idx]]
        amount = float(to_inr(row["TransactionAmt"].iloc[0]))
        p = float(scores[idx])
        posture = choose_posture(p, amount)
        casefile = synthesize_casefile(row.iloc[0], posture, seed=idx)
        w, missing = assess(casefile, REASON)
        dispute = Dispute(dispute_id=f"disp_{idx}",
                          transaction_id=int(row["TransactionID"].iloc[0]),
                          amount_inr=amount, reason_code=REASON)
        d = decide(dispute, p, w, missing)

        key = d.action.value
        # For CONTEST we specifically want an ACTIVE-posture row: the fault
        # injection demo needs a carrier_tracking source in the vault to
        # fabricate against, and PASSIVE case files have none.
        if key == Action.CONTEST.value and posture is not Posture.ACTIVE:
            continue
        if key not in found:
            found[key] = {"index": idx, "p_chargeback": round(p, 4),
                          "amount_inr": round(amount, 2), "posture": posture.value,
                          "delta_ev_inr": round(d.delta_ev_inr, 2),
                          "missing_required": d.missing_required}
        if len(found) == 3:
            break

    for action in ("CONTEST", "ACCEPT", "REVIEW"):
        hit = found.get(action)
        print(f"{action:<8} {hit if hit else 'not found in this sample'}")
    return found


if __name__ == "__main__":
    main()
