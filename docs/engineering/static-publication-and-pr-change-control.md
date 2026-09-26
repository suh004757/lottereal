# Reliable Static Publication and PR Change Control

## Purpose

This document captures a reusable engineering method for static-site generators that publish multiple related files. It separates two concerns:

1. **Publication correctness:** preventing partial, stale, or misleading generated output.
2. **Change governance:** preventing a small product change from expanding into an unnecessarily complex system without an explicit decision.

The method is intentionally proportional. A team should adopt only the reliability mechanisms justified by its failure model.

## Start with the business invariant

Before choosing implementation details, write the externally observable invariant.

Example:

> Every published report appears exactly once in the server-rendered archive, its canonical snapshot, and the sitemap. A technical CMS timestamp change must not claim that public content changed.

This statement is more important than any particular locking or journaling mechanism.

## Reliability ladder

Choose the lowest level that satisfies the actual operating conditions.

### Level 0 — deterministic generation

Use when generation runs in an isolated checkout and failed output is never deployed.

Required properties:

- deterministic ordering and rendering;
- strict input validation before writing;
- generated-output validation before commit;
- deployment only from a reviewed Git commit.

Preferred implementation:

1. Generate in a temporary worktree or staging directory.
2. Validate the complete result.
3. Commit and deploy only after every check passes.
4. Discard the temporary worktree on failure.

For many static sites, this is sufficient and should be the default.

### Level 1 — atomic replacement per file

Use when generated files must replace existing files in a live working tree.

For each target:

1. Write a sibling temporary file.
2. Flush the file contents.
3. Atomically replace the target with `rename`/`replace` on the same filesystem.
4. Sync the containing directory when the platform supports the required durability semantics.

This prevents readers from observing a partially written individual file. It does **not** make a set of files globally atomic.

### Level 2 — recoverable multi-file publication

Use only when an interrupted local run must recover automatically without discarding the checkout.

Add a transaction journal that records, before the first mutation:

- journal format version;
- transaction identifier;
- each allowed target;
- intended operation (`replace` or `delete`);
- original and next content hashes;
- staged and backup paths;
- durable progress state.

Recovery rules:

- validate every journal path against an allowlist;
- restore or remove only content whose current hash matches the transaction's installed hash;
- preserve concurrent or operator replacements rather than overwriting them;
- retain the recovery directory when rollback cannot complete safely;
- make recovery idempotent.

A journal is not a substitute for Git. The reviewed commit remains the global deployment generation boundary.

### Level 3 — concurrent publisher exclusion

Use only when two processes can genuinely operate on the same publication workspace.

A directory-based mutex should have:

- a cryptographically unique fencing token;
- PID plus process-start identity where available;
- owner metadata completed and flushed before publishing the well-known mutex path;
- atomic candidate-to-mutex rename;
- token verification before shared transaction recovery and public mutations;
- token verification during release;
- conservative liveness when process-start identity is unavailable.

#### ABA prevention

A stale owner must not be removed using only a path name observed earlier. Between observation and cleanup, another owner may acquire the same path—an ABA race.

Safe reclamation requires:

1. Atomically rename the observed stale mutex to a unique claim path.
2. Verify that the claimed owner token matches the owner originally observed.
3. Delete only the verified claim.
4. Never recursively delete the well-known mutex path based on a stale observation.

During release, if the renamed claim contains a different token, restore it to the well-known path when safe and fail closed. Never delete another owner's claim.

## Filesystem durability concepts

### `fsync`

Closing a file does not always mean its contents are durable after abrupt termination. Flush the staged file and any durable journal before publishing mutations. Where supported and required, sync the containing directory after creating, renaming, or deleting directory entries.

Durability guarantees vary by filesystem and mount type. Verify behavior on the production filesystem rather than assuming POSIX behavior from a different environment.

### Atomic rename/replace

An atomic same-filesystem replacement prevents an individual target from disappearing between “remove old” and “install new.” Avoid renaming the old target away first when readers require continuous availability.

Directory replacement can fail on platforms with persistent external handles even when replacement of files inside that directory works. Test the real deployment filesystem.

## Preventing public-date contamination

A CMS synchronization timestamp is not automatically a public modification date.

Calculate a versioned fingerprint from fields that actually affect the rendered public page, such as:

- title and description;
- publication date;
- rendered body;
- rendered source links.

Rules:

- preserve the existing public modification date when the public fingerprint is unchanged;
- advance it only when visible content or the publication date changes;
- require valid full timestamps and real calendar dates;
- reject `updated_at` earlier than `created_at`;
- migrate legacy pages without a fingerprint by comparing their rendered public content;
- keep sitemap `lastmod`, structured-data `dateModified`, and visible modification text consistent.

This avoids telling crawlers and users that content changed when only internal metadata was touched.

## Complexity gate

Reliability work should stop for an explicit owner decision when any of the following appears:

- a new journal, mutex, queue, database, or persistent state machine;
- a change much larger than the initial estimate;
- a new concurrency or crash-recovery protocol;
- authentication, privacy, schema, destructive-history, or irreversible operations;
- a rollback design more complex than the feature itself.

At the gate, the PR must present at least two choices:

1. **Minimal option:** isolated generation plus Git-based rollback.
2. **Hardened option:** additional runtime recovery or concurrency mechanisms.

The recommendation must state which observed failure justifies the hardened option. Hypothetical future scale alone is not sufficient.

## Pull-request change envelope

Medium- and high-risk changes begin as a draft PR before implementation is considered complete. The PR records:

- goal and measurable outcome;
- non-goals;
- smallest viable change;
- proposed implementation;
- complexity budget;
- alternatives and trade-offs;
- scope-expansion triggers;
- focused and full verification;
- rollback plan;
- publication/privacy review;
- post-merge measurement window.

### Risk classes

- **L0:** documentation or copy only; normal review.
- **L1:** small, reversible UI/content behavior; CI may be sufficient.
- **L2:** multi-file generation, SEO semantics, or deployment behavior; owner review before merge.
- **L3:** credentials, personal data, schema migration, history rewrite, concurrency protocol, or irreversible change; design approval before implementation and owner approval before merge.

Risk is determined by state, permissions, and reversibility—not line count alone.

## Review separation

Use distinct review questions:

1. **Product/specification review:** Is this the smallest change that satisfies the business invariant?
2. **Correctness review:** Does the implementation preserve data, ownership, and recovery invariants?
3. **Owner review:** Is the complexity and operational cost justified?

Independent automated review is advisory. The owner controls the merge gate for L2/L3 work.

Limit automated fix-and-review cycles. Repeated findings often indicate that the chosen architecture is too complex; return to the minimal option rather than extending the protocol indefinitely.

## Verification matrix

| Concern | Minimum evidence |
|---|---|
| Determinism | Two runs from identical inputs produce identical hashes |
| Archive completeness | Published input slugs equal archive links and generated snapshots |
| Input safety | Invalid, duplicate, or unsafe slugs fail before mutation |
| Date integrity | Timestamp-only changes preserve public dates; visible changes update them |
| Atomic file publication | Fault injection never exposes a truncated target |
| Journal recovery | Abrupt termination recovers or reports a preserved recovery root |
| Concurrent replacement | Rollback preserves content it did not install |
| Mutex ownership | Live owner blocks; stale takeover yields one owner; release deletes only its own claim |
| Deployment | Reviewed commit, CI, remote SHA, and live checks agree |

Run focused tests while iterating. Run the full suite once before approval and bounded live verification after merge.

## Public-information boundary

A public repository may document general architecture and verification results. Do not place the following in commits, PR descriptions, comments, logs, or CI artifacts:

- credentials or connection secrets;
- personal or customer information;
- internal filesystem locations;
- private operational schedules;
- account quota or token usage;
- confidential business procedures.

Keep internal decision records in an approved private location. The public PR should contain only a sanitized engineering rationale.

## Decision record

A successful PR records not only **what** was changed, but also:

- why the minimal option was or was not sufficient;
- which real failure evidence justified added complexity;
- which guarantees belong to the filesystem and which belong to Git/deployment;
- what data will determine whether the product objective was achieved.

That record is the reusable enterprise artifact.
