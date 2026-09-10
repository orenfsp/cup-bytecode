import { useEffect, useState } from "react";
import { StaffShell } from "../components/Layout";
import { Card, Spinner } from "../components/ui";
import { api, getToken } from "../lib/api";
import { getStaff } from "../lib/auth";

const APPLICANT_RU: Record<string, string> = { student: "Школьники", parent: "Родители", teacher: "Педагоги" };
const STATUS_RU: Record<string, string> = {
  new: "Новое", distributed: "Распределено", in_progress: "В работе",
  need_clarification: "Нужно уточнение", answer_ready: "Ответ готов", returned: "Возвращено",
  done: "Завершено", rejected: "Отклонено", closed_no_answer: "Закрыто без ответа",
};

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const role = getStaff()?.role;

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    setData(await api.get(`/api/analytics/dashboard?${p.toString()}`));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function exportCsv() {
    const p = new URLSearchParams({ format: "csv" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const res = await fetch(`/api/analytics/export?${p.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "otklik_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <StaffShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-lilac-900">Аналитика {role !== "admin" && <span className="text-sm font-normal text-lilac-500">(по себе)</span>}</h1>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">С</label>
            <input type="date" className="input py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">По</label>
            <input type="date" className="input py-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn-soft py-2" onClick={load}>Применить</button>
          <button className="btn-primary py-2" onClick={exportCsv}>Выгрузить CSV</button>
        </div>
      </div>

      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Всего обращений" value={data.total} />
            <Metric title="Доля срочных" value={`${data.urgent_share.toFixed(0)}%`} />
            <Metric title="Доля возвратов" value={`${data.returns_share.toFixed(0)}%`} />
            <Metric title="Доля кризисных" value={`${data.crisis_share.toFixed(0)}%`} />
            <Metric title="Ср. время до принятия" value={fmtMin(data.avg_minutes_to_accept)} />
            <Metric title="Ср. время до 1-го ответа" value={fmtMin(data.avg_minutes_to_first_response)} />
            <Metric title="Ср. время до закрытия" value={fmtMin(data.avg_minutes_to_close)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarCard title="По категориям" data={data.by_category} />
            <BarCard title="По статусам" data={mapKeys(data.by_status, STATUS_RU)} />
            <BarCard title="По типам заявителей" data={mapKeys(data.by_applicant_type, APPLICANT_RU)} />
            {role === "admin" && <BarCard title="Нагрузка на экспертов" data={data.load_experts} />}
            {role === "admin" && <BarCard title="Нагрузка на операторов" data={data.load_operators} />}
          </div>
        </div>
      )}
    </StaffShell>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <Card className="py-4">
      <div className="text-sm text-lilac-500">{title}</div>
      <div className="mt-1 text-3xl font-extrabold text-lilac-900">{value}</div>
    </Card>
  );
}

function BarCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <Card>
      <div className="mb-3 font-bold text-lilac-900">{title}</div>
      {entries.length === 0 ? (
        <div className="text-sm text-lilac-400">Нет данных</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span className="text-lilac-700">{k}</span>
                <span className="font-semibold text-lilac-900">{v}</span>
              </div>
              <div className="h-2 rounded-full bg-lilac-100">
                <div className="h-2 rounded-full bg-gradient-to-r from-lilac-400 to-lilac-600" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function mapKeys(obj: Record<string, number>, dict: Record<string, string>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj || {})) out[dict[k] || k] = v;
  return out;
}

function fmtMin(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${Math.round(m)} мин`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)} ч`;
  return `${(h / 24).toFixed(1)} дн`;
}
