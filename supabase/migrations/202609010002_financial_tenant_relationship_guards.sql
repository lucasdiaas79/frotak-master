-- Frotak Financeiro - garantias relacionais multi-tenant.
-- RLS controla acesso; estas FKs compostas tambem impedem referencias cruzadas
-- em escritas privilegiadas feitas por jobs e servicos server-side.

create unique index if not exists workspaces_tenant_id_id_uidx
  on public.workspaces(tenant_id, id);
create unique index if not exists vehicles_tenant_id_id_uidx
  on public.vehicles(tenant_id, id);
create unique index if not exists drivers_tenant_id_id_uidx
  on public.drivers(tenant_id, id);
create unique index if not exists trailers_tenant_id_id_uidx
  on public.trailers(tenant_id, id);
create unique index if not exists senders_tenant_id_id_uidx
  on public.senders(tenant_id, id);
create unique index if not exists recipients_tenant_id_id_uidx
  on public.recipients(tenant_id, id);
create unique index if not exists products_tenant_id_id_uidx
  on public.products(tenant_id, id);
create unique index if not exists accounting_periods_tenant_workspace_id_uidx
  on public.accounting_periods(tenant_id, workspace_id, id);
create unique index if not exists journal_entries_tenant_workspace_id_uidx
  on public.journal_entries(tenant_id, workspace_id, id);

alter table public.freights
  add constraint freights_workspace_tenant_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  add constraint freights_vehicle_tenant_fk
    foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id),
  add constraint freights_driver_tenant_fk
    foreign key (tenant_id, driver_id) references public.drivers(tenant_id, id),
  add constraint freights_trailer_tenant_fk
    foreign key (tenant_id, primary_trailer_id) references public.trailers(tenant_id, id),
  add constraint freights_sender_tenant_fk
    foreign key (tenant_id, sender_id) references public.senders(tenant_id, id),
  add constraint freights_recipient_tenant_fk
    foreign key (tenant_id, recipient_id) references public.recipients(tenant_id, id),
  add constraint freights_product_tenant_fk
    foreign key (tenant_id, product_id) references public.products(tenant_id, id);

alter table public.business_partner_roles
  add constraint business_partner_roles_partner_tenant_fk
    foreign key (tenant_id, partner_id)
    references public.business_partners(tenant_id, id);

alter table public.legacy_partner_links
  add constraint legacy_partner_links_partner_tenant_fk
    foreign key (tenant_id, partner_id)
    references public.business_partners(tenant_id, id);

alter table public.chart_of_accounts
  add constraint chart_of_accounts_parent_tenant_fk
    foreign key (tenant_id, parent_id)
    references public.chart_of_accounts(tenant_id, id);

alter table public.cost_centers
  add constraint cost_centers_workspace_tenant_fk
    foreign key (tenant_id, workspace_id)
    references public.workspaces(tenant_id, id),
  add constraint cost_centers_parent_tenant_fk
    foreign key (tenant_id, parent_id)
    references public.cost_centers(tenant_id, id);

alter table public.financial_documents
  add constraint financial_documents_workspace_tenant_fk
    foreign key (tenant_id, workspace_id)
    references public.workspaces(tenant_id, id),
  add constraint financial_documents_partner_tenant_fk
    foreign key (tenant_id, partner_id)
    references public.business_partners(tenant_id, id),
  add constraint financial_documents_account_tenant_fk
    foreign key (tenant_id, chart_account_id)
    references public.chart_of_accounts(tenant_id, id);

alter table public.financial_installments
  add constraint financial_installments_document_tenant_fk
    foreign key (tenant_id, workspace_id, document_id)
    references public.financial_documents(tenant_id, workspace_id, id);

alter table public.financial_allocations
  add constraint financial_allocations_document_tenant_fk
    foreign key (tenant_id, workspace_id, document_id)
    references public.financial_documents(tenant_id, workspace_id, id),
  add constraint financial_allocations_freight_tenant_fk
    foreign key (tenant_id, freight_id) references public.freights(tenant_id, id),
  add constraint financial_allocations_vehicle_tenant_fk
    foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id),
  add constraint financial_allocations_partner_tenant_fk
    foreign key (tenant_id, business_partner_id)
    references public.business_partners(tenant_id, id),
  add constraint financial_allocations_cost_center_tenant_fk
    foreign key (tenant_id, cost_center_id) references public.cost_centers(tenant_id, id),
  add constraint financial_allocations_product_tenant_fk
    foreign key (tenant_id, product_id) references public.products(tenant_id, id),
  add constraint financial_allocations_account_tenant_fk
    foreign key (tenant_id, chart_account_id)
    references public.chart_of_accounts(tenant_id, id);

alter table public.accounting_periods
  add constraint accounting_periods_workspace_tenant_fk
    foreign key (tenant_id, workspace_id)
    references public.workspaces(tenant_id, id);

alter table public.journal_entries
  add constraint journal_entries_workspace_tenant_fk
    foreign key (tenant_id, workspace_id)
    references public.workspaces(tenant_id, id),
  add constraint journal_entries_document_tenant_fk
    foreign key (tenant_id, workspace_id, financial_document_id)
    references public.financial_documents(tenant_id, workspace_id, id),
  add constraint journal_entries_period_tenant_fk
    foreign key (tenant_id, workspace_id, accounting_period_id)
    references public.accounting_periods(tenant_id, workspace_id, id),
  add constraint journal_entries_reversal_tenant_fk
    foreign key (tenant_id, workspace_id, reversal_of_id)
    references public.journal_entries(tenant_id, workspace_id, id);

alter table public.journal_lines
  add constraint journal_lines_entry_tenant_fk
    foreign key (tenant_id, workspace_id, journal_entry_id)
    references public.journal_entries(tenant_id, workspace_id, id),
  add constraint journal_lines_account_tenant_fk
    foreign key (tenant_id, chart_account_id)
    references public.chart_of_accounts(tenant_id, id),
  add constraint journal_lines_cost_center_tenant_fk
    foreign key (tenant_id, cost_center_id)
    references public.cost_centers(tenant_id, id),
  add constraint journal_lines_freight_tenant_fk
    foreign key (tenant_id, freight_id) references public.freights(tenant_id, id),
  add constraint journal_lines_vehicle_tenant_fk
    foreign key (tenant_id, vehicle_id) references public.vehicles(tenant_id, id),
  add constraint journal_lines_partner_tenant_fk
    foreign key (tenant_id, business_partner_id)
    references public.business_partners(tenant_id, id),
  add constraint journal_lines_product_tenant_fk
    foreign key (tenant_id, product_id) references public.products(tenant_id, id);

alter table public.financial_audit_events
  add constraint financial_audit_events_document_tenant_fk
    foreign key (tenant_id, workspace_id, financial_document_id)
    references public.financial_documents(tenant_id, workspace_id, id);
