# 롯데부동산 자율 운영 설계

## Scope
롯데부동산 사이트는 국내 부동산 시장 정보, 매물/문의 UX, 시장 리포트 발행을 운영 대상으로 한다. 투자봇의 사고방식은 `가격이 아니라 thesis node를 추적한다`는 방식만 가져오며, 주식 포트폴리오·IOS Kill Condition·KR equity cron과 분리한다.

## Source Map
1. 한국부동산원: 주간 아파트 가격 동향, R-ONE 통계
2. 서울열린데이터광장: 서울시 부동산 실거래가 정보, 매일 갱신
3. 한국은행: 기준금리, 통화신용정책, 가계대출/주택시장 코멘트
4. 국토교통부/금융위/금감원: 정책·대출·공급·거래신고 제도
5. 민간 리서치/언론: CBRE/JLL/Cushman/Reuters/국내 주요 언론은 보조 source. 단독 결론 금지.

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
