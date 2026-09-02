"""Dispute Autopilot.

Loading .env here, at package import, is deliberate. Credentials live in a
gitignored .env at the repo root, but nothing read it: `python-dotenv` was
declared in requirements.txt and never called, so `os.getenv("ANTHROPIC_API_KEY")`
returned None even with a valid key on disk. The assembler would then resolve to
its template fallback and report a perfect groundedness score for a model that
never ran -- a silent, flattering wrong answer.

`override=False` (the default) means a real environment variable always wins
over the file, so CI and shell exports behave as expected. An absent .env is
fine and silent, which is what makes this safe to do on import.
"""
from pathlib import Path

from dotenv import load_dotenv

# Absolute, not CWD-relative: this must resolve the same whether the caller is
# in the repo root, in eval/, or anywhere else.
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

load_dotenv(ENV_PATH)
