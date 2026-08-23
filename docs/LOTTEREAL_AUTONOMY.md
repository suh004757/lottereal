# 롯데부동산 자율 운영 설계

## Scope
롯데부동산 사이트는 국내 부동산 시장 정보, 매물/문의 UX, 시장 리포트 발행을 운영 대상으로 한다. 투자봇의 사고방식은 `가격이 아니라 thesis node를 추적한다`는 방식만 가져오며, 주식 포트폴리오·IOS Kill Condition·KR equity cron과 분리한다. 운영 목표는 고급스러운 디자인 유지와 고객 유입 전환율 상승이다. 기준 저장소는 local repo/GitHub main/Supabase/운영 도메인 `lottes.co.kr`이며 Discord 알림은 쓰지 않는다.


## Autonomous Authority
승인 대기 없이 아래 범위를 직접 실행한다.
- 매물/시세 데이터 최신화 및 McKinsey 스타일 시장 리포트 SQL insert
- 모바일 UX 개선: 프롬프트 설계, 코드 생성, 적용, 검증까지 수행
- 전환율 향상을 위한 디자인/카피/레이아웃 개선. 필요하면 구조 변경 포함
- 코드 수정, 관련 테스트, commit, main push
- 운영 도메인 헬스체크, cron 등록/조정
- 레포 전체 또는 프론트+DB+자동화가 묶인 큰 점검은 SOL 모델 사용 허용

## Hard Rails
- Supabase secret/service key 노출·평문 커밋 금지
- 키 로테이션/스키마 변경은 verification 없이 push 금지
- 되돌릴 수 없는 데이터 삭제 금지. 매물/문의 데이터는 백업·soft-disable·reversible migration 우선
- 고객 개인정보/문의 원문은 public repo/log/Discord/Obsidian에 남기지 않음

## Push and Auto-Rollback Protocol
1. push 전 최소 검증: 관련 unittest, `py_compile`, touched JS `node --check`, `scripts/maintenance_check.py`, secret scan.
2. main push 후 `python3 scripts/post_push_guard.py`를 실행한다.
3. 다음 조건 중 하나라도 발생하면 사람 승인 없이 최신 commit을 revert하고 `origin/main`에 push한다.
   - live app config status가 200이 아님
   - `appConfig.js`에서 secret/service key 패턴 또는 실제 secret value 감지
   - 관련 unittest 또는 `py_compile` 실패
   - 변경 후 5분 내 헬스체크 재확인 실패
4. 롤백 발생 시 원인, 실패 체크, revert commit, 남은 리스크를 local/repo log에 남긴다.

## Source Map
1. 한국부동산원: 주간 아파트 가격 동향, R-ONE 통계
2. 서울열린데이터광장: 서울시 부동산 실거래가 정보, 매일 갱신
3. 한국은행: 기준금리, 통화신용정책, 가계대출/주택시장 코멘트
4. 국토교통부/금융위/금감원: 정책·대출·공급·거래신고 제도
5. 한국부동산원 부동산통계정보 OpenAPI: env `LOTTEREAL_REB_OPENAPI_KEY` 또는 `REALESTATE_STATS_OPENAPI_KEY`에서 읽는다. 키 원문은 repo/log/Discord에 기록하지 않는다.
6. 민간 리서치/언론: CBRE/JLL/Cushman/Reuters/국내 주요 언론은 보조 source. 단독 결론 금지.

## Real-estate Thesis Tree
- Macro funding: 기준금리, 주담대/전세대출, 은행 가산금리, DSR/LTV
- Demand quality: 실수요/투자수요 분리, 거래량, 신고가/하락거래 비중
- Supply: 인허가, 착공, 준공, 입주물량, 정비사업 지연
- Lease pressure: 전세가율, 월세화, 전세 매물, 보증/대출 조건
- Location moat: 직주근접, 학군, 교통, 재건축/정비사업, 상권
- Policy/legal: 토지거래허가, 세제, 임대차/중개/광고 규정

## Daily Runbook
1. 공식/공공 source를 먼저 확인한다.
2. 오늘 바뀐 데이터가 없으면 `no material change`로 쓰고, 억지 기사 요약을 하지 않는다.
3. 글은 `market_reports`에 `published`로 upsert하고, markdown 사본을 `content/daily/`와 Obsidian 기록 폴더에 저장한다.
4. 유지보수 체크를 실행하고 오류가 있으면 사이트 개선 TODO를 남긴다.
5. 법적 판단이 필요한 경우 Legal Bot에 자문 요청용 질문만 작성한다. 자격/계약/광고규정 해석을 default profile이 단정하지 않는다.

## Supabase Tables Observed
- `market_reports`: published/draft market report CMS
- `property_listings`: listing data
- `inquiries`: contact/inquiry data
- `external_feeds`: news/policy cache

## Guardrails
- 수익률 보장 금지
- 특정 매물 매수 권유 금지
- secret/service key 브라우저 노출 금지
- 개인정보/문의 데이터 요약 시 원문 노출 금지
- Legal Bot credential/profile isolation 유지
- 리포트는 변경 파일, 확인 항목, 남은 리스크, 다음 액션을 포함한다. 검증은 변경 범위 한정 ad-hoc verification으로 표현하고 전체 green이라고 과장하지 않는다.
