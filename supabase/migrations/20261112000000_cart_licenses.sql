-- 장바구니 다건 주문 + 라이선스 2종(Desktop / Web)
-- 한 주문에 여러 항목(폰트 웨이트 × 라이선스)을 담는다. 워터마크 번호는 주문번호 하나를 모든 파일에 쓴다.

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_no     bigint not null references public.orders (order_no) on delete cascade,
  product_slug text not null,
  font_id      text not null,                  -- 마스터 버전. 유출 검사 때 같은 마스터로 추출해야 한다
  license_type text not null check (license_type in ('desktop', 'web')),
  item_name    text not null,                  -- 주문 당시 표시 이름 (상품명이 바뀌어도 남도록)
  unit_price   integer not null check (unit_price > 0),
  created_at   timestamptz not null default now(),
  unique (order_no, product_slug, license_type)
);
create index order_items_order_idx on public.order_items (order_no);

-- 라이선스 사용자 정보 (개인 / 회사·단체)
alter table public.orders
  add column licensee_type text not null default 'personal' check (licensee_type in ('personal', 'company')),
  add column biz_no        text,               -- 사업자등록번호 (세금계산서용, 선택)
  add column web_domain    text;               -- Web 라이선스를 쓸 도메인 1개 (Web 항목이 있을 때만)

-- 이제 상품은 order_items 에 있다. 예전 단건 주문 칼럼은 기록용으로만 남긴다.
alter table public.orders alter column product_slug drop not null;
alter table public.orders alter column font_id drop not null;

-- 어떤 항목의 파일인지 (묶음 zip 은 null)
alter table public.order_files add column item_id uuid references public.order_items (id) on delete set null;

-- 기존 단건 주문을 항목 1개짜리 Desktop 주문으로 옮긴다
insert into public.order_items (order_no, product_slug, font_id, license_type, item_name, unit_price)
select order_no, product_slug, font_id, 'desktop', order_name, amount
  from public.orders
 where product_slug is not null;
update public.order_files f
   set item_id = i.id
  from public.order_items i
 where i.order_no = f.order_no and f.item_id is null;

alter table public.order_items enable row level security;
create policy "own items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.order_no = order_items.order_no and o.user_id = (select auth.uid()))
  );
