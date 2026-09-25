import type { LeapingCallContext } from "./leaping-context.js";

export interface CallInsightsConfig {
  leapingApiBaseUrl: string;
  leapingAccessToken?: string;
  leapingUsername?: string;
  leapingPassword?: string;
  leapingClientId?: string;
  leapingClientSecret?: string;
  leapingAgentId: string;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl: string;
}

export interface LeapingCallRecord {
  id: string;
  status: string;
  call_status?: "completed" | "failed" | "transferred" | "dropped" | "in_progress" | "unknown";
  created_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  transcript_text?: string;
  /** Leaping auto-summary (often present when utterance lines are sparse) */
  summary_text?: string;
  verification_successful?: boolean;
  function_calls?: Array<{ name: string; error?: string }>;
  detected_events?: {
    customer_frustrated?: boolean;
    customer_requested_human?: boolean;
    technical_issue_mentioned?: boolean;
    repeated_birthday_requests?: number;
    repeated_vnr_requests?: number;
    repeated_address_requests?: number;
    silence_or_dead_air?: boolean;
  };
  leaping_context?: LeapingCallContext;
  raw: Record<string, unknown>;
}

export type IssueOwner = "marie" | "leaping" | "mcp" | "mixed";

export type IssueSeverity = "low" | "medium" | "high" | "critical";

export type IssueCategory =
  | "verification_loop"
  | "birthday_binding"
  | "phone_path"
  | "stt_noise"
  | "wrong_brain"
  | "escalation"
  | "customer_confusion"
  | "other";

export interface DetectedIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  owner: IssueOwner;
  title: string;
  detail: string;
  recommendation: string;
}

export interface CallAnalysis {
  call: LeapingCallRecord;
  issues: DetectedIssue[];
  score: number;
  verdict: "ok" | "needs_review" | "failed";
}

export interface ReportSummary {
  generatedAt: string;
  totalCalls: number;
  ok: number;
  failed: number;
  needsReview: number;
  topIssues: Array<{ category: string; count: number; owner?: IssueOwner }>;
  bySeverity: Record<string, number>;
  byOwner: Record<string, number>;
}

export interface LlmAnalysisResult {
  headline: string;
  biggestIssues: Array<{ issue: string; count: number; owner: string; fix: string }>;
  recommendations: string[];
}
