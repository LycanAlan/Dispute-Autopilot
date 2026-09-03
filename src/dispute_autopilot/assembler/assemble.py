"""Evidence assembly behind a provider seam.

No LLM SDK is imported at module scope. Importing `anthropic` or `openai` at
import time makes this module unimportable -- and the whole test suite red --
on a machine with no key, which is the same class of bug that `import kaggle`
caused in ingest/download.py. Each provider imports its own SDK inside itself.
"""
import os
from typing import Callable

from pydantic import BaseModel, Field

from dispute_autopilot.assembler.prompts import SYSTEM, build_prompt
from dispute_autopilot.contracts import CaseFile, Claim, Dispute, EvidenceBundle

# Sonnet 5 at medium effort, chosen deliberately rather than inherited.
# This step is constrained extraction -- copy facts out of a five-line case
# file into a fixed schema and attribute each claim to a source key -- with a
# deterministic groundedness verifier checking the output afterwards. It is not
# a reasoning problem, and frontier capability buys little here.
#
# Effort is set EXPLICITLY. Omitting it defaults to "high" on current models,
# which is how you end up paying for the most expensive configuration without
# ever having decided to. That was the state of this file before this change.
#
# Whatever is set here is also what metric family C measures: reporting
# generation quality from a cheap model while demoing an expensive one is the
# unfalsifiable vendor claim this project's README criticises.
ANTHROPIC_MODEL = "claude-sonnet-5"
ANTHROPIC_EFFORT = "medium"
OPENAI_MODEL = "gpt-4.1"

# (system, prompt, schema) -> a validated instance of schema
Provider = Callable[[str, str, type[BaseModel]], BaseModel]


class _AssembledClaim(BaseModel):
    text: str = Field(description="One factual claim used in the representment")
    source_field: str = Field(description="The case-file source key backing this claim")


class _AssembledBundle(BaseModel):
    fields: dict[str, str] = Field(
        description="Razorpay evidence field name -> value, built only from case-file facts"
    )
    claims: list[_AssembledClaim] = Field(
        description="Every factual claim made, each attributed to a source key"
    )


def anthropic_provider(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    import anthropic  # inside: constructing a client requires credentials

    # An identity-linked API key is rejected without the workspace it acts in:
    #   400 "anthropic-workspace-id is required when authenticating with an
    #        identity-linked API key"
    # Ordinary keys neither need nor accept it, so it is sent only when set.
    workspace = os.getenv("ANTHROPIC_WORKSPACE_ID")
    client = anthropic.Anthropic(
        default_headers={"anthropic-workspace-id": workspace} if workspace else None
    )

    response = client.messages.parse(
        model=ANTHROPIC_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
        output_config={"effort": ANTHROPIC_EFFORT},
    )
    return response.parsed_output


def openai_provider(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    import openai

    completion = openai.OpenAI().beta.chat.completions.parse(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format=schema,
    )
    return completion.choices[0].message.parsed


def default_provider() -> Provider | None:
    """Whichever key is present, else None -> the deterministic path.

    Checked in this order so a machine holding both keys uses Anthropic.
    """
    if os.getenv("ANTHROPIC_API_KEY"):
        return anthropic_provider
    if os.getenv("OPENAI_API_KEY"):
        return openai_provider
    return None


def assemble_deterministic(dispute: Dispute, casefile: CaseFile) -> EvidenceBundle:
    """Template assembly. No network, no key, no possibility of hallucination.

    Every value is copied verbatim from the vault, so groundedness is true by
    construction rather than by verification. That makes it a safe fallback and
    a useless benchmark: it cannot fail the family C metrics it would be scored
    on. Do not report family C numbers produced by this path.
    """
    return EvidenceBundle(
        dispute_id=dispute.dispute_id,
        fields={field: item.value for field, item in sorted(casefile.items.items())},
        claims=[
            Claim(text=item.value, source_field=item.source)
            for _, item in sorted(casefile.items.items())
        ],
    )


def assemble(
    dispute: Dispute,
    casefile: CaseFile,
    provider: Provider | None = None,
) -> EvidenceBundle:
    """`provider=None` resolves from the environment, then falls back to templates."""
    provider = provider or default_provider()
    if provider is None:
        return assemble_deterministic(dispute, casefile)

    parsed = provider(SYSTEM, build_prompt(dispute, casefile), _AssembledBundle)
    return EvidenceBundle(
        dispute_id=dispute.dispute_id,
        fields=parsed.fields,
        claims=[Claim(text=c.text, source_field=c.source_field) for c in parsed.claims],
    )
