"""Evaluation harness.

REPORTS lives here so every report writer resolves the same absolute
directory regardless of its own depth in the package or the caller's CWD.
Hand-writing the path in each module gets it wrong the moment one moves.
"""
from pathlib import Path

REPORTS = Path(__file__).resolve().parent / "reports"
