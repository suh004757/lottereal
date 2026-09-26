# LotteReal organic traffic growth plan — 2026-10-31

## Goal and operating definition

- **Stretch outcome:** reach approximately **100 GA4 measured active users per day** by 2026-10-31.
- GA4 starts only after analytics consent, so it can undercount real visitors. Judge progress with all three layers:
  1. GA4 daily `activeUsers` and engaged sessions.
  2. Google Search Console clicks, impressions, CTR, average position, query breadth, and landing-page breadth.
  3. Qualified actions: calculator completion, `contact_click`, telephone, directions, and completed inquiry.
- Internal QA, repeated staff visits, bots, purchased traffic, click farms, irrelevant referrals, or accidental traffic do not count toward the goal.

## Baseline (as of 2026-09-26 KST)

- GA4, 2026-08-30 through 2026-09-25: **10 users / 27 days**, about **0.37 users/day**.
- GA4 today at 11:44 KST: **0 measured users**.
- Search Console, 2026-09-01 through 2026-09-24: **13 clicks, 769 impressions, 1.69% CTR, average position 5.96**.
- Search Console average: about **0.54 clicks/day**.
- The 100/day goal is roughly **270× the GA4 baseline** and must be treated as a stretch target, not a promised outcome.
- Initial technical finding: 53 published reports were primarily query-string pages whose unique title, canonical, and body depended on client-side JavaScript. They were not appearing as distinct Search Console landing pages.

## Brand and legal guardrails

Never use:

- false listings, fake reviews, invented transaction data, misleading scarcity, bait titles, or guaranteed outcomes;
- doorway pages, keyword stuffing, hidden text, link spam, copied competitor content, or low-quality mass AI publishing;
- paid traffic, new external accounts, sponsored placement, or third-party posting without separate approval;
- analytics before consent, personal information in analytics, or property transaction amounts in event parameters;
- unverified legal, tax, policy, or market claims.

Use official or primary sources, disclose evidence dates and limitations, preserve privacy and accessibility, and keep the existing professional Korean brand tone.

## Growth system

### 1. Make every useful report independently indexable

- Export each published CMS report to `/reports/<slug>.html`.
- Give each page visible server-delivered content, one H1, unique title/description/canonical, Article structured data, evidence links, and a useful consultation path.
- Put only static report URLs in `Sitemap.xml` and point home, knowledge, report hubs, widgets, and admin previews to them.
- Re-export after every CMS publication or update.

### 2. Improve intent coverage rather than content volume

Daily publisher ownership:

- at most one useful Korean article each day;
- also improve one relevant existing URL when new evidence materially changes it;
- prioritize real Songpa/Jamsil/Samjeon/Seokchon transaction questions, contract steps, calculators, checklists, and local business-property needs;
- do not create EN/JP parity pages or generic national-news rewrites.

### 3. Run bounded M/W/F growth experiments

Each run may make one evidence-backed improvement, such as:

- improve an indexed page's title/description when impressions exist but CTR is weak;
- strengthen internal links between a landing page, calculator, checklist, and related report;
- add a genuinely useful utility or structured data;
- reduce friction between search landing and qualified contact action;
- improve an existing local-intent page rather than create a near-duplicate.

Do not publish another daily article or overlap with the daily publisher's ownership.

### 4. Review weekly and reallocate effort

Every Sunday compare the most recent complete 7 days with the preceding 7 days:

- GA4 users, engaged sessions, and qualified events;
- Search Console clicks, impressions, CTR, average position, query breadth, and landing-page breadth;
- pages gaining/losing impressions and queries at positions 4–20;
- internal or bot-like repeat traffic separated from probable customer traffic.

Scale only changes with positive evidence. Rewrite or stop pages that remain unhelpful, duplicate, inaccurate, or unindexed.

## Checkpoints

These are decision checkpoints, not forecasts or guarantees.

| Week ending | GA4 measured active-user run rate | Search/quality checkpoint |
|---|---:|---|
| 2026-10-03 | 3/day | 53 static reports live; sitemap accepted; report URLs begin appearing in GSC |
| 2026-10-10 | 10/day | at least 10 distinct organic landing pages with impressions; first non-brand long-tail clicks |
| 2026-10-17 | 25/day | rising 7-day clicks and query breadth; at least one qualified action from organic traffic |
| 2026-10-24 | 50/day | winning topic clusters expanded through internal links and utilities, not duplicates |
| 2026-10-31 | approximately 100/day | corroborated by GA4 plus GSC; quality events and bot/internal exclusions reported separately |

If a checkpoint is missed, do not compensate with spam or irrelevant traffic. Concentrate on the pages and intents already earning impressions, improve snippets and usefulness, and publish fewer but stronger pages.

## Verification gate for every mutation

1. Start from a clean, synchronized `main` branch.
2. Use tests before implementation for new logic.
3. Run `node scripts/export_static_reports.mjs` after report changes.
4. Run the full Python suite, relevant Node tests, `python3 scripts/maintenance_check.py`, and `git diff --check`.
5. Review the diff for credentials, personal data, exaggerated claims, duplicate content, inaccessible controls, and broken links.
6. Commit and push only verified changes.
7. Verify the live URL, canonical, visible content, and HTTP status after GitHub Pages deploys.

## Ownership boundaries

- Daily publisher: one new source-grounded article plus one relevant existing-URL improvement; must run the static export.
- M/W/F growth experiment: one existing-URL, utility, internal-link, or technical SEO improvement; no daily article duplication.
- Weekly review: read-only KPI review and next-week priorities.
- Inquiry, ADMIN, email, and privacy jobs remain separate and must not be modified for traffic growth.
