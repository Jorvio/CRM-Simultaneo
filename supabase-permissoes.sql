-- ================================================================
-- CRM Simultâneo — papéis e políticas RLS
-- MASTER: tudo + gerenciamento de usuários
-- EDITOR: visualizar, cadastrar, editar e excluir dados do CRM
-- VISUALIZADOR: somente visualizar
-- ================================================================

begin;

-- 1. Permitir o novo papel VISUALIZADOR na tabela de perfis.
alter table public.profiles
  drop constraint if exists profiles_role_name_chk;

alter table public.profiles
  add constraint profiles_role_name_chk
  check (role_name = any (array['editor'::text, 'master'::text, 'visualizador'::text]));

-- 2. Funções de autorização usadas pelas políticas RLS.
-- SECURITY DEFINER evita recursão ao consultar public.profiles dentro das políticas.
create or replace function public.is_active_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role_name in ('master', 'editor', 'visualizador')
  );
$$;

create or replace function public.is_crm_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role_name = 'master'
  );
$$;

create or replace function public.is_crm_editor_or_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role_name in ('master', 'editor')
  );
$$;

revoke all on function public.is_active_crm_user() from public;
revoke all on function public.is_crm_master() from public;
revoke all on function public.is_crm_editor_or_master() from public;

grant execute on function public.is_active_crm_user() to authenticated;
grant execute on function public.is_crm_master() to authenticated;
grant execute on function public.is_crm_editor_or_master() to authenticated;

-- 3. CLIENTES
-- A política de SELECT existente continua usando is_active_crm_user().
drop policy if exists clients_insert_active on public.clients;
drop policy if exists clients_update_master on public.clients;
drop policy if exists clients_delete_master on public.clients;
drop policy if exists clients_insert_editor_master on public.clients;
drop policy if exists clients_update_editor_master on public.clients;
drop policy if exists clients_delete_editor_master on public.clients;

create policy clients_insert_editor_master
on public.clients
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy clients_update_editor_master
on public.clients
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy clients_delete_editor_master
on public.clients
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 4. PROJETOS
drop policy if exists projects_insert_active on public.projects;
drop policy if exists projects_update_master on public.projects;
drop policy if exists projects_delete_master on public.projects;
drop policy if exists projects_insert_editor_master on public.projects;
drop policy if exists projects_update_editor_master on public.projects;
drop policy if exists projects_delete_editor_master on public.projects;

create policy projects_insert_editor_master
on public.projects
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy projects_update_editor_master
on public.projects
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy projects_delete_editor_master
on public.projects
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 5. PROPOSTAS
drop policy if exists proposals_insert_active on public.proposals;
drop policy if exists proposals_update_master on public.proposals;
drop policy if exists proposals_delete_master on public.proposals;
drop policy if exists proposals_insert_editor_master on public.proposals;
drop policy if exists proposals_update_editor_master on public.proposals;
drop policy if exists proposals_delete_editor_master on public.proposals;

create policy proposals_insert_editor_master
on public.proposals
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy proposals_update_editor_master
on public.proposals
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy proposals_delete_editor_master
on public.proposals
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 6. RESPONSÁVEIS
drop policy if exists responsaveis_insert_active on public.responsaveis;
drop policy if exists responsaveis_update_master on public.responsaveis;
drop policy if exists responsaveis_delete_master on public.responsaveis;
drop policy if exists responsaveis_insert_editor_master on public.responsaveis;
drop policy if exists responsaveis_update_editor_master on public.responsaveis;
drop policy if exists responsaveis_delete_editor_master on public.responsaveis;

create policy responsaveis_insert_editor_master
on public.responsaveis
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy responsaveis_update_editor_master
on public.responsaveis
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy responsaveis_delete_editor_master
on public.responsaveis
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 7. CONTRATOS
drop policy if exists contracts_insert_active on public.contracts;
drop policy if exists contracts_update_master on public.contracts;
drop policy if exists contracts_delete_master on public.contracts;
drop policy if exists contracts_insert_editor_master on public.contracts;
drop policy if exists contracts_update_editor_master on public.contracts;
drop policy if exists contracts_delete_editor_master on public.contracts;

create policy contracts_insert_editor_master
on public.contracts
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy contracts_update_editor_master
on public.contracts
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy contracts_delete_editor_master
on public.contracts
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 8. ACOMPANHAMENTO DE PROJETOS
drop policy if exists project_followups_insert_active on public.project_followups;
drop policy if exists project_followups_update_master on public.project_followups;
drop policy if exists project_followups_delete_master on public.project_followups;
drop policy if exists project_followups_insert_editor_master on public.project_followups;
drop policy if exists project_followups_update_editor_master on public.project_followups;
drop policy if exists project_followups_delete_editor_master on public.project_followups;

create policy project_followups_insert_editor_master
on public.project_followups
for insert
to authenticated
with check (public.is_crm_editor_or_master());

create policy project_followups_update_editor_master
on public.project_followups
for update
to authenticated
using (public.is_crm_editor_or_master())
with check (public.is_crm_editor_or_master());

create policy project_followups_delete_editor_master
on public.project_followups
for delete
to authenticated
using (public.is_crm_editor_or_master());

-- 9. Somente MASTER pode alterar função ou status dos perfis.
drop policy if exists profiles_update_master on public.profiles;

create policy profiles_update_master
on public.profiles
for update
to authenticated
using (public.is_crm_master())
with check (public.is_crm_master());

commit;

-- Conferência final das funções e políticas alteradas.
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_name_chk';

select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'clients',
    'projects',
    'proposals',
    'responsaveis',
    'contracts',
    'project_followups'
  )
order by tablename, cmd, policyname;
