import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "../components/Layout";
import { FloralStrip, ScanIcon } from "../components/Decor";
import { Banner, Card, StatusBadge } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { connectApplicantWS } from "../lib/ws";
import { enablePush, pushSupported } from "../lib/push";
import type { ApplicantType, Attachment, ChatMessage, CrisisContact } from "../lib/types";

interface TicketView {
  status: string;
  status_ru: string;
  status_hint: string;
  priority: string;
  is_crisis: boolean;
  applicant_type: ApplicantType;
  category: string | null;
  free_text: string;
  created_at: string;
  messages: ChatMessage[];
  attachments: Attachment[];
  rating: number | null;
  reject_reason?: string;
  reject_contacts?: CrisisContact[];
  crisis_contacts?: CrisisContact[];
}

const TIMELINE = [
  { key: "new", label: "Получено" },
  { key: "distributed", label: "Передано специалисту" },
  { key: "in_progress", label: "В работе" },
  { key: "answer_ready", label: "Ответ готов" },
  { key: "done", label: "Завершено" },
];

const CHANGED = ["Та же проблема", "Стало лучше", "Стало хуже", "Другое"];

export default function Track() {
  const [track, setTrack] = useState("");
  const [view, setView] = useState<TicketView | null>(null);
  const [phase, setPhase] = useState<"lookup" | "followup" | "ticket">("lookup");
  const [sameExpert, setSameExpert] = useState(true);
  const [changed, setChanged] = useState("");
  const [updateText, setUpdateText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [hint, setHint] = useState(false);

  async function fetchTicket(value: string) {
    const v: TicketView = await api.post("/api/applicant/lookup", { track: value });
    setView(v);
    setTrack(value);
    return v;
  }

  async function lookup(tn?: string) {
    const value = (tn ?? track).trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await fetchTicket(value);
      setPhase("followup");
      setSameExpert(true);
      setChanged("");
      setUpdateText("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось найти обращение");
      setView(null);
    } finally {
      setBusy(false);
    }
  }

  async function refreshTicket() {
    if (!track) return;
    try {
      await fetchTicket(track);
    } catch {
      /* сеть */
    }
  }

  const hasView = !!view && phase === "ticket";
  useEffect(() => {
    if (!hasView || !track) return;
    const conn = connectApplicantWS(track, () => refreshTicket());
    return () => conn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasView, track]);

  async function continueTicket() {
    if (!view) return;
    const bits: string[] = [];
    if (!sameExpert) bits.push("Прошу назначить другого специалиста.");
    if (changed) bits.push("Что изменилось: " + changed + ".");
    if (updateText.trim()) bits.push(updateText.trim());
    const body = bits.join(" ");
    if (body) {
      try {
        await api.post("/api/applicant/messages", { track, body });
      } catch {
        /* обращение всё равно откроем */
      }
    }
    setPhase("ticket");
    refreshTicket();
  }

  if (!view || phase === "lookup") {
    return (
      <PublicShell compact>
        <div className="mx-auto max-w-xl">
          <div className="card overflow-hidden">
            <div className="p-6 md:p-8">
              <h1 className="text-2xl font-extrabold text-lilac-900">У меня уже есть трек-номер</h1>
              <div className="mt-6">
                <label className="label">Трек-номер</label>
                <div className="relative">
                  <input
                    className="input pr-12 font-mono tracking-wider"
                    placeholder="Например: ОТК-XXXX-XXXX"
                    value={track}
                    onChange={(e) => setTrack(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && lookup()}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lilac-400">
                    <ScanIcon />
                  </span>
                </div>
                <button className="mt-2 text-sm text-lilac-600 underline" type="button" onClick={() => setHint((v) => !v)}>
                  Где найти трек-номер?
                </button>
                {hint && (
                  <p className="mt-2 text-sm text-lilac-600/80">
                    Он был на экране после отправки. Можно было скопировать или сохранить файл. Восстановить номер нельзя.
                  </p>
                )}
              </div>
              {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
              <button className="btn-primary mt-6 w-full" onClick={() => lookup()} disabled={busy}>
                {busy ? "Ищем…" : "Продолжить →"}
              </button>
              <p className="mt-4 text-sm text-lilac-600/80">
                Номер был показан после отправки. Если он потерян, можно{" "}
                <Link to="/new" className="font-semibold underline">подать новое обращение</Link>.
              </p>
            </div>
            <div className="relative">
              <img src="/art/cats-field.jpg" alt="" className="h-36 w-full object-cover" />
              <FloralStrip className="absolute bottom-0 w-full" />
            </div>
          </div>
        </div>
      </PublicShell>
    );
  }

  if (phase === "followup") {
    const date = new Date(view.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    return (
      <PublicShell compact>
        <div className="mx-auto max-w-xl">
          <div className="card overflow-hidden">
            <div className="p-6 md:p-8">
              <div className="text-sm text-lilac-500">Мы нашли ваше обращение от {date}</div>
              <h1 className="mt-1 text-xl font-extrabold text-lilac-900">Хотите продолжить с тем же специалистом?</h1>
              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => setSameExpert(true)}
                  className={`rounded-2xl border p-4 text-left ${sameExpert ? "border-lilac-500 bg-lilac-50" : "border-lilac-200"}`}
                >
                  <div className="font-bold text-lilac-900">Да, с тем же специалистом</div>
                  <div className="text-sm text-lilac-700/80">Он уже знает ситуацию</div>
                </button>
                <button
                  onClick={() => setSameExpert(false)}
                  className={`rounded-2xl border p-4 text-left ${!sameExpert ? "border-lilac-500 bg-lilac-50" : "border-lilac-200"}`}
                >
                  <div className="font-bold text-lilac-900">Нет, назначить другого</div>
                  <div className="text-sm text-lilac-700/80">Хочу свежий взгляд</div>
                </button>
              </div>
              <div className="mt-6">
                <div className="label">Что изменилось?</div>
                <div className="flex flex-wrap gap-2">
                  {CHANGED.map((c) => (
                    <button
                      key={c}
                      onClick={() => setChanged((v) => (v === c ? "" : c))}
                      className={`chip ${changed === c ? "border-lilac-500 bg-lilac-500 text-white" : "border-lilac-200 bg-white text-lilac-700"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="input mt-4 min-h-[110px]"
                placeholder="Расскажите, что происходит сейчас..."
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
              />
              <button className="btn-primary mt-6 w-full" onClick={continueTicket}>
                Продолжить →
              </button>
            </div>
            <FloralStrip className="w-full bg-cream-50" />
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <button className="text-lilac-600 hover:text-lilac-800" onClick={() => { setView(null); setPhase("lookup"); }}>
          ← К другому обращению
        </button>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={view.status} label={view.status_ru} />
            <span className="text-xs text-lilac-500">от {new Date(view.created_at).toLocaleDateString("ru-RU")}</span>
          </div>
          <p className="mt-3 text-lg font-semibold text-lilac-900">{view.status_hint}</p>

          <Timeline status={view.status} />
        </Card>

        {view.is_crisis && (
          <CrisisList title="Контакты помощи" contacts={view.crisis_contacts || []} />
        )}

        {view.status === "rejected" && view.reject_reason && (
          <Card>
            <div className="font-bold text-lilac-900">Мы посмотрели ситуацию</div>
            <p className="mt-1 text-lilac-700/90">{view.reject_reason}</p>
            {view.reject_contacts && view.reject_contacts.length > 0 && (
              <div className="mt-3">
                <CrisisList title="Куда ещё можно обратиться" contacts={view.reject_contacts} />
              </div>
            )}
          </Card>
        )}

        {/* Исходное обращение */}
        <Card>
          <div className="mb-1 text-sm font-semibold text-lilac-500">Твоё обращение</div>
          {view.category && <div className="mb-2 text-sm text-lilac-600">Категория: {view.category}</div>}
          <p className="whitespace-pre-wrap text-lilac-800">{view.free_text}</p>
          {view.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {view.attachments.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt="вложение" className="h-20 w-20 rounded-xl object-cover" />
                </a>
              ))}
            </div>
          )}
        </Card>

        {/* Чат */}
        <Chat view={view} track={track} onRefresh={refreshTicket} />

        {/* Ответ готов — ветка «помогло / не помогло» */}
        {view.status === "answer_ready" && <ResolveBlock track={track} onDone={refreshTicket} />}

        {/* Завершено — оценка */}
        {(view.status === "done" || view.status === "closed_no_answer") && (
          <RateBlock track={track} rating={view.rating} onDone={refreshTicket} />
        )}

        <PushOptIn track={track} />

        <ComplaintBlock track={track} />
      </div>
    </PublicShell>
  );
}

function PushOptIn({ track }: { track: string }) {
  const [state, setState] = useState<"idle" | "on" | "error">("idle");
  const [msg, setMsg] = useState("");
  if (!pushSupported()) return null;
  return (
    <Card className="bg-lilac-50/40">
      <div className="font-bold text-lilac-900">Уведомления о новом ответе</div>
      <p className="mt-1 text-sm text-lilac-700/80">
        Можно включить push-уведомления в этом браузере — они приходят без имени и телефона, только по этому обращению.
        Так ты не пропустишь ответ, даже если закроешь вкладку.
      </p>
      {state === "on" ? (
        <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Уведомления включены ✓</div>
      ) : (
        <button
          className="btn-soft mt-3"
          onClick={async () => {
            try {
              await enablePush(track);
              setState("on");
            } catch (e: any) {
              setMsg(e?.message || "Не удалось включить");
              setState("error");
            }
          }}
        >
          Включить уведомления
        </button>
      )}
      {state === "error" && <div className="mt-2 text-sm text-rose-600">{msg}</div>}
    </Card>
  );
}

function Timeline({ status }: { status: string }) {
  const idx = TIMELINE.findIndex((s) => s.key === status);
  const activeIdx = status === "need_clarification" ? 2 : status === "returned" ? 2 : idx;
  return (
    <div className="mt-5 flex items-center">
      {TIMELINE.map((s, i) => (
        <div key={s.key} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={`h-1 flex-1 rounded ${i === 0 ? "opacity-0" : i <= activeIdx ? "bg-lilac-400" : "bg-lilac-100"}`} />
            <div
              className={`mx-1 h-3 w-3 rounded-full ${i <= activeIdx ? "bg-lilac-500" : "bg-lilac-200"}`}
            />
            <div className={`h-1 flex-1 rounded ${i === TIMELINE.length - 1 ? "opacity-0" : i < activeIdx ? "bg-lilac-400" : "bg-lilac-100"}`} />
          </div>
          <div className={`mt-1 text-[11px] ${i <= activeIdx ? "text-lilac-700" : "text-lilac-400"}`}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Chat({ view, track, onRefresh }: { view: TicketView; track: string; onRefresh: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = ["done", "rejected", "closed_no_answer"].includes(view.status);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/applicant/messages", { track, body: text.trim() });
      setText("");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 font-bold text-lilac-900">Чат со специалистом</div>
      <div className="space-y-3">
        {view.messages.length === 0 && (
          <p className="text-sm text-lilac-500">Пока сообщений нет. Как только специалист ответит, они появятся здесь.</p>
        )}
        {view.messages.map((m, i) => (
          <div key={i} className={`flex ${m.kind === "applicant" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                m.kind === "applicant" ? "bg-lilac-500 text-white" : "bg-lilac-50 text-lilac-900"
              }`}
            >
              {m.kind === "specialist" && <div className="mb-0.5 text-xs font-bold text-lilac-500">{m.from}</div>}
              <div className="whitespace-pre-wrap">{m.body}</div>
              <div className={`mt-1 text-[10px] ${m.kind === "applicant" ? "text-white/70" : "text-lilac-400"}`}>
                {new Date(m.at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {closed ? (
        <p className="mt-4 text-sm text-lilac-500">Обращение закрыто, но ты всегда можешь <Link to="/new" className="font-semibold text-lilac-700 underline">написать снова</Link>.</p>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            className="input"
            placeholder="Написать сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn-primary" onClick={send} disabled={busy}>
            Отправить
          </button>
        </div>
      )}
    </Card>
  );
}

function ResolveBlock({ track, onDone }: { track: string; onDone: () => void }) {
  const [notHelped, setNotHelped] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(action: "helped" | "not_helped") {
    setBusy(true);
    try {
      await api.post("/api/applicant/resolve", { track, action, comment });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-emerald-50/50">
      <div className="font-bold text-lilac-900">Мы подготовили рекомендации. Это помогло?</div>
      {!notHelped ? (
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => act("helped")} disabled={busy}>
            Это помогло
          </button>
          <button className="btn-ghost" onClick={() => setNotHelped(true)} disabled={busy}>
            Это не помогло
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="label">Расскажи, чего не хватило — мы вернёмся к твоей ситуации</label>
          <textarea className="input min-h-[100px]" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={() => act("not_helped")} disabled={busy}>
              Отправить
            </button>
            <button className="btn-ghost" onClick={() => setNotHelped(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RateBlock({ track, rating, onDone }: { track: string; rating: number | null; onDone: () => void }) {
  const [value, setValue] = useState(rating || 0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(rating != null);

  async function submit() {
    if (!value) return;
    await api.post("/api/applicant/rate", { track, rating: value, comment });
    setSaved(true);
    onDone();
  }

  return (
    <Card>
      <div className="font-bold text-lilac-900">Как тебе помощь?</div>
      {saved ? (
        <p className="mt-2 text-lilac-700/80">Спасибо за оценку! Рады, что были рядом.</p>
      ) : (
        <>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setValue(n)} className="text-3xl">
                <span className={n <= value ? "text-amber-400" : "text-lilac-200"}>★</span>
              </button>
            ))}
          </div>
          <textarea
            className="input mt-3 min-h-[80px]"
            placeholder="Комментарий по желанию"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn-primary mt-3" onClick={submit} disabled={!value}>
            Оценить
          </button>
        </>
      )}
    </Card>
  );
}

function ComplaintBlock({ track }: { track: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    if (!text.trim()) return;
    await api.post("/api/applicant/complaint", { track, body: text.trim() });
    setSent(true);
  }

  if (sent) {
    return <Banner tone="info"><div className="text-sm">Спасибо, жалоба передана оператору. Специалист её не увидит.</div></Banner>;
  }

  return (
    <div className="text-center">
      {!open ? (
        <button className="text-sm text-lilac-500 underline" onClick={() => setOpen(true)}>
          Пожаловаться на специалиста
        </button>
      ) : (
        <Card className="text-left">
          <div className="label">Что случилось? Жалобу увидит только оператор.</div>
          <textarea className="input min-h-[80px]" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" onClick={send}>Отправить</button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function CrisisList({ title, contacts }: { title: string; contacts: CrisisContact[] }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
      <div className="mb-2 font-bold text-rose-700">{title}</div>
      <ul className="space-y-1 text-sm">
        {contacts.map((c) => (
          <li key={c.phone}>
            <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className="font-bold text-rose-700 underline">{c.phone}</a>{" "}
            <span className="text-rose-800">{c.title}</span> <span className="text-rose-700/70">— {c.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
