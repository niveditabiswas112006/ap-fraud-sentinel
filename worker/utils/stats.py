"""worker.utils.stats — per-vendor statistics + first-time-vendor detection.

Pure functions. The RocketRide ``python_tool`` node ``worker.utils.stats.*``
references in ``pipelines/03_grounding.pipe`` and ``pipelines/04_signals.pipe``
resolve to these symbols.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Iterable, Mapping


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
    # Fallback: fromisoformat handles trailing 'Z' poorly in some Python builds.
    try:
        return datetime.fromisoformat(str(value).rstrip("Z"))
    except Exception:
        return None


def compute_vendor_stats(history: Iterable[Mapping[str, Any]] | None) -> dict:
    """Compute per-vendor statistics from payment history rows.

    Returns:
        {
          "amount_mean": float,
          "amount_std": float,        # population std (ddof=0), matches signals.py
          "count": int,
          "last_paid_date": str | None,
        }

    Empty history → mean=0, std=0, count=0, last_paid_date=None. The downstream
    amount_anomaly signal guards std>0 before dividing, so the zero-std case
    simply means "no history" → signal does not fire (the first_time_vendor
    signal is what catches that case instead).
    """
    history = list(history or [])
    amounts = [float((row or {}).get("amountUsd", row.get("amount_usd", 0)) or 0) for row in history]
    count = len(amounts)
    if count == 0:
        return {"amount_mean": 0.0, "amount_std": 0.0, "count": 0, "last_paid_date": None}

    mean = sum(amounts) / count
    variance = sum((a - mean) ** 2 for a in amounts) / count  # population std
    std = math.sqrt(variance)

    # Sort by paidDate desc to pick last_paid_date.
    def _row_date(row: Mapping[str, Any]) -> datetime | None:
        return _parse_date(row.get("paidDate") or row.get("paid_date"))

    dated = [(_row_date(r), r) for r in history if _row_date(r)]
    last_paid = None
    if dated:
        dated.sort(key=lambda x: x[0], reverse=True)
        last_paid = dated[0][0].strftime("%Y-%m-%d")

    return {
        "amount_mean": round(mean, 4),
        "amount_std": round(std, 4),
        "count": count,
        "last_paid_date": last_paid,
    }


def is_first_time(
    vendor_first_invoice_date: str | None = None,
    invoice_date: str | None = None,
    payment_history_count: int = 0,
    vendor_in_master: bool = True,
    vendor_id: str | None = None,
) -> bool:
    """Return True if this looks like a first-time / fake vendor.

    Fires when ANY of:
      - vendor not in master (vendor_in_master is False / vendor_id is None)
      - vendor.firstInvoiceDate == this invoice_date (their first-ever invoice)
      - payment_history_count == 0 (no history on file)
    """
    if not vendor_in_master or not vendor_id:
        return True
    if payment_history_count is None or payment_history_count == 0:
        return True
    if vendor_first_invoice_date and invoice_date:
        first = _parse_date(vendor_first_invoice_date)
        inv = _parse_date(invoice_date)
        if first and inv and first.date() == inv.date():
            return True
    return False


__all__ = ["compute_vendor_stats", "is_first_time"]
