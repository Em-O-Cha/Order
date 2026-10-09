-- ลูกค้าหน้าบูธที่พนักงานส่งเข้ามาทาง LINE OA (Edge Function booth-line) — หน้าเว็บ BoothCRM อ่านผ่าน booth-leads
--
-- booth.leads  หนึ่งแถวต่อลูกค้าหนึ่งคน: ข้อความที่พนักงานส่ง (raw_text) + ข้อมูลที่ Claude แยกให้
--              พนักงานส่ง "+ ข้อความ" เพื่อต่อท้ายรายการล่าสุดของตัวเอง แล้วให้ AI อ่านใหม่ทั้งหมด
-- booth.staff  พนักงานแต่ละคน (LINE user id): ชื่อใน LINE + ชื่องานที่ตั้งไว้ล่าสุด
-- ทุกอย่างเรียกได้เฉพาะ service_role (Edge Function) — ข้อมูลลูกค้าไม่เปิดให้หน้าเว็บอ่านตรง
create schema if not exists booth;

create table if not exists booth.leads (
  id            bigint      generated always as identity primary key,
  source        text        not null default 'line',
  line_user_id  text,
  staff_name    text        not null default '',
  event         text        not null default '',
  raw_text      text        not null default '',
  name          text        not null default '',
  phone         text        not null default '',
  branch        text        not null default '',
  survey        jsonb       not null default '{}'::jsonb,
  summary       text        not null default '',
  ai_error      text,                            -- AI อ่านไม่สำเร็จ (ยังเก็บข้อความไว้)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists leads_created_idx on booth.leads (created_at desc);
create index if not exists leads_user_idx on booth.leads (line_user_id, created_at desc);
alter table booth.leads enable row level security;

create table if not exists booth.staff (
  line_user_id  text        primary key,
  display_name  text        not null default '',
  event         text        not null default '',
  updated_at    timestamptz not null default now()
);
alter table booth.staff enable row level security;

revoke all on schema booth from public, anon, authenticated;
revoke all on booth.leads, booth.staff from public, anon, authenticated;
grant usage on schema booth to service_role;
grant select, insert, update, delete on booth.leads, booth.staff to service_role;

-- พนักงาน: อัปเดตชื่อ LINE เสมอ, เปลี่ยนชื่องานเฉพาะเมื่อส่งมา (p_event = null คือไม่เปลี่ยน)
create or replace function public.booth_staff_touch(p_line_user_id text, p_display_name text, p_event text)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  insert into booth.staff as s (line_user_id, display_name, event)
  values (p_line_user_id, coalesce(p_display_name, ''), coalesce(p_event, ''))
  on conflict (line_user_id) do update
     set display_name = case when coalesce(excluded.display_name, '') <> '' then excluded.display_name else s.display_name end,
         event = case when p_event is null then s.event else excluded.event end,
         updated_at = now()
  returning to_jsonb(s)
$$;

create or replace function public.booth_lead_insert(p jsonb)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  insert into booth.leads as l (source, line_user_id, staff_name, event, raw_text, name, phone, branch, survey, summary, ai_error)
  values (coalesce(p->>'source', 'line'), p->>'line_user_id', coalesce(p->>'staff_name', ''), coalesce(p->>'event', ''),
          coalesce(p->>'raw_text', ''), coalesce(p->>'name', ''), coalesce(p->>'phone', ''), coalesce(p->>'branch', ''),
          coalesce(p->'survey', '{}'::jsonb), coalesce(p->>'summary', ''), p->>'ai_error')
  returning to_jsonb(l)
$$;

-- แก้เฉพาะช่องที่ส่งมา
create or replace function public.booth_lead_update(p_id bigint, p jsonb)
returns jsonb
language sql volatile security definer set search_path = '' as $$
  update booth.leads l
     set raw_text = coalesce(p->>'raw_text', l.raw_text),
         name     = coalesce(p->>'name', l.name),
         phone    = coalesce(p->>'phone', l.phone),
         branch   = coalesce(p->>'branch', l.branch),
         survey   = coalesce(p->'survey', l.survey),
         summary  = coalesce(p->>'summary', l.summary),
         ai_error = case when p ? 'ai_error' then p->>'ai_error' else l.ai_error end,
         updated_at = now()
   where l.id = p_id
  returning to_jsonb(l)
$$;

-- รายการล่าสุดของพนักงานคนนี้ ภายในช่วงเวลาที่กำหนด (ไว้ต่อท้าย "+" หรือ "ลบ")
create or replace function public.booth_lead_latest(p_line_user_id text, p_within_minutes int)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(l) from booth.leads l
   where l.line_user_id = p_line_user_id and l.created_at > now() - make_interval(mins => p_within_minutes)
   order by l.created_at desc limit 1
$$;

create or replace function public.booth_lead_delete(p_id bigint, p_line_user_id text)
returns boolean
language sql volatile security definer set search_path = '' as $$
  with d as (delete from booth.leads where id = p_id and line_user_id = p_line_user_id returning 1)
  select exists (select 1 from d)
$$;

create or replace function public.booth_leads_list(p_limit int)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (select * from booth.leads order by created_at desc limit greatest(1, least(p_limit, 2000))) x
$$;

revoke all on function public.booth_staff_touch(text, text, text) from public, anon, authenticated;
revoke all on function public.booth_lead_insert(jsonb) from public, anon, authenticated;
revoke all on function public.booth_lead_update(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.booth_lead_latest(text, int) from public, anon, authenticated;
revoke all on function public.booth_lead_delete(bigint, text) from public, anon, authenticated;
revoke all on function public.booth_leads_list(int) from public, anon, authenticated;
grant execute on function public.booth_staff_touch(text, text, text) to service_role;
grant execute on function public.booth_lead_insert(jsonb) to service_role;
grant execute on function public.booth_lead_update(bigint, jsonb) to service_role;
grant execute on function public.booth_lead_latest(text, int) to service_role;
grant execute on function public.booth_lead_delete(bigint, text) to service_role;
grant execute on function public.booth_leads_list(int) to service_role;
