export type ApplicantType = "student" | "parent" | "teacher";

export interface Category {
  id: number;
  slug: string;
  title: string;
  is_free_text: boolean;
}

export interface CrisisContact {
  title: string;
  phone: string;
  note: string;
}

export interface Staff {
  id: number;
  login: string;
  role: "operator" | "expert" | "admin";
  name: string;
  specialist_group?: string;
  voice_label?: string;
}

export interface ChatMessage {
  kind: "applicant" | "specialist";
  from?: string;
  voice?: string;
  body: string;
  at: string;
}

export interface Attachment {
  url: string;
  content_type: string;
  size: number;
}

export const STATUS_ORDER = [
  "new",
  "distributed",
  "in_progress",
  "need_clarification",
  "answer_ready",
  "done",
] as const;

export const APPLICANT_LABEL: Record<ApplicantType, string> = {
  student: "Школьник",
  parent: "Родитель",
  teacher: "Педагог",
};

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Срочно",
  standard: "Стандарт",
  low: "Низкий",
};
