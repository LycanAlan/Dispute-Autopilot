"""Typed configuration loaders. No magic numbers anywhere else in the codebase."""
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

CONFIG_DIR = Path("config")

ASSUMPTION_NOTICE = (
    "Contest recommendations rest on an inference that is NOT validated by this "
    "dataset: a transaction scored as low chargeback risk that is nevertheless "
    "charged back is treated as more likely to be first-party misuse. IEEE-CIS "
    "cannot separate first-party misuse from third-party fraud, so this is "
    "calibrated to published industry base rates, not measured here."
)


class ReasonCode(BaseModel):
    label: str
    required: list[str]
    supporting: list[str]


class Completeness(BaseModel):
    missing_required_penalty: float
    supporting_bonus: float


class CostConfig(BaseModel):
    currency: str
    base_win_rate_fraud_coded: float
    lift_clip: tuple[float, float]
    contest_fee_inr: float
    ops_cost_inr: float
    decision_margin_inr: float
    posture_cost_inr: dict[str, float]
    completeness: Completeness
    reason_codes: dict[str, ReasonCode]


class FeatureConfig(BaseModel):
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
