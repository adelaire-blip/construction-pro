-- ============================================================
-- CORRECTION DÉFINITIVE DES POLITIQUES RLS (anti-récursion)
-- À exécuter en entier dans Supabase > SQL Editor
-- ============================================================

-- 1. Supprimer TOUTES les politiques existantes sur toutes les tables
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','projects','project_members','floors','annotations','annotation_comments','messages')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 2. Fonctions SECURITY DEFINER : elles contournent le RLS,
--    ce qui casse toute récursion entre projects <-> project_members
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects
    where id = p_project_id and created_by = auth.uid()
  );
$$;

-- Accès à un projet via un floor
create or replace function public.can_access_floor(p_floor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from floors f
    where f.id = p_floor_id
      and (public.is_project_owner(f.project_id) or public.is_project_member(f.project_id))
  );
$$;

-- 3. Activer RLS partout
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table floors enable row level security;
alter table annotations enable row level security;
alter table annotation_comments enable row level security;
alter table messages enable row level security;

-- 4. PROFILES
create policy "profiles_select" on profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- 5. PROJECTS
create policy "projects_select" on projects
  for select using (
    created_by = auth.uid() or public.is_project_member(id)
  );
create policy "projects_insert" on projects
  for insert with check (created_by = auth.uid());
create policy "projects_update" on projects
  for update using (created_by = auth.uid());
create policy "projects_delete" on projects
  for delete using (created_by = auth.uid());

-- 6. PROJECT_MEMBERS
create policy "members_select" on project_members
  for select using (
    user_id = auth.uid() or public.is_project_owner(project_id)
  );
-- Un utilisateur peut s'ajouter lui-même (création de projet)
create policy "members_insert_self" on project_members
  for insert with check (user_id = auth.uid());
-- Le propriétaire peut ajouter d'autres membres
create policy "members_insert_owner" on project_members
  for insert with check (public.is_project_owner(project_id));
-- Le propriétaire peut retirer des membres
create policy "members_delete_owner" on project_members
  for delete using (public.is_project_owner(project_id));

-- 7. FLOORS
create policy "floors_select" on floors
  for select using (
    public.is_project_owner(project_id) or public.is_project_member(project_id)
  );
create policy "floors_all_owner" on floors
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- 8. ANNOTATIONS
create policy "annotations_select" on annotations
  for select using (public.can_access_floor(floor_id));
create policy "annotations_insert" on annotations
  for insert with check (
    created_by = auth.uid() and public.can_access_floor(floor_id)
  );
create policy "annotations_update" on annotations
  for update using (public.can_access_floor(floor_id));
create policy "annotations_delete" on annotations
  for delete using (public.can_access_floor(floor_id));

-- 9. ANNOTATION_COMMENTS
create policy "comments_select" on annotation_comments
  for select using (
    exists (select 1 from annotations a where a.id = annotation_id and public.can_access_floor(a.floor_id))
  );
create policy "comments_insert" on annotation_comments
  for insert with check (created_by = auth.uid());

-- 10. MESSAGES
create policy "messages_select" on messages
  for select using (
    public.is_project_owner(project_id) or public.is_project_member(project_id)
  );
create policy "messages_insert" on messages
  for insert with check (
    user_id = auth.uid() and
    (public.is_project_owner(project_id) or public.is_project_member(project_id))
  );
