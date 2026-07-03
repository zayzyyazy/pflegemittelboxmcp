export interface CallInsightsConfig {
  leapingApiBaseUrl: string;
  /** Pasted Bearer token from Leaping UI or curl login response */
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
  created_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  transcript_text?: string;
  verification_successful?: boolean;
  function_calls?: Array<{ name: string; error?: string }>;
  raw: Record<string, unknown>;
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IssueCategory =
  | 'verification_loop'
  | 'birthday_binding'
  | 'phone_path'
  | 'stt_noise'
  | 'wrong_brain'
  | 'escalation'
  | 'customer_confusion'
  | 'other';

export interface DetectedIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

export interface CallAnalysis {
  call: LeapingCallRecord;
  issues: DetectedIssue[];
  score: number;
  verdict: 'ok' | 'needs_review' | 'failed';
}

export interface ReportSummary {
  generatedAt: string;
  totalCalls: number;
  failed: number;
  needsReview: number;
  topIssues: Array<{ category: string; count: number }>;
  bySeverity: Record<string, number>;
}

export interface LlmAnalysisResult {
  executiveSummary: string;
  biggestIssues: Array<{ issue: string; count: number; fix: string }>;
  marieVsMcp: string;
  recommendations: string[];
}
