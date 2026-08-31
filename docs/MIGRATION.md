# Migration Guide: memoharness → xpi-memo

## Overview

xpi-memo is the successor to `@fx-pi/memoharness`, with enhanced capabilities planned:
- L0 session-trace layer (v0.2)
- Markdown data export (v0.3)
- Pluggable search backends (v0.4)

## Quick Migration

```bash
pi install xpi-memo
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

## What Gets Migrated

### ✅ Preserved (copied verbatim)
- All memory databases (`mnemosyne.db`, `banks/project-*/mnemosyne.db`)
- Audit log (`audit.json`) — original provenance values (`pi:memoharness_*`) are kept untouched
- Candidate queue (`candidates.json`) — pending state preserved

### 🔄 Translated
- User config: `~/.config/memoharness/config.json` → `~/.config/xpi-memo/config.json`
  - `MEMOHARNESS_*` keys renamed to `XPI_MEMO_*`
  - Secret-looking keys (`token`, `apiKey`, `password`, `secret`, `credential`) are never copied

### ⚠️ Changed (breaking)
- Commands: `/memoharness` → `/xpi-memo`, `/memoharness-status` → `/xpi-memo-status`
- Tools: `memoharness_remember` → `xpi_memo_remember` (same for recall/forget/sleep)
- Environment variables: `MEMOHARNESS_*` → `XPI_MEMO_*`
- Data directory: `~/.pi/agent/memoharness/` → `~/.pi/agent/xpi-memo/`
- Config directory: `~/.config/memoharness/` → `~/.config/xpi-memo/`

## Migration Process

### Step 1: Backup (recommended)

```bash
cp -r ~/.pi/agent/memoharness ~/.pi/agent/memoharness.backup
```

### Step 2: Dry Run

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
```

Review the output: files to copy, config mappings, warnings.

### Step 3: Apply

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

A report is written to `<dataDir>/migration-report-<timestamp>.md` with file counts, sizes, and validation results.

### Step 4: Verify

```bash
/xpi-memo-status
```

Check that memory counts match and banks are accessible.

### Step 5: Update Your Workflow

Update scripts/docs referencing old commands, tool names, and environment variables.

## Rollback

1. Uninstall xpi-memo
2. Restore backup: `rm -rf ~/.pi/agent/xpi-memo && mv ~/.pi/agent/memoharness.backup ~/.pi/agent/memoharness`
3. Reinstall memoharness

The original memoharness directory is never modified by the migration tool.

## Troubleshooting

### Migration tool not found
Ensure xpi-memo is installed: `pi list | grep xpi-memo`

### "Bank not found" after migration
Check banks were copied: `ls ~/.pi/agent/xpi-memo/banks/`

### Configuration not migrated
Check `~/.config/xpi-memo/config.json`. If missing, the legacy config may not exist — xpi-memo uses safe defaults.

## FAQ

**Q: Will my old memories still work?**
A: Yes. Banks are copied as-is; mnemosyne reads them unchanged.

**Q: Do I need to update my audit logs?**
A: No. Historical provenance values are preserved for audit integrity.

**Q: Can I run both memoharness and xpi-memo?**
A: Not recommended — both would write to separate copies of the same banks and diverge.

## Support

- GitHub Issues: xpi-memo repository
- Documentation: [docs/](./)
