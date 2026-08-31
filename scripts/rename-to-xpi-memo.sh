#!/bin/bash
# Rename memoharness -> xpi-memo. Idempotent.
# Preserves LEGACY_MEMOHARNESS_* constants (backward-compat detection).
set -e
cd "$(dirname "$0")/.."

echo "🔄 memoharness -> xpi-memo"

# 1. Function export name
sed -i '' 's/export default function memoharness/export default function xpiMemo/g' src/index.ts

# 2. Command registration
sed -i '' 's/"memoharness"/"xpi-memo"/g' src/index.ts
sed -i '' 's/"memoharness-status"/"xpi-memo-status"/g' src/index.ts

# 3. Tool names (global)
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's/memoharness_remember/xpi_memo_remember/g' \
  -e 's/memoharness_recall/xpi_memo_recall/g' \
  -e 's/memoharness_forget/xpi_memo_forget/g' \
  -e 's/memoharness_sleep/xpi_memo_sleep/g' \
  -e 's/memoharness_/xpi_memo_/g' \
  {} +

# 4. Provenance
find src -name "*.ts" -type f -exec sed -i '' 's/pi:memoharness_/pi:xpi_memo_/g' {} +

# 5. Env vars
find src -name "*.ts" -type f -exec sed -i '' 's/MEMOHARNESS_/XPI_MEMO_/g' {} +

# 6. Data/config dir paths (string form and join() form)
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's|\.pi/agent/memoharness|.pi/agent/xpi-memo|g' \
  -e 's|\.config/memoharness|.config/xpi-memo|g' \
  -e 's|"agent", "memoharness"|"agent", "xpi-memo"|g' \
  -e 's|join(configHome, "memoharness"|join(configHome, "xpi-memo"|g' \
  {} +

# 7. customType / status / widget / surface identifiers
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's/"memoharness-memory"/"xpi-memo-memory"/g' \
  -e 's/ui\.setStatus("memoharness"/ui.setStatus("xpi-memo"/g' \
  -e 's/T1: "memoharness"/T1: "xpi-memo"/g' \
  -e 's/"memoharness-surface"/"xpi-memo-surface"/g' \
  {} +

# 8. CONFIG_DIRECTORY constant
sed -i '' 's/const CONFIG_DIRECTORY = "memoharness"/const CONFIG_DIRECTORY = "xpi-memo"/g' src/config.ts

# 9. Test tmp-dir prefixes and remaining hyphenated refs
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness-/xpi-memo-/g' {} +

# 10. Type names
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's/MemoharnessConfig/XpiMemoConfig/g' \
  -e 's/MemoharnessDependencies/XpiMemoDependencies/g' \
  -e 's/DEFAULT_MEMOHARNESS_CONFIG/DEFAULT_XPI_MEMO_CONFIG/g' \
  {} +

# 11. Remaining CamelCase refs (descriptions, test titles, imports of renamed export)
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's/Memoharness/XpiMemo/g' \
  -e 's/import memoharness from/import xpiMemo from/g' \
  -e 's/\bmemoharness(/xpiMemo(/g' \
  {} +

# 12. Bare remaining lowercase refs (command names in tests, config dirs)
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness/xpi-memo/g' {} +

# 13. Skills docs
if [ -f "skills/memory-boundaries/SKILL.md" ]; then
  sed -i '' -e 's/memoharness/xpi-memo/g' -e 's/Memoharness/xpi-memo/g' skills/memory-boundaries/SKILL.md
fi

# 14. Restore LEGACY_* names clobbered by steps 5/12 (must keep old names for migration detection)
find src -name "*.ts" -type f -exec sed -i '' \
  -e 's/LEGACY_XPI_MEMO_DATA_DIR/LEGACY_MEMOHARNESS_DATA_DIR/g' \
  -e 's/legacyXpiMemoDataDir/legacyMemoharnessDataDir/g' \
  {} +
# Legacy data dir VALUE stays "memoharness" (old install location)
sed -i '' 's|join(homedir(), ".local", "share", "xpi-memo")|join(homedir(), ".local", "share", "memoharness")|g' src/config.ts

echo "✅ 改名完成"
echo "⚠️  LEGACY_MEMOHARNESS_* 必须保留旧名(迁移检测)"
