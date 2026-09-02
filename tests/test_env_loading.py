"""The .env file must actually be loaded.

A key sitting in .env that nothing reads is worse than no key at all: the
assembler silently resolves to its template fallback and reports a perfect
groundedness score for a model that never ran.
"""
import subprocess
import sys


def test_importing_the_package_loads_dotenv():
    from dispute_autopilot import ENV_PATH

    assert ENV_PATH.name == ".env"
    assert ENV_PATH.is_absolute(), "must not be CWD-relative"


def test_a_real_environment_variable_beats_the_file():
    """override=False, so shell exports and CI always win over .env."""
    code = (
        "import os;"
        "os.environ['ANTHROPIC_API_KEY']='sentinel-from-shell';"
        "import dispute_autopilot;"
        "print(os.environ['ANTHROPIC_API_KEY'])"
    )
    out = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert out.stdout.strip() == "sentinel-from-shell"


def test_the_package_imports_cleanly_with_no_env_file(tmp_path, monkeypatch):
    """An absent .env must be silent, not an error -- a fresh clone has none."""
    code = "import dispute_autopilot; print('ok')"
    out = subprocess.run(
        [sys.executable, "-c", code], cwd=tmp_path, capture_output=True, text=True
    )
    assert out.returncode == 0, out.stderr
    assert "ok" in out.stdout
