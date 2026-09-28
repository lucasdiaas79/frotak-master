-- Faz a integracao operacional gravar diretamente no modelo gerencial atual.
-- Contas legadas ficam inativas e nao participam mais de novos lancamentos.

create or replace function private.ensure_current_operational_managerial_accounts(
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_seed record;
  v_parent_id uuid;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  for v_seed in
    select *
    from (values
      ('1', null, 'RECEITAS', 'revenue', 'credit', null, false),
      ('1.002', '1', 'RECEITAS COM FRETES', 'revenue', 'credit', 'gross_revenue', true),
      ('2', null, 'DESPESAS', 'expense', 'debit', null, false),
      ('2.002', '2', 'DESPESAS ADMINISTRATIVAS', 'expense', 'debit', 'operating_expense', false),
      ('2.002.140', '2.002', 'DESPESAS DIVERSAS', 'expense', 'debit', 'operating_expense', true),
      ('2.007', '2', 'DESPESAS OPERACIONAIS', 'expense', 'debit', 'variable_cost', false),
      ('2.007.004', '2.007', 'DIARIAS', 'expense', 'debit', 'variable_cost', false),
      ('2.007.004.6', '2.007.004', 'DIARIAS DA FROTA', 'expense', 'debit', 'variable_cost', true),
      ('2.009', '2', 'DESPESAS COM FROTA', 'expense', 'debit', 'variable_cost', false),
      ('2.009.004', '2.009', 'PEDAGIO', 'expense', 'debit', 'variable_cost', true),
      ('2.009.007', '2.009', 'COMBUSTIVEIS', 'expense', 'debit', 'variable_cost', true),
      ('2.009.015', '2.009', 'MANUTENCAO', 'expense', 'debit', 'variable_cost', false),
      ('2.009.015.1', '2.009.015', 'MANUTENCAO GERAL', 'expense', 'debit', 'variable_cost', true),
      ('2.009.027', '2.009', 'DESPESAS C/ARLA', 'expense', 'debit', 'variable_cost', true)
    ) as seed(code, parent_code, name, account_type, normal_balance, dre_group, is_postable)
    order by length(code), code
  loop
    v_parent_id := null;
    if v_seed.parent_code is not null then
      select id into v_parent_id
      from public.chart_of_accounts
      where tenant_id = p_tenant_id
        and code = v_seed.parent_code;
    end if;

    insert into public.chart_of_accounts (
      tenant_id, parent_id, code, name, account_type, normal_balance,
      dre_group, is_postable, is_system, active
    ) values (
      p_tenant_id, v_parent_id, v_seed.code, v_seed.name, v_seed.account_type,
      v_seed.normal_balance, v_seed.dre_group, v_seed.is_postable, true, true
    )
    on conflict (tenant_id, code) do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      account_type = excluded.account_type,
      normal_balance = excluded.normal_balance,
      dre_group = excluded.dre_group,
      is_postable = excluded.is_postable,
      is_system = true,
      active = true;
  end loop;
end;
$$;

-- A fundacao financeira deixa de semear o plano legado. Ela preserva as
-- demais estruturas necessarias e garante somente os gerenciais atuais usados
-- pela integracao operacional.
create or replace function private.ensure_financial_foundation_for_workspace(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace public.workspaces;
begin
  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  perform private.ensure_current_operational_managerial_accounts(v_workspace.tenant_id);

  insert into public.cost_centers (tenant_id, workspace_id, code, name, is_system)
  values (v_workspace.tenant_id, v_workspace.id, 'EMPRESA', 'Empresa', true)
  on conflict (tenant_id, code) do nothing;

  insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name, is_system)
  select v_workspace.tenant_id, v_workspace.id, root.id, seed.code, seed.name, true
  from public.cost_centers root
  cross join (values
    ('OPERACAO', 'Operacao'),
    ('ADMINISTRATIVO', 'Administrativo'),
    ('OFICINA', 'Oficina')
  ) as seed(code, name)
  where root.tenant_id = v_workspace.tenant_id
    and root.code = 'EMPRESA'
  on conflict (tenant_id, code) do nothing;

  insert into public.financial_integration_settings (
    tenant_id, workspace_id, default_receivable_due_days, default_payable_due_days
  ) values (
    v_workspace.tenant_id, v_workspace.id, 0, 0
  )
  on conflict (workspace_id) do update set
    default_receivable_due_days = coalesce(
      public.financial_integration_settings.default_receivable_due_days,
      excluded.default_receivable_due_days
    ),
    default_payable_due_days = coalesce(
      public.financial_integration_settings.default_payable_due_days,
      excluded.default_payable_due_days
    ),
    active = true,
    updated_at = now();
end;
$$;

-- A funcao atualmente instalada ainda contem os codigos antigos em literais.
-- Esta migration substitui esses literais uma unica vez na definicao da funcao;
-- em runtime a integracao passa a procurar somente os codigos canonicos.
do $$
declare
  v_definition text;
  v_old_code text;
  v_new_code text;
begin
  v_definition := pg_get_functiondef(
    'private.process_financial_integration_job(uuid)'::regprocedure
  );

  for v_old_code, v_new_code in
    select * from (values
      ('3.01', '1.002'),
      ('4.01', '2.009.007'),
      ('4.02', '2.009.027'),
      ('4.03', '2.009.004'),
      ('4.05', '2.007.004.6'),
      ('4.06', '2.002.140'),
      ('4.99', '2.002.140'),
      ('5.01', '2.009.015.1')
    ) as mapping(old_code, new_code)
  loop
    if position(quote_literal(v_old_code) in v_definition) = 0 then
      raise exception 'OPERATIONAL_MANAGERIAL_CODE_NOT_FOUND:%', v_old_code;
    end if;
    v_definition := replace(
      v_definition,
      quote_literal(v_old_code),
      quote_literal(v_new_code)
    );
  end loop;

  execute v_definition;

  v_definition := pg_get_functiondef(
    'private.process_financial_integration_job(uuid)'::regprocedure
  );
  foreach v_old_code in array array[
    '3.01', '4.01', '4.02', '4.03', '4.05', '4.06', '4.99', '5.01'
  ]
  loop
    if position(quote_literal(v_old_code) in v_definition) > 0 then
      raise exception 'OPERATIONAL_MANAGERIAL_CODE_STILL_LEGACY:%', v_old_code;
    end if;
  end loop;
end;
$$;

-- Garante o mesmo modelo para workspaces de tenants criados no futuro.
create or replace function private.ensure_financial_foundation_after_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.ensure_financial_foundation_for_workspace(new.id);
  return new;
end;
$$;

-- Migra todas as referencias remanescentes antes de remover fisicamente as
-- contas legadas. Assim nenhum documento depende de leitura ou traducao.
do $$
declare
  v_tenant record;
  v_map record;
  v_old_id uuid;
  v_new_id uuid;
begin
  for v_tenant in select id from public.tenants loop
    perform private.ensure_current_operational_managerial_accounts(v_tenant.id);

    for v_map in
      select * from (values
        ('3.01', '1.002'),
        ('3.02', '1.001.005'),
        ('3.03', '1.003.0003.7'),
        ('3.09', '2.003.002'),
        ('4.01', '2.009.007'),
        ('4.02', '2.009.027'),
        ('4.03', '2.009.004'),
        ('4.04', '2.007.005'),
        ('4.05', '2.007.004.6'),
        ('4.06', '2.002.140'),
        ('4.99', '2.002.140'),
        ('5.01', '2.009.015.1'),
        ('5.02', '2.009.011'),
        ('5.03', '2.001.001.0005.2'),
        ('5.04', '2.009.026'),
        ('5.05', '2.002.140'),
        ('5.06', '2.005.003'),
        ('6.01', '5.3'),
        ('7.01', '2.003.007'),
        ('7.02', '5.003'),
        ('7.03', '2.003.001'),
        ('7.04', '2.003.009'),
        ('8.01', '2.006.008'),
        ('8.99', '2.002.140')
      ) as mapping(old_code, new_code)
    loop
      select id into v_old_id
      from public.chart_of_accounts
      where tenant_id = v_tenant.id and code = v_map.old_code;

      if v_old_id is null then
        continue;
      end if;

      select id into v_new_id
      from public.chart_of_accounts
      where tenant_id = v_tenant.id and code = v_map.new_code and active = true;

      if v_new_id is null then
        raise exception 'CURRENT_MANAGERIAL_ACCOUNT_NOT_FOUND:%:%', v_tenant.id, v_map.new_code;
      end if;

      update public.financial_documents
      set chart_account_id = v_new_id
      where tenant_id = v_tenant.id and chart_account_id = v_old_id;

      update public.financial_allocations
      set chart_account_id = v_new_id
      where tenant_id = v_tenant.id and chart_account_id = v_old_id;

      update public.financial_recurring_rules
      set chart_account_id = v_new_id
      where tenant_id = v_tenant.id and chart_account_id = v_old_id;

      update public.employee_financial_profiles
      set default_chart_account_id = v_new_id
      where tenant_id = v_tenant.id and default_chart_account_id = v_old_id;

      update public.payroll_entries
      set chart_account_id = v_new_id
      where tenant_id = v_tenant.id and chart_account_id = v_old_id;

      update public.journal_lines
      set chart_account_id = v_new_id
      where tenant_id = v_tenant.id and chart_account_id = v_old_id;
    end loop;
  end loop;

  update public.chart_of_accounts child
  set parent_id = null
  from public.chart_of_accounts parent
  where child.parent_id = parent.id
    and parent.is_system = true
    and parent.code in ('3', '4', '6', '7', '8');

  delete from public.chart_of_accounts
  where is_system = true
    and code in (
      '3.01', '3.02', '3.03', '3.09',
      '4.01', '4.02', '4.03', '4.04', '4.05', '4.06', '4.99',
      '5.01', '5.02', '5.03', '5.04', '5.05', '5.06',
      '6.01',
      '7.01', '7.02', '7.03', '7.04',
      '8.01', '8.99'
    );

  delete from public.chart_of_accounts
  where is_system = true
    and code in ('3', '4', '6', '7', '8');
end;
$$;

-- A integracao agora aponta diretamente para a conta definitiva; a camada de
-- traducao criada na migration anterior deixa de ser necessaria.
drop trigger if exists financial_documents_normalize_managerial_account
  on public.financial_documents;
drop trigger if exists financial_allocations_normalize_managerial_account
  on public.financial_allocations;
drop function if exists private.normalize_financial_managerial_account();

revoke all on function private.ensure_current_operational_managerial_accounts(uuid)
  from public, anon, authenticated;

comment on function private.ensure_current_operational_managerial_accounts(uuid) is
  'Garante os gerenciais canonicos usados pela integracao de fretes e despesas da frota.';

notify pgrst, 'reload schema';
