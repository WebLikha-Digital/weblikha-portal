-- =============================================================================
-- WEBLIKHA PORTAL — RICH-TEXT COMMENTS, EDITING, MENTIONS, ATTACHMENTS
-- Migration: 009_comment_richtext_mentions.sql
--
-- Changes:
--   1. task_comments: add updated_at (edit tracking) + mentions uuid[] column
--   2. RLS: authors can update their own comments
--   3. Raise body length cap (rich-text HTML is longer than plain text)
--   4. Storage bucket for comment image attachments (paste/drop/attach)
--
-- Run via: Supabase Dashboard → SQL Editor
-- Requires: 008_task_comments_and_completion_fix.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EDIT TRACKING + MENTIONS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.task_comments
  add column updated_at timestamptz not null default now(),
  add column mentions   uuid[]      not null default '{}';

-- Backfill so existing comments don't show as "(edited)"
update public.task_comments set updated_at = created_at;

comment on column public.task_comments.updated_at is
  'Set by trigger on update. updated_at > created_at ⇒ comment was edited.';
comment on column public.task_comments.mentions is
  'User IDs @mentioned in the body. Only project members can be mentioned
   (clients later). Enables notification fan-out without parsing HTML.';

-- Reuse the shared set_updated_at() trigger function from 001
create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AUTHOR EDIT POLICY
--    (admin update is already covered by "task_comments: admin all")
-- ─────────────────────────────────────────────────────────────────────────────

create policy "task_comments: author updates own"
  on public.task_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BODY LENGTH — HTML markup needs more room than plain text
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.task_comments
  drop constraint task_comments_body_check;

alter table public.task_comments
  add constraint task_comments_body_check
  check (char_length(trim(body)) between 1 and 20000);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. STORAGE — comment image attachments
--    Public-read bucket; authenticated users upload; uploader can delete.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('comment-attachments', 'comment-attachments', true)
on conflict (id) do nothing;

create policy "comment attachments: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comment-attachments');

create policy "comment attachments: public read"
  on storage.objects for select
  using (bucket_id = 'comment-attachments');

create policy "comment attachments: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'comment-attachments' and owner = auth.uid());

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
