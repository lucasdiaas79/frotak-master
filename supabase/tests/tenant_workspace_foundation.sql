begin;

do $$
declare
  v_tenant_id uuid;
  v_other_tenant_id uuid;
  v_workspace_id uuid;
begin
  insert into public.tenants (slug, legal_name, trade_name, cnpj, status)
  values ('tenant-valido', 'Tenant Valido Ltda', 'Tenant Valido', '12345678000199', 'active')
  returning id into v_tenant_id;

  begin
    insert into public.tenants (slug, legal_name)
    values ('Tenant Valido', 'Slug Invalido Ltda');
    raise exception 'Expected invalid tenant slug to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.tenants (slug, legal_name, status)
    values ('status-invalido', 'Status Invalido Ltda', 'blocked');
    raise exception 'Expected invalid tenant status to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.tenants (slug, legal_name, cnpj)
    values ('cnpj-invalido', 'CNPJ Invalido Ltda', '123');
    raise exception 'Expected invalid CNPJ length to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.workspaces (tenant_id, name, slug, is_default)
  values (v_tenant_id, 'Operacao Principal', 'operacao-principal', true)
  returning id into v_workspace_id;

  insert into public.workspaces (tenant_id, name, slug)
  values (v_tenant_id, 'Filial Salvador', 'filial-salvador');

  begin
    insert into public.workspaces (tenant_id, name, slug)
    values (v_tenant_id, 'Operacao Duplicada', 'operacao-principal');
    raise exception 'Expected duplicate workspace slug in same tenant to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.tenants (slug, legal_name, status)
  values ('transportadora-alfa', 'Transportadora Alfa Ltda', 'active')
  returning id into v_other_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, is_default)
  values (v_other_tenant_id, 'Operacao Principal', 'operacao-principal', true);

  begin
    insert into public.workspaces (tenant_id, name, slug, is_default)
    values (v_tenant_id, 'Outro Padrao', 'outro-padrao', true);
    raise exception 'Expected second default workspace for same tenant to be rejected';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.workspaces (tenant_id, name, slug, status)
    values (v_tenant_id, 'Status Invalido', 'status-invalido', 'deleted');
    raise exception 'Expected invalid workspace status to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.workspaces (tenant_id, name, slug)
    values (v_tenant_id, '   ', 'nome-vazio');
    raise exception 'Expected blank workspace name to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    delete from public.tenants where id = v_tenant_id;
    raise exception 'Expected tenant delete with existing workspaces to be restricted';
  exception
    when foreign_key_violation then null;
  end;

  update public.workspaces
  set name = 'Operacao Principal Atualizada'
  where id = v_workspace_id;
end;
$$;

rollback;
