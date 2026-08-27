"""worker package — AP Payment Fraud Sentinel Python pipeline runner.

Submodules:
  main           — entry point (aiohttp app on port 3030).
  app            — HTTP routes (healthz, runs, cases, decisions).
  runner         — REAL RocketRide SDK wrapper with try/finally + terminate.
  pipeline_defs  — PipelineConfig dicts mirroring pipelines/*.pipe.
  local_executor — the fallback 7-stage executor (sandbox path).
  signals        — 6 pure deterministic signal functions + assemble + risk_score.
  agents         — 3 Stage 05 subagents (LLM via /api/ai/llm, deterministic fallback).
  call           — Stage 06 verification call (TTS via /api/ai/tts, ASR via /api/ai/asr).
  db             — sqlite3 helpers (read vendor_master/payment_history; write cases/etc).
  ws_client      — push trace events to the WS service on port 3003.
  utils/         — pure helpers consumed by both the local executor and the .pipe files.
"""

__version__ = "0.1.0"
