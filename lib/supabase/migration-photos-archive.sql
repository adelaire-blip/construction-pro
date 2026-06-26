-- ============================================================
-- Migration : archivage des projets + galerie photos d'annotations
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. Colonne d'archivage sur les projets
alter table projects add column if not exists archived boolean default false;

-- 2. Table galerie de photos pour les annotations
create table if not exists annotation_photos (
  id uuid default gen_random_uuid() primary key,
  annotation_id uuid references annotations(id) on delete cascade,
  photo_url text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table annotation_photos enable row level security;

drop policy if exists "photos_select" on annotation_photos;
drop policy if exists "photos_insert" on annotation_photos;
drop policy if exists "photos_delete" on annotation_photos;

create policy "photos_select" on annotation_photos for select using (
  exists (
    select 1 from annotations a
    where a.id = annotation_id and public.can_access_floor(a.floor_id)
  )
);
create policy "photos_insert" on annotation_photos for insert with check (created_by = auth.uid());
create policy "photos_delete" on annotation_photos for delete using (created_by = auth.uid());

-- 3. Rafraîchir le cache de schéma PostgREST
notify pgrst, 'reload schema';
