begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_denied_user_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_module_id uuid;
  v_permission_id uuid;
  v_i integer;
  v_seen boolean;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'ai-lab@example.com', now(), now(), now()),
    (v_denied_user_id, 'authenticated', 'authenticated', 'ai-denied@example.com', now(), now(), now());

  insert into public.tenants (slug, legal_name, status)
  values ('ai-wave0-lab', 'AI Wave 0 Lab Ltda', 'active')
  returning id into v_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, status, is_default)
  values (v_tenant_id, 'AI Lab', 'ai-lab', 'active', true)
  returning id into v_workspace_id;

  select id into v_module_id from public.modules where code = 'frotak_ai';
  select id into v_permission_id from public.permissions where code = 'ai.assistant.use';

  insert into public.workspace_modules (workspace_id, module_id, enabled, source, starts_at)
  values (v_workspace_id, v_module_id, true, 'addon', now() - interval '1 minute');

  insert into public.workspace_roles (workspace_id, code, name, active)
  values (v_workspace_id, 'AI_TESTER', 'AI Tester', true)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_id)
  values (v_role_id, v_permission_id);

  insert into public.workspace_memberships (workspace_id, user_id, status)
  values (v_workspace_id, v_user_id, 'active')
  returning id into v_membership_id;

  insert into public.membership_roles (membership_id, role_id, workspace_id)
  values (v_membership_id, v_role_id, v_workspace_id);

  insert into public.workspace_memberships (workspace_id, user_id, status)
  values (v_workspace_id, v_denied_user_id, 'active');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- 30 chats por minuto devem passar.
  for v_i in 1..30 loop
    perform public.authorize_frotak_ai('chat');
  end loop;

  v_seen := false;
  begin
    perform public.authorize_frotak_ai('chat');
  exception when others then
    if sqlerrm like 'AI_RATE_LIMIT_EXCEEDED%' then
      v_seen := true;
    else
      raise;
    end if;
  end;
  if not v_seen then
    raise exception 'Expected chat rate limit to reject request 31';
  end if;

  -- O contador de live e separado e limitado a 5/minuto.
  for v_i in 1..5 loop
    perform public.authorize_frotak_ai('live_token');
  end loop;

  v_seen := false;
  begin
    perform public.authorize_frotak_ai('live_token');
  exception when others then
    if sqlerrm like 'AI_RATE_LIMIT_EXCEEDED%' then
      v_seen := true;
    else
      raise;
    end if;
  end;
  if not v_seen then
    raise exception 'Expected live token rate limit to reject request 6';
  end if;

  -- Mesmo no mesmo tenant, membro sem a permissao explicita nao usa a IA.
  perform set_config('request.jwt.claim.sub', v_denied_user_id::text, true);
  v_seen := false;
  begin
    perform public.authorize_frotak_ai('chat');
  exception when insufficient_privilege then
    if sqlerrm like 'AI_PERMISSION_REQUIRED%' then
      v_seen := true;
    else
      raise;
    end if;
  end;
  if not v_seen then
    raise exception 'Expected member without ai.assistant.use to be denied';
  end if;
end;
$$;

rollback;
