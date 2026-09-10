import { useState } from "react";
import { PublicShell } from "../components/Layout";
import { FloralStrip } from "../components/Decor";
import { api, ApiError } from "../lib/api";
import { homeForRole, saveSession } from "../lib/auth";

const DEMO = [
  { login: "operator", pass: "operator123", label: "Оператор" },
  { login: "psycholog", pass: "expert123", label: "Эксперт (психолог)" },
  { login: "jurist", pass: "expert123", label: "Эксперт (юрист)" },
  { login: "admin", pass: "admin123", label: "Администратор" },
];

export default function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(l = login, p = password) {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/api/auth/login", { login: l, password: p });
      saveSession(res.token, res.staff);
      window.location.href = homeForRole(res.staff.role);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell compact>
      <div className="mx-auto max-w-md">
        <div className="card overflow-hidden">
          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-extrabold text-lilac-900">Вход для сотрудников</h1>
            <p className="mt-1 text-sm text-lilac-700/80">Оператор, эксперт или администратор.</p>
            <img src="/art/night.jpg" alt="" className="mt-4 h-28 w-full rounded-2xl object-cover" />
            <div className="mt-5 space-y-3">
              <div>
                <label className="label">Логин</label>
                <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} />
              </div>
              <div>
                <label className="label">Пароль</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
            </div>
            {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
            <button className="btn-primary mt-5 w-full" onClick={() => submit()} disabled={busy}>
              {busy ? "Входим…" : "Войти"}
            </button>
            <div className="mt-6 border-t border-lilac-100 pt-4">
              <div className="mb-2 text-sm font-semibold text-lilac-600">Тестовые учётные записи</div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.login}
                    className="rounded-xl border border-lilac-200 bg-white px-3 py-2 text-left text-sm hover:bg-lilac-50"
                    onClick={() => {
                      setLogin(d.login);
                      setPassword(d.pass);
                      submit(d.login, d.pass);
                    }}
                  >
                    <div className="font-semibold text-lilac-800">{d.label}</div>
                    <div className="text-xs text-lilac-500">{d.login}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <FloralStrip className="w-full bg-cream-50" />
        </div>
      </div>
    </PublicShell>
  );
}
