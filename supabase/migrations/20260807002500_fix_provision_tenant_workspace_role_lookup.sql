do $$
declare
  provision_function_definition text;
begin
  select pg_get_functiondef(
    'private.provision_tenant(uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], uuid)'::regprocedure
  )
    into provision_function_definition;

  provision_function_definition := replace(
    provision_function_definition,
    'where workspace_id = v_workspace_id',
    'where workspace_roles.workspace_id = v_workspace_id'
  );

  execute provision_function_definition;
end $$;
