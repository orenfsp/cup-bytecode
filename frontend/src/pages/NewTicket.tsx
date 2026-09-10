import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicShell } from "../components/Layout";
import { CheckMark, FloralStrip, LockIcon, PaperclipIcon } from "../components/Decor";
import { CrisisHelp } from "../components/CrisisHelp";
import { api, ApiError } from "../lib/api";
import { CLARIFYING_QUESTIONS, looksCrisis, tone } from "../lib/content";
import type { ApplicantType, Category } from "../lib/types";
import { APPLICANT_LABEL } from "../lib/types";

type Step = "type" | 1 | 2 | 3 | "done";
type Priority = "urgent" | "standard" | "low";

const URGENCY_OPTIONS: { value: Priority; title: string; hint: string }[] = [
  { value: "urgent", title: "Срочно", hint: "Нужна помощь как можно скорее" },
  { value: "standard", title: "Обычная", hint: "Не горит, но важно" },
  { value: "low", title: "Не срочно", hint: "Могу подождать" },
];

interface CreateResult {
  track_number: string;
  is_crisis: boolean;
  message: string;
}

export default function NewTicket() {
  const [step, setStep] = useState<Step>("type");
  const [applicantType, setApplicantType] = useState<ApplicantType | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<Priority>("standard");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

  const t = tone(applicantType);

  useEffect(() => {
    api.get("/api/categories").then(setCategories).catch(() => {});
  }, []);

  const selectedCat = categories.find((c) => c.id === categoryId);
  const isFreeTextMode = !selectedCat || selectedCat.is_free_text;

  const clientCrisis = useMemo(
    () => looksCrisis(freeText + " " + Object.values(answers).join(" ")),
    [freeText, answers]
  );

  function onFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 5 - files.length);
    setFiles((prev) => [...prev, ...arr].slice(0, 5));
  }

  async function submit() {
    setError("");
    if (!applicantType) return;
    if (!categoryId && freeText.trim().length === 0) {
      setError(t.you("Расскажи о том, что происходит, своими словами", "Расскажите о том, что происходит, своими словами"));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("applicant_type", applicantType);
      if (categoryId) form.append("category_id", String(categoryId));
      form.append("free_text", freeText);
      form.append("clarifying_answers", JSON.stringify(answers));
      form.append("priority", priority);
      files.forEach((f) => form.append("files", f));
      const res: CreateResult = await api.postForm("/api/tickets", form);
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не получилось отправить. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done" && result) {
    return <DoneScreen result={result} applicantType={applicantType!} />;
  }

  return (
    <PublicShell compact>
      <div className="mx-auto max-w-xl">
        {step === "type" ? (
          <FormCard>
            <h1 className="text-2xl font-extrabold text-lilac-900">Новое обращение</h1>
            <p className="mt-2 text-lilac-700/80">От чьего лица расскажем — так мы подберём тон и специалиста.</p>
            <div className="mt-6 grid gap-3">
              {(["student", "parent", "teacher"] as ApplicantType[]).map((ty) => (
                <button
                  key={ty}
                  onClick={() => {
                    setApplicantType(ty);
                    setStep(1);
                  }}
                  className="rounded-2xl border border-lilac-200 bg-white p-4 text-left font-semibold text-lilac-800 transition hover:border-lilac-500"
                >
                  {APPLICANT_LABEL[ty]}
                </button>
              ))}
            </div>
            <Link to="/" className="mt-5 inline-block text-sm text-lilac-600">
              ← На главную
            </Link>
          </FormCard>
        ) : (
          <FormCard>
            <StepHeader step={step as number} />

            {clientCrisis && (
              <div className="mb-5">
                <CrisisHelp />
              </div>
            )}

            {step === 1 && (
              <div>
                <h1 className="text-2xl font-extrabold text-lilac-900">Новое обращение</h1>
                <label className="label mt-5">{t.you("Расскажи, что случилось", "Расскажите, что случилось")}</label>
                <textarea
                  className="input min-h-[180px] resize-y"
                  maxLength={2000}
                  placeholder="Расскажите, что случилось..."
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                />
                <div className="mt-1 text-right text-xs text-lilac-500">{freeText.length}/2000</div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryId(c.id)}
                      className={`chip ${
                        categoryId === c.id
                          ? "border-lilac-500 bg-lilac-500 text-white"
                          : "border-lilac-200 bg-white text-lilac-700 hover:border-lilac-400"
                      }`}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>

                <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-lilac-300 bg-cream-50/80 px-4 py-4 text-lilac-700 hover:bg-lilac-50">
                  <PaperclipIcon />
                  <span className="text-sm">
                    <span className="font-semibold">Прикрепить файлы</span>
                    <span className="block text-lilac-500">(необязательно). Можно добавить до 5 файлов.</span>
                  </span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
                </label>

                <VoiceRecorder
                  disabled={files.length >= 5}
                  onRecorded={(f) => setFiles((prev) => [...prev, f].slice(0, 5))}
                />

                {files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-xl bg-lilac-50 px-3 py-2 text-sm">
                        <span className="truncate text-lilac-800">
                          {f.type.startsWith("audio/") ? `🎤 Голосовое сообщение (${f.name})` : f.name}
                        </span>
                        <button className="text-lilac-500 hover:text-rose-500" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-4 flex items-center gap-2 text-sm text-lilac-600">
                  <LockIcon className="h-4 w-4" />
                  Обращение анонимно и защищено
                </p>
                <NavButtons onNext={() => setStep(2)} nextLabel="Далее →" />
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-lilac-900">Несколько коротких вопросов</h2>
                <p className="mt-1 text-sm text-lilac-700/80">Все по желанию — отвечайте только на то, что хотите.</p>
                <div className="mt-4 space-y-5">
                  {CLARIFYING_QUESTIONS.map((q) => (
                    <div key={q.id}>
                      <div className="label">{q.question}</div>
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === opt ? "" : opt }))}
                            className={`chip ${
                              answers[q.id] === opt
                                ? "border-lilac-500 bg-lilac-500 text-white"
                                : "border-lilac-200 bg-white text-lilac-700 hover:border-lilac-400"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Далее →" />
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-xl font-bold text-lilac-900">Проверьте и отправьте</h2>
                <p className="mt-1 text-sm text-lilac-700/80">
                  {isFreeTextMode
                    ? t.you("Можно ещё дополнить текст — или сразу отправить.", "Можно ещё дополнить текст — или сразу отправить.")
                    : t.you("Категория выбрана. Можно отправить.", "Категория выбрана. Можно отправить.")}
                </p>

                <div className="mt-5">
                  <label className="label">{t.you("Насколько это срочно?", "Насколько это срочно?")}</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {URGENCY_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setPriority(o.value)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          priority === o.value
                            ? "border-lilac-500 bg-lilac-50"
                            : "border-lilac-200 bg-white hover:border-lilac-400"
                        }`}
                      >
                        <div className="font-semibold text-lilac-900">{o.title}</div>
                        <div className="text-xs text-lilac-600">{o.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
                <NavButtons onBack={() => setStep(2)} onNext={submit} nextLabel={busy ? "Отправляем…" : "Отправить →"} disabled={busy} />
              </div>
            )}
          </FormCard>
        )}
      </div>
    </PublicShell>
  );
}

// VoiceRecorder — запись голосового обращения прямо в браузере.
// Подросткам иногда проще наговорить, чем писать. Записанное аудио добавляется
// к вложениям и уходит на бэкенд как обычный файл (audio/*).
function VoiceRecorder({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (f: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof window !== "undefined" &&
    typeof (window as any).MediaRecorder !== "undefined";

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.stop();
    setRecording(false);
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = candidates.find((m) => (window as any).MediaRecorder.isTypeSupported?.(m)) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const type = (mr.mimeType || "audio/webm").split(";")[0];
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([new Blob(chunksRef.current, { type })], `voice-${Date.now()}.${ext}`, { type });
        onRecorded(file);
      };
      mr.start();
      recRef.current = mr;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= 120) {
            // авто-стоп на 2 минутах
            stop();
            return 120;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Не удалось получить доступ к микрофону. Проверьте разрешения браузера.");
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    };
  }, []);

  if (!supported) return null;

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="mt-3">
      {!recording ? (
        <button
          type="button"
          disabled={disabled}
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-lilac-300 bg-cream-50/80 px-4 py-3 text-sm font-semibold text-lilac-700 hover:bg-lilac-50 disabled:opacity-50"
        >
          🎤 Записать голосовое сообщение
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
          Идёт запись… {mm}:{ss} — нажмите, чтобы остановить
        </button>
      )}
      {disabled && !recording && <p className="mt-1 text-xs text-lilac-400">Достигнут лимит в 5 вложений.</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 md:p-8">{children}</div>
      <FloralStrip className="w-full bg-cream-50" />
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between text-sm text-lilac-500">
        <span className="font-semibold text-lilac-700">Новое обращение</span>
        <span>{step} из 3</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-lilac-100">
        <div className="h-full rounded-full bg-lilac-500" style={{ width: `${(step / 3) * 100}%` }} />
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      {onBack ? (
        <button className="btn-ghost" onClick={onBack}>
          ← Назад
        </button>
      ) : (
        <span />
      )}
      <button className="btn-primary" onClick={onNext} disabled={disabled}>
        {nextLabel}
      </button>
    </div>
  );
}

function DoneScreen({ result, applicantType }: { result: CreateResult; applicantType: ApplicantType }) {
  const nav = useNavigate();
  const t = tone(applicantType);
  const [copied, setCopied] = useState(false);
  const [contact, setContact] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);

  function copy() {
    navigator.clipboard.writeText(result.track_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function save() {
    const blob = new Blob(
      [`Ваш трек-номер на «Рядом»: ${result.track_number}\nСохраните его — по нему можно проверить статус и продолжить общение.`],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ryadom-track.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveContact() {
    if (!contact.trim()) return;
    setContactBusy(true);
    try {
      await api.post("/api/applicant/contact", { track: result.track_number, contact: contact.trim() });
      setContactSaved(true);
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <PublicShell compact>
      <div className="mx-auto max-w-lg">
        <FormCard>
          <div className="text-center">
            <CheckMark className="mx-auto h-16 w-16" />
            <h1 className="mt-4 text-2xl font-extrabold text-lilac-900">Сообщение передано</h1>
            <p className="mt-2 text-lilac-700/80">{result.message}</p>

            <div className="mt-6 rounded-2xl border border-lilac-200 p-5">
              <div className="text-sm text-lilac-600">Ваш трек-номер:</div>
              <div className="mt-1 select-all text-2xl font-extrabold tracking-wide text-lilac-800">#{result.track_number.replace(/^ОТК-/, "")}</div>
              <div className="mt-4 flex justify-center gap-2">
                <button className="btn-ghost py-2 text-sm" onClick={copy}>
                  {copied ? "Скопировано" : "Скопировать"}
                </button>
                <button className="btn-ghost py-2 text-sm" onClick={save}>
                  Сохранить
                </button>
              </div>
            </div>

            <p className="mt-5 text-sm text-lilac-700/80">
              {t.you("Мы ответим в ближайшее время. Обычно это занимает несколько часов.", "Мы ответим в ближайшее время. Обычно это занимает несколько часов.")}
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Сохрани номер обязательно — восстановить его нельзя.
            </p>

            {result.is_crisis && !contactSaved && (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-left">
                <div className="font-bold text-rose-700">Хочешь, чтобы с тобой могли связаться?</div>
                <p className="mt-1 text-sm text-rose-700/90">
                  По желанию. Способ связи увидит только оператор по кризисным обращениям.
                </p>
                <div className="mt-3 flex gap-2">
                  <input className="input" placeholder="Телефон, ник или e-mail" value={contact} onChange={(e) => setContact(e.target.value)} />
                  <button className="btn-primary" onClick={saveContact} disabled={contactBusy}>
                    {contactBusy ? "…" : "Ок"}
                  </button>
                </div>
              </div>
            )}
            {contactSaved && (
              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Спасибо, оператор сможет связаться.</div>
            )}

            <button className="btn-primary mt-6 w-full" onClick={() => nav("/")}>
              На главную
            </button>
          </div>
        </FormCard>
      </div>
    </PublicShell>
  );
}
