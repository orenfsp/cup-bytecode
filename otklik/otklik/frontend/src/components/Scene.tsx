// Декоративная сцена «два кота в цветущем поле» — в духе макета.
export function MeadowScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 240" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Два кота в поле">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe8f9" />
          <stop offset="100%" stopColor="#f7eef1" />
        </linearGradient>
        <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7dcf3" />
          <stop offset="100%" stopColor="#d9ecdc" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#sky)" />
      <circle cx="320" cy="60" r="30" fill="#fbeede" />
      <path d="M0 170 Q120 120 220 160 T400 150 V240 H0 Z" fill="url(#hill)" />
      <path d="M0 200 Q140 170 260 195 T400 190 V240 H0 Z" fill="#cfe6d3" opacity="0.9" />

      {/* Кот тёмный */}
      <g transform="translate(150 118)">
        <ellipse cx="0" cy="52" rx="26" ry="8" fill="#000" opacity="0.06" />
        <path d="M-18 55 Q-22 10 0 8 Q22 10 18 55 Z" fill="#4b4258" />
        <path d="M-16 8 L-9 -12 L-2 6 Z" fill="#4b4258" />
        <path d="M16 8 L9 -12 L2 6 Z" fill="#4b4258" />
        <path d="M18 50 Q40 46 34 24" stroke="#4b4258" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>

      {/* Кот рыжий */}
      <g transform="translate(196 122)">
        <ellipse cx="0" cy="48" rx="24" ry="7" fill="#000" opacity="0.06" />
        <path d="M-16 50 Q-20 8 0 6 Q20 8 16 50 Z" fill="#e6a866" />
        <path d="M-14 6 L-8 -12 L-2 4 Z" fill="#e6a866" />
        <path d="M14 6 L8 -12 L2 4 Z" fill="#e6a866" />
        <path d="M-16 46 Q-38 42 -32 22" stroke="#e6a866" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>

      {/* Ромашки */}
      {[30, 70, 110, 260, 300, 340, 370].map((x, i) => (
        <g key={i} transform={`translate(${x} ${185 + (i % 3) * 8})`}>
          <line x1="0" y1="0" x2="0" y2="16" stroke="#8bbf8f" strokeWidth="2" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx={Math.cos((a * Math.PI) / 180) * 5} cy={Math.sin((a * Math.PI) / 180) * 5} rx="2.4" ry="4" fill="#fff" transform={`rotate(${a} 0 0)`} />
          ))}
          <circle cx="0" cy="0" r="2.4" fill="#f2c94c" />
        </g>
      ))}
    </svg>
  );
}
