## Context

See `proposal.md` for the field-verified motivation and scope. The current architecture already separates semantic scope from physical Mnemosyne banks, exposes bank provenance internally during search, and keeps the forget tool on a single `memoryId` input. The design must repair the information flow without changing bank layout, public tool names, or the existing governance boundaries.

## Goals / Non-Goals

**Goals:**

- Preserve a real Mnemosyne memory ID from backend parsing through the public recall response.
- Make single-argument forget reliable for both project and global memories in a project context.
- Keep fallback search results honest when they do not identify a deletable T1 row.
- Replace the redundant intent gate while retaining ambiguity, verification, identity, and length protections.
- Make regression coverage prove the complete project recall-to-forget path.

**Non-Goals:**

- Do not encode bank names into Mnemosyne IDs or add a local ID-to-bank registry.
- Do not add a bank parameter to `xpi_memo_forget`.
- Do not change routing semantics, database placement, recall ranking, sleep, UI, LLM extraction, or Markdown export.

## Decisions

### 1. Add an optional ID to the backend-neutral search result

The search result contract will carry an optional string ID. The Mnemosyne backend maps the upstream row ID when it is a string; other backends omit it. The public recall mapper forwards this field and continues using `null` when it is absent.

This is preferred over fabricating identifiers from content or paths because only Mnemosyne IDs are valid inputs to deletion. It also avoids making fallback backends pretend to support T1 mutation.

### 2. Resolve deletion by bounded bank probing

The forget operation will construct an ordered, duplicate-free list: current project bank when available, then the default bank. It invokes delete with the corresponding bank option and stops on the first successful deletion. Outside a project it invokes only the default bank.

This preserves the existing one-argument tool contract and handles both project-memory and global-memory IDs without requiring callers to echo provenance. A future explicit locator can be added if cross-bank ID collisions become a real problem; it is unnecessary for the current UUID-like ID contract.

### 3. Treat only successful deletion as a deletion audit

The audit entry will be emitted after the delete command succeeds and will include the actual bank. A failed probe is an internal candidate for the next bank, not a user-visible success. If all probes fail, the final error remains bounded and contains no memory body.

This prevents audit data from claiming deletion when the ID was only absent from one bank.

### 4. Let category matching be the intent gate

The extractor will classify the input before deciding whether to skip it. A single category proceeds to existing governance checks; zero categories returns `no-explicit-intent`; multiple categories returns `ambiguous-intent`. The independent marker regex is removed rather than expanded, avoiding a second vocabulary that can drift from category patterns.

This fixes the measured natural-language misses while preserving the existing protections for project facts, missing project identity, and oversized session context.

### 5. Test at both contract and real-CLI layers

Unit tests will verify ID parsing, public mapping, bank ordering, and category decisions. The real CLI integration path will store project memory, recall it, assert a non-null ID and project bank, then forget it and verify the project bank no longer contains it. Existing global deletion behavior remains covered.

## Risks / Trade-offs

- **[Risk]** Probing two banks adds one bounded CLI call for a global memory used inside a project. → **Mitigation:** stop immediately on success and never probe more than the current project plus default bank.
- **[Risk]** A fallback result remains non-actionable. → **Mitigation:** return `null` explicitly instead of a misleading synthetic ID; the result still remains usable for context recall.
- **[Risk]** Removing the marker gate could increase false positives. → **Mitigation:** require exactly one category and retain all existing ambiguity, project-fact, identity, and length checks; preserve ordinary-statement regression cases.
- **[Risk]** Existing test fixtures assume every `SearchResult` lacks an ID. → **Mitigation:** make the field optional and update only assertions whose contract intentionally changes.

## Migration Plan

1. Ship the backend/result contract and intent regression tests.
2. Enable ordered bank probing for forget without changing existing stored data.
3. Verify global, project, fallback, and absent-ID behavior in automated tests.
4. Roll back by reverting the small contract and handler changes; no data migration or database rewrite is required.
