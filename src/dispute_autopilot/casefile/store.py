"""Evidence vault plus the posture policy.

METRIC FAMILY B (simulated): the vault's benefit has no counterfactual in this
data. Report it as a policy simulation, never as a measured result.
"""
import json
from pathlib import Path

from dispute_autopilot.config import CostConfig, load_costs
from dispute_autopilot.contracts import CaseFile, Posture

VAULT_ROOT = Path(__file__).resolve().parents[3] / "data" / "vault"


def choose_posture(
    p_chargeback: float, amount_inr: float, costs: CostConfig | None = None
) -> Posture:
    """Expected exposure = P(chargeback) * amount. Spend on evidence in proportion.

    Thresholds live in config/costs.yaml beside posture_cost_inr. They are the
    vault's policy dial and get reported, so they are published methodology --
    not literals buried in this module.
    """
    thresholds = (costs or load_costs()).posture_thresholds_inr
    exposure = p_chargeback * amount_inr
    if exposure >= thresholds["ACTIVE"]:
        return Posture.ACTIVE
    if exposure >= thresholds["PASSIVE"]:
        return Posture.PASSIVE
    return Posture.NONE


class VaultStore:
    def __init__(self, root: Path = VAULT_ROOT):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, transaction_id: int) -> Path:
        return self.root / f"{transaction_id}.json"

    def put(self, casefile: CaseFile) -> None:
        self._path(casefile.transaction_id).write_text(casefile.model_dump_json(indent=2))

    def get(self, transaction_id: int) -> CaseFile | None:
        path = self._path(transaction_id)
        if not path.exists():
            return None
        return CaseFile(**json.loads(path.read_text()))
