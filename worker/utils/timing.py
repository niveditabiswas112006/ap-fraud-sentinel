"""worker.utils.timing — bank-change vs due-date arithmetic.

Pure function. Referenced from ``pipelines/04_signals.pipe`` as
``worker.utils.timing.bank_change_vs_due_date``.

The signal fires when a bank-account-change email arrives within 3 days of
the invoice due date — i.e. the attacker is manufacturing urgency (last-
minute change before AP cuts the check).
"""

from __future__ import annotations

from datetime import datetime
from typing import Tuple


_ISO_FORMATS = ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ")


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    for fmt in _ISO_FORMATS:
        try:
            return datetime.strptime(str(value)[:19], fmt)
        except (ValueError, TypeError):
            continue
    try:
        return datetime.fromisoformat(str(value).rstrip("Z"))
    except Exception:
        return None


def bank_change_vs_due_date(
    bank_change_date: str | None = None,
    due_date: str | None = None,
) -> Tuple[int, bool, float]:
    """Compute the days-between for a bank-change request vs the invoice due date.

    Args:
        bank_change_date: ISO date of the bank-change email (the email's `date`
            field, surfaced as bankChangeRequestDate on the Case row).
        due_date: ISO date of the invoice's dueDate field.

    Returns:
        (days_before_due, suspicious, score)
        - days_before_due = (due_date - bank_change_date).days
        - suspicious: True when 0 <= days_before_due <= 3 (urgent change)
        - score: days<=2 → 1.0, days<=3 → 0.6, else 0.0
        - If either date is missing or bank_change_date is after due_date
          (i.e. negative or very large gap), suspicious=False, score=0.0.

    The `bank_change_date` argument is the email envelope date, NOT the bank
    account added date on the master file. The master file's
    bankAccountAddedDate is the vendor's baseline; this date is when the
    (suspicious) email arrived asking to change it.
    """
    bc = _parse_date(bank_change_date)
    dd = _parse_date(due_date)
    if not bc or not dd:
        return -1, False, 0.0
    days = (dd.date() - bc.date()).days
    if days < 0:
        # Bank change arrived AFTER due date — weird, but not the urgent-change
        # attack signature we're screening for here. Treat as not-suspicious;
        # other signals (first_time, lookalike) will catch what they catch.
        return days, False, 0.0
    if days <= 2:
        return days, True, 1.0
    if days <= 3:
        return days, True, 0.6
    return days, False, 0.0


__all__ = ["bank_change_vs_due_date"]
