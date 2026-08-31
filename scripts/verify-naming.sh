#!/bin/bash
# Naming consistency check: memoharness -> xpi-memo
set -e
cd "$(dirname "$0")/.."

ERRORS=0

echo "✓ 主函数导出..."
grep -q "export default function xpiMemo" src/index.ts || { echo "  ❌ xpiMemo 导出缺失"; ERRORS=$((ERRORS+1)); }

echo "✓ 旧命令注册..."
if grep -rn '"memoharness"' src --include='*.ts' | grep -v LEGACY_MEMOHARNESS | grep -v '^src/migration/'; then
  echo "  ❌ 仍有 memoharness 命令注册"
  ERRORS=$((ERRORS+1))
fi

echo "✓ 工具/环境变量名..."
if grep -rn "memoharness_\|MEMOHARNESS_" src --include='*.ts' | grep -v LEGACY | grep -v '^src/migration/' | grep -v '^src/cli/migrate.ts'; then
  echo "  ❌ 仍有旧工具/环境变量名"
  ERRORS=$((ERRORS+1))
fi

echo "✓ LEGACY 常量保留(迁移检测)..."
grep -q 'LEGACY_MEMOHARNESS_DATA_DIR' src/config.ts || { echo "  ❌ LEGACY_MEMOHARNESS_DATA_DIR 丢失"; ERRORS=$((ERRORS+1)); }
grep -q '"share", "memoharness"' src/config.ts || { echo "  ❌ legacy 数据目录值丢失"; ERRORS=$((ERRORS+1)); }

echo "✓ 新数据目录..."
grep -q '"agent", "xpi-memo"' src/config.ts || { echo "  ❌ dataDir 未指向 xpi-memo"; ERRORS=$((ERRORS+1)); }

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ 命名一致性检查通过"
else
  echo "❌ 发现 $ERRORS 个问题"
  exit 1
fi
