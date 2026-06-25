-- Run this SQL in your Supabase SQL editor

-- Profiles (linked to auth.users)
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  company text,
  role text default 'professional' check (role in ('admin', 'professional')),
  avatar_url text,
  phone text,
  created_at timestamptz default now()
);

-- Projects
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  description text,
  status text default 'en_cours' check (status in ('en_cours', 'termine', 'en_pause')),
  cover_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Project members
create table if not exists project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'professional' check (role in ('admin', 'professional')),
  created_at timestamptz default now(),
  unique(project_id, user_id)
);

-- Floors per project
create table if not exists floors (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  level integer not null default 0,
  plan_url text,
  plan_type text check (plan_type in ('pdf', 'image')),
  created_at timestamptz default now()
);

-- Annotations on plans
create table if not exists annotations (
  id uuid default gen_random_uuid() primary key,
  floor_id uuid references floors(id) on delete cascade,
  x float not null,
  y float not null,
  title text not null,
  description text,
  type text default 'reservation' check (type in ('reservation', 'note', 'alerte')),
  status text default 'ouvert' check (status in ('ouvert', 'en_cours', 'resolu')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Comments on annotations
create table if not exists annotation_comments (
  id uuid default gen_random_uuid() primary key,
  annotation_id uuid references annotations(id) on delete cascade,
  text text,
  photo_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Chat messages
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  content text,
  attachment_url text,
  attachment_type text check (attachment_type in ('image', 'document')),
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Fonctions SECURITY DEFINER (contournent le RLS -> anti-récursion)
-- ============================================================
create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from project_members where project_id = p_project_id and user_id = auth.uid());
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from projects where id = p_project_id and created_by = auth.uid());
$$;

create or replace function public.can_access_floor(p_floor_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from floors f
    where f.id = p_floor_id
      and (public.is_project_owner(f.project_id) or public.is_project_member(f.project_id))
  );
$$;

-- Row Level Security
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table floors enable row level security;
alter table annotations enable row level security;
alter table annotation_comments enable row level security;
alter table messages enable row level security;

-- PROFILES
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- PROJECTS
create policy "projects_select" on projects for select using (created_by = auth.uid() or public.is_project_member(id));
create policy "projects_insert" on projects for insert with check (created_by = auth.uid());
create policy "projects_update" on projects for update using (created_by = auth.uid());
create policy "projects_delete" on projects for delete using (created_by = auth.uid());

-- PROJECT_MEMBERS
create policy "members_select" on project_members for select using (user_id = auth.uid() or public.is_project_owner(project_id));
create policy "members_insert_self" on project_members for insert with check (user_id = auth.uid());
create policy "members_insert_owner" on project_members for insert with check (public.is_project_owner(project_id));
create policy "members_delete_owner" on project_members for delete using (public.is_project_owner(project_id));

-- FLOORS
create policy "floors_select" on floors for select using (public.is_project_owner(project_id) or public.is_project_member(project_id));
create policy "floors_all_owner" on floors for all using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

-- ANNOTATIONS
create policy "annotations_select" on annotations for select using (public.can_access_floor(floor_id));
create policy "annotations_insert" on annotations for insert with check (created_by = auth.uid() and public.can_access_floor(floor_id));
create policy "annotations_update" on annotations for update using (public.can_access_floor(floor_id));
create policy "annotations_delete" on annotations for delete using (public.can_access_floor(floor_id));

-- ANNOTATION_COMMENTS
create policy "comments_select" on annotation_comments for select using (
  exists (select 1 from annotations a where a.id = annotation_id and public.can_access_floor(a.floor_id))
);
create policy "comments_insert" on annotation_comments for insert with check (created_by = auth.uid());

-- MESSAGES
create policy "messages_select" on messages for select using (public.is_project_owner(project_id) or public.is_project_member(project_id));
create policy "messages_insert" on messages for insert with check (
  user_id = auth.uid() and (public.is_project_owner(project_id) or public.is_project_member(project_id))
);

-- Storage buckets (run in Supabase Storage section)
-- Create bucket "plans" (public: false)
-- Create bucket "attachments" (public: false)
-- Create bucket "avatars" (public: true)
