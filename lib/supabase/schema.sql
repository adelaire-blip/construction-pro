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

-- Row Level Security
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table floors enable row level security;
alter table annotations enable row level security;
alter table annotation_comments enable row level security;
alter table messages enable row level security;

-- RLS Policies
create policy "Profiles are viewable by authenticated users" on profiles
  for select using (auth.role() = 'authenticated');

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Projects visible to members" on projects
  for select using (
    auth.uid() = created_by or
    exists (select 1 from project_members where project_id = id and user_id = auth.uid())
  );

create policy "Admins can create projects" on projects
  for insert with check (auth.uid() = created_by);

create policy "Admins can update their projects" on projects
  for update using (auth.uid() = created_by);

create policy "Members visible to project participants" on project_members
  for select using (
    exists (select 1 from project_members pm where pm.project_id = project_id and pm.user_id = auth.uid())
    or exists (select 1 from projects p where p.id = project_id and p.created_by = auth.uid())
  );

create policy "Project owners can manage members" on project_members
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.created_by = auth.uid())
  );

create policy "Floors visible to project members" on floors
  for select using (
    exists (
      select 1 from project_members pm where pm.project_id = project_id and pm.user_id = auth.uid()
      union
      select 1 from projects p where p.id = project_id and p.created_by = auth.uid()
    )
  );

create policy "Project owners can manage floors" on floors
  for all using (
    exists (select 1 from projects p where p.id = project_id and p.created_by = auth.uid())
  );

create policy "Annotations visible to project members" on annotations
  for select using (
    exists (
      select 1 from floors f
      join project_members pm on pm.project_id = f.project_id
      where f.id = floor_id and pm.user_id = auth.uid()
      union
      select 1 from floors f
      join projects p on p.id = f.project_id
      where f.id = floor_id and p.created_by = auth.uid()
    )
  );

create policy "Members can create annotations" on annotations
  for insert with check (
    auth.uid() = created_by and
    exists (
      select 1 from floors f
      join project_members pm on pm.project_id = f.project_id
      where f.id = floor_id and pm.user_id = auth.uid()
      union
      select 1 from floors f
      join projects p on p.id = f.project_id
      where f.id = floor_id and p.created_by = auth.uid()
    )
  );

create policy "Members can update annotations" on annotations
  for update using (
    exists (
      select 1 from floors f
      join project_members pm on pm.project_id = f.project_id
      where f.id = floor_id and pm.user_id = auth.uid()
      union
      select 1 from floors f
      join projects p on p.id = f.project_id
      where f.id = floor_id and p.created_by = auth.uid()
    )
  );

create policy "Comments visible to project members" on annotation_comments
  for select using (
    exists (
      select 1 from annotations a
      join floors f on f.id = a.floor_id
      join project_members pm on pm.project_id = f.project_id
      where a.id = annotation_id and pm.user_id = auth.uid()
      union
      select 1 from annotations a
      join floors f on f.id = a.floor_id
      join projects p on p.id = f.project_id
      where a.id = annotation_id and p.created_by = auth.uid()
    )
  );

create policy "Members can add comments" on annotation_comments
  for insert with check (auth.uid() = created_by);

create policy "Messages visible to project members" on messages
  for select using (
    exists (
      select 1 from project_members pm where pm.project_id = project_id and pm.user_id = auth.uid()
      union
      select 1 from projects p where p.id = project_id and p.created_by = auth.uid()
    )
  );

create policy "Members can send messages" on messages
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from project_members pm where pm.project_id = project_id and pm.user_id = auth.uid()
      union
      select 1 from projects p where p.id = project_id and p.created_by = auth.uid()
    )
  );

-- Storage buckets (run in Supabase Storage section)
-- Create bucket "plans" (public: false)
-- Create bucket "attachments" (public: false)
-- Create bucket "avatars" (public: true)
