# 롯데부동산 운영 규칙

## 목적
- 이 저장소는 `롯데부동산` 사이트 개발·유지보수 및 국내 부동산 시장 인사이트 발행을 위한 프로젝트다.
- 운영 목표는 고급스러운 사이트 디자인 유지와 고객 유입 전환율 상승이다.
- 투자봇에서 배운 thesis-first / evidence-first 방식을 국내 부동산에 적용하되, 주식 IOS Kill Condition과 혼동하지 않는다.
- 기준 상태는 local repo, GitHub main, Supabase, 운영 도메인 `lottes.co.kr`이다. 롯데부동산 운영은 Discord 알림 없이 로컬/레포/Supabase 로그로 남긴다.

## 운영 원칙
1. 공개·공신력 source 우선: 국토교통부, 한국부동산원, 한국은행, 서울열린데이터광장, 금융위/금감원, 지자체/법원/등기·공시 자료를 우선한다.
2. 가격/거래량/전세/금리/정책/공급을 분리해서 보고, 단일 기사나 커뮤니티 글만으로 결론 내리지 않는다.
3. 모든 글은 정보 제공 목적이며 매수·매도 권유, 수익 보장, 특정 매물 투자 권유로 쓰지 않는다.
4. 사실, 추정, 해석을 분리하고, 데이터 기준일과 출처 URL을 `evidence_json`에 남긴다.
5. Supabase `secret`/service급 key는 서버-side 자동화에서만 사용한다. 브라우저에는 public publishable/anon key만 둔다.
6. Legal Bot 자문은 법령/계약/중개/개인정보/광고규정처럼 법적 판단이 필요한 경우에만 요청한다. Legal Bot credential/API/MCP는 legalbot profile에만 유지하며 이 repo/default profile로 복사하지 않는다.
7. 관리자/문의/개인정보 관련 변경은 최소권한·비밀값 비노출·public deployment leakage 점검 후 진행한다.
8. 승인 대기 없이 판단해서 매물/시세 데이터 최신화, McKinsey 스타일 시장 리포트 SQL insert, 모바일 UX 개선, 디자인/카피/레이아웃 개선, 코드 수정, 테스트, 커밋, main push, 헬스체크, 자동화 스케줄 조정을 수행할 수 있다.
9. 레포 전체, 프론트+DB+자동화가 묶인 큰 점검은 SOL 모델 사용을 허용한다. 단순 one-file 수정은 기본 모델로 처리해도 된다.

## 하드 레일
- Supabase secret/service key 원문 노출·평문 커밋 금지
- 키 로테이션/스키마 변경은 verification 없이 push 금지
- 매물 DB 등 되돌릴 수 없는 데이터 삭제 금지. 필요한 경우 soft-disable/status change나 백업 후 reversible migration을 우선한다.
- 고객 개인정보/문의 원문은 공개 로그, Obsidian, commit message, Discord에 남기지 않는다.

## Push 후 자동 롤백 게이트
main push 후 다음 중 하나라도 걸리면 사람 승인 없이 즉시 이전 커밋을 revert하고 origin/main에 push한 뒤 원인을 기록한다.
- live app config status가 200이 아님
- `appConfig.js`에서 secret/service key 패턴 또는 실제 secret key 값 감지
- 관련 unittest 또는 `py_compile` 실패
- 변경 후 5분 내 헬스체크 재확인 실패

표준 명령:
```bash
python3 scripts/post_push_guard.py
```

검증 결과를 보고할 때는 `exit_code=0`과 관련 unittest 통과를 최소 조건으로 삼고, 전체 green이라고 과장하지 않는다. 변경 범위 한정 ad-hoc verification임을 명시한다.

## 매일 발행 글 형식
- 제목: 날짜 + 핵심 관찰 1개
- 본문: 700~1200자 권장
- 필수 섹션: 오늘의 관찰, Thesis Tree 영향, 확인할 데이터, 면책 고지
- 필수 evidence: 최소 2개 이상. 가능하면 공식/공공 source 1개 이상.

## 유지보수 체크
- `python3 scripts/maintenance_check.py` 실행
- JS 변경 시 `node --check`로 문법 확인
- Supabase table reachability 확인
- `.env`, `.env.local`, token/key 원문은 출력·커밋 금지
- 변경 파일, 확인 항목, 남은 리스크, 다음 액션을 repo/local log에 남긴다. 롤백 발생 시 원인 상세를 함께 기록한다.
