/**
 * Marque MyPNL : un carre arrondi vert, une courbe ascendante,
 * et le point du dernier releve. Lisible des 16 px.
 */
export function Marque({ taille = 28 }: { taille?: number }) {
  return (
    <svg
      width={taille} height={taille} viewBox="0 0 32 32"
      fill="none" aria-hidden
      className="shrink-0"
    >
      <rect width="32" height="32" rx="9" fill="url(#mypnl-fond)" />
      <path
        d="M7 21.5 L13 15.5 L17.5 19 L25 10.5"
        stroke="#04120c" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="25" cy="10.5" r="2.6" fill="#04120c" />
      <defs>
        <linearGradient id="mypnl-fond" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#4ade80" />
          <stop offset="1" stopColor="#10b981" />
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
        <span className="text-[15px] font-semibold tracking-tight text-texte">
          MyPNL
        </span>
      )}
    </span>
  );
}
