# D0 운영 DB 대조표

오너와 Phase 1 구현 담당자용. 운영 기준은 2026-11-27 03:55~04:00 KST, 레포 기준은 `be3419746c9abe2d02f7f6466edb6f06052e639a`다. 기존 D0 인계의 Supabase PostgreSQL 17.6 읽기 전용 카탈로그, PostgREST exact-count HEAD, 허용된 Auth 설정 및 공개 파일 관측을 사용했다. 이 문서 작성 중 운영 조회를 반복하거나 운영 상태를 변경하지 않았다. 아래에서 관측, 소스 기반 추론, 미확인을 구분한다.

## SDD 가정과 운영 대조

| SDD의 가정 | 운영에서 확인한 사실 | 조정안 | 오너 승인 필요 여부 |
| --- | --- | --- | --- |
| D0-6 직방 수집·기록·알림을 분리한다. | 활성 대체 잡은 Gmail을 읽고 `inquiries`를 조회한다. 로컬 중복 제거·이벤트·상태 기록과 건수·우선순위·날짜 요약은 있으나 receipts에 쓰지 않는다. 요약은 운영 Discord로 전달하도록 설정돼 있으나 수신 성공 미확인. 카카오·고객 발송 경로는 없다. 옛 잡은 현 잡 목록에 없고, 중단 사유는 SDD 기록이다. 레포의 기존 Gmail 스크립트에는 receipts upsert와 선택적 카카오 전달 코드가 있다. | P0는 새 메일만 별도 기록 전용 잡으로 수집하고 전달은 복원·변경하지 않는다. 현 Discord 설정과 AGENTS 무 Discord 원칙의 차이는 H0에 남긴다. 소급 전에는 메일 가용성과 receipts 수집 시각 제약을 확인한다. | 기록 전용 P0는 SDD 범위. 소급·운영 문의 경로 변경은 **B / H6 대기**, 전달 설정 차이는 H0 오너 확인. |
| D0-7 플랫폼 게시가 메인 목록·상세·sitemap에 영향을 주지 않는지 확인한다. | 목록과 상세 모두 `property_listings`를 플랫폼 구분 없이 허용 필드로 읽는다. 공개 SELECT는 `closed_at IS NULL`, anon 3건 / 전체 5건. 공개 `Sitemap.xml`은 HTTP 200, 139 URL, 동적 매물 상세 0건이며 레포 sitemap에도 동적 상세가 없다. | 새 미마감 공유 행도 목록·상세의 읽기 대상이라는 소스·RLS 기반 추론이다. 신규 행으로 검증하지 않았고 DB 삽입만으로 sitemap이 갱신된다는 증거는 없다. H6 전에는 기존 공개 매물에 `pf_` 확인만 추가하거나 빈 상태로 출시한다. `SHOW_COMPLETED` 기본 OFF이며 상세도 차단한다. 게시 검증은 로컬 목 데이터로 한다. | **B / H6 대기**: 공유 행 게시와 메인 공개 범위 변경. 기존 공개 행의 플랫폼 전용 확인은 A. |
| §1.1 비교 지표의 분모를 직방과 플랫폼에서 대조한다. | 직방 receipts는 메일 알림, `inquiries` 태그는 등록·폼 기록, `phone_click`은 클릭이다. 실제 통화·적합 문의·방문·계약·비용의 비교 가능한 운영 집계는 미확인이다. | 아래 지표별 출처로 분리한다. 같은 월·유사 매물군의 결과만 비교한다. 공백·미수집 분모는 `미확인`이며 비용 지표도 산출하지 않는다. | 신규 `pf_` 지표는 **A**. 가족·오너 입력은 H5. 공유 문의 폼 연동은 **B / H6 대기**. |
| D0-1~2 레포 기준선과 운영 이력이 일치한다. | 레포 기준 파일은 002, 005~032. 공식 이력 조회 200·0건, 이력 관계 조회 400 및 관계 카탈로그 미관측. 공식 이력에 033+ 등록은 없지만 실제 번호 예약과 적용 경로는 미확인. 운영 `public`의 `pf_` 관계/루틴은 0/0. | 기준 SQL 일괄 재적용 금지. 기존 객체·이력 차이를 잘라 확인하고 신규 번호는 오너와 충돌 여부를 확인한다. 기존 `last_verified_at`을 등급으로 사용하지 않고, 새 `pf_`에 거래유형·확인 기록·게시 감사를 둔다. | 신규 `pf_`만 조정은 **A**. 기존 객체 변경은 **B / H6 대기**. |
| D0-5·037 플랫폼 폼을 기존 문의에 붙일 수 있다. | 채널은 `inquiries.metadata` 안에 있다. 운영 `inquiries_valid_payload`는 `platform`을 허용하지 않는다. 레포 006 CHECK와 007 INSERT 정책이 각각 채널을 검사한다. | 양쪽 검사를 유지하며 승인 후에만 채널 확장을 제안한다. H6 전에는 플랫폼 전화와 가족 수기 기록만 사용한다. | **B / H6 대기**: 037과 플랫폼 폼 활성화. |
| D0-8 일반 가입을 열 수 있다. | Google ON, 신규 가입 OFF. 기존 운영 도메인 리다이렉트 1개, `/jamsilsari/` 명시 항목 없음. 실제 콜백과 와일드카드 동작은 미확인. 일반 로그인 역할에 열려 있는 사진 업로드 정책과 추가 검토가 필요한 읽기·함수 권한이 있다. | 비회원 조회는 먼저 공개할 수 있다. 가입은 아래 D0-8 순서대로 권한 점검·검증을 마칠 때까지 Auth 자체를 OFF로 유지한다. | **B / H6 대기**: 039 및 기존 권한 조정. 검증 뒤 가입 활성화는 H3. |

### D0-6: 직방 수집·기록·전달 근거

| 단계 | 현 대체 잡 | 기존 코드 및 알려진 차이 |
| --- | --- | --- |
| 수집 | 활성 스크립트형 잡은 Gmail 읽기 전용, `inquiries` 조회, 로컬 중복 제거를 수행한다. | 기존 잡은 현 목록에 없고, 중단 사유는 SDD D0·P0의 오너 기록이다. |
| 기록 | 로컬 이벤트·heartbeat 및 stdout 집계만 기록한다. receipts 쓰기는 없다. | `scripts/lottereal_gmail_inquiry_watch.py:113,526,1282` 기준 직방 메일 조회, receipts upsert, 선택적 카카오 전달 경로가 코드에 있다. |
| 전달 | 운영 Discord에 내부 요약을 보내도록 설정돼 있다. 실제 수신은 미확인이다. 카카오·고객 발송 경로는 없다. | 기록 전용 P0에서 전달을 추가하지 않는다. 현 설정 차이는 H0로 분리한다. |

### §1.1: 채널별 지표와 분모

| 지표 | 직방 | 플랫폼 |
| --- | --- | --- |
| 행동 신호 | 대응 지표 없음. | 전화 버튼 `phone_click`; 구현 경로 존재, 운영 수집 미확인. 클릭을 통화 또는 문의로 세지 않는다. |
| 공급 | 대응 지표 없음. | `pf_`에 등록 요청 수, 월 신규 게시 수, 확인 등급 분포 기록. `site_visit` 비율 분모는 해당 집계의 확인 등급이 있는 매물로 명시한다. 운영 집계는 아직 없다. |
| 문의 | receipts는 직방 알림 건수만 제공. 실제 통화·고객 수 미확인. | H6 전 가족이 실제 통화를 수기 기록. H6 후 승인된 폼만 `inquiries.metadata.source_channel='platform'`로 구분하고 실제 통화는 별도 집계. |
| 결과 | 적합 문의, 방문 약속, 계약, 비용은 가족·오너 입력(H5); 비교 가능한 운영 집계 미확인. | 같은 정의로 입력한다. `pf_channel_monthly` 설계는 비용·계약수이며 적합 문의·방문 약속은 명시 수기 입력 또는 신규 `pf_` 필드가 필요하다. 양 채널 모두 계약당 비용은 같은 구간의 확인된 비용 ÷ 확인된 양수 계약수일 때만 산출한다. |

## 부록: D0-1~5 운영 스키마·건수

| 대상 | 운영 카탈로그 관측 | 레포 비교와 한계 |
| --- | --- | --- |
| `property_listings` | UUID `id`, `user_id`; text `title`, `description`, `currency`, `address`, `city`, `district`, `property_type`, `contact_name`, `contact_phone`, `contact_email`; numeric `price`, `latitude`, `longitude`, `deposit`, `monthly_rent`; 배열 `images`; timestamptz `created_at`, `last_verified_at`, `closed_at`. PK, 보증금·월세 비음수 CHECK, 일부 열 공개 SELECT와 미마감 RLS, admin CRUD. | 기저 CREATE SQL 미식별. `transaction_type` 없음. `property_type`을 거래유형으로 대체하지 않는다. |
| `inquiries` | UUID `id`, `listing_id`; text `listing_title`, `name`, `phone`, `email`, `message`, `status`; JSONB `metadata`; timestamptz `created_at`. PK, 채널 CHECK, anon INSERT, admin SELECT, anon SELECT 없음. 직접 상태 쓰기 정책 미관측, `admin_set_inquiry_status` 존재. | 005 `inquiries_authenticated_manage` 운영 미관측은 007 정리 방향과 부합. 030~031 상태 RPC 존재. 037에서 006 CHECK와 007 정책을 함께 다뤄야 한다. |
| `listing_state_audit` | bigint `id`; UUID `listing_id`, `actor_id`; JSONB `previous_state`, `new_state`; text `action`; timestamptz `created_at`. PK, 매물 FK, action CHECK, admin SELECT. | 029의 레포 action은 `confirm_available`, `close`, `reopen`. 034 신규 `publish_from_request`는 기존 CHECK에 의존하지 않고 플랫폼 전용 추가 전용 감사 기록에 남긴다. |
| `external_inquiry_receipts` | UUID `id`; text `source`, `listing_number`, `status`, `source_message_hash`, `transaction_type`; timestamptz `received_hour`, `created_at`, `expires_at`. PK, 해시 UNIQUE, CHECK 9개. 공개 SELECT 정책 이름은 남아 있으나 anon/authenticated 기본 관계 SELECT 권한 없음. 공개 활동 RPC 존재. | 011~014 방향과 부합. 정책 이름만으로 유효 접근을 판단하지 않는다. |
| 운영 기저 차이 후보 | `report_revisions`, `external_feeds`, `property-images` 정책, `increment_report_view_count(text)` 존재. | 레포 기준 파일에서 정의 미식별. 수동 적용이나 별도 이력 여부는 미확인. |

건수 기준은 2026-11-27 03:55:45 KST, HEAD 집계다.

- 매물: 전체 5, 마감 2, 마지막 확인 30일 이내 0 / 초과 3 / NULL 2. 마감은 마지막 확인 범주와 중복된다. 거래유형별 집계는 해당 열이 없어 HEAD 400, 미확인.
- 문의: 이동 90일 7건. `website` 3, `zigbang` 3, `other` 1, `dabang`·`naver`·`walkin`·`platform`·NULL 각 0. 태그 건수이며 실제 통화·고객·계약 건수는 아니다.
- 직방 receipts: 이동 90일 176건, 전체 186건. KST 완전한 90일(08-29~11-26) 일별 HEAD 90/90 성공, 합계 176건. 마지막 기록은 10-23 1건, 10-24부터 관측 시점까지 새 행 0. 다른 0건 날짜는 09-15, 09-27, 10-02, 10-06. 10-23 수집 완전성과 그 이후 실제 유입은 미확인이다. 복구까지의 공백은 성과표에서 `미확인`으로 표시한다.
- 메인 문의 폼은 `inquiries`에 저장하는 코드 경로(`backendAdapter.js:408–425`)가 있다. 전화 버튼은 `phone_click` 이벤트 경로(`analyticsEvents.js:38`)가 있지만 실제 분석 수집과 통화 연결은 미확인. 직방 메일은 위 D0-6 참조.
- 메인 목록·상세 근거: `publicListingRepository.mjs:7–40`, `publicListingFields.mjs:1–20`, 운영 공개 RLS와 공개 sitemap 관측.

## D0-8: 가입 공개 차단 항목과 순서

| 점검면 | 관측 | 남은 확인 |
| --- | --- | --- |
| Storage | `property-images`에 permissive INSERT 정책 `Auth upload images`, `Authenticated users can upload images`가 있고 둘 다 admin/member 제한 표식이 없다. `storage.objects`의 authenticated INSERT는 유효하다. | 기존 admin 사진 경로는 코드에서 확인했다(`admin-dashboard.js:1052,1115`, `backendAdapter.js:373–397`). 실제 운영 업로더 전원의 역할·멤버십(가족·배치 포함)은 미확인. 오너가 계정 식별자 없이 역할을 먼저 목록화한다. |
| 공개·비공개 데이터 | 문의·메모·감사에 admin 제한, 가족 데이터에 멤버십 조건이 보인다. `report_revisions`에 authenticated SELECT 및 무조건 허용 정책이 있고 `external_feeds`는 현재 공개 SELECT다. | `report_revisions`의 데이터 민감도와 권한 의도, `external_feeds` 쓰기 권한, 정책·기본 권한 조합을 검토한다. 실계정 접근 결과는 미확인. |
| admin 화면 | 관리자 HTML HTTP 200, 기준 바이트 일치. JS 154–161에서 admin을 확인하고 아니면 리다이렉트한다. | 일반 로그인 시 실제 동작과 서버에서 비공개 데이터가 차단되는지 미검증. HTML의 접근 가능 여부와 비공개 데이터 인가를 별도로 검증한다. |
| RPC | 카탈로그에서 `public`의 authenticated EXECUTE 16개를 관측했다. 공개 활동은 읽기 의도다. 계수 함수는 admin/member 표식 없는 `VOLATILE SECURITY DEFINER`. | EXECUTE 권한과 REST 업무 호출 가능성을 구분한다. 가입 전 계수 함수의 의도·인가와 유효 호출 권한을 확인한다. |

EXECUTE 목록: `admin_confirm_listing_available`, `admin_list_property_listings`, `admin_set_inquiry_status`, `admin_set_listing_closed`, `archive_family_listing_as_owner`, `enforce_admin_intake_provenance`, `finalize_admin_intake_images`, `finalize_family_listing_images`, `finalize_family_listing_parse_review`, `get_external_inquiry_activity`, `guard_family_listing_parse_review`, `increment_report_view_count`, `is_family_listing_member`, `set_updated_at`, `touch_family_listing_record`, `update_updated_at_column`. `auto_apply_family_listing_parse`, `log_family_listing_event`는 이 목록에서 제외된다.

1. 비회원 목록·상세 무료 조회부터 공개한다.
2. 실제 업로더 역할 목록을 확보한 뒤, 039에서 두 업로드 정책을 함께 좁힌다. 운영 적용은 H6 승인 후에만 하며 기존 승인 업로더의 업로드가 계속 되는지 확인한다.
3. 가입을 끈 상태에서 승인된 일반 테스트 계정으로 비공개 읽기와 사진 업로드 거부를 확인한다. 읽기·함수 권한 검토에서 미해결 항목이 있으면 가입을 보류한다.
4. 위 검증 후 H3에서만 신규 가입을 켜고 버튼을 공개한다. 잠실살이 리다이렉트는 허용 목록에만 추가하고 기존 Site URL은 유지한다. 콜백·메일 설정도 H3에서 확인한다.

## 문의 통합·대리 접수 제안

- 기본안: 메인 폼은 기존 `inquiries`, 메인 전화는 클릭 이벤트, 플랫폼은 전화 및 가족 통화 수기, 직방은 알림 receipts 전용으로 유지한다. 대리 접수는 비공개 `pf_intake_items`에서 별도로 센다. 접수 건수를 고객 수나 계약에 합산하지 않는다.
- H6 후 대안: 037과 플랫폼 폼만 추가한다. `platform` 태그 폼 제출을 별도 집계하고 클릭·실제 통화·직방 알림·대리 원문은 섞지 않는다. 문제가 생기면 폼을 끄고 전화로 복귀한다.
- 대리 접수(038): 가족이 카카오·문자의 공유 기능으로 전용 접수 메일(H7)에 전달한다. 가족 허용 목록과 메일 인증을 확인하고 본문은 데이터로만 다룬다. 잡의 쓰기 권한은 접수 기록에 한정한다. 자동 답장·자동 게시 없음. 개인정보 필드는 처리 후 90일, 미처리는 180일에 비우는 안이며, 동의와 직접 의뢰 처리는 H1을 따른다.

## 잠금·복구 제안 및 미확인

| 변경 후보 | 예상 잠금·적용 전 확인 | 실패 시 복구 |
| --- | --- | --- |
| 신규 `pf_` | 기존 행 backfill 없음. 공유 FK 추가 시 참조·피참조 테이블 `SHARE ROW EXCLUSIVE` 예상. 필요하면 제약 검증을 분리한다. | 기능 경로 비활성화, 추가 데이터·감사 기록 보존. |
| 037, H6 | CHECK 교체는 `ACCESS EXCLUSIVE`, 분리한 검증은 `SHARE UPDATE EXCLUSIVE` 예상. 사본에서 기존 폼과 신규 채널 및 잘못된 채널의 처리 확인, 짧은 lock/statement timeout 사용. | 플랫폼 폼 먼저 차단하고 전화로 복귀. 신규 채널 행을 보존하면서 기존 정책을 복구할 수 있는지 사본에서 먼저 확인한다. 행 삭제 또는 기존 제약 강제 복원 금지. |
| 039, H6 | 두 정책의 교체 잠금 모드와 허용 시간은 사본에서 측정한다. 승인 업로더 성공 및 일반 계정 거절을 모두 확인한다. | 가입 OFF 유지 상태에서 기존 정책 복구, 기존 이미지 보존. |

미확인: 운영 적용·잠금 시간·테이블 바이트·쓰기율, Security Advisor/splinter 및 CI는 확인하지 않았다. 이력의 실제 적용 경로·033+ 예약, 실계정별 권한 및 기존 업로더 역할, Auth 콜백, 메인 신규 행·sitemap 동작, 직방 실제 전달·수집 공백과 비교 성과 분모도 확인되지 않았다. 분류 A의 SDD 반영과 분류 B의 STATUS/H6 기록, 보고서 커밋은 이 문서 작성 범위 밖이다.
