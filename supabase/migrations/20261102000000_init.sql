-- 폰트샵 초기 스키마
-- 원칙: 브라우저(anon/authenticated)는 자기 주문 읽기만. 쓰기는 전부 서버(service role)에서.

create type order_status as enum ('READY', 'CONFIRMING', 'PAID', 'FAILED', 'CANCELED');

create table public.orders (
  order_no      bigint generated always as identity (start with 10001) primary key, -- fontmark 워터마크에 들어가는 32bit 번호
  order_id      text unique not null,          -- 토스에 넘기는 주문번호 (ORD-10001-xxxxxxxxxxxx)
  user_id       uuid not null references auth.users (id) on delete restrict,
  product_slug  text not null,
  font_id       text not null,                 -- 마스터 버전. 유출 검사 때 같은 마스터로 추출해야 한다
  order_name    text not null,
  amount        integer not null check (amount > 0),
  customer_email text not null,
  licensee_name text not null,                 -- 폰트 파일에 기록되는 이름
  status        order_status not null default 'READY',
  -- 전자상거래법 17조 2항 5호: 디지털콘텐츠 청약철회 배제 명시적 동의
  withdrawal_waiver_agreed_at timestamptz not null,
  eula_agreed_at timestamptz not null,
  payment_key   text unique,
  method        text,
  approved_at   timestamptz,
  receipt_url   text,
  failure       jsonb,
  fulfill_started_at timestamptz,              -- 파일 생성 잠금 (한 번만)
  fulfilled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (order_no < 4294967296)
);
create index orders_user_idx on public.orders (user_id, created_at desc);

create table public.order_events (
  id        bigint generated always as identity primary key,
  order_no  bigint not null references public.orders (order_no) on delete cascade,
  event     text not null,
  detail    text,
  at        timestamptz not null default now()
);

-- 워터마크를 넣어 만든 구매자 전용 파일
create table public.order_files (
  id           uuid primary key default gen_random_uuid(),
  order_no     bigint not null references public.orders (order_no) on delete cascade,
  storage_path text not null,                  -- deliveries 버킷 안의 경로
  filename     text not null,                  -- 다운로드 시 파일명
  format       text not null,
  sha256       text not null,                  -- 유출 파일과 정확히 같은지 바로 확인
  bytes        integer not null,
  created_at   timestamptz not null default now()
);

-- 메일로 보내는 다운로드 링크 (토큰 원문은 저장하지 않고 해시만)
create table public.download_links (
  id          uuid primary key default gen_random_uuid(),
  order_no    bigint not null references public.orders (order_no) on delete cascade,
  token_hash  text unique not null,
  expires_at  timestamptz not null,
  max_uses    integer not null default 5,
  uses        integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.downloads (
  id       bigint generated always as identity primary key,
  link_id  uuid references public.download_links (id) on delete set null,
  order_no bigint not null references public.orders (order_no) on delete cascade,
  file_id  uuid references public.order_files (id) on delete set null,
  via      text not null,                      -- 'email_link' | 'account'
  ip       text,
  ua       text,
  at       timestamptz not null default now()
);

create table public.emails (
  id          bigint generated always as identity primary key,
  order_no    bigint references public.orders (order_no) on delete set null,
  to_email    text not null,
  subject     text not null,
  status      text not null,                   -- 'sent' | 'failed' | 'skipped'(키 없음)
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);

-- 다운로드 링크 사용: 만료·횟수를 한 번의 조건부 UPDATE 로 확인해서 동시 요청에도 초과하지 않게 한다
create function public.use_download_link(p_token_hash text)
returns table (link_id uuid, order_no bigint, uses integer, max_uses integer)
language sql
security definer
set search_path = public
as $$
  update public.download_links l
     set uses = l.uses + 1
    from public.orders o
   where l.token_hash = p_token_hash
     and l.order_no = o.order_no
     and o.status = 'PAID'
     and l.expires_at > now()
     and l.uses < l.max_uses
  returning l.id, l.order_no, l.uses, l.max_uses;
$$;
revoke execute on function public.use_download_link(text) from public, anon, authenticated;

alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.order_files enable row level security;
alter table public.download_links enable row level security;
alter table public.downloads enable row level security;
alter table public.emails enable row level security;

-- 로그인한 구매자는 자기 주문과 파일 목록만 읽을 수 있다
create policy "own orders" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own files" on public.order_files
  for select to authenticated using (
    exists (select 1 from public.orders o where o.order_no = order_files.order_no and o.user_id = (select auth.uid()))
  );

-- 파일 버킷: 비공개. 접근은 서버가 짧은 서명 URL 로만
insert into storage.buckets (id, name, public) values ('deliveries', 'deliveries', false)
on conflict (id) do nothing;
