"""Download IEEE-CIS from Kaggle. Requires competition rules acceptance."""
import subprocess
import zipfile
from pathlib import Path

RAW = Path("data/raw")
COMPETITION = "ieee-fraud-detection"
NEEDED = ["train_transaction.csv", "train_identity.csv"]


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if all((RAW / n).exists() for n in NEEDED):
        print("already downloaded")
        return
    subprocess.run(
        ["kaggle", "competitions", "download", "-c", COMPETITION, "-p", str(RAW)],
        check=True,
    )
    for z in RAW.glob("*.zip"):
        with zipfile.ZipFile(z) as f:
            f.extractall(RAW)
    missing = [n for n in NEEDED if not (RAW / n).exists()]
    if missing:
        raise RuntimeError(f"missing after download: {missing}")
    print("download complete")


if __name__ == "__main__":
    download()
