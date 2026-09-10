import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CrisisContact } from "../lib/types";
import { HeartIcon } from "./ui";

export function CrisisHelp({ compact = false }: { compact?: boolean }) {
  const [contacts, setContacts] = useState<CrisisContact[]>([]);
  useEffect(() => {
    api.get("/api/crisis-contacts").then(setContacts).catch(() => {});
  }, []);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
      <div className="mb-2 flex items-center gap-2 font-bold text-rose-700">
        <HeartIcon className="h-4 w-4" />
        Если тяжело прямо сейчас — помощь рядом
      </div>
      {!compact && (
        <p className="mb-3 text-sm text-rose-700/90">
          Ты можешь продолжить рассказ, это не прервётся. А пока — контакты, куда можно
          обратиться немедленно:
        </p>
      )}
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.phone} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className="font-bold text-rose-700 underline">
              {c.phone}
            </a>
            <span className="font-semibold text-rose-800">{c.title}</span>
            <span className="text-rose-700/70">— {c.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
