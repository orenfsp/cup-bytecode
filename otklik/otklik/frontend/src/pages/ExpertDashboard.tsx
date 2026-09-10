import { useEffect, useRef, useState } from "react";
import { StaffShell } from "../components/Layout";
import { Banner, Card, Modal, PriorityBadge, Spinner, StatusBadge } from "../components/ui";
import { api, getToken } from "../lib/api";
import { connectStaffWS } from "../lib/ws";
import { APPLICANT_LABEL } from "../lib/types";

const STATUS_FILTERS = [
  { v: "", l: "Все" },
  { v: "distributed", l: "Распределено" },
  { v: "in_progress", l: "В работе" },
  { v: "need_clarification", l: "Нужно уточнение" },
  { v: "answer_ready", l: "Ответ готов" },
];

export default function ExpertDashboard() {
  const [list, setList] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const [l, col] = await Promise.all([
      api.get(`/api/expert/tickets?${params.toString()}`),
      api.get("/api/expert/colleagues"),
    ]);
    setList(l);
    setColleagues(col);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [status, priority]);

  return (
    <StaffShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-lilac-900">Мои обращения</h1>
        <button className="btn-ghost py-2" onClick={refresh}>Обновить</button>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setStatus(f.v)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${status === f.v ? "bg-lilac-500 text-white" : "bg-white/70 text-lilac-600 hover:bg-lilac-50"}`}
            >
              {f.l}
            </button>
          ))}
        </div>
        <select className="input w-auto py-1.5" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Любой приоритет</option>
          <option value="urgent">Срочно</option>
          <option value="standard">Стандарт</option>
          <option value="low">Низкий</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3">
          {list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-lilac-200 p-8 text-center text-lilac-400">
              Назначенных обращений нет
            </div>
          )}
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className={`card p-4 text-left transition hover:shadow-lg ${t.is_crisis || t.priority === "urgent" ? "border-rose-200 ring-1 ring-rose-100" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-lilac-900">#{t.id}</span>
                <StatusBadge status={t.status} label={t.status_ru} />
                <PriorityBadge priority={t.priority} />
                {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
                {!t.responsible && <span className="rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-bold text-lilac-600">соисполнитель</span>}
              </div>
              <div className="mt-1 text-sm text-lilac-600">
                {APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]} · {t.category || "без категории"}
              </div>
            </button>
          ))}
        </div>
      )}

      {openId != null && (
        <ExpertTicketModal id={openId} colleagues={colleagues} onClose={() => setOpenId(null)} onChanged={refresh} />
      )}
    </StaffShell>
  );
}

function ExpertTicketModal({ id, colleagues, onClose, onChanged }: { id: number; colleagues: any[]; onClose: () => void; onChanged: () => void }) {
  const [t, setT] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [collabId, setCollabId] = useState(0);
  const [lock, setLock] = useState<{ me: boolean; holder?: string }>({ me: true });
  const timer = useRef<any>(null);

  async function load() {
    const d = await api.get(`/api/expert/tickets/${id}`);
    setT(d);
  }

  async function heartbeat() {
    try {
      await api.post(`/api/expert/tickets/${id}/presence`, {});
      const l = await api.post(`/api/expert/tickets/${id}/lock`, {});
      setLock({ me: !!l.locked_by_me, holder: l.holder });
    } catch {}
  }

  useEffect(() => {
    load();
    heartbeat();
    // heartbeat присутствия + удержание блокировки ввода
    timer.current = setInterval(heartbeat, 12000);
    // realtime-обновления вместо частого опроса
    const conn = connectStaffWS(id, getToken() || "", () => load());
    return () => {
      clearInterval(timer.current);
      conn.close();
      api.post(`/api/expert/tickets/${id}/unlock`, {}).catch(() => {});
    };
  }, [id]);

  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!t) {
    return (
      <Modal open onClose={onClose} title={`Обращение #${id}`}>
        <Spinner />
      </Modal>
    );
  }

  const othersPresent: any[] = t.presence || [];
  const canWork = t.responsible; // соисполнитель тоже может писать, но ответственный — основной
  void canWork;

  return (
    <Modal open onClose={onClose} title={`Обращение #${id}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} label={t.status_ru} />
          <PriorityBadge priority={t.priority} />
          {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
          <span className="text-sm text-lilac-500">{APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]}</span>
          {t.responsible ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">вы ответственный</span>
          ) : (
            <span className="rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-bold text-lilac-600">вы соисполнитель</span>
          )}
        </div>

        {othersPresent.length > 0 && (
          <Banner tone="warn">
            <div className="text-sm">
              Сейчас в карточке также: {othersPresent.map((p) => p.name).join(", ")}.
            </div>
          </Banner>
        )}
        {!lock.me && (
          <Banner tone="warn">
            <div className="text-sm">
              🔒 Сейчас отвечает <b>{lock.holder || "другой специалист"}</b>. Поле ввода заблокировано, чтобы не отправить
              два ответа одновременно. Освободится автоматически, когда коллега закончит.
            </div>
          </Banner>
        )}

        {/* Приоритет эксперт не меняет */}
        <div className="text-xs text-lilac-400">Приоритет меняет только оператор. При несогласии оставьте внутреннюю заметку и запросите пересмотр.</div>

        {/* Исходное обращение + ответы */}
        <div>
          <div className="text-xs font-semibold uppercase text-lilac-400">Обращение</div>
          <p className="mt-1 whitespace-pre-wrap text-lilac-800">{t.free_text}</p>
          {t.category && <div className="mt-1 text-sm text-lilac-500">Категория: {t.category}</div>}
        </div>
        {t.clarifying_answers && Object.keys(t.clarifying_answers).length > 0 && (
          <div className="text-sm text-lilac-700">
            <span className="font-semibold text-lilac-500">Уточнения:</span> {Object.values(t.clarifying_answers).map(String).join(" · ")}
          </div>
        )}
        {t.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.attachments.map((a: any, i: number) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} className="h-16 w-16 rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}

        {/* Участники */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-lilac-500">Участники:</span>
          {(t.participants || []).map((p: any, i: number) => (
            <span key={i} className="rounded-full bg-lilac-50 px-2 py-0.5">
              {p.name} {p.role === "responsible" ? "(ответственный)" : "(соисполнитель)"}
            </span>
          ))}
        </div>

        {/* Чат с заявителем */}
        <div className="rounded-2xl border border-lilac-100 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-lilac-400">Чат с заявителем</div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {(t.messages || []).length === 0 && <div className="text-sm text-lilac-400">Сообщений пока нет</div>}
            {(t.messages || []).map((m: any, i: number) => (
              <div key={i} className={`flex ${m.kind === "specialist" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.kind === "specialist" ? "bg-lilac-500 text-white" : "bg-lilac-50 text-lilac-900"}`}>
                  {m.kind === "specialist" && <div className="text-[10px] font-bold opacity-80">{m.voice || "Специалист"}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </div>
              </div>
            ))}
          </div>
          {t.status === "distributed" && (
            <button className="btn-primary mt-3 w-full" disabled={busy} onClick={() => run(() => api.post(`/api/expert/tickets/${id}/take`, {}))}>
              Взять в работу
            </button>
          )}
          {t.status !== "distributed" && (
            <div className="mt-3">
              <textarea className="input min-h-[70px]" placeholder="Ответ заявителю (от лица сервиса)" value={msg} disabled={!lock.me} onChange={(e) => setMsg(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || !msg.trim() || !lock.me} onClick={() => run(async () => { await api.post(`/api/expert/tickets/${id}/message`, { body: msg, action: "reply" }); setMsg(""); })}>Ответить</button>
                <button className="btn-soft" disabled={busy || !msg.trim() || !lock.me} onClick={() => run(async () => { await api.post(`/api/expert/tickets/${id}/message`, { body: msg, action: "ask" }); setMsg(""); })}>Задать вопрос</button>
                <button className="btn-soft" disabled={busy || !msg.trim() || !lock.me} onClick={() => run(async () => { await api.post(`/api/expert/tickets/${id}/message`, { body: msg, action: "answer" }); setMsg(""); })}>Отправить рекомендации</button>
              </div>
            </div>
          )}
        </div>

        {/* Внутренние заметки — визуально отделены */}
        <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-amber-600">Внутренние заметки · заявителю не видны</div>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {(t.notes || []).length === 0 && <div className="text-sm text-amber-700/60">Заметок пока нет</div>}
            {(t.notes || []).map((n: any, i: number) => (
              <div key={i} className="rounded-xl bg-white/70 px-3 py-1.5 text-sm">
                <span className="font-semibold text-amber-700">{n.author}: </span>
                <span className="text-lilac-800">{n.body}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" placeholder="Добавить заметку для коллег и оператора" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-soft" disabled={busy || !note.trim()} onClick={() => run(async () => { await api.post(`/api/expert/tickets/${id}/note`, { body: note }); setNote(""); })}>Добавить</button>
          </div>
        </div>

        {/* Совместная работа */}
        <div className="grid gap-3 border-t border-lilac-100 pt-3 sm:grid-cols-2">
          <div>
            <label className="label">Подключить соисполнителя</label>
            <div className="flex gap-2">
              <select className="input py-2" value={collabId} onChange={(e) => setCollabId(Number(e.target.value))}>
                <option value={0}>Выбрать коллегу…</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.group_ru}</option>
                ))}
              </select>
              <button className="btn-soft" disabled={!collabId || busy} onClick={() => run(() => api.post(`/api/expert/tickets/${id}/collaborator`, { staff_id: collabId }))}>Добавить</button>
            </div>
          </div>
          <div>
            <label className="label">Запросить передачу</label>
            {showTransfer ? (
              <div className="flex gap-2">
                <input className="input py-2" placeholder="Причина передачи" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
                <button className="btn-soft" disabled={!transferReason.trim() || busy} onClick={() => run(async () => { await api.post(`/api/expert/tickets/${id}/transfer`, { reason: transferReason }); setTransferReason(""); setShowTransfer(false); })}>Запросить</button>
              </div>
            ) : (
              <button className="btn-ghost" onClick={() => setShowTransfer(true)}>Запросить передачу другому специалисту</button>
            )}
            <p className="mt-1 text-xs text-lilac-400">Передачу подтверждает оператор.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
