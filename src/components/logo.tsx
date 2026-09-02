/**
 * Marque MyPNL : un carre arrondi vert, une courbe ascendante,
 * et le point du dernier releve. Lisible des 16 px.
 */
export function Marque({ taille = 26 }: { taille?: number }) {
  return (
    <svg
      width={taille} height={taille} viewBox="0 0 32 32"
      fill="none" aria-hidden
      className="shrink-0"
    >
      <rect width="32" height="32" rx="8" fill="url(#mypnl-fond)" />
      <path
        d="M7 21.5 L13 15.5 L17.5 19 L25 10.5"
        stroke="#08210b" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="25" cy="10.5" r="2.6" fill="#08210b" />
      <defs>
        <linearGradient id="mypnl-fond" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#5cf03a" />
          <stop offset="1" stopColor="#2dca02" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Marque />
      {!compact && (
        <span className="text-[14px] font-semibold tracking-[-0.02em] text-texte">
          MyPNL
        </span>
      )}
    </span>
  );
}
