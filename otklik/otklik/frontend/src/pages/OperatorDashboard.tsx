import { useEffect, useState } from "react";
import { StaffShell } from "../components/Layout";
import { Banner, Card, Modal, PriorityBadge, Spinner, StatusBadge, waitingLabel } from "../components/ui";
import { api } from "../lib/api";
import { APPLICANT_LABEL } from "../lib/types";

type Tab = "queue" | "distributed" | "transfers" | "complaints";

interface QueueItem {
  id: number;
  applicant_type: string;
  status: string;
  status_ru: string;
  priority: string;
  is_crisis: boolean;
  return_count: number;
  created_at: string;
  waiting_minutes: number;
  category: string | null;
  suggested_category: string | null;
  suggested_category_id: number | null;
}

export default function OperatorDashboard() {
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [distributed, setDistributed] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [experts, setExperts] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [q, d, tr, c, ex] = await Promise.all([
      api.get("/api/operator/queue"),
      api.get("/api/operator/distributed"),
      api.get("/api/operator/transfers"),
      api.get("/api/operator/complaints"),
      api.get("/api/operator/experts"),
    ]);
    setQueue(q.tickets);
    setOverdue(q.overdue);
    setDistributed(d);
    setTransfers(tr);
    setComplaints(c);
    setExperts(ex);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const crisis = queue.filter((t) => t.is_crisis);
  const normal = queue.filter((t) => !t.is_crisis);

  return (
    <StaffShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-lilac-900">Рабочее место оператора</h1>
        <div className="flex gap-2 text-sm">
          {overdue > 0 && (
            <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-600">Просрочено: {overdue}</span>
          )}
          <button className="btn-ghost py-2" onClick={refresh}>Обновить</button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1">
        <TabBtn active={tab === "queue"} onClick={() => setTab("queue")}>Очередь новых ({queue.length})</TabBtn>
        <TabBtn active={tab === "distributed"} onClick={() => setTab("distributed")}>Распределённые ({distributed.length})</TabBtn>
        <TabBtn active={tab === "transfers"} onClick={() => setTab("transfers")}>Передачи ({transfers.length})</TabBtn>
        <TabBtn active={tab === "complaints"} onClick={() => setTab("complaints")}>Жалобы ({complaints.length})</TabBtn>
      </div>

      {loading ? (
        <Spinner />
      ) : tab === "queue" ? (
        <div className="space-y-5">
          {crisis.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 font-bold text-rose-600">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100">!</span>
                Кризисные обращения — вне очереди
              </div>
              <div className="grid gap-3">
                {crisis.map((t) => (
                  <QueueCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3">
            {normal.length === 0 && crisis.length === 0 && <Empty text="Новых обращений нет" />}
            {normal.map((t) => (
              <QueueCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />
            ))}
          </div>
        </div>
      ) : tab === "distributed" ? (
        <div className="grid gap-3">
          {distributed.length === 0 && <Empty text="Пока нет распределённых обращений" />}
          {distributed.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lilac-900">#{t.id}</span>
                  <StatusBadge status={t.status} label={t.status_ru} />
                  <PriorityBadge priority={t.priority} />
                  {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
                  {t.stalled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">завис</span>}
                </div>
                <div className="mt-1 text-sm text-lilac-600">
                  {APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]} · {t.category || "без категории"} · исполнитель: {t.expert || "—"}
                </div>
              </div>
              <span className="text-xs text-lilac-400">переписку оператор не видит</span>
            </Card>
          ))}
        </div>
      ) : tab === "transfers" ? (
        <Transfers transfers={transfers} experts={experts} onDone={refresh} />
      ) : (
        <div className="grid gap-3">
          {complaints.length === 0 && <Empty text="Жалоб нет" />}
          {complaints.map((c) => (
            <Card key={c.id}>
              <div className="text-sm text-lilac-500">Обращение #{c.ticket_id} · {new Date(c.created_at).toLocaleString("ru-RU")}</div>
              <p className="mt-1 text-lilac-800">{c.body}</p>
            </Card>
          ))}
        </div>
      )}

      {openId != null && (
        <OperatorTicketModal id={openId} experts={experts} onClose={() => setOpenId(null)} onChanged={refresh} />
      )}
    </StaffShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? "bg-lilac-500 text-white shadow-soft" : "bg-white/70 text-lilac-600 hover:bg-lilac-50"}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-lilac-200 p-8 text-center text-lilac-400">{text}</div>;
}

function QueueCard({ t, onOpen }: { t: QueueItem; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`card p-4 text-left transition hover:shadow-lg ${t.is_crisis ? "border-rose-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-lilac-900">#{t.id}</span>
        <StatusBadge status={t.status} label={t.status_ru} />
        <PriorityBadge priority={t.priority} />
        {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
        {t.return_count > 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">возврат ×{t.return_count}</span>}
        <span className="ml-auto text-xs text-lilac-400">ожидает {waitingLabel(t.waiting_minutes)}</span>
      </div>
      <div className="mt-2 text-sm text-lilac-600">
        {APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]} ·{" "}
        {t.category || <span className="text-lilac-400">категория не задана</span>}
        {t.suggested_category && <span className="ml-1 text-lilac-400">(подсказка: {t.suggested_category})</span>}
      </div>
    </button>
  );
}

function Transfers({ transfers, experts, onDone }: { transfers: any[]; experts: any[]; onDone: () => void }) {
  async function resolve(id: number, approve: boolean, toExpert?: number) {
    await api.post(`/api/operator/transfers/${id}/resolve`, { approve, to_expert_id: toExpert || 0 });
    onDone();
  }
  return (
    <div className="grid gap-3">
      {transfers.length === 0 && <Empty text="Запросов на передачу нет" />}
      {transfers.map((tr) => (
        <Card key={tr.id}>
          <div className="text-sm text-lilac-500">Обращение #{tr.ticket_id} · от «{tr.from}»</div>
          <p className="mt-1 text-lilac-800">Причина: {tr.reason}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ExpertSelect experts={experts} onPick={(id) => resolve(tr.id, true, id)} label="Подтвердить и назначить" />
            <button className="btn-ghost" onClick={() => resolve(tr.id, false)}>Отклонить</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ExpertSelect({ experts, onPick, label }: { experts: any[]; onPick: (id: number) => void; label: string }) {
  const [id, setId] = useState<number>(0);
  return (
    <div className="flex items-center gap-2">
      <select className="input py-2" value={id} onChange={(e) => setId(Number(e.target.value))}>
        <option value={0}>Выбрать исполнителя…</option>
        {experts.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} — {e.group_ru} (нагрузка {e.load}/{e.active_limit}){e.overloaded ? " ⚠" : ""}
          </option>
        ))}
      </select>
      <button className="btn-primary py-2" disabled={!id} onClick={() => onPick(id)}>{label}</button>
    </div>
  );
}

function EscalateBlock({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/operator/tickets/${id}/escalate`, { reason: reason.trim() });
      setToken(res.channel_token || "");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <Banner tone="crisis">
        <div className="text-sm">
          Обращение эскалировано во внешнее реагирование. Одноразовый защищённый токен канала:{" "}
          <span className="font-mono font-bold">{token}</span>. Он записан в журнал; передайте его по регламенту.
        </div>
      </Banner>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
      {!open ? (
        <button className="btn-ghost border-rose-300 text-rose-700" onClick={() => setOpen(true)}>
          Требуется внешнее реагирование (эскалация)
        </button>
      ) : (
        <div>
          <div className="label text-rose-700">Причина эскалации во внешнее реагирование</div>
          <textarea className="input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" disabled={busy || !reason.trim()} onClick={submit}>Эскалировать</button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Карточка обращения оператора ---
function OperatorTicketModal({ id, experts, onClose, onChanged }: { id: number; experts: any[]; onClose: () => void; onChanged: () => void }) {
  const [t, setT] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectKind, setRejectKind] = useState("out_of_scope");
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");

  async function load() {
    const [d, cats] = await Promise.all([api.get(`/api/operator/tickets/${id}`), api.get("/api/admin/categories").catch(() => api.get("/api/categories"))]);
    setT(d);
    setCategories(cats);
  }
  useEffect(() => {
    load();
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

  const hint = t.routing_hint;
  const isReturned = t.status === "returned";

  return (
    <Modal open onClose={onClose} title={`Обращение #${id}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} label={t.status_ru} />
          <PriorityBadge priority={t.priority} />
          {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
          <span className="text-sm text-lilac-500">{APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]}</span>
        </div>

        {t.is_crisis && t.contact_info && (
          <Banner tone="crisis">
            <div className="text-sm"><b>Способ связи (только по кризису):</b> {t.contact_info}</div>
          </Banner>
        )}

        {t.is_crisis && <EscalateBlock id={id} onChanged={() => run(async () => {})} />}

        <div>
          <div className="text-xs font-semibold uppercase text-lilac-400">Текст обращения</div>
          <p className="mt-1 whitespace-pre-wrap text-lilac-800">{t.free_text}</p>
        </div>

        {t.clarifying_answers && Object.keys(t.clarifying_answers).length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase text-lilac-400">Ответы на уточняющие вопросы</div>
            <ul className="mt-1 text-sm text-lilac-700">
              {Object.entries(t.clarifying_answers).map(([k, v]) => (
                <li key={k}>• {String(v)}</li>
              ))}
            </ul>
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

        {/* Подсказка системы */}
        <Banner tone="info">
          <div className="text-sm">
            <b>Подсказка системы:</b> {hint?.message}
            {hint?.none_found && <span className="ml-1 font-bold text-rose-600">Требует внимания администратора.</span>}
          </div>
        </Banner>

        {/* Управление */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Категория</label>
            <select
              className="input py-2"
              value={t.category_id || 0}
              onChange={(e) => run(() => api.post(`/api/operator/tickets/${id}/category`, { category_id: Number(e.target.value) }))}
            >
              <option value={0}>— не выбрана —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Приоритет</label>
            <select
              className="input py-2"
              value={t.priority}
              onChange={(e) => run(() => api.post(`/api/operator/tickets/${id}/priority`, { priority: e.target.value }))}
            >
              <option value="urgent">Срочно</option>
              <option value="standard">Стандарт</option>
              <option value="low">Низкий</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">{isReturned ? "Возврат: переназначить исполнителя" : "Назначить исполнителя"}</label>
          <ExpertSelect
            experts={experts}
            label={isReturned ? "Переназначить" : "Назначить"}
            onPick={(eid) =>
              run(() =>
                isReturned
                  ? api.post(`/api/operator/tickets/${id}/return-resolve`, { action: "reassign", expert_id: eid })
                  : api.post(`/api/operator/tickets/${id}/assign`, { expert_id: eid })
              )
            }
          />
        </div>

        {/* Ответить и закрыть самому */}
        {replyOpen ? (
          <div className="rounded-2xl bg-lilac-50 p-3">
            <label className="label">Ответ заявителю (от лица сервиса)</label>
            <textarea className="input min-h-[80px]" value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" disabled={busy || !reply.trim()} onClick={() => run(async () => { await api.post(`/api/operator/tickets/${id}/reply-close`, { message: reply }); onClose(); })}>Отправить ответ</button>
              <button className="btn-ghost" onClick={() => setReplyOpen(false)}>Отмена</button>
            </div>
          </div>
        ) : rejectOpen ? (
          <div className="rounded-2xl bg-rose-50 p-3">
            <label className="label">Причина отклонения</label>
            <select className="input mb-2 py-2" value={rejectKind} onChange={(e) => setRejectKind(e.target.value)}>
              <option value="spam">Спам / дубль</option>
              <option value="out_of_scope">Вне компетенции сервиса</option>
            </select>
            <textarea className="input min-h-[70px]" placeholder="Что написать заявителю и куда обратиться" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" disabled={busy || !rejectReason.trim()} onClick={() => run(async () => { await api.post(`/api/operator/tickets/${id}/reject`, { reason: rejectReason, kind: rejectKind }); onClose(); })}>Отклонить</button>
              <button className="btn-ghost" onClick={() => setRejectOpen(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-lilac-100 pt-3">
            <button className="btn-soft" onClick={() => setReplyOpen(true)}>Ответить и закрыть самому</button>
            {isReturned ? (
              <button className="btn-ghost" onClick={() => run(async () => { await api.post(`/api/operator/tickets/${id}/return-resolve`, { action: "close", reason: "Закрыто оператором после возврата" }); onClose(); })}>Закрыть возврат</button>
            ) : (
              <button className="btn-ghost" onClick={() => setRejectOpen(true)}>Отклонить</button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
