# LotteReal website

롯데부동산의 공개 웹사이트, 정적 리포트, 매물·문의 UI, 콘텐츠 발행 도구와 Supabase 변경 이력을 관리하는 저장소입니다.

## GitHub Pages deployment boundary

GitHub Pages는 **GitHub Actions workflow artifact**만 배포합니다. `scripts/build_pages_artifact.py`가 allowlist에 있는 공개 route와 asset을 원래 상대경로 그대로 복사하므로, 저장소 source 구조와 production 공개 경계가 분리됩니다.

- `index.html` → `https://lottes.co.kr/`
- `listings.html` → `https://lottes.co.kr/listings.html`
- `report.html` → `https://lottes.co.kr/report.html`
- `reports/<slug>.html` → 개별 정적 리포트

### Public URL compatibility

source 파일을 이동하더라도 artifact의 상대경로, canonical, sitemap, 외부 링크와 검색 색인은 그대로 유지해야 합니다. route-equivalence test 없이 공개 경로를 바꾸지 않습니다.

`scripts/`, `tests/`, `supabase/`, `content/`, `scss/`는 source·검증·운영 영역이며 Pages artifact에 포함하지 않습니다.

Phase 1은 연결된 HTML/application route와 배포 설정을 바꾸지 않습니다. 다만 참조되지 않는 Office 작업 원본은 공개 site artifact가 아니므로, 기존 `Data/부동산 시장 데이터 마크다운 및 SQL 업데이트.docx` 직접 다운로드 URL을 의도적으로 종료합니다. 필요하면 Git history에서 복원할 수 있습니다.

## Repository map

| 경로 | 역할 | 변경 시 주의점 |
|---|---|---|
| `*.html` | 현재 운영되는 공개 route 및 호환 route | 파일 이동·이름 변경은 URL migration으로 취급 |
| `reports/` | exporter가 만든 indexable 정적 리포트 | 수동 수정하지 않고 exporter로 재생성 |
| `js/` | 공개 브라우저 application 및 module | CSP, 개인정보, accessibility test 필요 |
| `css/`, `scss/`, `style.css` | 공개 style source와 현재 root stylesheet | 경로 변경 시 모든 route와 generated page 영향 |
| `img/`, `fonts/` | 공개 asset | 미사용·중복 여부 확인 후 제거 |
| `Data/` | 브라우저가 읽는 versioned public data | Office 원본이나 내부 운영 문서 저장 금지 |
| `content/` | 리포트 작성·발행용 versioned source data | public evidence와 private 운영정보 분리 |
| `scripts/` | exporter, maintenance, analytics 및 운영 도구 | browser bundle에 포함하지 않음 |
| `tests/` | Python·Node regression tests | route 및 publication 계약을 fail closed로 보호 |
| `supabase/` | versioned schema/RPC/migration source | secret, 고객정보, service key 커밋 금지 |
| `admin/` | 관리자 전용 browser surface | public page와 권한·CSP 경계를 분리 |
| `docs/` | 공개 가능한 architecture/change-control 문서 | private 운영 문서는 `.gitignore` 경계 유지 |
| `downloads/` | owner가 검토한 공개 다운로드 artifact | Office 파일 예외는 이 경로에서만 허용 |

## Generated and source boundaries

- `reports/*.html`은 `scripts/export_static_reports.mjs`의 산출물입니다.
- `Sitemap.xml`과 `report.html`의 정적 archive도 publication transaction에 포함됩니다.
- generated output을 바꿀 때는 source renderer와 test를 먼저 바꾸고 전체 export를 재실행합니다.
- 고객정보, credential, 내부 운영 원문, Office 작업 원본은 GitHub Pages tree에 두지 않습니다.
- tracked 파일은 기본적으로 2MB 이하를 유지합니다. 더 큰 공개 asset이 꼭 필요하면 최적화·외부 저장·명시적 allowlist를 먼저 검토합니다.

## Layout cleanup roadmap

### Phase 1 — repository hygiene

- unreferenced Office source와 큰 binary 제거
- README directory map과 generated/source 경계 명시
- regression test로 source 위치에 Office 원본이 다시 들어오는 것을 차단
- linked HTML/application route와 배포 설정은 변경하지 않음
- unreferenced DOCX 직접 다운로드 URL은 의도적으로 종료

### Phase 2 — naming and ownership normalization

- `Data/` 같은 legacy naming을 lowercase convention으로 바꿀지 검토
- source/generated ownership marker와 asset inventory 추가
- rename이 필요하면 old URL compatibility와 browser cache 전환을 함께 설계

### Phase 3 — build boundary (completed)

- GitHub Actions가 검증된 allowlist artifact만 GitHub Pages에 배포
- source page·style·data를 `src/` 등으로 정리하되, artifact에는 기존 public URL을 그대로 생성
- canonical, sitemap, redirects/compatibility pages, rollback을 production 전 검증

source 이동은 artifact route-equivalence와 production smoke test를 함께 통과하는 작은 PR로 진행합니다.

## Verification

일반 변경의 최소 확인 순서:

```bash
python3 -B -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.mjs
python3 scripts/maintenance_check.py
git diff --check
```

JavaScript 변경은 관련 파일에 `node --check`를 추가하고, 고객 journey 변경은 desktop/mobile browser로 검증합니다.

## Change control

- 기능, generated output, route 구조 변경은 작은 Draft PR로 분리합니다.
- PR 완료 댓글과 독립 review 결과는 같은 영역의 후속 변경에서 근거로 다시 확인합니다.
- owner 승인 전 merge·배포하지 않습니다.
