"""worker.pipeline_defs — PipelineConfig dicts mirroring the .pipe files conforming to RocketRide JSON reference schema.

Each dict here is the in-process equivalent of the corresponding file in
``pipelines/``. They're built using the same node ids / providers / configs
so a reader comparing the JSON to the dict sees the same structure.

These are passed to ``RocketRideClient.use(pipeline=...)`` when the worker
is configured with a real ``ROCKETRIDE_API_KEY``. Without a key, the local
executor in ``worker/local_executor.py`` produces identical outputs.
"""

from __future__ import annotations

from typing import Any


# ---- Stage 01: Intake ----
PIPE_01_INTAKE: dict[str, Any] = {
    "name": "Stage 01 — Case Intake Pipeline",
    "description": "Ingests incoming PDF invoices and EML emails via webhook, parses tags, classifies document type, and persists initial case entry.",
    "version": 1,
    "source": "webhook_intake",
    "project_id": "71bd3b36-422a-4cb7-9340-247ec7d837e1",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "webhook_intake",
            "provider": "webhook",
            "name": "Webhook Ingestion Node",
            "description": "Receives raw PDF invoices and EML email attachments.",
            "config": {"path": "/intake", "methods": ["POST"]},
        },
        {
            "id": "parse_intake",
            "provider": "parse",
            "name": "Document Parser",
            "description": "Parses raw ingested payload tags.",
            "input": [{"from": "webhook_intake", "lane": "tags"}],
            "config": {},
        },
        {
            "id": "classify_kind",
            "provider": "python_tool",
            "name": "Document Classifier",
            "description": "Classifies document type as invoice PDF or email EML.",
            "input": [{"from": "parse_intake", "lane": "text"}],
            "config": {
                "function": "worker.utils.email_parser.classify_kind",
                "inputs": {
                    "mime_type": "{{ parse_intake.mime_type }}",
                    "file_extension": "{{ parse_intake.extension }}",
                },
                "outputs": {"kind": "string"},
            },
        },
        {
            "id": "persist_case",
            "provider": "http_request",
            "name": "Case Storage Initializer",
            "description": "Creates initial case record with queued status.",
            "input": [{"from": "classify_kind", "lane": "text"}],
            "config": {
                "method": "POST",
                "url": "{{ env.WORKER_URL }}/internal/cases",
                "body": {
                    "case_id": "{{ parse_intake.case_id }}",
                    "source_path": "{{ parse_intake.path }}",
                    "kind": "{{ classify_kind.kind }}",
                    "status": "queued",
                },
            },
        },
    ],
}


# ---- Stage 02: Extraction ----
PIPE_02_EXTRACTION: dict[str, Any] = {
    "name": "Stage 02 — Data Extraction & Fact Normalization Pipeline",
    "description": "Extracts raw text via OCR/pdfplumber, cleans whitespace, extracts key facts, converts currency, and validates schema.",
    "version": 1,
    "source": "webhook_extraction",
    "project_id": "8fb70e78-a352-4cb9-844f-ef3ba46e9140",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "webhook_extraction",
            "provider": "webhook",
            "name": "Invoice Webhook Source",
            "description": "Receives raw invoice document via HTTP POST.",
            "config": {"path": "/extraction", "methods": ["POST"]},
        },
        {
            "id": "ocr",
            "provider": "ocr",
            "name": "Document OCR Reader",
            "description": "Extracts raw text contents from invoice PDF documents.",
            "input": [{"from": "webhook_extraction", "lane": "image"}],
            "config": {"model": "tesseract", "lang": "eng"},
        },
        {
            "id": "cleanup_text",
            "provider": "cleanup",
            "name": "Text Cleaner",
            "description": "Normalizes whitespace and removes text artifacts.",
            "input": [{"from": "ocr", "lane": "text"}],
            "config": {"strip_pii": False, "normalize_whitespace": True},
        },
        {
            "id": "extract_facts",
            "provider": "fact_extractor",
            "name": "Fact Extractor",
            "description": "Extracts key invoice fields using pattern matchers.",
            "input": [{"from": "cleanup_text", "lane": "text"}],
            "config": {"schema": "invoice_v1"},
        },
        {
            "id": "normalize",
            "provider": "normalize_facts",
            "name": "Fact Normalizer",
            "description": "Normalizes dates to ISO8601 and trims string whitespace.",
            "input": [{"from": "extract_facts", "lane": "answers"}],
            "config": {"date_format": "iso8601", "trim_strings": True},
        },
        {
            "id": "validate",
            "provider": "schema_validate",
            "name": "Schema Validator",
            "description": "Validates case_facts against schema v1.",
            "input": [{"from": "normalize", "lane": "answers"}],
            "config": {
                "schema": "case_facts_v1",
                "on_fail": {"status": "quarantined", "reason": "schema_validation_fail"},
            },
        },
    ],
}


# ---- Stage 03: Grounding ----
PIPE_03_GROUNDING: dict[str, Any] = {
    "name": "Stage 03 — Vendor Master Grounding & History Pipeline",
    "description": "Performs exact and vector lookup against Vendor Master DB, queries payment history, and computes historical payment statistics.",
    "version": 1,
    "source": "find_vendor",
    "project_id": "e086d97a-f4fd-4513-88c1-3be27adb73f6",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "find_vendor",
            "provider": "rocketride_sql",
            "name": "Vendor Master SQL Matcher",
            "description": "Queries SQLite Vendor table by vendor ID or legal name.",
            "config": {
                "query": "SELECT * FROM Vendor WHERE vendorId = :vendor_id OR legalName LIKE '%' || :extracted_vendor_name || '%'",
                "params": {
                    "vendor_id": "{{ facts.vendor_id }}",
                    "extracted_vendor_name": "{{ facts.vendor_name }}",
                },
            },
        },
        {
            "id": "fetch_history",
            "provider": "rocketride_sql",
            "name": "Payment History Fetcher",
            "description": "Retrieves up to 50 previous historical payment records.",
            "input": [{"from": "find_vendor", "lane": "table"}],
            "config": {
                "query": "SELECT * FROM PaymentHistory WHERE vendorId = :vendor_id ORDER BY paidDate DESC LIMIT 50",
                "params": {"vendor_id": "{{ find_vendor.rows[0].vendorId }}"},
            },
        },
        {
            "id": "fuzzy_match",
            "provider": "embeddings",
            "name": "Vendor Vector Embedder",
            "description": "Generates text embeddings for vendor name fallback.",
            "input": [{"from": "find_vendor", "lane": "table"}],
            "config": {
                "model": "text-embedding-3-small",
                "field": "{{ facts.vendor_name }}",
            },
        },
        {
            "id": "vector_lookup",
            "provider": "rr_vector",
            "name": "Vendor Vector Search",
            "description": "Searches vector DB for top-1 similar vendor record.",
            "input": [{"from": "fuzzy_match", "lane": "text"}],
            "config": {"collection": "vendors", "top_k": 1},
        },
        {
            "id": "compute_stats",
            "provider": "python_tool",
            "name": "Vendor Payment Statistics Calculator",
            "description": "Computes historical payment mean, standard deviation, and count.",
            "input": [{"from": "fetch_history", "lane": "table"}],
            "config": {
                "function": "worker.utils.stats.compute_vendor_stats",
                "inputs": {"history": "{{ fetch_history.rows }}"},
                "outputs": {
                    "amount_mean": "float",
                    "amount_std": "float",
                    "count": "int",
                    "last_paid_date": "string",
                },
            },
        },
    ],
}


# ---- Stage 04: Signals ----
PIPE_04_SIGNALS: dict[str, Any] = {
    "name": "Stage 04 — Risk Signals & Composite Scoring Pipeline",
    "description": "Runs 6 pure risk signal detection rules, validates schema via guardrails, and calculates composite risk score.",
    "version": 1,
    "source": "webhook_signals",
    "project_id": "ed46e32a-f8d8-47a1-8c54-f068c8404ff8",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "webhook_signals",
            "provider": "webhook",
            "name": "Risk Signals Ingestion",
            "description": "Receives extracted case facts for risk signal analysis.",
            "config": {"path": "/signals", "methods": ["POST"]},
        },
        {
            "id": "amount_anomaly",
            "provider": "anomaly_detector",
            "name": "Amount Anomaly Detector (Z-Score)",
            "description": "Calculates z-score anomaly of current invoice amount against historical mean and std dev.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {
                "metric": "z_score",
                "field": "amount_usd",
                "baseline": "{{ case.stats.amount_mean }}",
                "std": "{{ case.stats.amount_std }}",
                "threshold": 3.0,
            },
        },
        {
            "id": "domain_check",
            "provider": "python_tool",
            "name": "Domain Lookalike Checker",
            "description": "Compares email sender domain against vendor registered domain using Levenshtein distance.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {
                "function": "worker.utils.domain_check.compare_domains",
                "inputs": {
                    "sender_domain": "{{ email.from_domain }}",
                    "registered_domain": "{{ vendor.registeredDomain }}",
                },
            },
        },
        {
            "id": "timing_check",
            "provider": "python_tool",
            "name": "Rapid Bank Change Timing Evaluator",
            "description": "Checks if bank change request date is suspiciously close (within 5 days) to invoice due date.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {
                "function": "worker.utils.timing.bank_change_vs_due_date",
                "inputs": {
                    "bank_change_date": "{{ email.bank_change_request_date }}",
                    "due_date": "{{ facts.due_date }}",
                },
            },
        },
        {
            "id": "duplicate_check",
            "provider": "rocketride_sql",
            "name": "Duplicate Invoice Search",
            "description": "Queries payment history for duplicate invoice numbers or matching vendor/amount pairs.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {
                "query": "SELECT COUNT(*) AS dupes FROM PaymentHistory WHERE invoiceNumber = :inv_no OR (vendorId = :vid AND amountUsd = :amt)",
                "params": {
                    "inv_no": "{{ facts.invoice_number }}",
                    "vid": "{{ vendor.vendorId }}",
                    "amt": "{{ facts.amount_usd }}",
                },
            },
        },
        {
            "id": "first_time_vendor",
            "provider": "python_tool",
            "name": "First Time Vendor Evaluator",
            "description": "Checks whether vendor ID is missing from Vendor Master database.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {"function": "worker.utils.stats.is_first_time"},
        },
        {
            "id": "threshold_skirting",
            "provider": "python_tool",
            "name": "SAR Threshold Skirting Detector",
            "description": "Detects invoice amounts structured just below the $10,000 reporting threshold.",
            "input": [{"from": "webhook_signals", "lane": "documents"}],
            "config": {
                "function": "worker.signals.check_threshold_skirting",
                "inputs": {
                    "amount": "{{ facts.amount_usd }}",
                    "threshold": 10000,
                    "buffer": 500,
                },
            },
        },
        {
            "id": "guardrails",
            "provider": "guardrails",
            "name": "Signal Guardrails Validator",
            "description": "Validates signal payload structures against signal_schema_v1.",
            "input": [
                {"from": "amount_anomaly", "lane": "documents"},
                {"from": "domain_check", "lane": "documents"},
                {"from": "timing_check", "lane": "documents"},
                {"from": "duplicate_check", "lane": "documents"},
                {"from": "first_time_vendor", "lane": "documents"},
                {"from": "threshold_skirting", "lane": "documents"},
            ],
            "config": {"validate": "signal_schema_v1"},
        },
        {
            "id": "assemble",
            "provider": "python_tool",
            "name": "Composite Risk Score Assembler",
            "description": "Calculates weighted composite risk score and generates recommendation (pass vs hold).",
            "input": [{"from": "guardrails", "lane": "documents"}],
            "config": {"function": "worker.signals.assemble_signals"},
        },
    ],
}


# ---- Stage 05: Agents ----
PIPE_05_AGENTS: dict[str, Any] = {
    "name": "Stage 05 — Multi-Agent Intelligence Swarm Pipeline",
    "description": "Orchestrates a 3-agent swarm (BEC Analyst, Vendor Verifier, Case Builder) supervised by a Manager Agent.",
    "version": 1,
    "source": "chat_agents",
    "project_id": "df3c34e0-ce3a-40b1-bd9d-6fa1d929ceaa",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "chat_agents",
            "provider": "chat",
            "name": "Agent Swarm Input",
            "description": "Ingests risk signals for multi-agent evaluation.",
            "config": {},
        },
        {
            "id": "bec_analyst",
            "provider": "crewai_subagent",
            "name": "BEC & Anomaly Analyst Subagent",
            "description": "Analyzes domain lookalikes, z-score anomalies, and suspicious bank change requests.",
            "input": [{"from": "chat_agents", "lane": "questions"}],
            "config": {
                "name": "BEC_Analyst",
                "role": "analyst",
                "prompt_file": "worker/prompts/bec_analyst.md",
                "inputs": {
                    "signals": "{{ case.signals }}",
                    "invoice": "{{ case.facts }}",
                    "vendor": "{{ case.vendor }}",
                    "stats": "{{ case.stats }}",
                },
            },
        },
        {
            "id": "vendor_verifier",
            "provider": "crewai_subagent",
            "name": "Vendor Verifier Subagent",
            "description": "Verifies vendor master registration, domain ownership, and payment history consistency.",
            "input": [{"from": "bec_analyst", "lane": "text"}],
            "control": [{"classType": "agent", "from": "bec_analyst"}],
            "config": {
                "name": "Vendor_Verifier",
                "role": "verifier",
                "prompt_file": "worker/prompts/vendor_verifier.md",
            },
        },
        {
            "id": "case_builder",
            "provider": "crewai_subagent",
            "name": "Evidence Pack Assembler Subagent",
            "description": "Compiles structured evidence pack and risk narrative for AP controllers.",
            "input": [{"from": "vendor_verifier", "lane": "text"}],
            "control": [{"classType": "agent", "from": "vendor_verifier"}],
            "config": {
                "name": "Case_Builder",
                "role": "assembler",
                "prompt_file": "worker/prompts/case_builder.md",
            },
        },
        {
            "id": "manager",
            "provider": "crewai_manager",
            "name": "Swarm Manager & Arbitrator",
            "description": "Arbitrates findings from all subagents with majority vote rule and tiebreak-to-hold policy.",
            "input": [{"from": "case_builder", "lane": "answers"}],
            "control": [{"classType": "manager", "from": "case_builder"}],
            "config": {"arbitration": "majority", "tiebreak": "hold"},
        },
    ],
}


# ---- Stage 06: Verification ----
PIPE_06_VERIFICATION: dict[str, Any] = {
    "name": "Stage 06 — Automated Verification Call Pipeline",
    "description": "Places automated phone call via Bland AI to known vendor contact, transcribes audio response using Whisper, and analyzes transcript.",
    "version": 1,
    "source": "place_call",
    "project_id": "ffbce23e-386c-4988-93a1-0e3bb701d2f7",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "place_call",
            "provider": "bland_ai",
            "name": "Out-of-Band Call Initiator",
            "description": "Dials known vendor phone number on file to verify bank change request.",
            "config": {
                "to": "{{ vendor.knownPhone }}",
                "script_path": "worker/prompts/call_script.md",
                "max_duration": 120,
                "record": True,
                "voice": "professional",
            },
        },
        {
            "id": "transcribe_call",
            "provider": "transcribe",
            "name": "Speech-to-Text Transcriber",
            "description": "Transcribes call audio recording using Whisper AI model.",
            "input": [{"from": "place_call", "lane": "audio"}],
            "config": {
                "model": "whisper-1",
                "audio": "{{ place_call.recording_url }}",
            },
        },
        {
            "id": "analyze_transcript",
            "provider": "python_tool",
            "name": "Transcript Sentiment & Intent Classifier",
            "description": "Parses transcript text to determine if vendor confirmed or denied the bank change request.",
            "input": [{"from": "transcribe_call", "lane": "text"}],
            "config": {
                "function": "worker.utils.call_analysis.classify_response",
                "inputs": {
                    "transcript": "{{ transcribe_call.text }}",
                    "expected_change": "bank_account",
                },
            },
        },
    ],
}


# ---- Stage 07: Gate ----
PIPE_07_GATE: dict[str, Any] = {
    "name": "Stage 07 — Controller Decision Gate Pipeline",
    "description": "Stages high-risk cases for AP controller review, waits for manual release/hold decision, writes decision record to DB.",
    "version": 1,
    "source": "stage_for_controller",
    "project_id": "307c0949-be56-494d-9b5e-d66de957dded",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "stage_for_controller",
            "provider": "chat",
            "name": "Controller Queue Dispatcher",
            "description": "Publishes held cases with risk evidence to AP controller review queue.",
            "config": {
                "channel": "controller_queue",
                "message": "Case {{ case.caseId }}: {{ case.recommendation }}\nVendor: {{ vendor.legalName }}\nAmount: {{ facts.amount_usd }}\nVerification: {{ case.verificationResult }}\nTranscript: {{ case.callTranscript[:200] }}...",
                "actions": ["release", "hold", "escalate"],
            },
        },
        {
            "id": "await_decision",
            "provider": "persistent_memory",
            "name": "Human Decision Awaiter",
            "description": "Blocks until controller submits release or hold decision via dashboard.",
            "input": [{"from": "stage_for_controller", "lane": "questions"}],
            "config": {
                "type": "persistent_memory",
                "key": "decision:{{ case.caseId }}",
                "wait_for": "value",
                "timeout": 86400,
            },
        },
        {
            "id": "write_decision",
            "provider": "rocketride_sql",
            "name": "Decision Audit Writer",
            "description": "Persists controller decision, approver name, reason, and timestamp.",
            "input": [{"from": "await_decision", "lane": "answers"}],
            "config": {
                "query": "INSERT INTO Decision (caseId, approver, decision, reason, timestamp) VALUES (:cid, :approver, :decision, :reason, datetime('now'))",
            },
        },
        {
            "id": "send_alert",
            "provider": "http_request",
            "name": "Fraud Alert Webhook",
            "description": "Triggers alert HTTP POST webhook when a payment is held.",
            "input": [{"from": "write_decision", "lane": "answers"}],
            "when": "await_decision.value.decision == 'hold'",
            "config": {
                "method": "POST",
                "url": "{{ env.ALERT_WEBHOOK_URL }}",
                "body": {
                    "case_id": "{{ case.caseId }}",
                    "action": "payment_held",
                    "approver": "{{ await_decision.value.approver }}",
                },
            },
        },
        {
            "id": "update_dashboard",
            "provider": "chart_js",
            "name": "Dashboard Metric Updater",
            "description": "Increments held cases chart counter on live dashboard UI.",
            "input": [{"from": "write_decision", "lane": "answers"}],
            "config": {"chart": "cases_held", "action": "increment"},
        },
    ],
}


PIPE_MASTER: dict[str, Any] = {
    "name": "AP Payment Fraud Sentinel — Master Orchestration Pipeline",
    "description": "Master end-to-end pipeline that chains all 7 AP fraud screening stages sequentially.",
    "version": 1,
    "source": "stage_01_intake",
    "project_id": "69a1e026-57c6-4cd2-b712-56d4ec4e7417",
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "components": [
        {
            "id": "stage_01_intake",
            "provider": "pipeline_ref",
            "name": "Stage 01 — Case Intake Node",
            "description": "Runs 01_intake.pipe component chain.",
            "config": {"pipeline": "01_intake"},
        },
        {
            "id": "stage_02_extraction",
            "provider": "pipeline_ref",
            "name": "Stage 02 — Data Extraction Node",
            "description": "Runs 02_extraction.pipe component chain.",
            "input": [{"from": "stage_01_intake", "lane": "tags"}],
            "config": {"pipeline": "02_extraction"},
        },
        {
            "id": "stage_03_grounding",
            "provider": "pipeline_ref",
            "name": "Stage 03 — Vendor Master Grounding Node",
            "description": "Runs 03_grounding.pipe component chain.",
            "input": [{"from": "stage_02_extraction", "lane": "text"}],
            "config": {"pipeline": "03_grounding"},
        },
        {
            "id": "stage_04_signals",
            "provider": "pipeline_ref",
            "name": "Stage 04 — Risk Signals & Scoring Node",
            "description": "Runs 04_signals.pipe component chain.",
            "input": [{"from": "stage_03_grounding", "lane": "documents"}],
            "config": {"pipeline": "04_signals"},
        },
        {
            "id": "stage_05_agents",
            "provider": "pipeline_ref",
            "name": "Stage 05 — Multi-Agent Intelligence Swarm Node",
            "description": "Runs 05_agents.pipe component chain.",
            "input": [{"from": "stage_04_signals", "lane": "documents"}],
            "config": {"pipeline": "05_agents"},
        },
        {
            "id": "stage_06_verification",
            "provider": "pipeline_ref",
            "name": "Stage 06 — Verification Call Node",
            "description": "Runs 06_verification.pipe component chain.",
            "input": [{"from": "stage_05_agents", "lane": "answers"}],
            "config": {"pipeline": "06_verification"},
        },
        {
            "id": "stage_07_gate",
            "provider": "pipeline_ref",
            "name": "Stage 07 — Controller Decision Gate Node",
            "description": "Runs 07_gate.pipe component chain.",
            "input": [{"from": "stage_06_verification", "lane": "answers"}],
            "config": {"pipeline": "07_gate"},
        },
    ],
    "on_failure": {"retry": 2, "fallback": "quarantine"},
}


PIPELINES: dict[str, dict[str, Any]] = {
    "01_intake": PIPE_01_INTAKE,
    "02_extraction": PIPE_02_EXTRACTION,
    "03_grounding": PIPE_03_GROUNDING,
    "04_signals": PIPE_04_SIGNALS,
    "05_agents": PIPE_05_AGENTS,
    "06_verification": PIPE_06_VERIFICATION,
    "07_gate": PIPE_07_GATE,
    "master": PIPE_MASTER,
}


__all__ = [
    "PIPE_01_INTAKE", "PIPE_02_EXTRACTION", "PIPE_03_GROUNDING",
    "PIPE_04_SIGNALS", "PIPE_05_AGENTS", "PIPE_06_VERIFICATION",
    "PIPE_07_GATE", "PIPE_MASTER", "PIPELINES",
]
