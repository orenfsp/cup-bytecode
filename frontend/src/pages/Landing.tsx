import { Link } from "react-router-dom";
import { PublicShell } from "../components/Layout";
import { BrainIcon } from "../components/Decor";
import { ShieldIcon, UserIcon } from "../components/ui";

export default function Landing() {
  return (
    <PublicShell>
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-lilac-900 md:text-5xl">
            Расскажи, что происходит
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-lilac-800/75">
            Ты не один. Мы рядом, чтобы выслушать и поддержать.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/new" className="btn-primary">
              Подать обращение →
            </Link>
            <Link to="/track" className="btn-ghost">
              У меня уже есть трек-номер
            </Link>
          </div>
        </div>
        <HeroArt />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Feature icon={<BrainIcon />} title="Мгновенный отклик" text="Мы быстро примем ваше обращение" />
        <Feature icon={<ShieldIcon className="h-6 w-6" />} title="Конфиденциально" text="Всё, что вы расскажете, под защитой" />
        <Feature icon={<UserIcon className="h-6 w-6" />} title="Профессионально" text="Ответят специалисты рядом с вами" />
      </section>

      <section id="how" className="mt-14 scroll-mt-8">
        <h2 className="mb-6 text-center text-2xl font-extrabold text-lilac-900">Как это работает?</h2>
        <div className="grid items-start gap-4 sm:grid-cols-4">
          <Step n={1} title="Оставляете обращение" />
          <Step n={2} title="Мы находим специалиста" />
          <Step n={3} title="Получаете ответ и поддержку" />
          <Step n={4} title="Вы не одни на этом пути" />
        </div>
      </section>

      <section id="help" className="mt-14 scroll-mt-8">
        <div className="card grid items-center gap-6 p-6 md:grid-cols-[1.2fr_1fr] md:p-8">
          <div>
            <h2 className="text-2xl font-extrabold text-lilac-900">Помощь рядом</h2>
            <p className="mt-2 text-lilac-800/75">
              Если опасно прямо сейчас — звоните 112. Можно продолжить рассказ здесь: обращение анонимно, без имени и телефона.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a className="btn-primary py-2" href="tel:112">112</a>
              <a className="btn-ghost py-2" href="tel:88002000122">8-800-2000-122</a>
            </div>
          </div>
          <img src="/art/together.jpg" alt="" className="h-44 w-full rounded-2xl object-cover md:h-52" />
        </div>
      </section>

      <section id="about" className="mt-10 scroll-mt-8">
        <div className="grid items-center gap-6 md:grid-cols-2">
          <img src="/art/bench.jpg" alt="" className="h-56 w-full rounded-3xl object-cover" />
          <div>
            <h2 className="text-2xl font-extrabold text-lilac-900">О нас</h2>
            <p className="mt-3 leading-relaxed text-lilac-800/75">
              Иногда достаточно просто быть рядом. «Рядом» — бережный канал к психологу, конфликтологу, юристу или социальному педагогу. Мы не спрашиваем, кто вы, и не связываем обращения между собой.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function HeroArt() {
  return (
    <figure className="relative overflow-hidden rounded-[28px]">
      <img src="/art/cats-sunset.jpg" alt="Два кота смотрят на закат" className="h-64 w-full object-cover md:h-80" />
      <figcaption className="pointer-events-none absolute bottom-4 left-5 right-5 font-serif text-[15px] italic text-white/95 drop-shadow">
        Иногда достаточно просто быть рядом
      </figcaption>
    </figure>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card flex items-start gap-3 p-5">
      <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lilac-50 text-lilac-600">
        {icon}
      </span>
      <div>
        <div className="font-bold text-lilac-900">{title}</div>
        <div className="text-sm text-lilac-700/80">{text}</div>
      </div>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      {n < 4 && (
        <div className="absolute left-[58%] top-5 hidden h-px w-[84%] bg-lilac-200 sm:block" />
      )}
      <div className="relative z-[1] mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-lilac-200 bg-white text-sm font-extrabold text-lilac-600">
        {n}
      </div>
      <div className="max-w-[180px] text-sm font-semibold leading-snug text-lilac-800">{title}</div>
    </div>
  );
}
