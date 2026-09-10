import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./ui";
import { getStaff, logout } from "../lib/auth";

export function PublicShell({
  children,
  compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-page items-center justify-between px-5 py-5">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex">
          <a href="/#how" className="nav-link">Как это работает</a>
          <a href="/#help" className="nav-link">Помощь</a>
          <a href="/#about" className="nav-link">О нас</a>
          <Link to="/login" className="btn-ghost py-2 px-5">Войти</Link>
        </nav>
        <button
          className="inline-flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl border border-lilac-200 md:hidden"
          aria-label="Меню"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="block h-0.5 w-5 bg-lilac-800" />
          <span className="block h-0.5 w-5 bg-lilac-800" />
          <span className="block h-0.5 w-5 bg-lilac-800" />
        </button>
      </header>
      {open && (
        <div className="mx-auto flex max-w-page flex-col gap-3 px-5 pb-4 md:hidden">
          <a href="/#how" className="nav-link" onClick={() => setOpen(false)}>Как это работает</a>
          <a href="/#help" className="nav-link" onClick={() => setOpen(false)}>Помощь</a>
          <a href="/#about" className="nav-link" onClick={() => setOpen(false)}>О нас</a>
          <Link to="/login" className="btn-ghost w-fit py-2" onClick={() => setOpen(false)}>Войти</Link>
        </div>
      )}
      <main className={`mx-auto max-w-page px-5 ${compact ? "pb-10" : "pb-20"}`}>{children}</main>
    </div>
  );
}

const NAV: { to: string; label: string; roles: string[] }[] = [
  { to: "/operator", label: "Оператор", roles: ["operator", "admin"] },
  { to: "/expert", label: "Мои обращения", roles: ["expert"] },
  { to: "/admin", label: "Администрирование", roles: ["admin"] },
  { to: "/analytics", label: "Аналитика", roles: ["operator", "expert", "admin"] },
];

export function StaffShell({ children }: { children: ReactNode }) {
  const staff = getStaff();
  const nav = useNavigate();
  const loc = useLocation();
  const items = NAV.filter((n) => staff && n.roles.includes(staff.role));
  return (
    <div className="min-h-full">
      <header className="border-b border-lilac-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="flex flex-wrap gap-1">
              {items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    loc.pathname === n.to ? "bg-lilac-100 text-lilac-800" : "text-lilac-600 hover:bg-lilac-50"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-lilac-700">
              {staff?.name} · <span className="text-lilac-400">{roleRU(staff?.role)}</span>
            </span>
            <button
              className="btn-ghost py-2"
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
    </div>
  );
}

function roleRU(r?: string) {
  return r === "operator" ? "оператор" : r === "expert" ? "эксперт" : r === "admin" ? "администратор" : "";
}
