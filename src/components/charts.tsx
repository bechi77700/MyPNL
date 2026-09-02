"use client";

import { useEffect, useRef, useState } from "react";
import { formaterMontant, formaterNombre } from "@/lib/periode";

/** Le formatage se fait ICI : on ne peut pas passer de fonction
 *  d'un composant serveur a un composant client. */
type Unite = "monnaie" | "nombre";

function faireFormat(unite: Unite, devise: string) {
  return (v: number) =>
    unite === "monnaie" ? formaterMontant(v, devise, true) : formaterNombre(Math.round(v));
}

/**
 * Libelles d'axe : toujours compacts (2,4 k / 1,2 M). Le format monetaire
 * complet deborde de la marge et se fait couper.
 */
function faireFormatAxe(unite: Unite, devise: string) {
  const compact = new Intl.NumberFormat("fr-FR", {
    notation: "compact", maximumFractionDigits: 1,
  });
  const symbole = unite === "monnaie"
    ? (0).toLocaleString("fr-FR", { style: "currency", currency: devise })
        .replace(/[\d\s,.\u00a0]/g, "")
    : "";
  return (v: number) => (v === 0 ? "0" : compact.format(v) + (symbole ? " " + symbole : ""));
}

/** Marge gauche calculee sur le libelle le plus large, pour ne rien couper. */
function margeGauche(labels: string[]) {
  const large = labels.reduce((a, l) => Math.max(a, l.length), 1);
  return Math.min(72, Math.max(30, large * 6.4 + 12));
}

const jourCourt = (x: string) =>
  new Date(x + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const moisCourt = (x: string) =>
  new Date(x + "T12:00:00Z").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

/** Palette categorielle validee pour notre fond sombre (#1a1a1a). */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const SURFACE = "#1a1a1a";
const GRILLE = "#242424";
const ACCENT = "#2dca02";
const NEGATIF = "#ff5f56";

function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  const [l, setL] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) => setL(e.contentRect.width));
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return [ref, l] as const;
}

function ticksY(max: number, n = 4) {
  if (max <= 0) return [0];
  const brut = max / n;
  const ordre = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * ordre).find((p) => p >= brut) ?? ordre * 10;
  const out: number[] = [];
  for (let v = 0; v <= max * 1.001; v += pas) out.push(v);
  return out;
}

type Point = { x: string; y: number };

/** Courbe + aire. Une seule serie : pas de legende, le titre suffit. */
export function Courbe({
  points, comparaison, hauteur = 200, unite = "monnaie", devise = "USD", grain = "day",
}: {
  points: Point[]; comparaison?: Point[]; hauteur?: number;
  unite?: Unite; devise?: string; grain?: "day" | "month";
}) {
  const format = faireFormat(unite, devise);
  const formatAxe = faireFormatAxe(unite, devise);
  const libelleX = grain === "month" ? moisCourt : jourCourt;
  const [ref, L] = useLargeur();
  const [survol, setSurvol] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.y), ...(comparaison ?? []).map((p) => p.y));
  const ticks = ticksY(max);
  const marge = { g: margeGauche(ticks.map(formatAxe)), d: 10, h: 12, b: 24 };
  const w = Math.max(0, L - marge.g - marge.d);
  const h = hauteur - marge.h - marge.b;
  const hautMax = ticks[ticks.length - 1] || max;
  const px = (i: number) => (points.length < 2 ? w / 2 : (i / (points.length - 1)) * w);
  const py = (v: number) => h - (v / hautMax) * h;

  const d = points.map((p, i) => `${i ? "L" : "M"}${px(i)},${py(p.y)}`).join(" ");
  // La periode precedente est alignee par rang : meme longueur, meme axe.
  const dComp = (comparaison ?? []).slice(0, points.length)
    .map((p, i) => `${i ? "L" : "M"}${px(i)},${py(p.y)}`).join(" ");
  const aire = points.length
    ? `${d} L${px(points.length - 1)},${h} L${px(0)},${h} Z`
    : "";

  return (
    <div ref={ref} className="relative">
      {L > 0 && (
        <svg
          width={L} height={hauteur} className="block"
          onMouseLeave={() => setSurvol(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left - marge.g;
            const i = Math.round((x / w) * (points.length - 1));
            setSurvol(i >= 0 && i < points.length ? i : null);
          }}
        >
          <g transform={`translate(${marge.g},${marge.h})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={py(t)} y2={py(t)} stroke={GRILLE} strokeWidth={1} />
                <text
                  x={-8} y={py(t)} dy="0.32em" textAnchor="end"
                  className="fill-[#6e6e6e] text-[10px] tabular-nums"
                >
                  {formatAxe(t)}
                </text>
              </g>
            ))}
            {dComp && (
              <path d={dComp} fill="none" stroke="#5a5a5a" strokeWidth={1.5}
                strokeDasharray="3 4" strokeLinejoin="round" strokeLinecap="round" />
            )}
            <path d={aire} fill={ACCENT} opacity={0.1} />
            <path d={d} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {survol !== null && points[survol] && (
              <>
                <line x1={px(survol)} x2={px(survol)} y1={0} y2={h} stroke={GRILLE} strokeWidth={1} />
                <circle
                  cx={px(survol)} cy={py(points[survol].y)} r={4.5}
                  fill={ACCENT} stroke={SURFACE} strokeWidth={2}
                />
              </>
            )}
            {points.length > 1 && (
              <>
                <text x={0} y={h + 16} className="fill-[#6e6e6e] text-[10px]">
                  {libelleX(points[0].x)}
                </text>
                <text x={w} y={h + 16} textAnchor="end" className="fill-[#6e6e6e] text-[10px]">
                  {libelleX(points[points.length - 1].x)}
                </text>
              </>
            )}
          </g>
        </svg>
      )}
      {survol !== null && points[survol] && (
        <Infobulle
          x={marge.g + px(survol)} largeur={L}
          titre={libelleX(points[survol].x)}
          valeur={format(points[survol].y)}
          secondaire={comparaison?.[survol] ? `préc. ${format(comparaison[survol].y)}` : undefined}
        />
      )}
      {dComp && (
        <p className="mt-2 flex items-center gap-3 text-[10.5px] text-faible">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded bg-accent" /> période</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t border-dashed border-[#5a5a5a]" /> période précédente</span>
        </p>
      )}
    </div>
  );
}

/** Colonnes. Barres fines, sommet arrondi, ecart de 2px entre voisines. */
export function Colonnes({
  points, hauteur = 180, unite = "nombre", devise = "USD", grain = "day",
}: {
  points: Point[]; hauteur?: number;
  unite?: Unite; devise?: string; grain?: "day" | "month";
}) {
  const format = faireFormat(unite, devise);
  const formatAxe = faireFormatAxe(unite, devise);
  const libelleX = grain === "month" ? moisCourt : jourCourt;
  const [ref, L] = useLargeur();
  const [survol, setSurvol] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.y));
  const min = Math.min(0, ...points.map((p) => p.y));
  const ticksPos = ticksY(max, 3);
  // Sous zero, memes pas que dessus : l'axe reste lisible.
  const pas = ticksPos.length > 1 ? ticksPos[1] - ticksPos[0] : 1;
  const ticksNeg: number[] = [];
  for (let v = -pas; v >= min * 1.001; v -= pas) ticksNeg.push(v);
  const ticks = [...ticksNeg.reverse(), ...ticksPos];
  const marge = { g: margeGauche(ticks.map(formatAxe)), d: 10, h: 12, b: 24 };
  const w = Math.max(0, L - marge.g - marge.d);
  const h = hauteur - marge.h - marge.b;
  const haut = ticks[ticks.length - 1] || max;
  const bas = ticks[0];
  const etendue = haut - bas || 1;
  const py = (v: number) => h - ((v - bas) / etendue) * h;
  const zero = py(0);
  const bande = points.length ? w / points.length : 0;
  const epaisseur = Math.max(1, Math.min(24, bande - 2));

  return (
    <div ref={ref} className="relative">
      {L > 0 && (
        <svg width={L} height={hauteur} className="block" onMouseLeave={() => setSurvol(null)}>
          <g transform={`translate(${marge.g},${marge.h})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={py(t)} y2={py(t)}
                  stroke={t === 0 ? "#3a3a3a" : GRILLE} strokeWidth={1} />
                <text
                  x={-8} y={py(t)} dy="0.32em" textAnchor="end"
                  className="fill-[#6e6e6e] text-[10px] tabular-nums"
                >
                  {formatAxe(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const yv = py(p.y);
              const negatif = p.y < 0;
              const top = negatif ? zero : yv;
              const hb = Math.abs(zero - yv);
              return (
                <rect
                  key={p.x}
                  x={i * bande + (bande - epaisseur) / 2}
                  y={top} width={epaisseur} height={Math.max(0, hb)}
                  rx={Math.min(4, epaisseur / 2)}
                  fill={negatif ? NEGATIF : ACCENT}
                  opacity={survol === null || survol === i ? 1 : 0.45}
                  onMouseEnter={() => setSurvol(i)}
                />
              );
            })}
            {points.length > 1 && (
              <>
                <text x={0} y={h + 16} className="fill-[#6e6e6e] text-[10px]">{libelleX(points[0].x)}</text>
                <text x={w} y={h + 16} textAnchor="end" className="fill-[#6e6e6e] text-[10px]">
                  {libelleX(points[points.length - 1].x)}
                </text>
              </>
            )}
          </g>
        </svg>
      )}
      {survol !== null && points[survol] && (
        <Infobulle
          x={marge.g + survol * bande + bande / 2} largeur={L}
          titre={libelleX(points[survol].x)} valeur={format(points[survol].y)}
        />
      )}
    </div>
  );
}

/** Repartition des coûts : une barre empilee, ecarts de 2px en couleur de fond. */
export function BarreRepartition({
  parts, total, devise = "USD",
}: {
  parts: { label: string; valeur: number }[];
  total: number;
  devise?: string;
}) {
  const format = faireFormat("monnaie", devise);
  const visibles = parts.filter((p) => p.valeur > 0);
  if (!visibles.length || total <= 0)
    return <p className="text-sm text-faible">Aucun coût sur la période.</p>;

  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {visibles.map((p, i) => (
          <div
            key={p.label}
            style={{
              width: `${(p.valeur / total) * 100}%`,
              backgroundColor: SERIES[i % SERIES.length],
            }}
            title={`${p.label} · ${format(p.valeur)}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SERIES[i % SERIES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-doux">{p.label}</span>
            <span className="chiffres text-[12.5px] text-texte">{format(p.valeur)}</span>
            <span className="chiffres w-10 text-right text-[11px] text-faible">
              {((p.valeur / total) * 100).toFixed(0)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Infobulle({
  x, largeur, titre, valeur, secondaire,
}: { x: number; largeur: number; titre: string; valeur: string; secondaire?: string }) {
  const aDroite = x > largeur / 2;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 rounded-[7px] border border-bord-fort bg-elev px-2.5 py-1.5 shadow-xl"
      style={aDroite ? { right: largeur - x + 8 } : { left: x + 8 }}
    >
      <p className="text-[10.5px] text-faible">{titre}</p>
      <p className="chiffres text-[13px] font-medium text-texte">{valeur}</p>
      {secondaire && <p className="chiffres text-[10.5px] text-faible">{secondaire}</p>}
    </div>
  );
}
