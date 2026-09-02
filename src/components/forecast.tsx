"use client";

import { useMemo, useState } from "react";
import { formaterMontant, formaterPourcent } from "@/lib/periode";
import { Carte } from "@/components/ui";
import { Colonnes } from "@/components/charts";

export type BaseProjection = {
  mois: string;          // dernier mois complet, AAAA-MM-01
  ca: number;
  tauxMarge: number;     // marge brute / CA HT
  tauxPub: number;       // pub / CA
  chargesFixes: number;  // charges mensuelles récurrentes
};

export default function Forecast({
  base, devise,
}: { base: BaseProjection; devise: string }) {
  const [croissance, setCroissance] = useState(10);
  const [horizon, setHorizon] = useState(6);
  const [tauxPub, setTauxPub] = useState(Math.round(base.tauxPub * 100));

  const mois = useMemo(() => {
    const out = [];
    const depart = new Date(base.mois + "T12:00:00Z");
    for (let k = 1; k <= horizon; k++) {
      const d = new Date(Date.UTC(depart.getUTCFullYear(), depart.getUTCMonth() + k, 1));
      const saison = [10, 11].includes(d.getUTCMonth()) ? 1.25 : 1; // nov. et déc.
      const ca = base.ca * Math.pow(1 + croissance / 100, k) * saison;
      const margeBrute = ca * base.tauxMarge;
      const pub = ca * (tauxPub / 100);
      const ebitda = margeBrute - pub - base.chargesFixes;
      out.push({ date: d.toISOString().slice(0, 10), ca, margeBrute, pub, ebitda });
    }
    return out;
  }, [base, croissance, horizon, tauxPub]);

  const m = (v: number) => formaterMontant(v, devise, true);
  const cumul = mois.reduce((a, x) => a + x.ebitda, 0);

  return (
    <>
      <Carte className="px-6 py-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Curseur
            label="Croissance mensuelle" valeur={croissance} min={-30} max={60}
            suffixe=" %" onChange={setCroissance}
          />
          <Curseur
            label="Dépense pub (% du CA)" valeur={tauxPub} min={0} max={80}
            suffixe=" %" onChange={setTauxPub}
          />
          <Curseur
            label="Horizon" valeur={horizon} min={1} max={24}
            suffixe=" mois" onChange={setHorizon}
          />
        </div>
      </Carte>

      <Carte className="mt-4 px-6 py-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-texte">
            EBITDA projeté sur {horizon} mois
          </h2>
          <span className={`chiffres text-lg ${cumul < 0 ? "text-negatif" : "text-accent"}`}>
            {m(cumul)} cumulés
          </span>
        </div>
        <Colonnes
          points={mois.map((x) => ({ x: x.date, y: Math.max(0, x.ebitda) }))}
          unite="monnaie" devise={devise} grain="month" hauteur={200}
        />
      </Carte>

      <Carte className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-carte-haut text-[11px] uppercase tracking-wider text-faible">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Mois</th>
                <th className="px-4 py-3 text-right font-medium">CA</th>
                <th className="px-4 py-3 text-right font-medium">Marge brute</th>
                <th className="px-4 py-3 text-right font-medium">Pub</th>
                <th className="px-5 py-3 text-right font-medium">EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {mois.map((x) => (
                <tr key={x.date} className="border-t border-bord">
                  <td className="px-5 py-2.5 text-doux">
                    {new Date(x.date + "T12:00:00Z").toLocaleDateString("fr-FR", {
                      month: "long", year: "numeric",
                    })}
                  </td>
                  <td className="chiffres px-4 py-2.5 text-right text-texte">{m(x.ca)}</td>
                  <td className="chiffres px-4 py-2.5 text-right text-doux">{m(x.margeBrute)}</td>
                  <td className="chiffres px-4 py-2.5 text-right text-faible">{m(x.pub)}</td>
                  <td className={`chiffres px-5 py-2.5 text-right font-medium ${x.ebitda < 0 ? "text-negatif" : "text-texte"}`}>
                    {m(x.ebitda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Carte>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-faible">
        Projection à partir de ton dernier mois complet : CA {m(base.ca)}, taux de
        marge {formaterPourcent(base.tauxMarge * 100)}, charges fixes{" "}
        {m(base.chargesFixes)} par mois. Novembre et décembre sont majorés de 25 %.
        C&apos;est une extrapolation, pas une prévision : elle vaut ce que valent tes
        hypothèses.
      </p>
    </>
  );
}

function Curseur({
  label, valeur, min, max, suffixe, onChange,
}: {
  label: string; valeur: number; min: number; max: number;
  suffixe: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-xs text-faible">{label}</span>
        <span className="chiffres text-sm text-texte">{valeur}{suffixe}</span>
      </span>
      <input
        type="range" min={min} max={max} value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-[#3b7bff]"
      />
    </label>
  );
}
