select
  version
from supabase_migrations.schema_migrations
where version in (
  '20260806203332',
  '20260806210115',
  '20260806210116',
  '20260806212813',
  '20260806212814',
  '20260806212815',
  '20260806212816'
)
order by version;

select
  n.nspname as schema,
  c.relname as tabela,
  c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'profiles',
    'platform_users',
    'workspace_memberships',
    'workspace_roles',
    'permissions',
    'role_permissions',
    'membership_roles'
  )
order by c.relname;

select
  schemaname as schema,
  tablename as tabela,
  policyname as policy,
  cmd as comando,
  roles,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'platform_users',
    'workspace_memberships',
    'workspace_roles',
    'permissions',
    'role_permissions',
    'membership_roles',
    'tenants',
    'workspaces',
    'modules',
    'workspace_modules',
    'plans',
    'plan_modules',
    'tenant_subscriptions'
  )
order by tablename, policyname;

select
  t.tgname as trigger,
  ns.nspname || '.' || cls.relname as tabela,
  case
    when (t.tgtype & 64) = 64 then 'INSTEAD OF'
    when (t.tgtype & 2) = 2 then 'BEFORE'
    else 'AFTER'
  end as timing,
  (t.tgtype & 4) = 4 as insert_event,
  (t.tgtype & 1) = 1 as for_each_row,
  pn.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as funcao
from pg_catalog.pg_trigger t
join pg_catalog.pg_class cls on cls.oid = t.tgrelid
join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
where t.tgname = 'on_auth_user_created_create_profile';

with expected_functions(schema_name, function_name, identity_args) as (
  values
    ('public', 'handle_new_auth_user', ''),
    ('private', 'is_active_profile', ''),
    ('private', 'is_platform_user', ''),
    ('private', 'has_platform_role', 'text[]'),
    ('private', 'is_workspace_member', 'uuid'),
    ('private', 'is_workspace_owner', 'uuid'),
    ('private', 'workspace_has_module', 'uuid, text'),
    ('private', 'has_permission', 'uuid, text')
)
select
  e.schema_name || '.' || e.function_name || '(' || e.identity_args || ')' as funcao,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) as proprietario,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos,
  coalesce(
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          p.proacl,
          pg_catalog.acldefault('f', p.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ),
    false
  ) as public_execute,
  coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      p.oid,
      'EXECUTE'
    ),
    false
  ) as anon_execute,
  coalesce(
    pg_catalog.has_function_privilege(
      'authenticated',
      p.oid,
      'EXECUTE'
    ),
    false
  ) as authenticated_execute,
  coalesce(
    pg_catalog.has_function_privilege(
      'service_role',
      p.oid,
      'EXECUTE'
    ),
    false
  ) as service_role_execute
from expected_functions e
left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
left join pg_catalog.pg_proc p
  on p.pronamespace = n.oid
  and p.proname = e.function_name
  and pg_catalog.pg_get_function_identity_arguments(p.oid) = e.identity_args
order by e.schema_name, e.function_name;

select
  con.conname as constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class child on child.oid = con.conrelid
join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
where child_ns.nspname = 'public'
  and child.relname = 'membership_roles'
  and con.contype = 'f'
order by con.conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'workspace_memberships'
  and indexname = 'workspace_memberships_one_owner_uidx';

with audited_tables(schema_name, table_name) as (
  values
    ('public', 'profiles'),
    ('public', 'platform_users'),
    ('public', 'workspace_memberships'),
    ('public', 'workspace_roles'),
    ('public', 'permissions'),
    ('public', 'role_permissions'),
    ('public', 'membership_roles'),
    ('public', 'tenants'),
    ('public', 'workspaces'),
    ('public', 'modules'),
    ('public', 'workspace_modules'),
    ('public', 'plans'),
    ('public', 'plan_modules'),
    ('public', 'tenant_subscriptions')
)
select
  schema_name as schema,
  table_name as tabela,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'SELECT'
  ) as select_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'INSERT'
  ) as insert_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'UPDATE'
  ) as update_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'DELETE'
  ) as delete_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'TRUNCATE'
  ) as truncate_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'REFERENCES'
  ) as references_allowed,
  pg_catalog.has_table_privilege(
    'authenticated',
    format('%I.%I', schema_name, table_name),
    'TRIGGER'
  ) as trigger_allowed
from audited_tables
order by schema_name, table_name;

select
  coalesce(m.code, 'administrative') as modulo,
  count(*)::integer as total
from public.permissions p
left join public.modules m on m.id = p.module_id
group by coalesce(m.code, 'administrative')
union all
select
  'total' as modulo,
  count(*)::integer as total
from public.permissions
order by modulo;

select
  'tenants' as tabela,
  count(*)::integer as total
from public.tenants
union all
select
  'workspaces' as tabela,
  count(*)::integer as total
from public.workspaces
union all
select
  'tenant_subscriptions' as tabela,
  count(*)::integer as total
from public.tenant_subscriptions
union all
select
  'workspace_modules' as tabela,
  count(*)::integer as total
from public.workspace_modules
union all
select
  'profiles' as tabela,
  count(*)::integer as total
from public.profiles
union all
select
  'platform_users' as tabela,
  count(*)::integer as total
from public.platform_users
union all
select
  'workspace_memberships' as tabela,
  count(*)::integer as total
from public.workspace_memberships
union all
select
  'workspace_roles' as tabela,
  count(*)::integer as total
from public.workspace_roles
union all
select
  'role_permissions' as tabela,
  count(*)::integer as total
from public.role_permissions
union all
select
  'membership_roles' as tabela,
  count(*)::integer as total
from public.membership_roles
order by tabela;
