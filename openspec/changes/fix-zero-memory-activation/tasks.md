## 1. Remember contract

- [x] 1.1 Make `xpi_memo_remember.kind` a required closed enum of existing T1 kinds and verify omitted or unknown kind fails schema validation with no audit write
- [x] 1.2 Stop defaulting missing kind to `session_context` in `operationFor` and verify remember tests that relied on the default now pass only with an explicit kind
- [x] 1.3 Keep `shouldAutoStore` unchanged and verify `global_preference` with explicit-user-statement still auto-stores while `project_decision` still creates a candidate
- [x] 1.4 Return exactly one of `stored` | `candidate` | `rejected` on governed remember paths and verify each status is covered by a unit test

## 2. Confirmation UX

- [x] 2.1 Replace blocking yes/no confirm with Store / Later / Reject showing kind, bank, and evidence summary and verify a candidate kind no longer treats Cancel as the only alternative to Store
- [x] 2.2 Map Store to `candidates.confirm` and Reject to `candidates.reject` without changing lifecycle persistence and verify existing candidate-lifecycle tests still pass
- [x] 2.3 Map Later to leave the candidate in `candidates.json` and verify `/xpi-memo` Pending lists it with no T1 row written
- [x] 2.4 In non-TUI mode, queue candidate kinds as `candidate` instead of blocking and verify the tool result status is `candidate`

## 3. Recall observability

- [x] 3.1 Report queried banks from the search query plan rather than from result rows and verify empty mnemosyne recall includes the global bank (and project bank when in a git project)
- [x] 3.2 Keep `queriedBanks: []` only when no backend ran and verify the no-backend warning path still returns an empty array
- [x] 3.3 Update recall/status tests so empty-result fixtures assert non-empty `queriedBanks` when a backend ran

## 4. Health doctor

- [x] 4.1 Classify empty T1 as exactly one of `NEVER_CALLED` | `PENDING` | `WRITE_FAILED` | `RECALL_EMPTY` using the design.md precedence and verify each state with a fixture
- [x] 4.2 Emit a read-only evidence bundle (audit counts, L0 T1 event counts, per-bank rows, configured vs CLI-default roots) and verify the report contains no memory body text
- [x] 4.3 Surface the diagnosis on the existing status/L0 command family as JSON plus TUI panel and verify `/xpi-memo-status` or `/xpi-memo-l0` includes the state field
- [x] 4.4 Detect configured root, mnemosyne CLI default, and stale `~/xpi-memo` as independent surfaces without creating symlinks and verify distinct inodes are listed separately

## 5. Shared root

- [x] 5.1 Keep extension-spawned mnemosyne on `MNEMOSYNE_DATA_DIR=<configured dataDir>` and verify a store then CLI stats against that env sees the new row
- [x] 5.2 Document the CLI cross-check as `MNEMOSYNE_DATA_DIR=$XPI_MEMO_DATA_DIR mnemosyne stats` in GUIDE.md and TROUBLESHOOTING.md, name the three surfaces (configured root, CLI default, stale `~/xpi-memo`), and note that consolidation is a manual step with no automated migrate

## 6. Skill and gates

- [x] 6.1 Update `skills/memory-boundaries/SKILL.md` so remember requires kind and outcomes are `stored` | `candidate` | `rejected` and verify the skill no longer describes optional kind
- [x] 6.2 Run `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test` and verify all three pass
