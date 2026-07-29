create extension if not exists pgcrypto;

create table if not exists public.tnva_faces (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  author text not null default 'Ẩn danh' check (char_length(author) <= 60),
  screen_width integer not null check (screen_width in (212, 250)),
  screen_height integer not null check (screen_height in (104, 122)),
  preview_data text not null,
  payload jsonb not null,
  downloads integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tnva_payload_size check (octet_length(payload::text) <= 300000),
  constraint tnva_preview_size check (octet_length(preview_data) <= 180000)
);

alter table public.tnva_faces enable row level security;

drop policy if exists "tnva_faces_public_read" on public.tnva_faces;
create policy "tnva_faces_public_read" on public.tnva_faces
for select to anon, authenticated using (true);

drop policy if exists "tnva_faces_public_insert" on public.tnva_faces;
create policy "tnva_faces_public_insert" on public.tnva_faces
for insert to anon, authenticated with check (true);

grant select, insert on public.tnva_faces to anon, authenticated;

create or replace function public.tnva_increment_download(face_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.tnva_faces set downloads = downloads + 1 where id = face_id;
$$;

grant execute on function public.tnva_increment_download(uuid) to anon, authenticated;
