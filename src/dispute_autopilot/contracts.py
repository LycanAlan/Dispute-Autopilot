"""Frozen data contracts. Every model crossing a stage boundary lives here.

Changing a field here is a breaking change for multiple tasks. Do not edit
casually — this module exists so that later work cannot force interface churn.
"""
from enum import Enum

from pydantic import BaseModel, Field


class Posture(str, Enum):
    NONE = "NONE"
    PASSIVE = "PASSIVE"
    ACTIVE = "ACTIVE"


class Action(str, Enum):
    CONTEST = "CONTEST"
    ACCEPT = "ACCEPT"
    REVIEW = "REVIEW"


class RiskScore(BaseModel):
    transaction_id: int
    p_chargeback: float = Field(ge=0.0, le=1.0)
    calibrated: bool
    top_reasons: list[tuple[str, float]] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    field: str
    value: str
    source: str


class CaseFile(BaseModel):
    transaction_id: int
    posture: Posture
    items: dict[str, EvidenceItem] = Field(default_factory=dict)


class Dispute(BaseModel):
    dispute_id: str
    transaction_id: int
    amount_inr: float = Field(gt=0)
    reason_code: str


class Claim(BaseModel):
    text: str
    source_field: str | None = None
    grounded: bool = False


class EvidenceBundle(BaseModel):
    dispute_id: str
    fields: dict[str, str] = Field(default_factory=dict)
    claims: list[Claim] = Field(default_factory=list)

    @property
    def groundedness(self) -> float:
        if not self.claims:
            return 1.0
        return sum(c.grounded for c in self.claims) / len(self.claims)


class Decision(BaseModel):
    dispute_id: str
    action: Action
    p_chargeback: float = Field(ge=0.0, le=1.0)
    p_win: float = Field(ge=0.0, le=1.0)
    delta_ev_inr: float
    w_completeness: float = Field(ge=0.0, le=1.0)
    missing_required: list[str] = Field(default_factory=list)
    assumption_notice: str
    bundle: EvidenceBundle | None = None
    # Claims the groundedness verifier could not tie back to the vault. Non-empty
    # means the refusal gate fired and downgraded this decision to REVIEW: the
    # bundle is retained for a human to inspect, never transmitted.
    refused_claims: list[str] = Field(default_factory=list)
