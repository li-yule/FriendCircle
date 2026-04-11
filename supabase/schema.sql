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
  source_comment_id text,
  source_preview text not null default '',
  content text not null default '',
  is_read int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.messages add column if not exists source_comment_id text;

create index if not exists idx_messages_user_unread on public.messages (user_id, is_read);
create index if not exists idx_messages_user_created_at on public.messages (user_id, created_at desc);
create unique index if not exists idx_messages_comment_unique
on public.messages (user_id, actor_id, source_type, source_id, source_comment_id)
where source_comment_id is not null;

do $$
declare
  tables text[] := array['profiles', 'posts', 'plans', 'knowledge', 'messages'];
  tbl text;
begin
  foreach tbl in array tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end
$$;

create or replace function public.enqueue_post_comment_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_comment jsonb;
  old_comment jsonb;
  comment_id text;
  actor_id_text text;
  actor_uuid uuid;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.comments, '[]'::jsonb) = coalesce(old.comments, '[]'::jsonb) then
    return new;
  end if;

  for new_comment in select value from jsonb_array_elements(coalesce(new.comments, '[]'::jsonb)) loop
    comment_id := coalesce(new_comment ->> 'id', '');
    if comment_id = '' then
      continue;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(old.comments, '[]'::jsonb)) as prev(value)
      where coalesce(prev.value ->> 'id', '') = comment_id
    ) then
      continue;
    end if;

    actor_id_text := coalesce(new_comment ->> 'userId', new_comment ->> 'user_id', '');
    if actor_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    actor_uuid := actor_id_text::uuid;

    if actor_uuid = new.user_id then
      continue;
    end if;

    insert into public.messages (
      user_id,
      actor_id,
      source_type,
      source_id,
      source_comment_id,
      source_preview,
      content,
      is_read
    )
    values (
      new.user_id,
      actor_uuid,
      'post',
      new.id,
      comment_id,
      left(coalesce(new.text, ''), 120),
      coalesce(new_comment ->> 'text', ''),
      0
    )
    on conflict (user_id, actor_id, source_type, source_id, source_comment_id) do nothing;
  end loop;

  return new;
end
$$;

drop trigger if exists trg_enqueue_post_comment_messages on public.posts;
create trigger trg_enqueue_post_comment_messages
after update of comments on public.posts
for each row
execute function public.enqueue_post_comment_messages();

create or replace function public.enqueue_knowledge_comment_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_comment jsonb;
  comment_id text;
  actor_id_text text;
  actor_uuid uuid;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.comments, '[]'::jsonb) = coalesce(old.comments, '[]'::jsonb) then
    return new;
  end if;

  for new_comment in select value from jsonb_array_elements(coalesce(new.comments, '[]'::jsonb)) loop
    comment_id := coalesce(new_comment ->> 'id', '');
    if comment_id = '' then
      continue;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(old.comments, '[]'::jsonb)) as prev(value)
      where coalesce(prev.value ->> 'id', '') = comment_id
    ) then
      continue;
    end if;

    actor_id_text := coalesce(new_comment ->> 'userId', new_comment ->> 'user_id', '');
    if actor_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    actor_uuid := actor_id_text::uuid;

    if actor_uuid = new.user_id then
      continue;
    end if;

    insert into public.messages (
      user_id,
      actor_id,
      source_type,
      source_id,
      source_comment_id,
      source_preview,
      content,
      is_read
    )
    values (
      new.user_id,
      actor_uuid,
      'knowledge',
      new.id,
      comment_id,
      left(coalesce(new.question, ''), 120),
      coalesce(new_comment ->> 'text', ''),
      0
    )
    on conflict (user_id, actor_id, source_type, source_id, source_comment_id) do nothing;
  end loop;

  return new;
end
$$;

drop trigger if exists trg_enqueue_knowledge_comment_messages on public.knowledge;
create trigger trg_enqueue_knowledge_comment_messages
after update of comments on public.knowledge
for each row
execute function public.enqueue_knowledge_comment_messages();

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

drop policy if exists "profiles_delete_self" on public.profiles;
create policy "profiles_delete_self"
on public.profiles for delete
to authenticated
using (auth.uid() = id);

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set friends = array_remove(friends, uid::text),
      updated_at = timezone('utc', now())
  where uid::text = any(friends);

  delete from auth.users where id = uid;
  return true;
end
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.append_post_comment(p_post_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  normalized_comment jsonb;
  updated_comments jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_post_id is null or btrim(p_post_id) = '' then
    raise exception 'post id is required';
  end if;

  normalized_comment := coalesce(p_comment, '{}'::jsonb);
  normalized_comment := normalized_comment || jsonb_build_object(
    'id', coalesce(nullif(normalized_comment ->> 'id', ''), gen_random_uuid()::text),
    'userId', uid::text,
    'createdAt', coalesce(nullif(normalized_comment ->> 'createdAt', ''), timezone('utc', now())::text)
  );

  update public.posts
  set comments = coalesce(comments, '[]'::jsonb) || jsonb_build_array(normalized_comment)
  where id = p_post_id
  returning comments into updated_comments;

  if updated_comments is null then
    raise exception 'post not found';
  end if;

  return updated_comments;
end
$$;

revoke all on function public.append_post_comment(text, jsonb) from public;
grant execute on function public.append_post_comment(text, jsonb) to authenticated;

create or replace function public.append_knowledge_comment(p_knowledge_id text, p_comment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  normalized_comment jsonb;
  updated_comments jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_knowledge_id is null or btrim(p_knowledge_id) = '' then
    raise exception 'knowledge id is required';
  end if;

  normalized_comment := coalesce(p_comment, '{}'::jsonb);
  normalized_comment := normalized_comment || jsonb_build_object(
    'id', coalesce(nullif(normalized_comment ->> 'id', ''), gen_random_uuid()::text),
    'userId', uid::text,
    'createdAt', coalesce(nullif(normalized_comment ->> 'createdAt', ''), timezone('utc', now())::text)
  );

  update public.knowledge
  set comments = coalesce(comments, '[]'::jsonb) || jsonb_build_array(normalized_comment)
  where id = p_knowledge_id
  returning comments into updated_comments;

  if updated_comments is null then
    raise exception 'knowledge not found';
  end if;

  return updated_comments;
end
$$;

revoke all on function public.append_knowledge_comment(text, jsonb) from public;
grant execute on function public.append_knowledge_comment(text, jsonb) to authenticated;

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
