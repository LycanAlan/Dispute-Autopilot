"""Deterministic evidence synthesis from real transaction features.

IEEE-CIS has no order records or tracking numbers, so evidence documents are
generated — but generated CONSISTENTLY with each row's real features, so the
case file never contradicts the data the model scored.

The evidence corpus is SYNTHETIC. The decision model's labels are REAL.
State this distinction in the README and the video.
"""
import hashlib

import pandas as pd

from dispute_autopilot.contracts import CaseFile, EvidenceItem, Posture

PASSIVE_FIELDS = ["billing_proof", "access_activity_log", "term_and_conditions"]
ACTIVE_EXTRA = ["shipping_proof", "customer_communication"]


def _stable_id(txn_id: int, seed: int, tag: str) -> str:
    digest = hashlib.sha256(f"{txn_id}:{seed}:{tag}".encode()).hexdigest()
    return digest[:12].upper()


def synthesize_casefile(row: pd.Series, posture: Posture, seed: int = 0) -> CaseFile:
    txn_id = int(row["TransactionID"])
    if posture is Posture.NONE:
        return CaseFile(transaction_id=txn_id, posture=posture, items={})

    flags = [str(row.get(m, "")).upper() for m in ("M1", "M2", "M6")]
    matched = sum(f == "T" for f in flags) >= 2
    dist = pd.to_numeric(pd.Series([row.get("dist1")]), errors="coerce").iloc[0]
    far = bool(pd.notna(dist) and dist > 100)

    items: dict[str, EvidenceItem] = {
        "billing_proof": EvidenceItem(
            field="billing_proof",
            value=(f"AVS match on name and postcode (M1/M2/M6 = {'/'.join(flags)})"
                   if matched else
                   f"AVS mismatch on name or postcode (M1/M2/M6 = {'/'.join(flags)})"),
            source="avs_result",
        ),
        "access_activity_log": EvidenceItem(
            field="access_activity_log",
            value=(f"Session from {row.get('DeviceType', 'unknown')} device "
                   f"({row.get('DeviceInfo', 'unknown')}), "
                   f"session {_stable_id(txn_id, seed, 'sess')}"),
            source="device_fingerprint",
        ),
        "term_and_conditions": EvidenceItem(
            field="term_and_conditions",
            value=f"T&C v3.1 accepted at checkout, ref {_stable_id(txn_id, seed, 'tnc')}",
            source="checkout_log",
        ),
    }

    if True:  # built unconditionally, then filtered by posture below
        items["shipping_proof"] = EvidenceItem(
            field="shipping_proof",
            value=(f"Delivered, signature captured, AWB {_stable_id(txn_id, seed, 'awb')}"
                   + (" — shipping address differs from billing address"
                      if far else " — shipping address matches billing address")),
            source="carrier_tracking",
        )
        items["customer_communication"] = EvidenceItem(
            field="customer_communication",
            value=(f"Order confirmation emailed to {row.get('P_emaildomain', 'customer')}; "
                   f"no reply received. Thread {_stable_id(txn_id, seed, 'mail')}"),
            source="email_log",
        )

    # PASSIVE_FIELDS / ACTIVE_EXTRA are the single source of truth for which
    # posture yields which evidence. Filtering here rather than branching above
    # keeps those constants load-bearing: if they were merely declared while the
    # dict was hand-built, the two would drift apart silently and 5.3's
    # required-evidence gate would be reasoning about the wrong field set.
    allowed = PASSIVE_FIELDS + (ACTIVE_EXTRA if posture is Posture.ACTIVE else [])
    return CaseFile(
        transaction_id=txn_id,
        posture=posture,
        items={k: v for k, v in items.items() if k in allowed},
    )
