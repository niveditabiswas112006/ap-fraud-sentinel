// AP Payment Fraud Sentinel — shared types (the data contract between
// the Next.js dashboard, the API routes, and the Python worker's HTTP responses).
// Mirrors the interfaces in build prompt §5.2.

export type CaseStatus =
  | 'queued'
  | 'extracted'
  | 'grounded'
  | 'scored'
  | 'reviewed'
  | 'verified'
  | 'closed'
  | 'quarantined';

export type Recommendation = 'hold' | 'pass';
export type ControllerDecision = 'release' | 'hold' | 'escalate';
export type VerificationResult = 'confirmed' | 'denied' | 'unclear';

export interface Signal {
  name: string;
  score: number; // 0.0 - 1.0
  weight: number;
  evidence: string; // e.g. "z_score=4.2, mean=$4250, std=$180"
  fired: boolean;
}

// Signal weights — frozen on Day 4 per build prompt §4 (no tuning after).
export const SIGNAL_WEIGHTS: Record<string, number> = {
  domain_lookalike: 0.30,
  timing_suspicious: 0.20,
  amount_anomaly: 0.20,
  duplicate: 0.15,
  first_time_vendor: 0.10,
  threshold_skirting: 0.05,
};

export const RISK_HOLD_THRESHOLD = 0.40;

export interface CaseRecord {
  caseId: string;
  runId?: string;
  vendorId?: string | null;
  vendorName: string;
  invoiceNumber: string;
  sourcePath: string;
  kind: 'invoice' | 'email';
  status: CaseStatus;
  amountUsd: number;
  currency: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  senderDomain?: string | null;
  bankChangeRequestDate?: string | null;
  requestedBankAccount?: string | null;
  emailBody?: string | null;
  factsJson: string;
  signals: Signal[];
  riskScore: number;
  recommendation?: Recommendation | null;
  evidencePackJson: string;
  narrative?: string | null;
  callTranscript?: string | null;
  callAudioUrl?: string | null;
  verificationResult?: VerificationResult | null;
  decision?: ControllerDecision | null;
  approver?: string | null;
  decisionReason?: string | null;
  decisionAt?: string | null;
  fraudType?: string | null;
  isFraud: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorRecord {
  vendorId: string;
  legalName: string;
  registeredDomain: string;
  knownPhone: string;
  knownBankAccount: string;
  bankAccountAddedDate: string;
  firstInvoiceDate: string;
  address: string;
  contactEmail: string;
  taxId: string;
  paymentCount?: number;
  amountMean?: number;
  amountStd?: number;
}

export interface PaymentRecord {
  paymentId: string;
  vendorId: string;
  invoiceNumber: string;
  paidDate: string;
  amountUsd: number;
  currencyOriginal: string;
}

export interface RunRecord {
  runId: string;
  startedAt: string;
  endedAt?: string | null;
  status: 'running' | 'complete' | 'failed';
  casesProcessed: number;
  casesHeld: number;
  fraudCaught: number;
  amountSavedUsd: number;
  signalsCostUsd: number;
  llmCostUsd: number;
  callCostUsd: number;
  totalUsd: number;
  durationS: number;
}

export interface DecisionRecord {
  id: number;
  caseId: string;
  approver: string;
  decision: ControllerDecision;
  reason: string;
  timestamp: string;
}

// ---- Pipeline trace events (worker -> websocket -> dashboard) ----
export type StageName =
  | 'intake'
  | 'extraction'
  | 'grounding'
  | 'signals'
  | 'agents'
  | 'verification'
  | 'gate';

export interface TraceStage {
  name: StageName;
  label: string;
  status: 'idle' | 'running' | 'blocked' | 'complete' | 'failed';
  startedAt?: number;
  completedAt?: number;
  casesInStage?: number;
}

export interface TraceEvent {
  type: 'run_started' | 'run_completed' | 'stage' | 'case' | 'log';
  runId: string;
  stage?: StageName;
  stageStatus?: TraceStage['status'];
  caseId?: string;
  caseStatus?: CaseStatus;
  message?: string;
  timestamp: number;
}

// ---- Cost model (build prompt §8: "predictable cost", end card $0.04/invoice) ----
export const COST = {
  // Deterministic signals cost fractions of a cent — CPU only.
  signals_per_invoice: 0.0005,
  // LLM agent review — 3 subagents + manager, ~$0.015 per case that reaches Stage 05.
  llm_per_reviewed_case: 0.015,
  // Verification call (TTS+ASR+classify) — only on held cases.
  call_per_held_case: 0.09,
};
