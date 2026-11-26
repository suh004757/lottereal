# SDD — 롯데부동산 자매 플랫폼 POC (확인 매물 + 계약 후 대시보드)

- 문서 상태: **승인됨 (2026-11-27, 오너)**, 같은 날 개정 1: 운영 방향(§1.1), 확인 등급, D0 운영 DB 검토 추가. 실행 에이전트는 이 문서만으로 끝까지 진행한다.
- 실행 에이전트: **GPT 6.2 SOL** (AGENTS.md 규칙 9의 SOL 모델). 설계·검토는 Claude가 맡는다.
- 작업 저장소: `F:\Git\lottereal` (GitHub `suh004757/lottereal`, `main`). 서버 작업 공간: Hermes 컨테이너 `/opt/data/projects/lottereal`.
- 상위 규칙: `AGENTS.md`가 이 문서보다 우선한다. 충돌하면 멈추고 기록한다.

---

## 0. 실행 에이전트에게 (먼저 읽기)

1. **순서대로** 진행한다: D0 → P0 → M1 → M2 → M3 → M4 → M5 (병렬 가능한 구간은 5번). 각 마일스톤 끝의 "완료 조건"을 모두 만족해야 다음으로 간다.
   - **이 문서의 구현 세부(테이블·컬럼·RPC 이름, 마이그레이션 번호, 화면 구성)는 레포 마이그레이션 001~032만 보고 쓴 가정이다.** 운영 DB는 보지 못했다. D0에서 운영 DB를 읽기 전용으로 대조한 뒤, §1.1 운영 방향 안에서 현실에 맞게 고쳐서 진행한다.
   - 고칠 때의 경계: §1.1을 지키고, 새 `pf_` 객체만 바꾸는 조정은 기록 후 바로 진행한다. **기존 운영 테이블(`property_listings`, `inquiries` 등)이나 운영 중인 문의 경로를 바꾸는 조정은 제안만 하고 H6에서 멈춘다.**
2. **커밋 단위:** 마일스톤마다 1~3개 커밋, 메시지 앞에 `[verified]`. 끝에는 아래 trailer를 붙인다.
   ```
   Co-Authored-By: GPT 6.2 SOL
   ```
   push 후에는 `python3 scripts/post_push_guard.py`를 실행하고, 실패하면 AGENTS.md의 자동 롤백 규칙을 따른다.
3. **사람 게이트(§11):** 만나면 그 마일스톤의 나머지 중 게이트와 무관한 일만 끝내고, `docs/platform/STATUS.md`에 "대기: 무엇을, 누가" 를 적고 멈춘다. 추측으로 통과시키지 않는다.
4. **매 작업 후** `docs/platform/STATUS.md`에 다음을 남긴다. 고객 개인정보는 넣지 않는다.
   - 날짜(KST), 마일스톤, 변경 파일, 실행한 검증과 결과, 남은 리스크, 다음 액션
5. **실행 도구 (Hermes에 omh = oh-my-hermes 설치됨, `/opt/data/plugins/omh`, 스킬은 `/opt/data/omh-store/skills`):**
   - 전체 진행은 `dag-ulw`로 한다. 이 SDD를 승인된 계획으로 보고 다시 계획하지 않는다. 마일스톤을 노드로, 각 "완료 조건"을 그 노드의 VERIFY/STOP WHEN으로, 사람 게이트(§11)를 멈추는 노드로 둔다.
   - 의존 순서: D0 → (P0 ∥ M1) → M2 → M3 → M4 → M5. P0(서버 잡)와 M1(마이그레이션)은 쓰기 범위가 겹치지 않아 병렬 가능하다. M2의 테스트·CSS처럼 서로 다른 파일만 쓰는 하위 작업도 병렬로 돌릴 수 있다.
   - **같은 파일을 두 노드가 쓰지 않게** `write_scope`를 나눈다. 특히 `docs/platform/STATUS.md`, `docs/platform/SDD.md`, `public/js/admin-dashboard.js`, `supabase/migrations/`는 한 번에 한 노드만 쓴다. STATUS는 부모가 레이어 단위로 한 번에 적는다.
   - D0과 M1의 마이그레이션 설계에는 `omh-relational-db`를 쓴다. 단계마다 잠금 동작과 롤백을 적는다.
   - omh의 승인 우회·거버넌스 설정과 상관없이 AGENTS.md와 이 문서의 금지·게이트가 우선한다. omh 기능으로 사람 게이트를 자동 통과시키지 않는다.
6. **금지:**
   - 기존 매물·문의 데이터 삭제
   - 기존 admin 기능 동작 변경. "추가"만 허용한다.
   - secret/service key를 브라우저 코드나 로그에 넣는 것
   - 고객에게 자동으로 메시지 보내기
   - `public/platform/`의 noindex를 M5 게이트 전에 해제하는 것
   - 메인 사이트 내비게이션에 플랫폼 링크를 넣는 것

---

## 1. 배경과 목표

**문제**
- 오너는 직방 광고에 1~3개월마다 약 200만원을 쓴다. 고객들은 허위매물을 크게 불신한다.
- 중개사무소의 강점이 더는 "집을 보여주는 것"이 아니다. 계약 후 장기 관리로 옮겨갈 수 있다.

**제안:** 롯데부동산이 직접 확인한 매물만 올리는 자매 플랫폼을 만든다.
- 소유자는 계정 없이 "등록 요청"을 보내고, 가족(관리자)이 기존 admin에서 확인한 뒤 게시한다.
- 계약 후에도 매물·계약 정보가 임대인/임차인 대시보드로 남는다. 대시보드는 주요 일정, 신고 항목, 수리 요청, 재등록을 다룬다.
- 앱이 아니라 PC·모바일 웹이다.

### 1.1 운영 방향 (오너 확정. 실행 에이전트가 바꾸지 않는다)

1. **빈 상태로 열어도 된다.** 매물은 가족이 기존 매물 자료를 admin에서 플랫폼에 올려 채운다. 오픈 시점의 매물 수를 완료 조건으로 삼지 않는다.
2. **전제: "중개 의뢰를 위해 직접 방문하거나 전화한 의뢰인"의 매물만 게시한다.** POC 동안 방문·전화 접촉이 없는 사람의 요청은 게시하지 않는다(등록 요청 폼으로만 들어온 건은 가족이 전화로 접촉한 뒤에야 게시 가능).
3. **확인은 등급으로 구분해서 표시한다.** 이것이 플랫폼의 신뢰 레이어다.

   | 등급 key | 표시 문구 (초안, H1 검토) | 의미 |
   |---|---|---|
   | `site_visit` | 롯데부동산 임장 확인 | 가족이 현장에 가서 매물과 거주 상태를 직접 봤다 |
   | `owner_listed` | 소유자 직접 의뢰 | 임장 전. 소유자(또는 가족)가 방문·전화로 중개를 의뢰했다 |
   | `tenant_listed` | 거주 임차인 의뢰 | 임장 전. 현재 거주 중인 임차인이 방문·전화로 내놓았다 |

   - 등급은 매물마다 **가장 최근 확인 기록** 하나로 정한다. 임장을 다녀오면 `site_visit`로 올라간다.
   - 확인일은 계속 표시하고, 30일이 지나면 등급과 상관없이 노출하지 않는다(A3).
   - `tenant_listed`는 임대인의 중개 의뢰 또는 동의가 있어야 광고할 수 있는지 법적 쟁점이 있다. H1에서 답을 받기 전까지 admin 게시 시 "임대인 의뢰·동의 확인" 체크를 필수로 한다.
4. **등록 요청 폼에 중개 의뢰 동의를 넣는다.** 개인정보 동의와 별개의 체크박스다. 문구 예: "이 매물의 중개를 롯데부동산에 의뢰하며, 확인 후 광고하는 데 동의합니다."
5. **문의 경로는 바뀔 수 있다.** 플랫폼이 생기면 메인 사이트의 문의 동선(폼, 전화, 직방 유입)과 겹친다. 실행 에이전트는 D0에서 현재 경로를 정리하고 통합안을 제안한다. 적용은 H6 승인 후.

**성공 지표:** 직방과 비교한다. 같은 달 기준이고, 월 단위로 §9 리포트에 쌓는다.

| 지표 | 직방 | 플랫폼 |
|---|---|---|
| 월 문의 수 | `external_inquiry_receipts` (P0에서 수집 복구) | H6 전: 플랫폼 전화 버튼 클릭 + `pf_listing_requests`. H6 후: `inquiries` 중 `source_channel='platform'` 추가 |
| 월 계약 수 | 오너 입력 (`pf_channel_monthly`) | 오너 입력 |
| 문의당 / 계약당 비용 | 광고비 ÷ 건수 (오너 입력 광고비) | 운영비 ÷ 건수 |
| 게시 매물 확인 등급 분포 | 해당 없음 | `site_visit` / `owner_listed` / `tenant_listed` 건수와 `site_visit` 비율. 30일 넘은 매물은 노출 0이 원칙 |
| 매물 공급 | 해당 없음 | 월 신규 게시 수 (admin 직접 게시 + 등록 요청 게시) |

**하지 않는 것 (POC 범위 밖)**
- 계약서·신분증 등 문서 파일 저장 (해킹 리스크. 오너 결정)
- 결제, 에스크로, 전자계약, 네이티브 앱
- 소유자가 관리자 승인 없이 직접 게시하는 것
- 고객 자동 메시지 (이메일·카카오 발송). 단, 인증용 매직링크는 예외
- 수리 요청의 사진 첨부, 관리비 정산 (주택임대관리업 소지)

---

## 2. 아키텍처 결정 (ADR 요약)

| # | 결정 | 이유 | 바꿀 조건 |
|---|---|---|---|
| A1 | POC는 같은 저장소 `public/platform/`에 두고 `https://lottes.co.kr/platform/`로 서빙한다 | 기존 JS 모듈(`../js/...`), CSP, Supabase 설정, 배포 파이프라인(`deploy-pages.yml`)을 그대로 쓴다. 도메인 구매나 새 저장소가 필요 없다 | M5에서 브랜드명·도메인이 확정되면 별도 저장소와 도메인으로 이전한다 (§10) |
| A2 | 같은 Supabase 프로젝트를 쓰고, 새 테이블은 `pf_` 접두어를 붙인다 | 매물은 기존 `property_listings`를 재사용한다. admin의 확인/마감 흐름과 감사 로그가 이미 있다 | — |
| A3 | "확인 매물" = `closed_at is null` **and** 플랫폼 확인 기록(`pf_listing_verifications`)이 있고 최신 기록이 30일 이내 | 메인 사이트의 "확인" 버튼(`last_verified_at`)은 "아직 있음"만 뜻해서 등급이 없다. 플랫폼 확인은 별도 append-only 테이블에 등급·접촉 경로와 함께 남기고, 기존 테이블은 건드리지 않는다. 미확인 매물은 **아예 노출하지 않는다** | D0에서 운영 DB에 쓸 만한 기존 필드가 발견되면 H6로 제안 |
| A4 | 계정은 Supabase Auth 이메일 매직링크만 쓴다. 역할은 `pf_members`에 둔다 | 비밀번호 저장이 없다. admin 역할은 계속 `app_metadata.role='admin'` | 카카오 로그인은 POC 이후 |
| A5 | 임대인·임차인은 **초대로만** 연결한다. admin이 계약을 만들고 일회용 초대 링크를 발급하면, 가족이 카톡으로 직접 전달한다 | 아무나 남의 계약에 붙을 수 없다. 자동 발송이 없다 | — |
| A6 | 주요 일정과 신고 체크리스트는 **클라이언트 순수 함수**로 계산한다 | DB에 파생 데이터를 저장하지 않는다. 테스트하기 쉽다 | 리마인더 발송이 생기면 서버로 옮긴다 |
| A7 | 모든 쓰기는 RLS + `security definer` RPC로 하고, admin RPC는 감사 행을 남긴다 | 기존 029·030 패턴과 같다 | — |
| A8 | 새 등록 요청 알림은 Hermes cron 스크립트가 오너에게 카카오 "나에게 보내기"를 보낸다. 내용은 건수만, 개인정보 없이 | 기존 `send_kakao_owner_alert` 재사용 | — |

---

## 3. 시스템 구성

```
[소유자]──등록요청(anon insert)──▶ pf_listing_requests ◀──알림 cron(service key)──▶ 오너 카카오
                                         │
[가족/관리자] public/admin/dashboard.html 「등록 요청」 탭
          └─ admin_publish_listing_request() ──▶ property_listings + pf_listing_verifications(등급)
[가족/관리자] 「플랫폼 게시」 탭 (기존 매물로 채우기, 임장 후 등급 올리기)
          └─ admin_record_listing_verification() ──▶ pf_listing_verifications

[방문자] public/platform/index.html, listing.html ──(anon select, 최신 확인 30일 이내만)──▶ property_listings ⋈ pf_listing_verifications
          └─ 문의 ──▶ 전화 버튼 (H6 후 inquiries source_channel='platform')

[관리자] 「계약 관리」 탭 ── admin_create_tenancy() ──▶ pf_tenancies + pf_invites(토큰 해시)
                                         └─ 초대 링크(#token) ── 가족이 카톡으로 전달
[임대인/임차인] platform/login.html(매직링크) → invite.html(claim_invite) → dashboard.html
          ├─ 주요 일정·신고 체크리스트 (클라이언트 계산)
          ├─ 수리 요청 ── pf_repair_requests
          └─ 재등록 ── request_relist() ──▶ pf_listing_requests

[지표] scripts/platform_metrics_report.py (월 1회, Hermes) ── 직방 receipts + 플랫폼 건수 + pf_channel_monthly
          └─▶ docs/platform/metrics/YYYY-MM.md (개인정보 없음)
```

---

## 4. 데이터 모델 (마이그레이션 033~037, 전부 추가형)

공통 규칙:
- 테이블마다 `enable row level security`를 켜고, `revoke all ... from public, anon, authenticated` 한 뒤 필요한 것만 grant 한다.
- 시간은 `timestamptz`, 날짜는 `date`, 금액은 `bigint`(원 단위가 아니라 **만원 단위**. 기존 `property_listings`와 같다).
- `drop table`, `on delete cascade` to `property_listings`, 기존 테이블 `update`는 금지한다. 단 037의 `inquiries` CHECK 목록 확장은 예외.
- 각 마이그레이션마다 `tests/test_pf_<name>_migration.py`를 둔다. 정적 SQL 검사이고 `tests/test_listing_unavailable_periods_migration.py` 스타일을 따른다.

### 033 `pf_listing_requests` — 소유자 등록 요청 (계정 없음)
| 컬럼 | 타입 | 규칙 |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| transaction_type | text | `in ('매매','전세','월세','단기임대')` |
| property_type | text | `in ('아파트','빌라','오피스텔','주택','사무실','상가','기타')` |
| address_text | text | 5~200자. 동·호수는 넣지 말라고 UI에서 안내 |
| district | text | 1~30자 |
| price_manwon / deposit_manwon / monthly_rent_manwon | bigint null | 각각 0 이상. 거래유형별 필수값은 CHECK로 강제 (매매→price, 전세→deposit, 월세→deposit+monthly) |
| available_from | date null | |
| area_m2 | numeric(7,2) null | > 0 |
| description | text | 0~1000자 |
| owner_name | text | 1~30자 |
| owner_phone | text | `^[0-9]{9,11}$` (기존 inquiries와 같다) |
| owner_role | text | `in ('소유자','소유자 가족','거주 임차인')` |
| privacy_consent | boolean | `= true` 필수 |
| brokerage_consent | boolean | `= true` 필수. 중개 의뢰 동의 (§1.1-4) |
| source | text | `in ('platform-request','relist')` |
| tenancy_id | uuid null | `relist`일 때만 값이 있다. references `pf_tenancies` (035에서 FK 추가) |
| status | text | `in ('new','reviewing','published','rejected')`, default `'new'` |
| reject_reason | text null | |
| published_listing_id | uuid null references property_listings(id) | |
| created_at, updated_at | timestamptz | |

- **권한:** anon은 insert만 가능하다 (`source='platform-request'`, `status='new'`, `tenancy_id is null`만 허용). select는 admin만, update는 RPC로만.
- **남용 방지:** `before insert` 트리거가 같은 `owner_phone`으로 24시간 안에 3건을 넘으면 거부한다. 메시지에 개인정보를 넣지 않는다.
- **보관:** 상태가 `rejected`이거나 `published`가 된 뒤 180일이 지나면 개인정보 컬럼(`owner_name`, `owner_phone`, `description`)을 null로 지운다. 행은 지표용으로 남긴다. `scripts/purge_expired_inquiries.py` 패턴으로 `scripts/purge_platform_requests.py`를 만든다. 지우기만 하고 `delete`는 하지 않는다.

### 034 admin RPC (요청 처리)
- `admin_list_listing_requests(status_filter text default null)` → setof. admin 확인 필수.
- `admin_set_listing_request_status(request_id uuid, new_status text, reason text default null)`: `reviewing` 또는 `rejected`. 감사 기록을 남긴다.
- `admin_publish_listing_request(request_id uuid, overrides jsonb, verification jsonb)` → uuid (새 listing id):
  - `property_listings`에 insert한다. 값은 요청 + overrides(title, price, 주소 표기, images 등 admin이 고친 값)이고, `contact_phone`은 기존 규칙대로 사무소 번호로 강제한다.
  - `last_verified_at = now()`, 요청 `status='published'`, `published_listing_id` 기록.
  - `verification`으로 `pf_listing_verifications` 첫 행을 같은 트랜잭션에서 만든다. 없거나 규칙 위반이면 전체를 거부한다.
  - `listing_state_audit`에 `action='publish_from_request'`로 남긴다.
- **`pf_listing_verifications`** (append-only. 플랫폼 노출의 유일한 근거):
  - 컬럼: id, listing_id uuid references property_listings(id), tier(`site_visit`/`owner_listed`/`tenant_listed`/`withdrawn`), intake_channel(`방문`/`전화`, `withdrawn`이면 null), landlord_consent_confirmed boolean, note text(0~300, 개인정보 금지 안내), verified_by uuid, verified_at timestamptz default now().
  - CHECK: `tier='tenant_listed'`이면 `landlord_consent_confirmed = true`.
  - anon은 `listing_id, tier, verified_at`만 select 가능(column grant)하고 나머지는 admin만. insert는 RPC로만, update·delete는 없다.
- `admin_record_listing_verification(listing_id uuid, tier text, intake_channel text, landlord_consent_confirmed boolean, note text)`: **기존 매물을 플랫폼에 올리는 경로.** 가족이 기존 매물 자료로 플랫폼을 채울 때와 임장 후 등급을 올릴 때 쓴다. `closed_at`이 있는 매물은 거부한다.
- `admin_unlist_from_platform(listing_id uuid, reason text)`: `tier='withdrawn'` 행을 추가해 플랫폼 노출만 내린다(최신 행이 `withdrawn`이면 비노출). 메인 사이트 노출에는 영향이 없다.
- 모든 확인 RPC는 `pf_request_audit`과 같은 방식으로 감사 행을 남긴다(D0 결과에 따라 `listing_state_audit` 재사용 여부 결정).
- **감사 테이블 `pf_request_audit`:** request_id, actor_id, action, previous_status, new_status, created_at. admin select만 가능하고 append-only다.
- 패턴은 `supabase/migrations/029_listing_rent_and_audit.sql`의 `admin_confirm_listing_available`과 같다: `security definer`, `set search_path = pg_catalog, public, auth`, admin 확인, `for update` 잠금.

### 035 계약·초대·회원
- **`pf_members`**: user_id uuid pk references auth.users, display_name text(1~30), terms_accepted_at timestamptz not null, created_at. 본인만 select/insert 가능하고, admin은 select 가능.
- **`pf_tenancies`**:
  - 컬럼: id, listing_id uuid null references property_listings(id), transaction_type(`매매`/`전세`/`월세`/`단기임대`), address_label text(동·호수 없이 표시용), contract_date date, start_date date, end_date date null(매매는 null), deposit_manwon, monthly_rent_manwon, price_manwon, landlord_user_id uuid null, tenant_user_id uuid null, status(`active`/`ended`), created_by, created_at, updated_at.
  - 조건: `end_date > start_date`, 매매가 아니면 end_date 필수.
  - select: 당사자(`auth.uid() in (landlord_user_id, tenant_user_id)`) 또는 admin. insert/update는 admin RPC로만.
- **`pf_invites`**: id, tenancy_id, role(`landlord`/`tenant`), token_hash text unique(sha256 hex), expires_at(발급+14일), claimed_by uuid null, claimed_at null, created_at. anon·authenticated의 직접 접근은 전부 차단하고 RPC로만 다룬다.
- **RPC:**
  - `admin_create_tenancy(payload jsonb)` → jsonb `{tenancy_id, landlord_token, tenant_token}`. 토큰은 `encode(gen_random_bytes(24),'hex')`로 만들고 해시만 저장한다. 평문은 이 응답에서 단 한 번만 나간다.
  - `admin_reissue_invite(tenancy_id, role)`: 기존 미사용 초대를 만료시키고 새 토큰을 발급한다.
  - `admin_end_tenancy(tenancy_id)`.
  - `claim_invite(token text)` (authenticated):
    - 해시가 맞고, 미사용·미만료이고, `pf_members` 행이 있어야 한다.
    - 해당 역할 칸이 비어 있을 때만 `auth.uid()`를 채우고 claim 처리한다.
    - 실패 사유는 하나로 뭉쳐서 반환한다 (`invalid_or_expired`).
- 033의 `tenancy_id` FK를 여기서 추가한다.

### 036 수리 요청·재등록·지표
- **`pf_repair_requests`**:
  - 컬럼: id, tenancy_id, created_by, category(`누수`/`난방·온수`/`전기`/`설비`/`기타`), body text(1~1000), status(`open`/`acknowledged`/`resolved`), created_at, updated_at.
  - 임차인은 자기 계약에 insert, 당사자 둘 다 select 가능.
  - 상태 변경은 `set_repair_status(id, status)` RPC로 한다. 임대인 또는 admin이 가능하고, 임차인은 `resolved`만 할 수 있다. 이력은 `pf_repair_events`(append-only)에 남는다.
- **`request_relist(tenancy_id uuid, changes jsonb)`** (임대인만):
  - `pf_listing_requests`에 `source='relist'`로 insert한다. 연락처는 `pf_members` display_name + admin이 아는 사무소 경로를 쓰고, owner_phone은 changes에서 받는다.
  - 같은 tenancy에 열린(new/reviewing) relist가 있으면 거부한다.
- **`pf_channel_monthly`**: month date(월 1일), channel(`zigbang`/`platform`/`other`), ad_spend_krw bigint ≥0, contracts int ≥0, note text, updated_by, updated_at, unique(month, channel). admin만 읽고 쓴다.

### 037 inquiries 채널 확장 — **H6 승인 후에만**
- 운영 중인 문의 폼의 제약을 바꾸므로 M1에서 다른 마이그레이션과 함께 적용하지 않는다. D0의 문의 경로 통합안(§1.1-5)과 묶어 H6에서 결정한다.
- 승인 전까지 플랫폼 문의는 **전화 버튼(`phoneHandoff.js`)만** 둔다. 문의 지표는 M5 전까지 "플랫폼 페이지 전화 버튼 클릭 수"(기존 분석 이벤트 방식, D0에서 확인)로 대신한다.
- 승인되면: `source_channel` 허용 목록에 `'platform'`을 **추가만** 한다. 기존 값은 유지하고, 006·030·031과 D0의 운영 제약 덤프를 먼저 읽는다. `not valid`로 추가한 뒤 `validate constraint` 하는 2단계로 하고, 기존 행 점검 쿼리 결과를 STATUS에 남긴다.

**롤백:** `supabase/rollbacks/033_037_down.sql`을 작성하되 자동으로 실행하지 않는다. 내용은 새 테이블·함수 drop과 037의 원래 제약 복원이다.

---

## 5. 화면 (public/platform/)

공통:
- `public/platform/platform.css`는 `style.css`·`mobile.css` 토큰(`--lr-dusk-*`, `--lr-yellow`)을 쓴다. 브랜드 표기는 `public/platform/js/brand.mjs`의 상수 `BRAND_NAME`(임시: "확인매물 by 롯데부동산")에서만 바꾼다.
- 모든 페이지 head:
  - `<meta name="robots" content="noindex,nofollow">` (M5 게이트까지)
  - 기존 페이지와 같은 CSP
  - `../js/mobileNav.js`, `../js/phoneHandoff.js`
- 하단 고정 고지: 사무소명·등록번호·대표·주소·전화. 표시광고 필수 항목이고 기존 푸터에서 가져온다.
- "보증" 단어는 쓰지 않는다. 문구는 "롯데부동산이 2026.11.20에 직접 확인한 매물" 형식으로 한다.
- 모바일 우선이다. 360·390px에서 가로 넘침이 없어야 하고, 본문 14px 이상, 정보 텍스트 12px 이상, 탭 타깃 44px 이상.

| 파일 | 내용 | 재사용 |
|---|---|---|
| `index.html` + `js/platformListings.mjs` | 확인 매물 목록. 필터(거래유형·지역·가격·확인 등급). 카드마다 등급 배지 + 확인일. 미확인·마감·`withdrawn` 매물은 쿼리 단계에서 제외. 매물 0건이면 빈 화면 대신 "매물 내놓기(request.html)·전화 상담" 안내 | `../js/services/publicListingRepository.mjs`, `publicListingFields.mjs`, `utils/propertyPrice.mjs`(`formatListingDisplayPrice`), `utils/listingFreshness.mjs`, `publicRenderSecurity.mjs` |
| `listing.html` | 상세. 사진·가격·등급 배지·확인일과 등급 설명(무엇을 확인했는지 한 줄). 문의는 H6 전까지 전화 버튼만. 확인일이 30일을 넘었으면 "확인 중" 화면과 전화 버튼만 | `utils/contactPhone.mjs`, `../js/phoneHandoff.js` (H6 후 `../js/inquiryMvp.js` 흐름) |
| `request.html` + `js/listingRequestForm.mjs` | 매물 내놓기 요청 폼. 거래유형별 필수 필드, 의뢰인 구분(소유자/소유자 가족/거주 임차인), **개인정보 동의 + 중개 의뢰 동의** 체크 2개. 제출 후 "롯데부동산이 전화로 확인한 뒤 게시합니다" 안내. 클라이언트 검증 규칙 = DB CHECK | 문의 폼의 동의 문구 패턴 |
| `login.html` | 이메일 매직링크. `redirectTo`는 `/platform/dashboard.html` | `../js/services/authService.js`는 admin용 IP allowlist가 있으니 **쓰지 않는다**. 새 `js/platformAuth.mjs`로 supabase-js `signInWithOtp`만 사용 |
| `invite.html` | URL fragment `#token=`을 읽고 로그인을 확인한다. 최초면 이름·약관 동의로 `pf_members`를 만든 뒤 `claim_invite`. 토큰은 처리 후 `history.replaceState`로 지운다 | |
| `dashboard.html` + `js/tenancyDashboard.mjs` | 내 계약 목록 → 계약별로 주요 일정 타임라인, 신고 체크리스트, 수리 요청(임차인: 작성 / 임대인: 상태 변경), 재등록 버튼(임대인) | |
| `js/tenancyKeyDates.mjs` | **순수 함수** (§6) | |

admin 추가 (기존 기능은 건드리지 않음):
- `public/admin/dashboard.html`에 탭 4개를 추가한다.
  - **「등록 요청」:** 목록, 검토중/반려(사유)/게시. 게시 시 기존 매물 폼을 요청값으로 미리 채워 열고, 확인 등급·접촉 경로(방문/전화)·(임차인이면) 임대인 의뢰·동의 확인을 필수로 고른 뒤 `admin_publish_listing_request`로 저장한다.
  - **「플랫폼 게시」:** 기존 매물 목록(마감 제외)에서 "플랫폼에 올리기"(등급·접촉 경로 선택 → `admin_record_listing_verification`), "임장 완료로 올리기", "플랫폼에서 내리기". 현재 등급과 확인일 경과일을 표시한다. 가족이 기존 매물 자료로 플랫폼을 채우는 주 경로다.
  - **「계약 관리」:** 계약 생성 → 초대 링크 2개 표시(복사 버튼, 한 번만 표시된다는 경고), 재발급, 종료.
  - **「채널 지표」:** 월별 광고비·계약 수 입력 (`pf_channel_monthly`).
- 코드는 새 파일 `public/js/adminPlatform.js`로 분리하고, `admin-dashboard.js`에는 탭 등록 몇 줄만 넣는다.

---

## 6. 주요 일정·신고 체크리스트 규칙 (`tenancyKeyDates.mjs`)

입력은 tenancy 행이고, 출력은 `[{key, label, date|null, window?:{from,to}, basis, sourceUrl}]`이다. 모든 항목은 "일반 안내이며 개별 사안은 관할 기관·전문가 확인" 문구와 근거 링크(국가법령정보센터)를 붙인다. 날짜 계산은 KST 기준 `date` 연산으로 하고, 말일 보정 규칙은 테스트로 고정한다(예: 8/31 + 6개월 전 → 2/28 또는 2/29).

| key | 대상 | 계산 | 근거 |
|---|---|---|---|
| `renewal_window` | 전세·월세 | end_date − 6개월 ~ end_date − 2개월 | 주택임대차보호법 제6조·제6조의3 |
| `rent_report` | 전세·월세, 보증금 6,000만원 초과 또는 월차임 30만원 초과 | contract_date + 30일 | 부동산거래신고법 제6조의2 (서울 전역 적용) |
| `move_in_and_fixed_date` | 전세·월세 | start_date 당일 확인 (전입신고·확정일자) | 주택임대차보호법 제3조, 제3조의2 |
| `deposit_return` | 전세·월세 | end_date | 계약 종료일 |
| `trade_report` | 매매 | contract_date + 30일 | 부동산거래신고법 제3조 |
| `funding_plan` | 매매 | contract_date + 30일 (신고를 맡은 사람이 매수인과 다르면 +25일 제공) | 같은 법 시행규칙 제2조 |

- 체크리스트 문구는 기존 발행 리포트를 요약해 재사용하고 링크를 단다.
  - `public/reports/2026-10-12-songpa-home-sale-transaction-reporting.html`
  - `public/reports/2026-10-16-songpa-home-purchase-funding-plan-documents.html`
- 금액 기준·법 조문은 실행 시점에 국가법령정보센터에서 다시 확인하고, 확인일을 코드 주석과 STATUS에 남긴다.
- 사용자 체크 상태(완료 표시)는 POC에서 `localStorage`에만 둔다. 서버에 저장하지 않는다.

---

## 7. 보안·개인정보

- **브라우저 키:** 브라우저에는 `public/js/config/appConfig.js`의 publishable/anon 키만 있다. service key는 Hermes의 `/opt/data/.env`에만 있다. post_push_guard가 이를 검사한다.
- **RLS 기본값은 차단이다.** 함수는 `security definer` + 고정 `search_path`이고, 입력은 전부 서버에서 다시 검증한다(클라이언트 검증은 편의일 뿐).
- **초대 토큰:** 평문은 응답에서 한 번만 나간다. URL은 fragment로 전달해서 서버 로그·리퍼러에 남지 않게 한다. 저장은 해시만 하고 14일 뒤 만료된다.
- **수집 최소화:**
  - 소유자 요청: 이름·전화만.
  - 계약: 동·호수 없는 표시 주소.
  - 주민번호·계좌·계약서는 받지 않고, UI에서도 "보내지 마세요" 안내.
- **개인정보처리방침:** `public/privacy.html`에 플랫폼 항목(등록 요청·회원·계약 정보, 보관 기간, 파기)을 **초안으로 추가**한다. 반영은 M5 법률 게이트 통과 후.
- **로그:** STATUS, 커밋 메시지, cron 출력에 전화번호·이름·이메일을 남기지 않는다.
- **카카오 알림 문구:** "확인매물: 새 등록 요청 N건 (관리자 화면 확인)". 개인정보는 넣지 않는다.

---

## 8. 서버 작업 (Hermes)

- **`scripts/platform_request_notifier.py`**
  - 5분 주기. service key로 `status='new'` 이면서 알림 안 한 요청을 센다.
  - 알림 여부는 `pf_listing_requests.notified_at` 컬럼(033에 포함, anon 쓰기 불가)으로 관리한다.
  - `scripts/lottereal_gmail_inquiry_watch.py`의 `send_kakao_owner_alert`를 import해서 재사용한다.
  - 성공하면 stdout은 비워 두고, 실패하면 메타데이터 없는 오류와 함께 exit 1.
- **`scripts/platform_metrics_report.py`**: 매월 1일 실행. 지난달 다음 항목을 `docs/platform/metrics/YYYY-MM.md`에 쓰고 커밋한다.
  - 직방 receipts 수, platform 문의 수, 등록 요청 수(new/published/rejected)
  - `pf_channel_monthly` 값
  - 문의당·계약당 비용 (분모가 0이면 "—")
- **`scripts/purge_platform_requests.py`**: 매일. §4-033의 보관 규칙을 적용한다.
- **cron 등록:** 위 3개를 Hermes `jobs.json`에 기존 LotteReal 잡과 같은 형식으로 추가한다. Discord로 보내지 않는다(AGENTS.md).

---

## 9. 마일스톤과 완료 조건

### D0 — 운영 DB 검토와 현실안 (읽기 전용, 맨 먼저)
- **할 일** (service key, Hermes에서. 쓰기·DDL 금지. 결과는 건수·스키마만, 개인정보 없음):
  1. 운영 스키마 덤프: `information_schema.columns`, `pg_constraint`, `pg_policies`, 함수 목록에서 `property_listings`, `inquiries`, `listing_state_audit`, `external_inquiry_receipts`와 `pf_` 접두어 객체.
  2. 레포 마이그레이션 001~032와 비교. 운영에만 있거나 레포에만 있는 컬럼·제약·정책·함수를 표로 만든다. 운영 마이그레이션 이력에 033 이후 번호가 이미 쓰였는지 확인한다.
  3. 매물 현황(건수만): 전체 / `closed_at` 있음 / `last_verified_at` 30일 이내 / 30일 초과 / null, 거래유형별.
  4. 문의 현황(건수만): `inquiries.source_channel`별 최근 90일 건수, 직방 receipts 최근 90일 건수.
  5. 현재 문의 경로 목록: 메인 사이트의 폼·전화 버튼·직방 메일, 각각이 어디에 기록되는지(테이블·분석 이벤트·없음).
- **산출물:** `docs/platform/db-review.md`
  - 위 1~5의 결과
  - **현실안:** 이 SDD에서 바꿔야 할 항목을 표로 정리한다. 열은 항목 / 원래 가정 / 운영 실제 / 조정안 / 분류.
    - 분류 A, 바로 진행: §1.1 안이고 새 `pf_` 객체만 바뀐다. 이름·번호·컬럼 조정 등.
    - 분류 B, H6 대기: 기존 테이블·운영 문의 경로를 바꾸거나 §1.1과 충돌한다.
  - 문의 경로 통합안(§1.1-5): 플랫폼이 생긴 뒤 메인 사이트·플랫폼·직방 문의를 어떻게 받고 어떻게 세는지 1~2안.
- **완료:** db-review.md가 커밋되고, 분류 A 조정이 이 SDD의 해당 절에 반영되며(변경 이력을 문서 상단에 한 줄), 분류 B는 STATUS에 "대기: H6"으로 남는다. 분류 B가 있어도 그와 무관한 다음 마일스톤은 진행한다.

### P0 — 직방 수집 복구 (선행, 서버)
- **현상:** `external_inquiry_receipts`의 마지막 기록이 2026-10-23이다. 기존 Gmail→카카오 잡(id 11760874002e)이 jobs.json에서 사라졌고, 대체 잡 `e232043ac45c`가 receipts를 쓰는지 불명확하다. 그 잡은 Discord DM으로 보내고 있어 AGENTS.md와 충돌한다.
- **할 일:**
  1. 현재 직방 문의 메일이 어디서 처리되는지 확인한다.
  2. receipts 기록을 복구한다 (`lottereal_gmail_inquiry_watch.py` 재가동 또는 대체 잡에 기록 추가).
  3. 오너 카카오 알림이 계속 가는지 확인한다.
  4. Discord 경로는 오너 확인 전까지 그대로 두고 STATUS에 질문을 남긴다.
- **완료:** 새 직방 문의 1건이 receipts에 기록된다. 공개 RPC `get_external_inquiry_activity`의 최신 날짜가 갱신된다. 오너 카카오 수신이 확인된다.

### M1 — 데이터 계층 (033~036. 037은 H6 후)
- 마이그레이션 4개, 정적 테스트 4개, 롤백 SQL. 번호와 세부는 D0 현실안을 따른다.
- 적용 전에 `python -m unittest` 전체를 돌려 기준 대비 새 실패가 없어야 한다. 적용은 Hermes에서 한다.
- 적용 후 스모크(service key, 테스트 행은 끝나고 정리):
  - anon insert 성공 1건 / CHECK 위반 거부 1건 (중개 의뢰 동의 false 포함)
  - anon select 거부
  - `tenant_listed` + 임대인 동의 false 확인 기록 거부
  - anon이 `pf_listing_verifications`의 `verified_by`·`note`를 읽으면 거부
  - admin RPC를 일반 사용자 JWT로 호출하면 거부
- **완료:** 위 스모크 결과가 STATUS에 남고, 기존 사이트 스모크(매물 목록·문의 제출 폼 로드)가 정상이다. 문의는 실제로 제출하지 않는다.

### M2 — 확인 매물 사이트 + 등록 요청
- `index.html`, `listing.html`, `request.html`, CSS, JS, 테스트를 만든다.
  - `tests/test_platform_listings.mjs`: 미확인·마감·`withdrawn` 제외, 최신 기록 기준 등급 선택, 등급별 배지 문구, 가격 표기, 확인일 문구, 0건 안내
  - `tests/test_listing_request_form.mjs`: 거래유형별 필수값 = DB CHECK
  - `tests/test_platform_pages.py`: noindex, CSP, 필수 고지, "보증" 단어 없음
- **완료:**
  - `node scripts/contrast_audit.mjs platform/index.html platform/listing.html platform/request.html` 실패 0
  - 360·390px 넘침 없음
  - 매물 0건 상태에서 index.html이 안내 화면을 보여준다
  - 테스트 매물이 확인 기록 추가 후 목록에 보이고, 31일 전 확인 기록만 남은 테스트 매물은 보이지 않는다 (테스트 데이터로만)

### M3 — admin 탭 + 알림
- `adminPlatform.js`, 탭 4개, `platform_request_notifier.py`, cron 등록.
- **완료:**
  - 테스트 요청 제출 → 5분 안에 오너 카카오 알림 → admin에서 등급을 골라 게시 → 플랫폼 목록에 등급 배지와 함께 노출
  - 테스트 매물 1건을 「플랫폼 게시」 탭에서 `owner_listed`로 올렸다가 `site_visit`로 올리고, 내리기까지 확인
  - 감사 행 2개 확인. 테스트 요청과 매물은 마감 처리한다 (삭제 금지)

### M4 — 계약 대시보드
- `login.html`, `invite.html`, `dashboard.html`, `tenancyKeyDates.mjs`, 수리 요청, 재등록.
- 테스트 `tests/test_tenancy_key_dates.mjs`:
  - 6개 규칙 × 경계값 (말일, 윤년, 2년 미만 계약, 신고 대상 금액 경계 6,000/6,001만원·30/31만원)
- **사람 게이트 H3** (Auth 설정) 필요.
- **완료:** 테스트 계정 2개(오너가 준비한 이메일)로 다음을 확인한다.
  - 초대 → 매직링크 → claim → 대시보드 일정 표시
  - 임차인 수리 요청 → 임대인 상태 변경
  - 재등록 → admin 「등록 요청」에 나타남
  - 제3 계정으로 계약 조회 시 빈 결과

### M5 — 런칭 게이트
- 법률 검토 결과를 반영한다: 문구, 고지, 개인정보처리방침.
- 브랜드명은 `brand.mjs` 한 곳에서 바꾼다.
- noindex를 해제하고 `Sitemap.xml`에 추가한다.
- 메인 사이트에서 링크한다: 매물 페이지 하단 "직접 확인한 매물만 보기".
- `platform_metrics_report.py` 첫 실행.
- **완료:** H1·H2 승인 기록이 STATUS에 있고, 라이브 URL이 200을 반환하며, post_push_guard가 통과한다.

---

## 10. 이후 (이 SDD 범위 밖, 기록만)
- 별도 도메인·저장소로 이전: 공용 JS는 패키지로 분리하거나 복사.
- 사용자 리마인더 발송: 이메일·카카오 알림톡. 개인정보 검토 후.
- 소유자 계정으로 요청 이력 조회, 카카오 로그인.
- 직방 대비 지표가 3개월 연속 우위면 직방 광고 축소를 오너가 판단한다.

---

## 11. 사람 게이트 (에이전트가 혼자 넘지 않는다)

| ID | 무엇 | 누가 | 막히는 단계 |
|---|---|---|---|
| H0 | P0에서 Discord DM 경로를 유지할지 | 오너 | 없음 (질문만 기록) |
| H1 | Legal Bot 검토: 브랜드 사용·표시광고 필수 항목(공인중개사법 §18·§18-2), 소유자 요청 매물의 광고 책임과 플랫폼 모니터링 의무(§18-3), "확인 매물" 문구, 수수료 문구(§32), 수리 요청이 주택임대관리업에 해당하지 않는지, 개인정보 처리 | 오너 → Legal Bot (legalbot 프로필, 이 저장소 밖) | M5 공개 |
| H2 | 브랜드명 최종 확정. 도메인 구매는 M5 이후 선택 | 오너 | M5 공개 |
| H3 | Supabase Auth 설정: Site URL / Redirect URL에 `https://lottes.co.kr/platform/*` 추가, 이메일 발송 설정 확인(기본 SMTP는 시간당 발송 제한이 있음) | 오너 (Supabase 대시보드) | M4 로그인 |
| H4 | 테스트용 이메일 계정 2~3개 준비 | 오너 | M4 완료 확인 |
| H5 | 월별 광고비·계약 수 입력 (admin 「채널 지표」) | 오너·가족 | 지표 리포트의 비용 항목 |
| H6 | D0 현실안의 분류 B 항목(기존 테이블·운영 문의 경로 변경, 037 포함)과 문의 경로 통합안 승인 | 오너 (Claude 검토 후) | 해당 항목만. 나머지는 진행 |

---

## 12. 참고 파일
- **매물:** `public/js/services/publicListingRepository.mjs`, `publicListingFields.mjs`, `public/js/utils/listingFreshness.mjs`, `propertyPrice.mjs`, `contactPhone.mjs`
- **admin:** `public/admin/dashboard.html`, `public/js/admin-dashboard.js`, `public/js/adminAvailability.js`, `public/js/services/backendAdapter.js`, `public/js/utils/adminListingPayload.mjs`
- **보안 패턴:** `supabase/migrations/006_validate_inquiry_rows.sql`, `029_listing_rent_and_audit.sql`, `030_harden_inquiry_status_updates.sql`, `032_listing_unavailable_periods.sql`
- **알림·정리:** `scripts/lottereal_gmail_inquiry_watch.py` (`send_kakao_owner_alert`), `scripts/purge_expired_inquiries.py`
- **검증:** `scripts/post_push_guard.py`, `scripts/maintenance_check.py`, `scripts/contrast_audit.mjs`, `scripts/page_screenshot.mjs`
- **광고 리스크 기존 메모:** `docs/listing-media-risk.md`
