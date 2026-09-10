import { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-lilac-500 text-white">
        <HeartIcon />
      </span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-lilac-800"}`}>рядом</span>
    </Link>
  );
}

export function HeartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21s-7.5-4.6-10-9.3C.3 8 2 4.6 5.3 4.6c2 0 3.4 1.2 4.2 2.4C10.3 5.8 11.7 4.6 13.7 4.6 17 4.6 18.7 8 17.3 11.7 15.9 15 12 21 12 21z" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BoltIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M13 3L5 13h5l-1 8 8-10h-5l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-6 ${className}`}>{children}</div>;
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "crisis"; children: ReactNode }) {
  const map = {
    info: "bg-lilac-50 border-lilac-200 text-lilac-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    crisis: "bg-rose-50 border-rose-200 text-rose-800",
  };
  return <div className={`rounded-2xl border p-4 ${map[tone]}`}>{children}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-lilac-200 border-t-lilac-500" />
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-100 text-sky-700",
  distributed: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-lilac-100 text-lilac-700",
  need_clarification: "bg-amber-100 text-amber-700",
  answer_ready: "bg-emerald-100 text-emerald-700",
  returned: "bg-orange-100 text-orange-700",
  done: "bg-green-100 text-green-700",
  rejected: "bg-gray-200 text-gray-600",
  closed_no_answer: "bg-gray-200 text-gray-600",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[status] || "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

export function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-lilac-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card p-6">
          {title && (
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-lilac-900">{title}</h3>
              <button className="text-lilac-400 hover:text-lilac-700" onClick={onClose}>✕</button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function waitingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} ч`;
  return `${Math.floor(h / 24)} дн`;
}

// AttachmentList рендерит вложения: изображения — превью, аудио — плеер.
export function AttachmentList({
  attachments,
  thumb = "h-20 w-20",
}: {
  attachments: { url: string; content_type?: string }[];
  thumb?: string;
}) {
  const isAudio = (a: { content_type?: string }) => (a.content_type || "").startsWith("audio/");
  const images = attachments.filter((a) => !isAudio(a));
  const audios = attachments.filter(isAudio);
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer">
              <img src={a.url} className={`${thumb} rounded-xl object-cover`} />
            </a>
          ))}
        </div>
      )}
      {audios.map((a, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-lilac-50 px-3 py-2">
          <span className="text-lilac-500" aria-hidden>🎤</span>
          <audio controls src={a.url} className="h-9 w-full max-w-xs" />
        </div>
      ))}
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-700",
    standard: "bg-lilac-100 text-lilac-700",
    low: "bg-slate-100 text-slate-600",
  };
  const label: Record<string, string> = { urgent: "Срочно", standard: "Стандарт", low: "Низкий" };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${map[priority] || ""}`}>{label[priority] || priority}</span>;
}
