"""Gate G1: does the 120-day label horizon right-censor the tail of the data?

The label is 'chargeback reported within 120 days' but the data spans 183 days.
If Vesta labelled at collection time rather than retrospectively, the final
120 days are under-labelled and measured precision is understated.
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from dispute_autopilot.ingest.load import load_raw

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


def run() -> dict:
    df = load_raw()
    df["day"] = df["TransactionDT"] // 86400
    daily = df.groupby("day")["isFraud"].agg(["mean", "size"])
    daily = daily[daily["size"] >= 100]

    head = daily["mean"].head(30).mean()
    tail = daily["mean"].tail(30).mean()
    ratio = tail / head if head else float("nan")

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(daily.index, daily["mean"], linewidth=1)
    ax.axhline(head, linestyle="--", label=f"first 30d mean = {head:.4f}")
    ax.axhline(tail, linestyle=":", label=f"last 30d mean = {tail:.4f}")
    ax.set_xlabel("day since dataset start")
    ax.set_ylabel("chargeback rate")
    ax.set_title("G1: chargeback rate over time (censoring check)")
    ax.legend()
    REPORTS.mkdir(parents=True, exist_ok=True)
    fig.savefig(REPORTS / "g1_censoring.png", dpi=120, bbox_inches="tight")

    verdict = "CENSORED" if ratio < 0.7 else "CLEAN"
    return {"head_rate": head, "tail_rate": tail, "ratio": ratio, "verdict": verdict}


if __name__ == "__main__":
    print(run())
