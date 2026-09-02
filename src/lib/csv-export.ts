/** Sortie CSV lisible par Excel FR : point-virgule, virgule decimale, BOM. */
export function versCsv(entetes: string[], lignes: (string | number | null | undefined)[][]) {
  const cellule = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corps = [entetes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n");
  return "﻿" + corps;
}

export function reponseCsv(nom: string, contenu: string) {
  return new Response(contenu, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
