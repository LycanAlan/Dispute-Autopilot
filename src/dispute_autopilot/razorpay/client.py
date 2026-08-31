"""Razorpay adapters.

Whether the live path is usable is recorded in docs/gates/G2-razorpay-test-mode.md.
The dry-run adapter constructs and validates a real payload without transmitting,
and is what the demo uses by default.
"""
import os

from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.schema import to_contest_payload, validate_bundle


class DryRunClient:
    live = False

    def contest(self, dispute_id: str, bundle: EvidenceBundle) -> dict:
        errors = validate_bundle(bundle)
        if errors:
            raise ValueError(f"invalid evidence bundle: {errors}")
        return {
            "transmitted": False,
            "endpoint": f"PATCH /v1/disputes/{dispute_id}/contest",
            "payload": to_contest_payload(bundle),
        }


class LiveClient:
    live = True

    def __init__(self):
        import razorpay
        self._client = razorpay.Client(
            auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"])
        )

    def contest(self, dispute_id: str, bundle: EvidenceBundle) -> dict:
        errors = validate_bundle(bundle)
        if errors:
            raise ValueError(f"invalid evidence bundle: {errors}")
        payload = to_contest_payload(bundle)
        response = self._client.dispute.contest(dispute_id, payload)
        return {"transmitted": True,
                "endpoint": f"PATCH /v1/disputes/{dispute_id}/contest",
                "payload": payload, "response": response}


def get_client(live: bool = False):
    return LiveClient() if live else DryRunClient()
