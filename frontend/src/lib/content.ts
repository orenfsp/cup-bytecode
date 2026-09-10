import type { ApplicantType } from "./types";

// Тон: со школьником на «ты», с родителем и педагогом — на «вы».
export function isInformal(t: ApplicantType | null): boolean {
  return t === "student";
}

export function tone(t: ApplicantType | null) {
  const informal = isInformal(t);
  return {
    informal,
    // выбор формы
    you: (a: string, b: string) => (informal ? a : b),
  };
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
}

// Лёгкий клиентский словарь для мгновенной подсказки о помощи (не блокирует ввод).
// Основная детекция — на сервере. Здесь только чтобы сразу показать контакты.
export const CRISIS_HINT_WORDS = [
  "суицид",
  "покончить",
  "не хочу жить",
  "хочу умереть",
  "убить себя",
  "убью себя",
  "повеситься",
  "вскрыть вены",
  "порезы",
  "режу себя",
  "насилие",
  "избили",
  "бьют",
  "бьёт",
  "бьет",
  "угрожают убить",
  "изнасил",
  "оружие",
  "с ножом",
  "исчезнуть навсегда",
  "лучше бы меня не было",
];

export function looksCrisis(text: string): boolean {
  const low = text.toLowerCase();
  return CRISIS_HINT_WORDS.some((w) => low.includes(w));
}

// 3–5 коротких необязательных вопросов для маршрутизации и приоритета.
export const CLARIFYING_QUESTIONS: ClarifyingQuestion[] = [
  {
    id: "where",
    question: "Где это происходит?",
    options: ["В школе", "В интернете", "Дома", "В другом месте"],
  },
  {
    id: "how_long",
    question: "Как давно это длится?",
    options: ["Только началось", "Пару недель", "Несколько месяцев", "Давно"],
  },
  {
    id: "who",
    question: "Кто участвует?",
    options: ["Один человек", "Несколько человек", "Взрослый", "Не хочу уточнять"],
  },
  {
    id: "asked_before",
    question: "Обращался ли уже к кому-то за помощью?",
    options: ["Нет, впервые", "Говорил с близкими", "Обращался в школу", "Да, но не помогло"],
  },
];
