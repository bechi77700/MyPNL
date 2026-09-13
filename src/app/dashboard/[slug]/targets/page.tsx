import { createClient } from "@/lib/supabase/server";
import { chargerSkus, nomSku } from "@/lib/skus";
import { aujourdhui, formaterMontant } from "@/lib/periode";
import { enregistrerTargets } from "@/lib/actions/targets";
import { Bouton, Carte, Champ, EnTetePage, Message, Selecteur } from "@/components/ui";

export const dynamic = "force-dynamic";

type Mix = { qty: number; orders: number; share: number; aov: number; cogs: number };
type Donnees = {
  orders: number; aov: number | null; cogs: number | null; product_cost: number | null; shipping_cost: number | null;
  psp_rate: number | null; fee_estimated: boolean; mix: Mix[];
  shop: { revenue: number; ad_spend: number; orders: number; add_to_carts: number };
};

const decale = (iso: string, n: number) =>
  new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);
const roas = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(2).replace(".", ",") : "—");
const pct = (v: number) => `${(v * 100).toFixed(0)} %`;

export default async function TargetsPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { slug } = await params;
  const { ok, erreur } = await searchParams;
  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;
  const auj = aujourdhui(boutique!.timezone as string);
  const du = decale(auj, -29);

  const [{ data: reglages }, skus] = await Promise.all([
    supabase.from("shop_targets").select("*").eq("shop_id", shopId).maybeSingle(),
    chargerSkus(shopId, false),
  ]);

  // Produits (regroupes par fiche) parmi lesquels choisir le produit principal.
  const groupes = new Map<string, { libelle: string; skus: string[] }>();
  for (const s of skus.actifs.filter((x) => !x.exclude_from_shipping)) {
    const cle = (s.product_title ?? s.title ?? s.sku).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
    const g = groupes.get(cle) ?? { libelle: nomSku(s), skus: [] };
    g.skus.push(s.sku); groupes.set(cle, g);
  }
  const choix = [...groupes.values()];
  const mainSkus = (reglages?.main_skus as string[] | undefined) ?? [];
  const mMin = Number(reglages?.margin_min ?? 15) / 100;
  const mCible = Number(reglages?.margin_target ?? 20) / 100;
  const perte = Number(reglages?.loss_pct ?? 20) / 100;
  const atcPct = Number(reglages?.atc_pct ?? 20) / 100;
  const libelleProduit = (reglages?.main_label as string | null) ?? choix.find((c) => c.skus.some((s) => mainSkus.includes(s)))?.libelle ?? null;

  let d: Donnees | null = null;
  if (mainSkus.length) {
    const { data } = await supabase.rpc("targets_data", { p_shop: shopId, p_skus: mainSkus, p_from: du, p_to: auj });
    d = data as Donnees;
  }

  // ── Formules du calculateur ──────────────────────────────────────
  //   dispo  = AOV − COGS − AOV × PSP
  //   BE     = AOV / dispo
  //   cible  = AOV / (dispo − marge_cible × AOV)
  //   min    = AOV / (dispo − marge_min × AOV)
  //   −20 %  = AOV / (dispo + perte × AOV)
  //   ATC    = atc % × AOV
  const aov = Number(d?.aov ?? 0), cogs = Number(d?.cogs ?? 0), psp = Number(d?.psp_rate ?? 0);
  const dispo = aov - cogs - aov * psp;
  const be = aov / dispo, cible = aov / (dispo - mCible * aov), min = aov / (dispo - mMin * aov), moins20 = aov / (dispo + perte * aov);
  const coutAtc = atcPct * aov;
  const reel = d && d.shop.ad_spend > 0 ? d.shop.revenue / d.shop.ad_spend : null;
  const cpaReel = d && d.shop.orders > 0 ? d.shop.ad_spend / d.shop.orders : null;
  const atcReel = d && d.shop.add_to_carts > 0 ? d.shop.ad_spend / d.shop.add_to_carts : null;
  const verdict = reel == null ? null : reel >= cible ? "cible" : reel >= be ? "entre" : "sous";
  const m = (v: number) => formaterMontant(v, devise);

  const inputCls = "chiffres w-20 rounded-[10px] bg-carte-haut px-2.5 py-1.5 text-right text-texte outline-none focus:border-accent/60";

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Targets"
        sous={<>Tes seuils de ROAS pour {libelleProduit ? <b className="text-doux">{libelleProduit}</b> : "le produit principal"}, calculés sur les vraies commandes des 30 derniers jours.</>}
      />
      <Message ok={ok} erreur={erreur} />

      {d && d.orders > 0 && (
        <>
          {/* ── Les 4 chiffres ─────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Seuil label="ROAS breakeven" valeur={roas(be)} note="0 de profit, 0 de perte" />
            <Seuil label="ROAS target" valeur={roas(cible)} note={`range ${roas(min)} – ${roas(cible)} · marge ${pct(mMin)} à ${pct(mCible)}`} accent />
            <Seuil label={`ROAS à −${pct(perte)} de perte`} valeur={roas(moins20)} note="en dessous, tu perds plus d'un cinquième du CA" />
            <Seuil label="Coût ATC max" valeur={m(coutAtc)} note={`${pct(atcPct)} de l'AOV`} />
          </div>

          {/* ── Ou tu en es ────────────────────────────────────── */}
          <Carte className="mt-3 px-6 py-5">
            {reel == null ? (
              <p className="text-[13.5px] text-doux">Pas de dépense pub sur la période : impossible de comparer.</p>
            ) : (
              <p className="text-[14px] leading-relaxed text-texte">
                Sur 30 jours, ton ROAS blended est à{" "}
                <b className={`chiffres ${verdict === "cible" ? "text-positif" : verdict === "entre" ? "text-alerte" : "text-negatif"}`}>{roas(reel)}</b>
                {verdict === "cible" && <> : au-dessus de la cible. Chaque commande dégage au moins {pct(mCible)} de marge, tu peux pousser le budget.</>}
                {verdict === "entre" && <> : rentable, mais sous la cible de {roas(cible)}. Tu gagnes entre 0 et {pct(mCible)} par commande.</>}
                {verdict === "sous" && <> : sous le breakeven de {roas(be)}. Chaque commande te coûte de l&apos;argent avant charges fixes.</>}
                {cpaReel != null && <span className="text-doux"> CPA réel {m(cpaReel)}, pour un maximum de {m(dispo)} au breakeven et {m(dispo - mCible * aov)} à la cible.</span>}
                {atcReel != null && <span className="text-doux"> Coût par ajout au panier {m(atcReel)}, plafond {m(coutAtc)}.</span>}
              </p>
            )}
          </Carte>

          {/* ── D'ou ca vient ──────────────────────────────────── */}
          <Carte className="mt-3 px-6 py-5">
            <h2 className="text-[13px] font-medium text-texte">D&apos;où ça vient</h2>
            <p className="mt-1 text-[12.5px] text-doux">{d.orders.toLocaleString("fr-FR")} commandes contenant {libelleProduit} entre le {du} et aujourd&apos;hui.</p>
            <div className="mt-4 space-y-2.5 text-[13px]">
              <Ligne label="AOV réel" valeur={m(aov)} detail="panier moyen net des remboursements" />
              <Ligne label="COGS réel par commande" valeur={m(cogs)} detail={`produit ${m(Number(d.product_cost))} + port ${m(Number(d.shipping_cost))}`} />
              <Ligne label="Frais de paiement réels" valeur={pct(psp)} detail={d.fee_estimated ? "estimés selon tes taux par passerelle" : "frais Shopify Payments constatés"} />
              <Ligne label="Disponible pour la pub" valeur={m(dispo)} detail="AOV − COGS − frais : ce que tu peux payer une commande sans perdre" fort />
            </div>

            <h3 className="mt-6 text-[13px] font-medium text-texte">Mix réel des bundles</h3>
            <p className="mt-1 text-[12.5px] text-doux">Combien de {libelleProduit} par commande. C&apos;est ce mix qui fait l&apos;AOV, pas besoin de le deviner.</p>
            <div className="mt-3 space-y-2">
              {d.mix.map((x) => (
                <div key={x.qty} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-10 shrink-0 text-doux">{x.qty >= 4 ? "x4+" : `x${x.qty}`}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-carte-haut">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, x.share * 100)}%` }} />
                  </div>
                  <span className="chiffres w-12 shrink-0 text-right text-texte">{pct(x.share)}</span>
                  <span className="chiffres hidden w-40 shrink-0 text-right text-faible sm:block">AOV {m(Number(x.aov))} · COGS {m(Number(x.cogs))}</span>
                </div>
              ))}
            </div>
          </Carte>
        </>
      )}

      {d && d.orders === 0 && (
        <Carte className="px-6 py-5"><p className="text-[13.5px] text-doux">Aucune commande avec ce produit sur les 30 derniers jours.</p></Carte>
      )}

      {/* ── Reglages ───────────────────────────────────────────── */}
      <Carte className="mt-3 px-6 py-5">
        <h2 className="text-[13px] font-medium text-texte">{mainSkus.length ? "Réglages" : "Choisis ton produit principal"}</h2>
        <p className="mt-1 text-[12.5px] text-doux">Le produit dont tu pilotes la pub, et les marges qui définissent ta cible. Les pourcentages s&apos;appliquent au prix de vente.</p>
        <form action={enregistrerTargets.bind(null, slug)} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="text-[11px] text-faible">Produit principal</span>
            <Selecteur name="skus" required defaultValue={choix.find((c) => c.skus.some((s) => mainSkus.includes(s)))?.skus.join(",") ?? ""}>
              <option value="" disabled>Choisir…</option>
              {choix.map((c) => <option key={c.skus.join(",")} value={c.skus.join(",")}>{c.libelle}{c.skus.length > 1 ? ` (${c.skus.length} variantes)` : ""}</option>)}
            </Selecteur>
          </label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-faible">Marge min %</span><Champ name="margin_min" type="text" inputMode="decimal" defaultValue={String(reglages?.margin_min ?? 15)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-faible">Marge cible %</span><Champ name="margin_target" type="text" inputMode="decimal" defaultValue={String(reglages?.margin_target ?? 20)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-faible">Perte max %</span><Champ name="loss_pct" type="text" inputMode="decimal" defaultValue={String(reglages?.loss_pct ?? 20)} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-faible">ATC % de l&apos;AOV</span><Champ name="atc_pct" type="text" inputMode="decimal" defaultValue={String(reglages?.atc_pct ?? 20)} className={inputCls} /></label>
          <Bouton type="submit">{mainSkus.length ? "Enregistrer" : "Calculer"}</Bouton>
        </form>
        <p className="mt-4 text-[11.5px] leading-relaxed text-faible">
          Formules : disponible = AOV − COGS − AOV × frais · breakeven = AOV ÷ disponible · target = AOV ÷ (disponible − marge cible × AOV) · −20 % = AOV ÷ (disponible + 20 % × AOV). Contribution seulement, sans charges fixes ni TVA.
        </p>
      </Carte>
    </div>
  );
}

function Seuil({ label, valeur, note, accent }: { label: string; valeur: string; note: string; accent?: boolean }) {
  return (
    <div className={`carte rounded-[14px] px-5 py-4 ${accent ? "bg-accent/10 shadow-[inset_0_0_0_1px_rgb(59_123_255/0.35)]" : "bg-carte"}`}>
      <p className="text-[12px] text-faible">{label}</p>
      <p className={`chiffres mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] ${accent ? "text-accent" : "text-texte"}`}>{valeur}</p>
      <p className="mt-2.5 text-[11.5px] leading-snug text-doux">{note}</p>
    </div>
  );
}

function Ligne({ label, valeur, detail, fort }: { label: string; valeur: string; detail?: string; fort?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={fort ? "text-texte" : "text-doux"}>{label}</span>
      <span className="mx-1 flex-1 border-b border-dotted border-bord-fort" />
      <span className={`chiffres ${fort ? "font-semibold text-texte" : "text-texte"}`}>{valeur}</span>
      {detail && <span className="hidden w-[46%] text-[11.5px] text-faible sm:block">{detail}</span>}
    </div>
  );
}
