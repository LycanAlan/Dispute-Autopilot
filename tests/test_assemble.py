# tests/test_assemble.py
from dispute_autopilot.contracts import CaseFile, Dispute, EvidenceItem, Posture
from dispute_autopilot.assembler.prompts import build_prompt


def _cf():
    return CaseFile(
        transaction_id=42, posture=Posture.ACTIVE,
        items={
            "billing_proof": EvidenceItem(
                field="billing_proof", value="AVS match on name and postcode",
                source="avs_result"),
            "shipping_proof": EvidenceItem(
                field="shipping_proof", value="Delivered, signature captured, AWB ABC123",
                source="carrier_tracking"),
        },
    )


def _d():
    return Dispute(dispute_id="disp_1", transaction_id=42,
                   amount_inr=2499.0, reason_code="fraud_card_absent")


def test_prompt_contains_every_vault_value():
    prompt = build_prompt(_d(), _cf())
    assert "AVS match on name and postcode" in prompt
    assert "AWB ABC123" in prompt


def test_prompt_forbids_facts_not_in_the_vault():
    prompt = build_prompt(_d(), _cf()).lower()
    assert "only" in prompt
    assert "do not invent" in prompt or "never invent" in prompt


def test_the_module_imports_with_no_llm_sdk_and_no_api_key(monkeypatch):
    """A missing key must not make this module unimportable.

    `import anthropic` / `import openai` at module scope would turn a billing
    problem into a red test suite -- the failure `import kaggle` already caused.
    """
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from dispute_autopilot.assembler.assemble import assemble, default_provider

    assert default_provider() is None
    bundle = assemble(_d(), _cf())          # falls back to templates, no network
    assert bundle.fields                    # and still produces a usable bundle


def test_the_template_path_copies_vault_values_verbatim(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from dispute_autopilot.assembler.assemble import assemble

    bundle = assemble(_d(), _cf())
    assert bundle.fields["billing_proof"] == "AVS match on name and postcode"
    assert {c.source_field for c in bundle.claims} == {"avs_result", "carrier_tracking"}


def test_a_stub_provider_is_used_when_supplied():
    """The seam must actually be a seam: substitutable, and never touching the network."""
    from dispute_autopilot.assembler.assemble import assemble

    def stub(system, prompt, schema):
        assert "AVS match on name and postcode" in prompt
        # fields is a LIST of typed entries, not a dict: an open dict[str, str]
        # has no declared properties and structured output satisfied it with {}
        # on every real call.
        return schema(fields=[{"evidence_field": "billing_proof", "value": "x"}],
                      claims=[{"text": "x", "source_field": "avs_result"}])

    bundle = assemble(_d(), _cf(), provider=stub)
    assert bundle.fields == {"billing_proof": "x"}


def test_prompt_lists_the_available_source_keys():
    prompt = build_prompt(_d(), _cf())
    assert "avs_result" in prompt and "carrier_tracking" in prompt
