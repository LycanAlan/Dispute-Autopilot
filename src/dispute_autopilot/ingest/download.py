"""Download IEEE-CIS from Kaggle. Requires competition rules acceptance."""
import zipfile
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent.parent.parent / "data" / "raw"
COMPETITION = "ieee-fraud-detection"
NEEDED = ["train_transaction.csv", "train_identity.csv"]


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if all((RAW / n).exists() for n in NEEDED):
        print("already downloaded")
        return
    # Imported here, not at module scope: `import kaggle` triggers
    # api.authenticate() as a side effect the moment it runs. Importing at
    # module scope would demand kaggle.json even when the fast path above
    # returns without touching Kaggle at all.
    import kaggle

    kaggle.api.competition_download_files(COMPETITION, path=str(RAW))
    for z in RAW.glob("*.zip"):
        with zipfile.ZipFile(z) as f:
            f.extractall(RAW)
    missing = [n for n in NEEDED if not (RAW / n).exists()]
    if missing:
        raise RuntimeError(f"missing after download: {missing}")
    print("download complete")


if __name__ == "__main__":
    download()
