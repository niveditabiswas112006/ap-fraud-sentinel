"""worker.utils.email_parser — parse the structured email JSON.

The dataset (Task 2-a) ships email JSONs already structured as:
    {
      "case_id", "message_id", "from", "from_domain", "to", "subject",
      "date", "body", "bank_change_request", "requested_bank_account"
    }

So this module is light: it normalizes the fields onto the case_facts shape
the rest of the pipeline expects (camelCase keys, ISO dates). If a future
build pulls raw .eml files instead, the ``parse_eml`` function below shows
where the stdlib ``email`` parsing would slot in — but it isn't called in
the demo path because the dataset is already structured.

Also exposes ``classify_kind`` referenced from ``pipelines/01_intake.pipe``.
"""

from __future__  import annotations

import json
from typing import Any, Mapping


def classify_kind(mime_type: str | None = None, file_extension: str | None = None) -> str:
    """Return 'invoice' or 'email' based on mime/extension hints.

    Used by pipelines/01_intake.pipe classify_kind python_tool node.
    Defaults to 'invoice' when ambiguous (the dataset is invoice-heavy).
    """
    mt = (mime_type or "").lower()
    ext = (file_extension or "").lower().lstrip(".")
    if "message/rfc822" in mt or ext in ("eml", "mail"):
        return "email"
    if ext in ("pdf", "json", "txt") or "pdf" in mt or "json" in mt:
        return "invoice"
    if "email" in mt:
        return "email"
    return "invoice"


def parse_email_json(raw: Mapping[str, Any] | str) -> dict:
    """Normalize an email JSON object into the case_facts envelope.

    Accepts either a dict or a JSON string (raises json.JSONDecodeError on bad
    input — the caller in local_executor wraps that in try/except to route
    CORRUPT files to quarantine).
    """
    data: Mapping[str, Any]
    if isinstance(raw, str):
        data = json.loads(raw)  # may raise — caller handles
    elif isinstance(raw, Mapping):
        data = raw
    else:
        raise TypeError(f"parse_email_json expected dict|str, got {type(raw).__name__}")

    return {
        "caseId": data.get("case_id") or data.get("caseId"),
        "messageId": data.get("message_id") or data.get("messageId"),
        "from": data.get("from"),
        "fromDomain": data.get("from_domain") or data.get("fromDomain"),
        "to": data.get("to"),
        "subject": data.get("subject"),
        "date": data.get("date"),
        "body": data.get("body"),
        "bankChangeRequest": bool(data.get("bank_change_request") or data.get("bankChangeRequest")),
        "requestedBankAccount": data.get("requested_bank_account") or data.get("requestedBankAccount"),
    }


def parse_eml(text: str) -> dict:  # pragma: no cover - reserved for future raw .eml intake
    """Reserved: parse a raw RFC822 .eml blob via the stdlib ``email`` module.

    Not used in the demo path (the dataset is already structured JSON), but
    documented here as the integration point if the build later ingests raw
    .eml files. Implemented as a stub so the import surface is honest.
    """
    import email
    from email import policy
    msg = email.message_from_string(text, policy=policy.default)
    return {
        "messageId": msg.get("Message-ID"),
        "from": msg.get("From"),
        "to": msg.get("To"),
        "subject": msg.get("Subject"),
        "date": msg.get("Date"),
        "body": msg.get_body().get_content() if msg.get_body() else "",
    }


__all__ = ["classify_kind", "parse_email_json", "parse_eml"]
