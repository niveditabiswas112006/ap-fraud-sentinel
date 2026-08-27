"""worker.utils.call_analysis — classify vendor call transcript.

Pure function. Referenced from ``pipelines/06_verification.pipe`` as
``worker.utils.call_analysis.classify_response``.

Deterministic: the same transcript always classifies the same way. The
classification is intentionally keyword-driven (not LLM) because the build
prompt §4 calls this the "audit-grade" lane — same verdict every time.
"""

from __future__ import annotations

from typing import Tuple


_DENY_PATTERNS = (
    "did not request", "did not change", "do not change", "don't change",
    "no change", "not us", "not me", "wrong", "incorrect", "incorrectly",
    "fraud", "scam", "phishing", "fake", "fake email", "we did not",
    "denied", "deny", "do not process", "do not authorize", "not authorized",
    "stop payment", "stop the payment",
)
_CONFIRM_PATTERNS = (
    "yes", "confirm", "confirmed", "that's right", "that is right", "correct",
    "we requested", "we asked", "i requested", "we changed", "we authorized",
    "please proceed", "please update", "please use the new",
    "that's us", "that is us", "yes that's", "yes, that's",
)


def _contains_any(text: str, patterns: Tuple[str, ...]) -> bool:
    lower = text.lower()
    for p in patterns:
        # Word-boundary-ish check — avoid matching "no" inside "now" etc.
        if " " in p or "'" in p:
            if p in lower:
                return True
        else:
            # Single-word patterns: require non-letter boundary on either side.
            idx = lower.find(p)
            while idx >= 0:
                before = lower[idx - 1] if idx > 0 else " "
                after = lower[idx + len(p)] if idx + len(p) < len(lower) else " "
                if not (before.isalpha() or after.isalpha()):
                    return True
                idx = lower.find(p, idx + 1)
    return False


def classify_response(
    transcript: str | None,
    expected_change: str = "bank_account",
) -> str:
    """Classify a vendor's verification-call response.

    Looks for deny/confirm keyword clusters in the transcript text. Returns
    one of:
        - 'denied'    — vendor says they did not request the change.
        - 'confirmed' — vendor says they did request it.
        - 'unclear'   — neither pattern matches confidently.

    expected_change is reserved for richer future classifiers that vary their
    keyword set by what the call was about (bank_account, address, vendor_name).
    For now only 'bank_account' is in the demo path.

    Empty / None transcript → 'unclear' (do not crash; the call may have failed
    to transcribe and the controller should still see a 'verified' case with
    an unclear result).
    """
    if not transcript or not transcript.strip():
        return "unclear"

    text = transcript.strip()
    denied = _contains_any(text, _DENY_PATTERNS)
    confirmed = _contains_any(text, _CONFIRM_PATTERNS)

    # If both appear (rare), trust the deny — the BEC defense is conservative.
    if denied:
        return "denied"
    if confirmed:
        return "confirmed"
    return "unclear"


__all__ = ["classify_response"]
