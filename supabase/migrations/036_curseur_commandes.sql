-- 036 : curseur de synchro des commandes.
-- Jusqu'ici chaque passe relisait TOUTES les commandes modifiees depuis 3 jours
-- (EverHaar : ~1 130 commandes, 13,8 s sur 25 mesurees le 2026-09-18), soit 96 fois par jour
-- depuis le passage aux 15 min, et chaque reecriture relance le trigger de calcul des couts.
-- A l'heure pile EverHaar depassait 60 s (2 coupures Vercel). On ne relit plus que ce qui a
-- change depuis la derniere synchro reussie ; le rebalayage de 3 jours reste, une fois par jour.
--
-- Ecriture ATOMIQUE d'une seule cle : sync_cursor est un bloc JSON que syncFrais reecrit en
-- entier (fees_since_id). Un read-modify-write cote application pourrait l'ecraser lors de deux
-- synchros simultanees et faire recompter des frais. Ici on fusionne en SQL, sans toucher au reste.
create or replace function public.set_sync_cursor_keys(p_shop uuid, p_platform text, p_keys jsonb)
returns void language sql as $$
  update public.connectors
     set sync_cursor = coalesce(sync_cursor, '{}'::jsonb) || p_keys
   where shop_id = p_shop and platform = p_platform;
$$;
revoke all on function public.set_sync_cursor_keys(uuid, text, jsonb) from public, anon, authenticated;
