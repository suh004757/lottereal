# LotteReal — An AI-Operated Real Estate Web Platform

[![Live site](https://img.shields.io/badge/live-lottes.co.kr-0A66C2)](https://lottes.co.kr/)
[![Deployment](https://img.shields.io/badge/deployment-GitHub%20Pages-222)](./DEPLOY.md)

LotteReal is a production real estate website for Seoul, South Korea. It is also an experiment in **harness engineering**: AI agents operate across the frontend, backend, content pipeline, data layer, testing, security review, and deployment lifecycle, while human governance defines business intent and high-impact production boundaries.

This is not a one-shot “AI-generated website.” The repository is the operating harness. It gives agents the context, tools, tests, evidence requirements, publication boundaries, and rollback paths needed to improve a live service safely over time.

**Live:** [https://lottes.co.kr](https://lottes.co.kr)

## Project thesis

Most AI software demos stop after code generation. LotteReal explores a harder question:

> Can an AI system maintain and improve a real, public-facing product—across frontend and backend—without giving up traceability, privacy, or engineering discipline?

The operating model is deliberately evidence-driven:

1. **Observe** — inspect the live site, repository, user feedback, official data, CI, and production behavior.
2. **Plan** — translate intent into a bounded change with explicit invariants and rollback conditions.
3. **Implement** — change application code, Supabase migrations, content generators, or infrastructure as one coherent unit.
4. **Prove** — run focused regressions, full CI where warranted, artifact checks, privacy/security gates, and production smoke tests.
5. **Release** — publish only a validated artifact through GitHub Actions.
6. **Learn** — convert incidents, review findings, and operational mistakes into regression tests, stronger tooling, and reusable procedures.

The result is a **self-improving SDLC**, not an unconstrained self-modifying system. Improvements are encoded as reviewable source, tests, migrations, documentation, and deployment policy.

## What the AI operates

The agentic harness can work across the full product lifecycle:

- **Frontend:** responsive property discovery, listing detail flows, multilingual guidance, accessibility, metadata, canonical URLs, and strict Content Security Policy.
- **Backend:** versioned Supabase schema, RPCs, Row Level Security, inquiry handling, public-data access, and privacy boundaries.
- **Content:** sourced market and policy reports generated into stable, indexable static pages.
- **Data quality:** deterministic exports, checksums, atomic publication, schema-aware tests, and source-date validation.
- **Security and privacy:** secret exclusion, customer-data boundaries, dependency integrity, CSP enforcement, and fail-closed repository checks.
- **Delivery:** branch isolation, pull-request CI, deterministic GitHub Pages artifacts, deployment monitoring, production smoke tests, and reversible hotfixes.
- **Operations:** maintenance checks, analytics minimization, incident diagnosis, and turning concrete failures into permanent regressions.

Human authority remains explicit. Business policy, credentials, customer handling rules, legal judgment, and material production decisions are not delegated blindly. Autonomy is strongest where outcomes are measurable and reversible.

## Harness engineering principles

### 1. The repository is executable context

Architecture, generated/source ownership, security boundaries, and deployment behavior are represented in code rather than left as tribal knowledge. An agent should be able to discover what is public, what is generated, what must remain private, and how to verify a change.

### 2. Production claims require evidence

A task is not complete because code was written. Completion means the relevant tests passed, the deployable artifact was built, the workflow succeeded, and the live behavior was checked. Failed or unavailable verification is reported as a blocker rather than replaced with plausible output.

### 3. Autonomy is bounded by invariants

The harness permits broad execution but protects non-negotiable properties:

- existing public URLs and search indexing remain stable unless a migration is intentional;
- customer data and credentials never enter the public artifact;
- Supabase migrations are versioned, but secrets and real customer records are not committed;
- generated reports are changed through their exporter, not by hand;
- destructive filesystem and publication operations fail closed;
- production changes preserve a rollback path.

### 4. Validation is proportional to risk

A reversible documentation change should not receive the same process as a schema migration. The system uses focused local checks, PR CI, and production smoke tests for ordinary changes, while backend, privacy, security, and destructive changes receive deeper gates.

### 5. Every incident should improve the harness

Review findings are not treated as isolated fixes. For example, deployment issues have produced permanent tests for artifact boundaries, symlink-safe output handling, custom `404.html` behavior, deterministic manifests, and exclusion of repository-only sources.

## Architecture

```text
Official/public sources ─┐
Versioned content ───────┼─> exporters and maintenance tools
Supabase migrations ─────┘              │
                                        ▼
                              tests and policy gates
                                        │
                                        ▼
public/ ──> deterministic artifact builder ──> GitHub Actions ──> GitHub Pages
   │                                                                  │
   └── stable routes, assets, reports, public data                     ▼
                                                             https://lottes.co.kr
```

The source tree and the deployment boundary are intentionally separate. `scripts/build_pages_artifact.py` copies only `public/` into a deterministic artifact. GitHub Pages deploys that artifact—not the repository root.

Repository-only areas such as `scripts/`, `tests/`, `supabase/`, `content/`, `scss/` are excluded from the website.

## Public URL contract

Source files live under `public/`, while production URLs remain clean:

- `index.html` → `https://lottes.co.kr/`
- `listings.html` → `https://lottes.co.kr/listings.html`
- `report.html` → `https://lottes.co.kr/report.html`
- `public/reports/<slug>.html` → `https://lottes.co.kr/reports/<slug>.html`

The artifact builder preserves relative paths, canonical metadata, sitemap entries, assets, and custom-domain configuration. A real static `404.html` is included because deployment uses `.nojekyll`.

## Repository map

| Path | Purpose |
|---|---|
| `public/` | Production website source and the only Pages publication boundary |
| `public/reports/` | Deterministically generated, indexable market and policy reports |
| `public/js/` | Browser application modules and privacy-aware analytics controls |
| `public/Data/` | Versioned data intentionally exposed to browsers |
| `public/admin/` | Administrative browser surface with a separate security boundary |
| `content/` | Versioned report source material and publication inputs |
| `scripts/` | Exporters, maintenance checks, analytics tools, and artifact builders |
| `tests/` | Python and Node regression, privacy, security, and publication contracts |
| `supabase/` | Versioned database migrations, RLS policies, and RPC definitions |
| `scss/` | Style source outside the deployed artifact |
| `docs/` | Public architecture and change-control documentation |

`public/reports/`, `public/Sitemap.xml`, and `public/report.html` are produced as one publication transaction by `scripts/export_static_reports.mjs`. Generated output is not edited manually.

## Security and privacy model

- No service-role keys, passwords, private keys, customer records, or operational credentials belong in Git.
- Public Supabase configuration is treated as public; authorization depends on database privileges and Row Level Security, not obscurity.
- Browser code uses restrictive CSP and referrer policies, with separate policies for public, admin, redirect, and error surfaces.
- Analytics are centralized, minimized, and excluded from the custom 404 page.
- Pinned vendor hashes and forbidden dependency checks protect the browser runtime.
- Repository hygiene tests reject large unreviewed binaries and Office working documents outside the explicit public-download boundary.
- GitHub Pages receives only the generated artifact. README, migrations, tests, scripts, and internal source directories are not deployed.

## Verification

The exact gates depend on the risk of a change. The complete local baseline is:

```bash
python3 -B -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.mjs
python3 scripts/maintenance_check.py
python3 scripts/build_pages_artifact.py \
  --output /tmp/lottereal-site \
  --manifest /tmp/lottereal-manifest.json
git diff --check
```

Pull requests run the regression suites and build the same Pages artifact without deploying it. Merges to `main` deploy through GitHub Actions, after which representative production routes and private-source exclusions are smoke-tested.

See [`DEPLOY.md`](./DEPLOY.md) for the deployment and rollback boundary.

## Why this project matters

LotteReal demonstrates a practical middle ground between manual software maintenance and unsafe “fully autonomous” deployment:

- AI can own substantial frontend and backend execution.
- Deterministic tools can make generated output auditable.
- Tests can encode business, privacy, publication, and operational memory.
- Production autonomy can remain reversible and evidence-based.
- Human governance can stay focused on intent and material risk rather than repetitive implementation work.

The long-term goal is not to remove humans from software. It is to build a harness in which AI can perform increasingly complete engineering work while the system remains understandable, inspectable, and accountable.
