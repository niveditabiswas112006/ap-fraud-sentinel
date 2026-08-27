"""worker.utils.domain_check — lookalike-domain detection via Levenshtein.

Pure function. Referenced from ``pipelines/04_signals.pipe`` as
``worker.utils.domain_check.compare_domains``.

Implements Levenshtein edit distance in-process (no python-Levenshtein dep,
no WHOIS round-trip in the demo path — the dataset already gives us the
registered domain and the sender domain; we just compare them).
"""

from __future__ import annotations

from typing import Tuple


def _levenshtein(a: str, b: str) -> int:
    """Classic two-row Levenshtein edit distance. O(min(m,n)) space."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            substitute = previous[j - 1] + (0 if ca == cb else 1)
            current[j] = min(insert, delete, substitute)
        previous = current
    return previous[-1]


def compare_domains(
    sender_domain: str | None = None,
    registered_domain: str | None = None,
) -> Tuple[int, bool, float]:
    """Compare an email sender domain against the vendor's registered domain.

    Args:
        sender_domain: the 'from_domain' extracted from the email envelope.
        registered_domain: vendor.registeredDomain from the master file.

    Returns:
        (levenshtein_distance, lookalike, score)
        - distance == 0 → identical, not a lookalike. lookalike=False, score=0.0.
        - distance 1-3 (close but different) → lookalike=True, score=1.0.
        - distance <= 5 → lookalike=True, score=0.6.
        - distance > 5 → lookalike=True (different domain), score=0.3.
        - missing either domain → distance=-1, lookalike=False, score=0.0
          (signal does not fire — we can't compare against nothing).
    """
    s = (sender_domain or "").strip().lower()
    r = (registered_domain or "").strip().lower()
    # Strip a leading www. / mail. prefix for comparison fairness.
    for prefix in ("www.", "mail.", "email."):
        if s.startswith(prefix):
            s = s[len(prefix):]
        if r.startswith(prefix):
            r = r[len(prefix):]

    if not s or not r:
        return -1, False, 0.0
    distance = _levenshtein(s, r)
    if distance == 0:
        return 0, False, 0.0
    if distance <= 2:
        # 1-2 edit-distance between sender and registered is high-fidelity
        # lookalike territory (acmeindustrial.com vs acmeindustrial.co).
        return distance, True, 1.0
    if distance <= 5:
        return distance, True, 0.6
    # Different domain entirely — NOT a lookalike. A genuinely different
    # sender domain is its own concern, but it is not the BEC typosquat
    # pattern this signal exists to catch, so we do not fire it (firing here
    # caused mass over-holding of legit invoices whose email came from a
    # different-but-legit domain).
    return distance, False, 0.0


__all__ = ["compare_domains"]
