-- ============================================================
-- Migration : page Paramètres (utilisateurs détaillés + corps de métier)
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. Champs détaillés sur les profils
alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists last_name text;
alter table profiles add column if not exists trade text;       -- corps de métier principal
alter table profiles add column if not exists email text;       -- copie lisible de l'email

-- 2. Table des corps de métier (configurables)
create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text default 'gray',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table trades enable row level security;

drop policy if exists "trades_select" on trades;
drop policy if exists "trades_insert" on trades;
drop policy if exists "trades_delete" on trades;

create policy "trades_select" on trades for select using (auth.role() = 'authenticated');
create policy "trades_insert" on trades for insert with check (auth.uid() = created_by);
create policy "trades_delete" on trades for delete using (auth.role() = 'authenticated');

-- 3. Corps de métier sur les annotations
alter table annotations add column if not exists trade text;

-- 4. Quelques métiers par défaut (ignorés si déjà présents)
insert into trades (name, color)
select v.name, v.color from (values
  ('PLOMBERIE', 'blue'),
  ('CHAUFFAGE', 'red'),
  ('ÉLECTRICITÉ', 'yellow'),
  ('MAÇONNERIE', 'gray'),
  ('PLÂTRERIE', 'orange'),
  ('MENUISERIE', 'amber'),
  ('CARRELAGE', 'teal'),
  ('PEINTURE', 'green'),
  ('VENTILATION (VMC)', 'cyan'),
  ('ÉTANCHÉITÉ', 'purple')
) as v(name, color)
where not exists (select 1 from trades t where t.name = v.name);

-- 5. Rafraîchir le cache de schéma PostgREST
notify pgrst, 'reload schema';
