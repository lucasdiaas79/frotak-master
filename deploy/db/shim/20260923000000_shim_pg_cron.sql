-- As migrations 202609240001 e 20260928154946 so agendam os jobs financeiros se o pg_cron ja
-- existir, mas no repositorio a extensao so e criada em 202610150001. Sem este arquivo, um banco
-- montado do zero fica sem recorrencias e sem reconciliacao, e nenhum erro aparece.
create extension if not exists pg_cron with schema pg_catalog;
