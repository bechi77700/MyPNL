-- 034 : synchro automatique toutes les 15 minutes (au lieu d'une fois par heure).
-- Mesure avant changement : 20 a 27 s par passe pour 3 boutiques, limite Vercel 60 s,
-- garde-fou a 52 s dans la route (une boutique non traitee est reprise au passage suivant).
-- On ne modifie QUE l'horaire : la commande (URL + secret) reste celle de 027, non versionnee.
-- Le nom du job reste "mypnl-sync-horaire" pour ne pas le recreer ; il tourne bien aux 15 min.
select cron.alter_job(
  job_id   := (select jobid from cron.job where jobname = 'mypnl-sync-horaire'),
  schedule := '*/15 * * * *'
);
