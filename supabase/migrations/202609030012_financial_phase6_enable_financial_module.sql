insert into public.workspace_modules (workspace_id, module_id, enabled, source, starts_at)
select w.id, m.id, true, 'manual', now()
from public.workspaces w
join public.modules m on m.code = 'financial' and m.active = true
where w.status = 'active'
  and not exists (
    select 1
    from public.workspace_modules wm
    where wm.workspace_id = w.id
      and wm.module_id = m.id
      and wm.enabled = true
      and wm.starts_at <= now()
      and (wm.expires_at is null or wm.expires_at > now())
  );
