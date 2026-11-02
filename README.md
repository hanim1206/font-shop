# Font Shop (테스트)

개인 폰트 판매 사이트 연습용 프로젝트. 회원가입 → 상세페이지 미리보기 → 토스 결제 → 주문번호 워터마크를 넣은 구매자 전용 파일 → 이메일 다운로드 링크까지 한 흐름으로 동작한다.
판매 정보·폰트는 전부 더미다 (Noto Sans KR 을 이름만 바꾼 `하님 더미고딕`).

| 페이지 | 경로 | 하는 일 |
|---|---|---|
| 목록 | `/` | 폰트 카드. 견본 문장도 동적 서브셋으로 그 글자만 받아 그림 |
| 상세 | `/fonts/[slug]` | 입력한 문장을 실시간 미리보기 (산돌식 동적 서브셋) |
| 결제 | `/checkout/[slug]` | 로그인 필요. 라이선스 받는 분 이름 + EULA·청약철회 배제 동의 + 토스 결제위젯 |
| 결제완료 | `/checkout/success` | 서버 승인 → 워터마크 파일 생성 → 메일 발송 결과 |
| 회원가입 / 로그인 | `/signup` `/login` | 이메일(필수) + 비밀번호 8자 이상 |
| 내 구매내역 | `/account` | 내 주문, 재다운로드 |
| 메일 링크 | `/download/[token]` | 7일·5회. 열어 보기만 해서는 횟수가 줄지 않음 (버튼 = POST) |
| 라이선스 확인 | `/verify/[주문ID]` | 폰트 파일 name 테이블에 적힌 주소. 이름은 가려서 보여줌 |
| 관리자 | `/admin/orders` | `ADMIN_EMAILS` 계정만. 주문·구매자·파일 해시·메일·다운로드·이력 |

## 흐름

```
상세페이지 ── GET /api/preview?font=&text=  → 입력한 글자만 담은 woff2 (수 KB)
   │
결제 페이지 (로그인) ── POST /api/orders     금액은 서버 카탈로그, 동의 시각 저장, 메일 = 가입 이메일
   │  토스 결제위젯 requestPayment()
   ▼
/checkout/success ── POST /api/payments/confirm
   │  ① 본인 주문인지  ② 저장 금액 = amount  ③ READY→CONFIRMING 잠금  ④ 토스 승인 API  ⑤ 응답 재확인 → PAID
   ▼
fulfillOrder()  (lib/fulfill.ts, 주문당 한 번만)
   │  worker/fontmark.py embed --order-id <주문번호>   → 구매자 전용 TTF
   │  Supabase Storage deliveries 버킷(비공개)에 랜덤 경로로 저장, sha256 기록
   │  다운로드 링크 토큰 발급 (DB엔 해시만)
   ▼  메일 (Resend / 로컬 Mailpit): 링크만, 파일 첨부 없음
/download/[token] → POST /api/download/[token]  DB 함수 use_download_link 가 만료·횟수·PAID 를 한 번에 확인
POST /api/webhooks/toss  본문을 믿지 않고 paymentKey 로 재조회. DONE(승인 응답 유실 복구) / CANCELED(→ 다운로드 차단)
```

## 보안 포인트

- **동적 서브셋 미리보기** (`lib/preview.ts`): 브라우저엔 입력한 글자만 든 작은 woff2 가 간다. 전체 폰트는 절대 안 내려감. 한 번에 서로 다른 글자 60자, IP 당 한 시간 1,500자 상한(글자를 바꿔 가며 모으는 것 방지), 다른 사이트에서 `@font-face` 로 끌어다 쓰면 403 (`Sec-Fetch-Site`). 마스터 파일은 `fonts/masters/`(공개 폴더 아님, git 제외).
- **주문번호 워터마크** (`worker/fontmark.py`): 두 겹.
  - 보이는 층: name 테이블에 `Licensed to <이름> · <주문ID> · order #<번호>` + 확인 주소. 쉽게 지워지지만 "모르고 공유"를 막는다.
  - 안 보이는 층: 주문번호 32bit + CRC-16 을 글리프 좌표 홀짝(±1 unit, 눈으로 구분 불가)에 넣는다. 위치는 `FONTMARK_SECRET` 으로 정해져서 비밀키 없이는 못 찾는다. 이름을 지우고 일부 글자만 남겨 WOFF2 로 바꿔도 남는다.
- **결제**: 금액은 서버가 계산, 승인 전에 금액 대조, 조건부 UPDATE 로 중복 승인 방지, 웹훅은 재조회로만 반영. 토스 시크릿 키는 서버 전용 파일(`server-only`).
- **DB 권한**: 모든 테이블 RLS. 브라우저는 자기 주문·파일 목록 읽기만, 쓰기는 서버(secret key)만. 남의 파일 id 로 요청하면 404.
- **법**: 디지털콘텐츠 청약철회 배제 동의를 별도 체크박스로 받고 시각을 `orders.withdrawal_waiver_agreed_at` 에 저장.

### 워터마크 실측 (Noto Sans KR 기반 더미, 2026-11-02)

구매 파일에서 이름을 지우고 문장 일부만 남겨 서브셋한 뒤 복원:

| 남긴 글자 | 결과 |
|---|---|
| 한국어 단어 2개 이상 (예: `가을 전시회에`) | 45/45 복원, 오답 0 |
| 한국어 단어 1개 | 38/45 복원, 오답 0 |
| `Hello World` | 복원 |
| `가나`, `Hi` 처럼 두 글자 | 복원 안 됨 (정보량 부족) |
| 워터마크 없는 원본 | 미검출 (오탐 없음) |

한 주문 생성에 약 5초(첫 주문은 위치 계산 캐시를 만드느라 20초 정도). 한계: Glyphs 등에서 외곽선을 다시 export 하거나 의도적으로 모든 점을 흔들면 사라진다. 그 수준은 고의 유출이라 파일 비교·디자이너 판단의 영역.

## 로컬 실행

필요: Node 22+, Python 3.10+, Docker(로컬 Supabase).

```bash
npm install
pip install -r worker/requirements.txt
npm run fonts:dummy             # Noto Sans KR 을 받아 fonts/masters/ 에 더미 마스터 2개 생성
npm run db:start                # 로컬 Supabase (처음엔 이미지 받느라 몇 분)
npx supabase db reset           # supabase/migrations 적용
cp .env.example .env.local      # supabase status 의 키, FONTMARK_SECRET(openssl rand -hex 32), 내 이메일 채우기
npm run dev                     # http://localhost:3000
```

- 가입 인증 메일과 다운로드 메일은 로컬 Mailpit(http://127.0.0.1:54324) 에서 본다 (`MAIL_PROVIDER=mailpit`).
- 진짜 메일로 받으려면 [Resend](https://resend.com) 가입 → API 키 → `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_TO_OVERRIDE=내 메일`. 도메인 인증 전 테스트 모드는 가입한 본인 메일로만 보낼 수 있다.
- 토스 테스트 결제창에서는 아무 카드나 골라 진행하면 실제 출금 없이 승인된다.
- 관리자 화면: `.env.local` 의 `ADMIN_EMAILS` 에 넣은 이메일로 가입하면 상단에 "관리자" 메뉴가 생긴다.

### 자동 점검 (토스 서버 없이)

```bash
npm run build
node scripts/mock-toss.mjs &                                    # 토스 API 목 서버 :4010
TOSS_API_BASE=http://localhost:4010 npx next start &           # .env.local 의 MAIL_PROVIDER=mailpit
node scripts/e2e.mjs                                            # Playwright 로 실제 화면을 돌린다
```

2026-11-02 결과 (모두 통과):

```
✓ 이메일+비밀번호 회원가입 → 로그인 상태
✓ 비로그인 사용자는 결제 페이지 → 로그인으로
✓ 상세 미리보기: 입력한 글자만 woff2 로 받아 적용 (1972 bytes, 마스터는 6MB)
✓ 미리보기 제한: 한 번에 60자 초과 413, 다른 사이트에서 가져다 쓰기 403
✓ 주문: 동의 없으면 거절, 클라이언트 금액 무시하고 서버 가격 33,000원, 메일은 가입 이메일
✓ successUrl 금액 위조 → 승인 전에 차단
✓ 정상 결제 → PAID → 주문 #10004 워터마크 파일 생성
✓ 새로고침 재승인은 같은 결과, 다른 paymentKey 로 재승인은 409
✓ 구매자 이메일로 다운로드 링크 1통 (파일 첨부 없음)
✓ 받은 파일에서 주문번호 #10004 복원 (안 보이는 층), name 에 구매자 이름
✓ 이름 삭제 + 20글자 서브셋 + WOFF2 변환 뒤에도 #10004 복원
✓ 다운로드 1회 차감 (5회 중 4회 남음)
✓ 내 구매내역에서 재다운로드
✓ 다른 회원이 같은 파일 주소로 요청 → 404 (RLS)
✓ 관리자 주문 목록에 주문·구매자·파일 해시·메일·다운로드 기록, 일반 회원은 404
✓ 결제 취소 웹훅 → 메일 링크 다운로드 차단, 위조 웹훅은 무시
```

**아직 확인 못 한 것**: 개발 환경에서 토스(js/api.tosspayments.com)와 Resend 에 접속할 수 없어서 결제위젯 화면, 실제 승인 API, 실제 메일 발송은 돌려보지 못했다. 요청 형식은 문서·SDK 타입대로다. 로컬에서 `npm run dev` 로 한 번 결제해 보면 확인된다.

## 실제 폰트로 바꾸기

1. 폰트 파일을 `fonts/masters/` 에 넣는다 (레포에 올리지 않음).
2. `lib/catalog.ts` 의 `fontId`·`masterFile`·`downloadName`·가격을 고친다.
3. `fontId` 와 `FONTMARK_SECRET`, `worker/fontmark.py` 의 `PLAN_VERSION` 은 판매를 시작한 뒤 바꾸지 않는다. 바꾸면 이미 판 파일에서 주문번호를 못 읽는다.

## 배포할 때

- Supabase 클라우드 프로젝트 생성 → `npx supabase link` → `npx supabase db push`. Auth 설정에서 **이메일 인증(Confirm email)을 켠다** (로컬은 꺼져 있음). Site URL·Redirect URL 에 배포 주소 + `/auth/callback`.
- 워터마크는 Python 이 필요하다. Vercel 같은 서버리스에선 Python 을 같이 못 돌리므로, 웹은 Vercel 에 두고 `fontmark` 를 작은 워커(Fly.io, Railway 등)로 떼어 큐로 연결하거나, 둘 다 Python 이 깔린 컨테이너 하나(Render, Fly)에 올린다.
- 동적 서브셋 IP 제한은 지금 메모리에 있다. 서버가 여러 대면 Redis(Upstash 등)로 옮긴다.
- 라이브 결제: 사업자등록 + 통신판매업 신고 → 토스페이먼츠 계약 → 라이브 키는 배포 환경 변수에만. 하단 사업자 정보(`lib/catalog.ts` 의 `SELLER`)를 실제 정보로.

## 파일

| 파일 | 역할 |
|---|---|
| `lib/catalog.ts` | 상품·가격·판매자 정보 (가격의 단일 출처) |
| `lib/preview.ts`, `app/api/preview` | 동적 서브셋 미리보기 (harfbuzz wasm, `subset-font`) |
| `lib/orders.ts` | 주문 저장·조건부 상태 전이 |
| `lib/toss.ts` | 토스 승인·조회 API |
| `lib/fulfill.ts`, `lib/fontmark.ts` | 결제 후 워터마크 파일 생성 → 저장 → 링크 → 메일 |
| `lib/mail.ts` | Resend / Mailpit / 기록만 |
| `worker/fontmark.py` | 워터마크 삽입·추출 (`extract` 로 유출 파일 검사) |
| `worker/make_dummy_fonts.py` | 더미 마스터 생성 |
| `supabase/migrations/` | 테이블, RLS, 다운로드 링크 함수, 비공개 버킷 |
| `scripts/mock-toss.mjs`, `scripts/e2e.mjs` | 목 서버와 화면 점검 |

유출 의심 파일 검사:

```bash
FONTMARK_SECRET=... python3 worker/fontmark.py extract \
  --master fonts/masters/HanimDummyGothic-Regular-1.000.ttf \
  --font-id HanimDummyGothic-Regular-1.000 --suspect leaked.woff2
# → outline_layer.order_id 가 주문번호. confidence 가 low 면 주문 DB 와 대조
```
