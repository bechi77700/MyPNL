-- 035 : un appel de synchro PAR boutique active, en parallele (pg_net est asynchrone).
-- Pourquoi : un seul appel traitait les 3 boutiques a la suite. Mesure le 2026-09-18 :
-- 24 a 55 s pour le meme travail, limite Vercel 60 s, et le garde-fou de 52 s de la route
-- n'est verifie qu'AVANT de commencer une boutique : la derniere pouvait etre coupee en plein milieu.
-- Desormais chaque boutique a ses 60 s, une nouvelle boutique est couverte sans rien changer,
-- et net._http_response garde une ligne (donc une duree) par boutique.
-- La commande d'origine contient le CRON_SECRET : on la transforme sur place, sans jamais l'ecrire ici.
-- Idempotent : relance, aucun des deux motifs ne correspond plus.
-- Retour arriere : remplacer "?shop=' || s.slug" par "'" et la clause "from public.shops ..." par ");".
select cron.alter_job(
  job_id  := j.jobid,
  command := regexp_replace(
               replace(j.command,
                       '''https://mypnl-tau.vercel.app/api/cron/sync''',
                       '''https://mypnl-tau.vercel.app/api/cron/sync?shop='' || s.slug'),
               '\)\s*;\s*$',
               E')\n  from public.shops s\n  where s.is_active;\n')
)
from cron.job j
where j.jobname = 'mypnl-sync-horaire'
  and j.command not like '%from public.shops s%';
