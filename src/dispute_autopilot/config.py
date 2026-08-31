"""Typed configuration loaders. No magic numbers anywhere else in the codebase.

The loaded config models are frozen (immutable) and cached process-wide via
lru_cache, so a single shared instance is handed to every caller. Callers that
need a variant MUST use `load_costs().model_copy(update={...})` (or the same
on `load_features()`) to derive a new, independent instance rather than
mutating the shared one -- mutation is disallowed at the type level.
Known limitation: `frozen=True` blocks attribute reassignment but does not
deep-freeze nested containers, so in-place mutation of a `list[str]` field
(e.g. `.required.append(...)`) is still possible and will corrupt the shared
cached instance -- do not do this.
"""
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"

ASSUMPTION_NOTICE = (
    "Contest recommendations rest on an inference that is not validated by this "
    "dataset: a transaction scored as low chargeback risk that is nevertheless "
    "charged back is treated as more likely to be first-party misuse. IEEE-CIS "
    "cannot separate first-party misuse from third-party fraud, so this is "
    "calibrated to published industry base rates, not measured here."
)


class ReasonCode(BaseModel):
    model_config = ConfigDict(frozen=True)

    label: str
    required: list[str]
    supporting: list[str]


class Completeness(BaseModel):
    model_config = ConfigDict(frozen=True)

    missing_required_penalty: float
    supporting_bonus: float


class BaselineRules(BaseModel):
    model_config = ConfigDict(frozen=True)

    amount_inr: float
    dist: float


class CostConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    currency: str
    base_win_rate_fraud_coded: float
    lift_clip: tuple[float, float]
    contest_fee_inr: float
    ops_cost_inr: float
    decision_margin_inr: float
    posture_cost_inr: dict[str, float]
    completeness: Completeness
    reason_codes: dict[str, ReasonCode]
    baseline_rules: BaselineRules


class FeatureConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    target: str
    id_column: str
    time_column: str
    numeric: list[str]
    categorical: list[str]
    engineered: list[str]

    @property
    def all_model_columns(self) -> list[str]:
        return self.numeric + self.categorical + self.engineered


@lru_cache(maxsize=1)
def load_costs() -> CostConfig:
    return CostConfig(**yaml.safe_load((CONFIG_DIR / "costs.yaml").read_text()))


@lru_cache(maxsize=1)
def load_features() -> FeatureConfig:
    return FeatureConfig(**yaml.safe_load((CONFIG_DIR / "features.yaml").read_text()))
