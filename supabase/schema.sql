create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account text not null unique,
  name text not null,
  bio text not null default '',
  avatar text,
  avatar_color text not null default '#4ECDC4',
  friends text[] not null default '{}',
  subjects text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.posts (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null default '',
  images text[] not null default '{}',
  videos text[] not null default '{}',
  likes text[] not null default '{}',
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plans (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  date timestamptz not null,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.knowledge (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  question text not null default '',
  wrong_answer text not null default '',
  correct_answer text not null default '',
  summary text not null default '',
  images text[] not null default '{}',
  question_images text[] not null default '{}',
  wrong_answer_images text[] not null default '{}',
  correct_answer_images text[] not null default '{}',
  summary_images text[] not null default '{}',
  audio_files jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  likes text[] not null default '{}',
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  source_type text not null,
  source_id text not null,
  source_preview text not null default '',
  content text not null default '',
  is_read int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_messages_user_unread on public.messages (user_id, is_read);
create index if not exists idx_messages_user_created_at on public.messages (user_id, created_at desc);

create table if not exists public.notification_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  read_interaction_ids text[] not null default '{}',
  last_read_time timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.plans enable row level security;
alter table public.knowledge enable row level security;
alter table public.messages enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated"
on public.profiles for update
to authenticated
using (true)
with check (true);

drop policy if exists "posts_select_authenticated" on public.posts;
create policy "posts_select_authenticated"
on public.posts for select
to authenticated
using (true);

drop policy if exists "posts_insert_owner" on public.posts;
create policy "posts_insert_owner"
on public.posts for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "posts_update_authenticated" on public.posts;
create policy "posts_update_authenticated"
on public.posts for update
to authenticated
using (true)
with check (true);

drop policy if exists "posts_delete_owner" on public.posts;
create policy "posts_delete_owner"
on public.posts for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated"
on public.plans for select
to authenticated
using (true);

drop policy if exists "plans_insert_owner" on public.plans;
create policy "plans_insert_owner"
on public.plans for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "plans_update_authenticated" on public.plans;
create policy "plans_update_authenticated"
on public.plans for update
to authenticated
using (true)
with check (true);

drop policy if exists "plans_delete_owner" on public.plans;
create policy "plans_delete_owner"
on public.plans for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "knowledge_select_authenticated" on public.knowledge;
create policy "knowledge_select_authenticated"
on public.knowledge for select
to authenticated
using (true);

drop policy if exists "knowledge_insert_owner" on public.knowledge;
create policy "knowledge_insert_owner"
on public.knowledge for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "knowledge_update_authenticated" on public.knowledge;
create policy "knowledge_update_authenticated"
on public.knowledge for update
to authenticated
using (true)
with check (true);

drop policy if exists "knowledge_delete_owner" on public.knowledge;
create policy "knowledge_delete_owner"
on public.knowledge for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "messages_select_owner" on public.messages;
create policy "messages_select_owner"
on public.messages for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "messages_insert_authenticated" on public.messages;
create policy "messages_insert_authenticated"
on public.messages for insert
to authenticated
with check (auth.uid() = actor_id);

drop policy if exists "messages_update_owner" on public.messages;
create policy "messages_update_owner"
on public.messages for update
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notification_reads_select_owner" on public.notification_reads;
create policy "notification_reads_select_owner"
on public.notification_reads for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notification_reads_insert_owner" on public.notification_reads;
create policy "notification_reads_insert_owner"
on public.notification_reads for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "notification_reads_update_owner" on public.notification_reads;
create policy "notification_reads_update_owner"
on public.notification_reads for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "storage_media_public_read" on storage.objects;
create policy "storage_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'media');

drop policy if exists "storage_media_authenticated_upload" on storage.objects;
create policy "storage_media_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media');

drop policy if exists "storage_media_authenticated_update" on storage.objects;
create policy "storage_media_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

drop policy if exists "storage_media_authenticated_delete" on storage.objects;
create policy "storage_media_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'media');
