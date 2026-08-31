"""Load IEEE-CIS with dtype downcasting. 590k x 434 in float64 will not fit
comfortably in 8 GB; downcasting on load is what makes this run on a laptop."""
import pandas as pd

# Reuse the ONE definition of where raw data lives. A second literal
# Path("data/raw") here would be CWD-relative and would break the moment
# anything runs from outside the repo root -- the bug already fixed once
# in download.py. Importing download is side-effect free: it imports
# kaggle inside the function, never at module scope.
from dispute_autopilot.ingest.download import RAW


def downcast(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in out.select_dtypes(include=["float64"]).columns:
        out[col] = pd.to_numeric(out[col], downcast="float")
    for col in out.select_dtypes(include=["int64"]).columns:
        out[col] = pd.to_numeric(out[col], downcast="integer")
    for col in out.select_dtypes(include=["object"]).columns:
        if out[col].nunique(dropna=False) / max(len(out), 1) < 0.5:
            out[col] = out[col].astype("category")
    return out


def load_raw(sample_n: int | None = None) -> pd.DataFrame:
    txn = pd.read_csv(RAW / "train_transaction.csv")
    ident = pd.read_csv(RAW / "train_identity.csv")
    df = txn.merge(ident, on="TransactionID", how="left")
    df = df.sort_values("TransactionDT").reset_index(drop=True)
    if sample_n is not None and sample_n < len(df):
        # Head-sample by time, never random: a random sample destroys the
        # temporal structure the split depends on.
        df = df.head(sample_n).reset_index(drop=True)
    return downcast(df)
