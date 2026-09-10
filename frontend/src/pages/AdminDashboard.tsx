import { useEffect, useState } from "react";
import { StaffShell } from "../components/Layout";
import { Banner, Card, Modal, PriorityBadge, Spinner, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { APPLICANT_LABEL } from "../lib/types";

type Tab = "categories" | "routing" | "staff" | "tickets";

const GROUPS = [
  { v: "psychologist", l: "Психологи" },
  { v: "conflictologist", l: "Конфликтологи" },
  { v: "lawyer", l: "Юристы" },
  { v: "social_teacher", l: "Социальные педагоги" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("categories");
  const [alerts, setAlerts] = useState<any>(null);

  useEffect(() => {
    api.get("/api/admin/alerts").then(setAlerts).catch(() => {});
  }, [tab]);

  return (
    <StaffShell>
      <h1 className="mb-4 text-2xl font-extrabold text-lilac-900">Администрирование</h1>

      {alerts && (alerts.unrouted?.length > 0 || alerts.overloaded_groups?.length > 0) && (
        <div className="mb-5">
          <Banner tone="warn">
            <div className="text-sm">
              {alerts.unrouted?.length > 0 && (
                <div>⚠ Без исполнителя: {alerts.unrouted.length} обращений (нет подходящих экспертов в группе).</div>
              )}
              {alerts.overloaded_groups?.length > 0 && (
                <div>⚠ Перегружены группы: {alerts.overloaded_groups.map((g: any) => g.group_ru).join(", ")}.</div>
              )}
            </div>
          </Banner>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-1">
        {(["categories", "routing", "staff", "tickets"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === tb ? "bg-lilac-500 text-white shadow-soft" : "bg-white/70 text-lilac-600 hover:bg-lilac-50"}`}
          >
            {tb === "categories" ? "Категории" : tb === "routing" ? "Маршрутизация" : tb === "staff" ? "Сотрудники" : "Обращения"}
          </button>
        ))}
      </div>

      {tab === "categories" && <Categories />}
      {tab === "routing" && <Routing />}
      {tab === "staff" && <StaffMgr />}
      {tab === "tickets" && <TicketsMgr />}
    </StaffShell>
  );
}

function Categories() {
  const [list, setList] = useState<any[]>([]);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [isFree, setIsFree] = useState(false);

  async function load() {
    setList(await api.get("/api/admin/categories"));
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!slug.trim() || !title.trim()) return;
    await api.post("/api/admin/categories", { slug: slug.trim(), title: title.trim(), is_free_text: isFree, sort_order: list.length + 1 });
    setSlug("");
    setTitle("");
    setIsFree(false);
    load();
  }

  async function toggle(c: any) {
    await api.put(`/api/admin/categories/${c.id}`, { title: c.title, is_free_text: c.is_free_text, sort_order: c.sort_order, active: !c.active });
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 font-bold text-lilac-900">Новая категория</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="slug (латиницей)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input className="input" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-lilac-700">
            <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
            «Не знаю, как назвать» (свободное описание)
          </label>
        </div>
        <button className="btn-primary mt-3" onClick={add}>Добавить</button>
      </Card>

      <div className="grid gap-2">
        {list.map((c) => (
          <Card key={c.id} className="flex items-center justify-between py-3">
            <div>
              <span className="font-semibold text-lilac-900">{c.title}</span>
              <span className="ml-2 text-xs text-lilac-400">{c.slug}</span>
              {c.is_free_text && <span className="ml-2 rounded-full bg-lilac-100 px-2 py-0.5 text-xs text-lilac-600">свободное описание</span>}
            </div>
            <button className={`chip ${c.active ? "border-emerald-300 text-emerald-600" : "border-gray-300 text-gray-400"}`} onClick={() => toggle(c)}>
              {c.active ? "активна" : "скрыта"}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Routing() {
  const [rules, setRules] = useState<any[]>([]);

  async function load() {
    const d = await api.get("/api/admin/routing");
    setRules(d.rules);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(categoryId: number, group: string, limit: number) {
    await api.put(`/api/admin/routing/${categoryId}`, { specialist_group: group, load_limit: limit });
    load();
  }

  return (
    <Card>
      <div className="mb-3 font-bold text-lilac-900">Правила: категория → группа специалистов + лимит нагрузки</div>
      <div className="space-y-2">
        {rules.map((r) => (
          <RoutingRow key={r.category_id} r={r} onSave={save} />
        ))}
      </div>
    </Card>
  );
}

function RoutingRow({ r, onSave }: { r: any; onSave: (c: number, g: string, l: number) => void }) {
  const [group, setGroup] = useState(r.specialist_group || "psychologist");
  const [limit, setLimit] = useState(r.load_limit || 10);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/60 p-2">
      <span className="min-w-[180px] font-semibold text-lilac-800">{r.category}</span>
      <select className="input w-auto py-1.5" value={group} onChange={(e) => setGroup(e.target.value)}>
        {GROUPS.map((g) => (
          <option key={g.v} value={g.v}>{g.l}</option>
        ))}
      </select>
      <label className="text-sm text-lilac-600">лимит</label>
      <input className="input w-20 py-1.5" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
      <button className="btn-soft py-1.5" onClick={() => onSave(r.category_id, group, limit)}>Сохранить</button>
    </div>
  );
}

function StaffMgr() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ login: "", password: "", display_name: "", role: "expert", specialist_group: "psychologist", voice_label: "", active_limit: 10 });

  async function load() {
    setList(await api.get("/api/admin/staff"));
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!form.login || !form.password || !form.display_name) return;
    await api.post("/api/admin/staff", form);
    setForm({ ...form, login: "", password: "", display_name: "", voice_label: "" });
    load();
  }

  async function toggle(s: any) {
    await api.put(`/api/admin/staff/${s.id}`, { ...s, display_name: s.name, active: !s.active });
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 font-bold text-lilac-900">Новая учётная запись</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Логин" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <input className="input" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="input" placeholder="Отображаемое имя" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="operator">Оператор</option>
            <option value="expert">Эксперт</option>
            <option value="admin">Администратор</option>
          </select>
          {form.role === "expert" && (
            <>
              <select className="input" value={form.specialist_group} onChange={(e) => setForm({ ...form, specialist_group: e.target.value })}>
                {GROUPS.map((g) => (
                  <option key={g.v} value={g.v}>{g.l}</option>
                ))}
              </select>
              <input className="input" placeholder="Голос для заявителя (напр. «Психолог»)" value={form.voice_label} onChange={(e) => setForm({ ...form, voice_label: e.target.value })} />
            </>
          )}
        </div>
        <button className="btn-primary mt-3" onClick={add}>Создать и выдать права</button>
      </Card>

      <div className="grid gap-2">
        {list.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <span className="font-semibold text-lilac-900">{s.name}</span>
              <span className="ml-2 text-xs text-lilac-400">{s.login} · {roleRU(s.role)}{s.specialist_group ? ` · ${groupRU(s.specialist_group)}` : ""}</span>
            </div>
            <button className={`chip ${s.active ? "border-emerald-300 text-emerald-600" : "border-gray-300 text-gray-400"}`} onClick={() => toggle(s)}>
              {s.active ? "активен" : "отключён"}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TicketsMgr() {
  const [list, setList] = useState<any[]>([]);
  const [experts, setExperts] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [l, ex, esc] = await Promise.all([
      api.get("/api/admin/tickets"),
      api.get("/api/operator/experts"),
      api.get("/api/admin/escalations").catch(() => []),
    ]);
    setList(l);
    setExperts(ex);
    setEscalations(esc);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="grid gap-2">
      {escalations.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/50">
          <div className="mb-2 font-bold text-rose-700">Эскалации во внешнее реагирование</div>
          <div className="space-y-1 text-sm">
            {escalations.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/60 px-2 py-1">
                <span className="font-bold text-lilac-900">#{e.ticket_id}</span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">{e.status}</span>
                {e.has_contact && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">есть контакт</span>}
                <span className="text-lilac-700">{e.reason}</span>
                <span className="ml-auto text-xs text-lilac-400">{e.by} · {new Date(e.created_at).toLocaleString("ru-RU")}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {list.map((t) => (
        <Card key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-lilac-900">#{t.id}</span>
              <StatusBadge status={t.status} label={t.status_ru} />
              <PriorityBadge priority={t.priority} />
              {t.is_crisis && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">кризис</span>}
              {t.escalated && <span className="rounded-full bg-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700">эскалация</span>}
              {t.stalled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">завис</span>}
            </div>
            <div className="mt-1 text-sm text-lilac-500">
              {APPLICANT_LABEL[t.applicant_type as keyof typeof APPLICANT_LABEL]} · {t.category || "—"} · исполнитель: {t.expert || "—"}
            </div>
          </div>
          <button className="btn-ghost py-2" onClick={() => setOpenId(t.id)}>Вмешаться / журнал</button>
        </Card>
      ))}
      {openId != null && <OverrideModal id={openId} experts={experts} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function OverrideModal({ id, experts, onClose, onChanged }: { id: number; experts: any[]; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [expertId, setExpertId] = useState(0);
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadAudit() {
    setAudit(await api.get(`/api/admin/audit?ticket_id=${id}`));
  }
  useEffect(() => {
    loadAudit();
  }, [id]);

  async function apply() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/tickets/${id}/override`, {
        status: status || undefined,
        priority: priority || undefined,
        expert_id: expertId || undefined,
        reason,
      });
      setReason("");
      await loadAudit();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Обращение #${id} · вмешательство администратора`}>
      <div className="space-y-4">
        <Banner tone="info">
          <div className="text-sm">Администратор не участвует в переписке и не закрывает обращение. Любое изменение фиксируется в журнале с причиной.</div>
        </Banner>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="input py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Статус (не менять)</option>
            {["new", "distributed", "in_progress", "need_clarification", "answer_ready", "returned", "done", "rejected"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="input py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Приоритет (не менять)</option>
            <option value="urgent">Срочно</option>
            <option value="standard">Стандарт</option>
            <option value="low">Низкий</option>
          </select>
          <select className="input py-2" value={expertId} onChange={(e) => setExpertId(Number(e.target.value))}>
            <option value={0}>Исполнитель (не менять)</option>
            {experts.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <input className="input" placeholder="Причина (обязательно)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn-primary" disabled={busy || !reason.trim()} onClick={apply}>Применить и записать в журнал</button>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-lilac-400">Журнал обращения</div>
          <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {audit.map((a) => (
              <div key={a.id} className="rounded-lg bg-white/60 px-2 py-1">
                <span className="text-lilac-400">{new Date(a.created_at).toLocaleString("ru-RU")}</span>{" "}
                <span className="font-semibold text-lilac-700">[{a.actor_kind}{a.actor ? ` · ${a.actor}` : ""}]</span>{" "}
                <span className="text-lilac-800">{a.action}</span>
                {a.details && <span className="text-lilac-500"> — {a.details}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function roleRU(r: string) {
  return r === "operator" ? "оператор" : r === "expert" ? "эксперт" : "администратор";
}
function groupRU(g: string) {
  return GROUPS.find((x) => x.v === g)?.l || g;
}
