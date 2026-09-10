export function FloralStrip({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 720 72" className={className} aria-hidden>
      {[
        [28, 48],
        [78, 40],
        [128, 52],
        [176, 38],
        [228, 50],
        [278, 36],
        [332, 54],
        [384, 40],
        [438, 50],
        [490, 36],
        [544, 52],
        [598, 40],
        [652, 48],
        [696, 42],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <line x1="0" y1="0" x2="0" y2="14" stroke="#8fbf93" strokeWidth="1.6" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse
              key={a}
              cx={Math.cos((a * Math.PI) / 180) * 5.5}
              cy={Math.sin((a * Math.PI) / 180) * 5.5 - 8}
              rx="2.4"
              ry="4.4"
              fill="#fff"
              stroke="#efe8d8"
              strokeWidth="0.4"
              transform={`rotate(${a})`}
            />
          ))}
          <circle cx="0" cy="-8" r="2.5" fill="#f2c94c" />
        </g>
      ))}
    </svg>
  );
}

export function CheckMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" className={className} aria-hidden>
      <circle cx="36" cy="36" r="34" fill="#6b4fd4" />
      <path d="M22 37.5l9 9 19-22" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PaperclipIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M8 12.5l7.2-7.2a3.4 3.4 0 014.8 4.8L10.2 20.5a4.6 4.6 0 01-6.5-6.5L15 2.8" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ className = "h-4 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

export function ScanIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M7 4H5a1 1 0 00-1 1v2M17 4h2a1 1 0 011 1v2M7 20H5a1 1 0 01-1-1v-2M17 20h2a1 1 0 001-1v-2M4 12h16" strokeLinecap="round" />
    </svg>
  );
}

export function BrainIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M8.5 6.2a3 3 0 015 0 3 3 0 014.2 3.6A3.2 3.2 0 0119 14.5 3 3 0 0116 18H8a3 3 0 01-3-3.5 3.2 3.2 0 011.3-4.7A3 3 0 018.5 6.2z" />
      <path d="M12 7.5v9M9 12h3M12 10h3" strokeLinecap="round" />
    </svg>
  );
}

export function UsersIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.4-3.2 2.8-5.2 5.5-5.2s5.1 2 5.5 5.2" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.2 14.2c2 .4 3.5 2.1 3.8 4.8" strokeLinecap="round" />
    </svg>
  );
}
