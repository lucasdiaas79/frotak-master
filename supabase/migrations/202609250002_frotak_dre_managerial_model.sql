-- Frotak Financeiro: modelo gerencial baseado no demonstrativo 12 meses da Frotak.
-- Mantem contas legadas ativas apenas para compatibilidade de rotinas antigas,
-- mas migra os lancamentos atuais conhecidos para a nova numeracao.

do $$
declare
  v_tenant record;
  v_seed record;
  v_parent_id uuid;
  v_old_id uuid;
  v_new_id uuid;
  v_map record;
begin
  for v_tenant in select id from public.tenants loop
    for v_seed in
      select *
      from (values
        ('1', null, 'RECEITAS', 'revenue', 'credit', null, false),
        ('1.001', '1', 'RECEITAS OPERACIONAIS', 'revenue', 'credit', 'gross_revenue', false),
        ('1.001.005', '1.001', 'RECEITAS DE REEMBOLSO DE DESPESAS', 'revenue', 'credit', 'gross_revenue', true),
        ('1.001.009', '1.001', 'RECEITA EMPRESTIMO CAPITAL DE GIRO', 'revenue', 'credit', 'other_result', true),
        ('1.001.4', '1.001', 'RECEITAS COM VIAGENS DO FROTA', 'revenue', 'credit', 'gross_revenue', true),
        ('1.002', '1', 'RECEITAS COM FRETES', 'revenue', 'credit', 'gross_revenue', true),
        ('1.003', '1', 'RECEITAS FINANCEIRAS', 'revenue', 'credit', 'other_result', false),
        ('1.003.0001', '1.003', 'RENDIMENTOS DE APLICACOES', 'revenue', 'credit', 'other_result', true),
        ('1.003.0003', '1.003', 'DESCONTOS OBTIDOS', 'revenue', 'credit', 'discounts_obtained', false),
        ('1.003.0003.7', '1.003.0003', 'DESCONTOS OBTIDOS S/DUPLICADAS', 'revenue', 'credit', 'discounts_obtained', true),
        ('1.003.0007', '1.003', 'RECEITA DE RESGATE DE TITULO DE CAPITALIZACAO', 'revenue', 'credit', 'other_result', true),
        ('1.007', '1', 'RECEITA COM VENDA DE CAMINHAO', 'revenue', 'credit', 'other_result', true),

        ('2', null, 'DESPESAS', 'expense', 'debit', null, false),
        ('2.001', '2', 'DESPESAS OPERACIONAIS', 'expense', 'debit', 'operating_expense', false),
        ('2.001.001', '2.001', 'CUSTOS COM PESSOAL', 'expense', 'debit', 'operating_expense', false),
        ('2.001.001.0001', '2.001.001', 'RESCISAO', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0002', '2.001.001', 'PRO LABORE', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0003', '2.001.001', 'ADIANTAMENTO DE SALARIOS', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0005', '2.001.001', 'SALARIOS', 'expense', 'debit', 'operating_expense', false),
        ('2.001.001.0005.2', '2.001.001.0005', 'SALARIO FUNCIONARIOS', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0006', '2.001.001', 'FERIAS', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0012', '2.001.001', 'INDENIZACAO FGTS (40%)', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0013', '2.001.001', 'INSS - FUNCIONARIOS', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0015', '2.001.001', 'PLANO DE SAUDE', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0016', '2.001.001', 'SEGURO DE VIDA EMPRESARIAL', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0018', '2.001.001', 'EXAME MEDICO (ASO)', 'expense', 'debit', 'operating_expense', true),
        ('2.001.001.0020', '2.001.001', 'PENSAO ALIMENTICIA', 'expense', 'debit', 'operating_expense', true),
        ('2.001.6', '2.001', 'EMPRESTIMOS', 'expense', 'debit', 'financial_result', false),
        ('2.001.6.00001', '2.001.6', 'EMPRESTIMO CAPITAL DE GIRO BANCO', 'expense', 'debit', 'financial_result', true),
        ('2.001.6.00001.018', '2.001.6.00001', 'FILTROS E OLEO LUBRIFICANTE', 'expense', 'debit', 'variable_cost', true),
        ('2.001.6.00008', '2.001.6', 'EMPRESTIMO CAPITAL GIRO BANCO DO BRASIL', 'expense', 'debit', 'financial_result', true),
        ('2.001.6.00009', '2.001.6', 'EMPRESTIMO CAPITAL BNB GIRO SIMPLES FGI PEAC', 'expense', 'debit', 'financial_result', true),

        ('2.002', '2', 'DESPESAS ADMINISTRATIVAS', 'expense', 'debit', 'operating_expense', false),
        ('2.002.001', '2.002', 'ALUGUEIS DE BENS IMOVEIS E EQUIPAMENTOS E VEICULOS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.003', '2.002', 'ENERGIA ELETRICA', 'expense', 'debit', 'operating_expense', true),
        ('2.002.005', '2.002', 'SEGURO DE CARGAS EMPRESA', 'expense', 'debit', 'operating_expense', false),
        ('2.002.005.1', '2.002.005', 'SEGURO DE CARGAS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.006', '2.002', 'INFORMATICA', 'expense', 'debit', 'operating_expense', true),
        ('2.002.008', '2.002', 'OUTROS IMPOSTOS E TAXAS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.010', '2.002', 'INTERNET', 'expense', 'debit', 'operating_expense', true),
        ('2.002.013', '2.002', 'HONORARIOS CONTABEIS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.019', '2.002', 'GERENCIADOR DE RISCO', 'expense', 'debit', 'operating_expense', true),
        ('2.002.022', '2.002', 'VIAGENS E ESTADIAS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.023', '2.002', 'CONSERVACAO/ LIMPEZA DE BENS IMOVEIS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.028', '2.002', 'DESPESAS COM MATERIAIS DE CONSTRUCAO', 'expense', 'debit', 'operating_expense', true),
        ('2.002.041', '2.002', 'DESPESAS C/FARDAMENTO', 'expense', 'debit', 'operating_expense', true),
        ('2.002.042', '2.002', 'DESPESAS C/FRETE', 'expense', 'debit', 'operating_expense', true),
        ('2.002.139', '2.002', 'MATERIAL DE SEGURANCA', 'expense', 'debit', 'operating_expense', true),
        ('2.002.140', '2.002', 'DESPESAS DIVERSAS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.141', '2.002', 'AQUISICAO DE MOVEIS PARA ESCRITORIO', 'expense', 'debit', 'depreciation_amortization', false),
        ('2.002.141.7', '2.002.141', 'AQUISICAO BENS DE PEQUENO VALOR (IMOBILIZADO)', 'expense', 'debit', 'depreciation_amortization', true),
        ('2.002.147', '2.002', 'HONORARIOS ADVOCATICIOS', 'expense', 'debit', 'operating_expense', true),
        ('2.002.153', '2.002', 'FATURA CARTAO DE CREDITO', 'expense', 'debit', 'operating_expense', true),
        ('2.002.161', '2.002', 'CONTRIBUICAO SINDICAL E PATRONAL', 'expense', 'debit', 'operating_expense', true),

        ('2.003', '2', 'DESPESAS FINANCEIRAS', 'expense', 'debit', 'financial_result', false),
        ('2.003.001', '2.003', 'JUROS PAGOS', 'expense', 'debit', 'financial_result', true),
        ('2.003.002', '2.003', 'DESCONTOS CONCEDIDOS', 'expense', 'debit', 'financial_result', true),
        ('2.003.003', '2.003', 'JUROS S/EMPRESTIMOS', 'expense', 'debit', 'financial_result', true),
        ('2.003.007', '2.003', 'DESPESAS FINANCEIRAS CARTOES', 'expense', 'debit', 'financial_result', true),
        ('2.003.008', '2.003', 'JUROS S/GIRO SIMPLES FGI PEAC', 'expense', 'debit', 'financial_result', true),
        ('2.003.009', '2.003', 'MULTAS PAGAS', 'expense', 'debit', 'financial_result', true),
        ('2.003.6', '2.003', 'JUROS S/ OPERACAO CONFIRMING', 'expense', 'debit', 'financial_result', true),
        ('2.003.8', '2.003', 'JUROS S/CARENCIA', 'expense', 'debit', 'financial_result', true),

        ('2.004', '2', 'DESPESAS BANCARIAS', 'expense', 'debit', 'financial_result', false),
        ('2.004.001', '2.004', 'DESPESAS BANCARIAS', 'expense', 'debit', 'financial_result', true),
        ('2.004.003', '2.004', 'JUROS S/ CONTA GARANTIDA', 'expense', 'debit', 'financial_result', true),
        ('2.004.004', '2.004', 'IOF S/ EMPRESTIMO', 'expense', 'debit', 'financial_result', true),
        ('2.004.007', '2.004', 'TITULO DE CAPITALIZACAO', 'expense', 'debit', 'financial_result', true),

        ('2.005', '2', 'DESPESAS COMERCIAIS', 'expense', 'debit', 'operating_expense', false),
        ('2.005.003', '2.005', 'BRINDES E DONATIVOS', 'expense', 'debit', 'operating_expense', true),

        ('2.006', '2', 'CUSTOS VARIAVEIS', 'expense', 'debit', 'variable_cost', false),
        ('2.006.0014', '2.006', 'PARCELAMENTO (PERT)', 'expense', 'debit', 'variable_cost', true),
        ('2.006.0015', '2.006', 'PARCELAMENTO DO ICMS (DIVIDA ATIVA)', 'expense', 'debit', 'variable_cost', true),
        ('2.006.0017', '2.006', 'PARCELAMENTO ICMS SEFAZ/BA', 'expense', 'debit', 'variable_cost', true),
        ('2.006.005', '2.006', 'ALVARA DE LOCALIZACAO', 'expense', 'debit', 'variable_cost', true),
        ('2.006.008', '2.006', 'COFINS', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.009', '2.006', 'PIS', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.010', '2.006', 'ICMS', 'expense', 'debit', 'revenue_deduction', false),
        ('2.006.010.2', '2.006.010', 'ICMS VALE', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.010.3', '2.006.010', 'ICMS NORMAL', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.010.4', '2.006.010', 'ICMS DIF ALIQUOTA', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.010.7', '2.006.010', 'ICMS FUNDO DE COMBATE A POBREZA', 'expense', 'debit', 'revenue_deduction', true),
        ('2.006.013', '2.006', 'PARCELAMENTO DE IMPOSTO (ICMS NORMAL)', 'expense', 'debit', 'variable_cost', true),
        ('2.006.14', '2.006', 'PARCELAMENTO PGFN', 'expense', 'debit', 'variable_cost', true),
        ('2.006.21', '2.006', 'PARCELAMENTO DO REFIS', 'expense', 'debit', 'variable_cost', true),

        ('2.007', '2', 'DESPESAS OPERACIONAIS', 'expense', 'debit', 'variable_cost', false),
        ('2.007.002', '2.007', 'DESPESAS COM DESCARGA', 'expense', 'debit', 'variable_cost', true),
        ('2.007.004', '2.007', 'DIARIAS', 'expense', 'debit', 'variable_cost', false),
        ('2.007.004.6', '2.007.004', 'DIARIAS DA FROTA', 'expense', 'debit', 'variable_cost', true),
        ('2.007.005', '2.007', 'ADIANTAMENTO DE FRETE', 'expense', 'debit', 'variable_cost', true),
        ('2.007.006', '2.007', 'SALDO DE FRETE', 'expense', 'debit', 'variable_cost', true),

        ('2.008', '2', 'DESPESAS COM ACIDENTES', 'expense', 'debit', 'operating_expense', false),
        ('2.008.003', '2.008', 'CUSTAS JUDICIAIS/ HONORARIOS ADVOCATICIOS', 'expense', 'debit', 'operating_expense', true),

        ('2.009', '2', 'DESPESAS COM FROTA', 'expense', 'debit', 'variable_cost', false),
        ('2.009.004', '2.009', 'PEDAGIO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.006', '2.009', 'SERVICOS', 'expense', 'debit', 'variable_cost', false),
        ('2.009.006.1', '2.009.006', 'AFERICAO TACOGRAFO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.006.2', '2.009.006', 'SOLDA EM GERAL', 'expense', 'debit', 'variable_cost', true),
        ('2.009.006.3', '2.009.006', 'SERVICO DE REBOQUE', 'expense', 'debit', 'variable_cost', true),
        ('2.009.006.6', '2.009.006', 'SERVICOS DE MOLAS E SOLDA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.007', '2.009', 'COMBUSTIVEIS', 'expense', 'debit', 'variable_cost', true),
        ('2.009.010', '2.009', 'CHAPEAMENTO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.011', '2.009', 'PNEUS', 'expense', 'debit', 'variable_cost', true),
        ('2.009.013', '2.009', 'MONITORAMENTO DA FROTA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.015', '2.009', 'MANUTENCAO', 'expense', 'debit', 'variable_cost', false),
        ('2.009.015.1', '2.009.015', 'MANUTENCAO GERAL', 'expense', 'debit', 'variable_cost', true),
        ('2.009.016', '2.009', 'SERVICO DE PNEUS/RECAUCHUTAGEM', 'expense', 'debit', 'variable_cost', true),
        ('2.009.017', '2.009', 'OLEO LUBRIFICANTE', 'expense', 'debit', 'variable_cost', true),
        ('2.009.020', '2.009', 'LAVAGEM', 'expense', 'debit', 'variable_cost', true),
        ('2.009.023', '2.009', 'ELETRICA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.025', '2.009', 'LUBRIFICACAO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.026', '2.009', 'SEGURO DE FROTA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.027', '2.009', 'DESPESAS C/ARLA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.032', '2.009', 'BATERIA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.033', '2.009', 'FUNILARIA E PINTURA', 'expense', 'debit', 'variable_cost', true),
        ('2.009.034', '2.009', 'ALINHAMENTO E BALANCEAMENTO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.035', '2.009', 'DISCO TACOGRAFO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.041', '2.009', 'FILTROS', 'expense', 'debit', 'variable_cost', true),
        ('2.009.042', '2.009', 'INSPECAO DE PNEUS', 'expense', 'debit', 'variable_cost', true),
        ('2.009.043', '2.009', 'MANUTENCAO TACOGRAFO', 'expense', 'debit', 'variable_cost', true),
        ('2.009.044', '2.009', 'A.R.T', 'expense', 'debit', 'variable_cost', true),
        ('2.009.8', '2.009', 'SERVICO DE GUINCHO/MUNCK', 'expense', 'debit', 'variable_cost', true),

        ('5', null, 'IMOBILIZADA', 'expense', 'debit', 'depreciation_amortization', false),
        ('5.003', '5', 'FINANCIAMENTOS DE VEICULOS', 'expense', 'debit', 'depreciation_amortization', true),
        ('5.006', '5', 'AR CONDICIONADO (MANUTENCAO)', 'expense', 'debit', 'depreciation_amortization', true),
        ('5.012', '5', 'ENTRADA DE PAGAMENTO CAMINHAO E SEMI REBOQUE', 'expense', 'debit', 'depreciation_amortization', true),
        ('5.028', '5', 'CONSORCIO', 'expense', 'debit', 'depreciation_amortization', true),
        ('5.3', '5', 'PECAS', 'expense', 'debit', 'depreciation_amortization', true),
        ('5.4', '5', 'ACESSORIOS DIVERSOS', 'expense', 'debit', 'depreciation_amortization', true)
      ) as seed(code, parent_code, name, account_type, normal_balance, dre_group, is_postable)
      order by length(code), code
    loop
      v_parent_id := null;
      if v_seed.parent_code is not null then
        select id into v_parent_id
        from public.chart_of_accounts
        where tenant_id = v_tenant.id and code = v_seed.parent_code;
      end if;

      insert into public.chart_of_accounts (
        tenant_id, parent_id, code, name, account_type, normal_balance,
        dre_group, is_postable, is_system, active
      ) values (
        v_tenant.id, v_parent_id, v_seed.code, v_seed.name, v_seed.account_type,
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

    for v_map in
      select *
      from (values
        ('3.01', '1.002'),
        ('3.02', '1.001.005'),
        ('3.03', '1.003.0003.7'),
        ('3.09', '2.006.010.3'),
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
      ) as m(old_code, new_code)
    loop
      select id into v_old_id from public.chart_of_accounts where tenant_id = v_tenant.id and code = v_map.old_code;
      select id into v_new_id from public.chart_of_accounts where tenant_id = v_tenant.id and code = v_map.new_code;

      if v_old_id is not null and v_new_id is not null and v_old_id <> v_new_id then
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

        update public.chart_of_accounts
        set is_postable = false,
            is_system = true
        where id = v_old_id;
      end if;
    end loop;
  end loop;
end $$;

create or replace function private.frotak_managerial_code_alias(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when '3.01' then '1.002'
    when '3.02' then '1.001.005'
    when '3.03' then '1.003.0003.7'
    when '3.09' then '2.003.002'
    when '4.01' then '2.009.007'
    when '4.02' then '2.009.027'
    when '4.03' then '2.009.004'
    when '4.04' then '2.007.005'
    when '4.05' then '2.007.004.6'
    when '4.06' then '2.002.140'
    when '4.99' then '2.002.140'
    when '5.01' then '2.009.015.1'
    when '5.02' then '2.009.011'
    when '5.03' then '2.001.001.0005.2'
    when '5.04' then '2.009.026'
    when '5.05' then '2.002.140'
    when '5.06' then '2.005.003'
    when '6.01' then '5.3'
    when '7.01' then '2.003.007'
    when '7.02' then '5.003'
    when '7.03' then '2.003.001'
    when '7.04' then '2.003.009'
    when '8.01' then '2.006.008'
    when '8.99' then '2.002.140'
    else p_code
  end;
$$;

create or replace function private.find_financial_system_account(
  p_tenant_id uuid,
  p_code text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select id
  from public.chart_of_accounts
  where tenant_id = p_tenant_id
    and code = private.frotak_managerial_code_alias(p_code)
    and active = true
  limit 1;
$$;

create or replace function private.find_required_financial_system_account(
  p_tenant_id uuid,
  p_code text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_code text := private.frotak_managerial_code_alias(p_code);
  v_id uuid;
begin
  select id into v_id
  from public.chart_of_accounts
  where tenant_id = p_tenant_id
    and code = v_code
    and active = true
  limit 1;

  if v_id is null then
    raise exception 'FINANCIAL_SYSTEM_ACCOUNT_NOT_FOUND:%', v_code;
  end if;

  return v_id;
end;
$$;

revoke all on function private.frotak_managerial_code_alias(text) from public, anon, authenticated;
revoke all on function private.find_financial_system_account(uuid, text) from public, anon, authenticated;
revoke all on function private.find_required_financial_system_account(uuid, text) from public, anon, authenticated;
