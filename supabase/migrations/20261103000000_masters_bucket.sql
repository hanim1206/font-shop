-- 폰트 원본 버킷: 비공개. 정책을 두지 않아 서버(secret key)만 읽을 수 있다
insert into storage.buckets (id, name, public) values ('masters', 'masters', false)
on conflict (id) do nothing;
