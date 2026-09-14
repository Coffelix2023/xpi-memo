# Phase 1 实施指南：从 memoharness 到 xpi-memo

## 概述

本文档是 Phase 1 (v0.1) 的详细实施指南，基于对源代码的深入调研。

**核心决策**：
- ✅ 完全改名：`memoharness` → `xpi-memo`
- ✅ 全新品牌重启，不保留旧 API 名称
- ✅ 通过迁移工具实现数据兼容
- ✅ 保持历史 provenance 不变（审计完整性）

## 前置条件检查

当前 xpi-memo 项目状态：
- ✅ `biome.jsonc` 已存在（与 monorepo 一致）
- ✅ `tsconfig.json` 已存在（已内联 base config）
- ✅ `package.json` 基础框架已存在
- ✅ `.gitignore` 已存在
- ⚠️ `src/` 只有骨架 index.ts
- ❌ 缺少所有核心代码

源项目统计：
- 📁 66 个 TypeScript 源文件
- 🧪 60+ 个测试文件
- 📝 138 处 "memoharness" 引用分布在 35 个文件
- 📚 skills/ 目录（memory-boundaries）
- 📖 docs/ 目录

## Task 1: 文件复制与结构搭建

### Task 1.1 备份现有 xpi-memo 骨架

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
cp src/index.ts src/index.ts.backup
```

**验证**：
```bash
ls -la src/index.ts.backup
```

### Task 1.2 复制源文件

```bash
# 复制所有源文件
cp -r /Users/felix/c6x_local/app-prd/fx-pi-extensions/packages/fx-pi-memoharness/src/* \
     /Users/felix/c6x_local/app-prd/xpi-memo/src/

# 复制 skills 目录
cp -r /Users/felix/c6x_local/app-prd/fx-pi-extensions/packages/fx-pi-memoharness/skills \
     /Users/felix/c6x_local/app-prd/xpi-memo/

# 复制 docs 目录
cp -r /Users/felix/c6x_local/app-prd/fx-pi-extensions/packages/fx-pi-memoharness/docs \
     /Users/felix/c6x_local/app-prd/xpi-memo/

# 复制 WIP-NOTES.md（可选，作为参考）
cp /Users/felix/c6x_local/app-prd/fx-pi-extensions/packages/fx-pi-memoharness/WIP-NOTES.md \
   /Users/felix/c6x_local/app-prd/xpi-memo/docs/memoharness-wip-notes.md
```

**验证**：
```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
find src -name "*.ts" | wc -l  # 应该是 66
ls -la skills/
ls -la docs/
```

### Task 1.3 更新 package.json

检查并更新 `package.json`：

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
cat package.json
```

需要确认的字段：
- ✅ `name`: `"xpi-memo"` (已正确)
- ✅ `peerDependencies`: 应该匹配源项目
- ⚠️ 需要添加 `"pi.skills"` 配置

更新内容：
```json
{
  "name": "xpi-memo",
  "version": "0.1.0",
  "description": "Super memory tool combining mnemosyne + pi-memory architectures: L0 session-trace, T1 governance, Markdown export, pluggable search",
  "keywords": ["pi-package", "pi-extension", "memory", "mnemosyne", "xpi-memo"],
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"]
  },
  "scripts": {
    "lint": "biome check .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

**验证**：
```bash
cat package.json | jq '.pi'
pnpm install  # 确保依赖正确
```

## Task 2: 系统化改名

### Task 2.1 创建改名脚本

创建 `scripts/rename-to-xpi-memo.sh`：

```bash
#!/bin/bash
set -e

echo "🔄 开始将 memoharness 改名为 xpi-memo..."

cd "$(dirname "$0")/.."

# 1. 函数导出名
echo "📝 Step 1: 更新函数导出名..."
sed -i '' 's/export default function memoharness/export default function xpiMemo/g' src/index.ts

# 2. 命令注册
echo "📝 Step 2: 更新命令名..."
sed -i '' 's/"memoharness"/"xpi-memo"/g' src/index.ts
sed -i '' 's/"memoharness-status"/"xpi-memo-status"/g' src/index.ts

# 3. 工具名称（全局）
echo "📝 Step 3: 更新工具名称..."
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness_remember/xpi_memo_remember/g' {} \;
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness_recall/xpi_memo_recall/g' {} \;
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness_forget/xpi_memo_forget/g' {} \;
find src -name "*.ts" -type f -exec sed -i '' 's/memoharness_sleep/xpi_memo_sleep/g' {} \;

# 4. Provenance
echo "📝 Step 4: 更新 provenance..."
find src -name "*.ts" -type f -exec sed -i '' 's/pi:memoharness_/pi:xpi_memo_/g' {} \;

# 5. 环境变量
echo "📝 Step 5: 更新环境变量..."
find src -name "*.ts" -type f -exec sed -i '' 's/MEMOHARNESS_/XPI_MEMO_/g' {} \;

# 6. 数据目录路径
echo "📝 Step 6: 更新数据目录路径..."
find src -name "*.ts" -type f -exec sed -i '' 's|\.pi/agent/memoharness|\.pi/agent/xpi-memo|g' {} \;
find src -name "*.ts" -type f -exec sed -i '' 's|\.config/memoharness|\.config/xpi-memo|g' {} \;

# 7. customType 和其他字符串
echo "📝 Step 7: 更新内部标识符..."
find src -name "*.ts" -type f -exec sed -i '' 's/"memoharness-memory"/"xpi-memo-memory"/g' {} \;

# 8. ui.setStatus
echo "📝 Step 8: 更新 UI 状态标识..."
find src -name "*.ts" -type f -exec sed -i '' 's/ui\.setStatus("memoharness"/ui.setStatus("xpi-memo"/g' {} \;

# 9. T1 标识
echo "📝 Step 9: 更新 T1 标识..."
find src -name "*.ts" -type f -exec sed -i '' 's/T1: "memoharness"/T1: "xpi-memo"/g' {} \;

# 10. CONFIG_DIRECTORY 常量
echo "📝 Step 10: 更新配置目录常量..."
sed -i '' 's/const CONFIG_DIRECTORY = "memoharness"/const CONFIG_DIRECTORY = "xpi-memo"/g' src/config.ts

# 11. 测试临时目录前缀
echo "📝 Step 11: 更新测试临时目录前缀..."
find src -name "*.test.ts" -type f -exec sed -i '' 's/"memoharness-/"xpi-memo-/g' {} \;

# 12. 类型名称
echo "📝 Step 12: 更新类型名称..."
find src -name "*.ts" -type f -exec sed -i '' 's/MemoharnessDependencies/XpiMemoDependencies/g' {} \;
find src -name "*.ts" -type f -exec sed -i '' 's/DEFAULT_MEMOHARNESS_CONFIG/DEFAULT_XPI_MEMO_CONFIG/g' {} \;

# 13. 更新 skills 中的引用
echo "📝 Step 13: 更新 skills 文档..."
if [ -d "skills/memory-boundaries" ]; then
  sed -i '' 's/memoharness/xpi-memo/g' skills/memory-boundaries/SKILL.md
  sed -i '' 's/Memoharness/xpi-memo/g' skills/memory-boundaries/SKILL.md
fi

echo "✅ 改名完成！"
echo ""
echo "⚠️  请注意：以下内容应保持 'memoharness' 不变（用于向后兼容）："
echo "   - LEGACY_MEMOHARNESS_DATA_DIR 常量"
echo ""
echo "📋 下一步："
echo "   1. 手动检查 src/config.ts 中的 LEGACY_* 常量"
echo "   2. 运行: pnpm typecheck"
echo "   3. 运行: pnpm lint"
echo "   4. 运行: grep -r 'memoharness' src/ | grep -v LEGACY"
```

**执行改名**：
```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
chmod +x scripts/rename-to-xpi-memo.sh
./scripts/rename-to-xpi-memo.sh
```

### Task 2.2 手动检查保留项

**必须保留 "memoharness" 的地方**：

编辑 `src/config.ts`，确认以下常量**保持不变**：

```typescript
// ✅ 应该保持 "memoharness"（用于迁移检测）
const LEGACY_MEMOHARNESS_DATA_DIR = join(
  homedir(),
  ".local",
  "share",
  "memoharness"  // ← 不要改这个！
);

export function legacyDataDirExists(): boolean {
  return existsSync(LEGACY_MEMOHARNESS_DATA_DIR);
}
```

**验证保留项**：
```bash
grep -n "LEGACY_MEMOHARNESS_DATA_DIR" src/config.ts
```

### Task 2.3 验证改名完整性

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo

# 检查是否有遗漏的 "memoharness"（排除 LEGACY_）
echo "🔍 检查遗漏的 memoharness 引用..."
grep -r "memoharness" src/ | grep -v "LEGACY_MEMOHARNESS" | grep -v ".backup"

# 应该没有输出，或者只有注释中的引用
```

## Task 3: 代码验证

### Task 3.1 TypeScript 类型检查

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
pnpm typecheck
```

**预期输出**：无错误

**常见问题**：
- 如果有 `MemoharnessDependencies` 未定义错误，说明某处改名遗漏
- 如果有 import 路径错误，检查是否有 monorepo 路径残留

### Task 3.2 代码规范检查

```bash
pnpm lint
```

**预期输出**：无错误或只有 warning

**常见问题**：
- 未使用的导入：可以运行 `pnpm lint --apply` 自动修复

### Task 3.3 运行测试

```bash
pnpm test
```

**预期输出**：所有测试通过

**如果测试失败**：
1. 检查测试中的 mock 数据路径
2. 检查测试中的环境变量名称
3. 检查临时目录前缀是否正确改名

### Task 3.4 最终命名一致性检查

创建检查清单脚本 `scripts/verify-naming.sh`：

```bash
#!/bin/bash

echo "🔍 命名一致性检查..."
echo ""

cd "$(dirname "$0")/.."

ERRORS=0

# 检查主函数名
echo "✓ 检查主函数导出..."
if ! grep -q "export default function xpiMemo" src/index.ts; then
  echo "  ❌ 主函数名未改为 xpiMemo"
  ERRORS=$((ERRORS + 1))
fi

# 检查命令注册
echo "✓ 检查命令注册..."
if grep -q '"memoharness"' src/index.ts | grep -v xpi-memo; then
  echo "  ❌ 仍有 'memoharness' 命令注册"
  ERRORS=$((ERRORS + 1))
fi

# 检查工具名称
echo "✓ 检查工具名称..."
if grep -q 'memoharness_' src/ -r | grep -v xpi_memo | grep -v LEGACY; then
  echo "  ❌ 仍有 'memoharness_' 工具名称"
  ERRORS=$((ERRORS + 1))
fi

# 检查环境变量
echo "✓ 检查环境变量..."
if grep -q 'MEMOHARNESS_' src/ -r | grep -v XPI_MEMO | grep -v LEGACY; then
  echo "  ❌ 仍有 'MEMOHARNESS_' 环境变量"
  ERRORS=$((ERRORS + 1))
fi

# 检查 LEGACY 常量是否保留
echo "✓ 检查 LEGACY 常量..."
if ! grep -q 'LEGACY_MEMOHARNESS_DATA_DIR' src/config.ts; then
  echo "  ❌ LEGACY_MEMOHARNESS_DATA_DIR 常量丢失"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ 命名一致性检查通过！"
  exit 0
else
  echo "❌ 发现 $ERRORS 个命名问题"
  exit 1
fi
```

**执行检查**：
```bash
chmod +x scripts/verify-naming.sh
./scripts/verify-naming.sh
```

## Task 4: 文档更新

### Task 4.1 更新 README.md

创建新的 `README.md`（替换原有的）：

```markdown
# xpi-memo

Super memory tool combining mnemosyne + pi-memory architectures.

## Features

- **L0 Session Trace**: Append-only JSONL event log
- **T1 Governed Memory**: Routing, governance, recall policies
- **Markdown Export**: Data sovereignty with MEMORY.md and daily logs
- **Pluggable Search**: mnemosyne, ripgrep, or qmd backends

## Installation

```bash
pi install xpi-memo
```

## Migration from memoharness

If you're upgrading from `@fx-pi/memoharness`:

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

See [MIGRATION.md](./docs/MIGRATION.md) for details.

## Usage

### Commands

- `/xpi-memo` - Open TUI console
- `/xpi-memo-status` - Show JSON status

### Tools

- `xpi_memo_remember` - Store memory
- `xpi_memo_recall` - Recall memory
- `xpi_memo_forget` - Delete memory
- `xpi_memo_sleep` - Consolidate memory

## Configuration

Default data directory: `~/.pi/agent/xpi-memo/`

Environment variables:
- `XPI_MEMO_DATA_DIR`
- `XPI_MEMO_PAUSED`
- `XPI_MEMO_LIMIT`
- `XPI_MEMO_RECALL_POLICY`

User config: `~/.config/xpi-memo/config.json`

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## License

MIT
```

### Task 4.2 创建 MIGRATION.md

创建 `docs/MIGRATION.md`：

```markdown
# Migration Guide: memoharness → xpi-memo

## Overview

xpi-memo is the successor to `@fx-pi/memoharness`, with enhanced capabilities:
- L0 session-trace layer
- Markdown data export
- Pluggable search backends

## Quick Migration

1. Install xpi-memo
2. Run migration tool
3. Start using new commands

```bash
pi install xpi-memo
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

## What Gets Migrated

### ✅ Preserved (copied)
- All memory databases (`mnemosyne.db`, `banks/project-*/`)
- Audit log (`audit.json`)
- Candidate queue (`candidates.json`)
- Configuration settings

### ⚠️ Changed
- Commands: `/memoharness` → `/xpi-memo`
- Tools: `memoharness_*` → `xpi_memo_*`
- Environment variables: `MEMOHARNESS_*` → `XPI_MEMO_*`
- Data directory: `~/.pi/agent/memoharness/` → `~/.pi/agent/xpi-memo/`

### ✓ Backward Compatible
- Old provenance values (`pi:memoharness_remember`) are preserved in audit logs
- xpi-memo can read memories created by memoharness
- No data loss or corruption

## Migration Process

### Step 1: Backup (Optional but Recommended)

```bash
cp -r ~/.pi/agent/memoharness ~/.pi/agent/memoharness.backup
```

### Step 2: Dry Run

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
```

Review the output. It shows:
- Files to be migrated
- Configuration mappings
- Potential issues

### Step 3: Apply Migration

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

### Step 4: Verify

```bash
/xpi-memo-status
```

Check that:
- Memory counts match
- Banks are accessible
- Configuration is correct

### Step 5: Update Your Workflow

Update any scripts or documentation that reference:
- Old commands (`/memoharness` → `/xpi-memo`)
- Old tool names (`memoharness_remember` → `xpi_memo_remember`)
- Old environment variables (`MEMOHARNESS_*` → `XPI_MEMO_*`)

## Rollback

If you need to rollback:

1. Uninstall xpi-memo
2. Restore backup
3. Reinstall memoharness

```bash
pi uninstall xpi-memo
cp -r ~/.pi/agent/memoharness.backup ~/.pi/agent/memoharness
pi install @fx-pi/memoharness
```

## Troubleshooting

### Migration tool not found

Ensure xpi-memo is properly installed:
```bash
pi list | grep xpi-memo
```

### "Bank not found" after migration

Check that banks were copied:
```bash
ls -la ~/.pi/agent/xpi-memo/banks/
```

### Configuration not migrated

Manually copy config:
```bash
cp ~/.config/memoharness/config.json ~/.config/xpi-memo/config.json
```

Then edit environment variable names.

## FAQ

**Q: Will my old memories still work?**
A: Yes! xpi-memo is fully backward compatible with memoharness data.

**Q: Do I need to update my audit logs?**
A: No. Historical provenance values are preserved for audit integrity.

**Q: Can I run both memoharness and xpi-memo?**
A: Not recommended. They use the same underlying mnemosyne banks and could conflict.

**Q: What if I have custom scripts?**
A: Update command names and environment variables in your scripts.

## Support

For issues or questions:
- GitHub Issues: [xpi-memo repository]
- Documentation: [docs/](./docs/)
```

## Task 5: 准备 GitHub 发布

### Task 5.1 Git 提交

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo
git status
git add .
git commit -m "feat: Phase 1 (v0.1) - Migrate from memoharness to xpi-memo

- Copied 66 source files from fx-pi-memoharness
- Renamed all 'memoharness' identifiers to 'xpi-memo'
- Updated commands, tools, environment variables
- Preserved LEGACY constants for backward compatibility
- Added migration guide and updated documentation

Breaking changes:
- New command names: /xpi-memo, /xpi-memo-status
- New tool names: xpi_memo_*
- New environment variables: XPI_MEMO_*
- New data directory: ~/.pi/agent/xpi-memo/

Migration:
- Use 'xpi-memo migrate' command to migrate from memoharness
- See docs/MIGRATION.md for details"
```

### Task 5.2 创建 GitHub 仓库（如果还没有）

```bash
# 如果还没有 remote，添加它
git remote add origin https://github.com/[your-username]/xpi-memo.git
git branch -M main
git push -u origin main
```

### Task 5.3 创建 v0.1.0 标签

```bash
git tag -a v0.1.0 -m "Release v0.1.0: Foundation

- Drop-in functional replacement for memoharness
- Full rename to xpi-memo brand
- Migration tool for seamless upgrade
- All 66 source files migrated
- 60+ tests passing
- Complete documentation"

git push origin v0.1.0
```

### Task 5.4 创建 GitHub Release

在 GitHub 上创建 Release，使用以下内容：

**Title**: `v0.1.0 - Foundation`

**Description**:
```markdown
# xpi-memo v0.1.0 - Foundation

First release of xpi-memo, the successor to `@fx-pi/memoharness`.

## 🎉 What's New

- **New Brand**: xpi-memo (超级记忆工具)
- **Migration Tool**: Seamless upgrade from memoharness
- **Full Documentation**: Installation, usage, and migration guides

## 🔄 Migration from memoharness

```bash
pi install xpi-memo
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

See [MIGRATION.md](./docs/MIGRATION.md) for details.

## 📋 Features (same as memoharness)

- T1 Memory routing (global/project/session)
- Write governance with candidate confirmation
- Recall policies (active/high-value-auto)
- TUI console
- Mnemosyne integration

## ⚠️ Breaking Changes

**API Changes**:
- Commands: `/memoharness` → `/xpi-memo`
- Tools: `memoharness_*` → `xpi_memo_*`
- Env vars: `MEMOHARNESS_*` → `XPI_MEMO_*`
- Data dir: `~/.pi/agent/memoharness/` → `~/.pi/agent/xpi-memo/`

**Backward Compatibility**:
- ✅ Can migrate all data
- ✅ Preserves audit history
- ✅ No data loss

## 🚀 What's Next

- **v0.2**: L0 session-trace layer
- **v0.3**: Markdown export
- **v0.4**: Pluggable search backends
- **v1.0**: Production-ready

## 📦 Installation

```bash
pi install xpi-memo
```

## 🐛 Known Issues

None at this time.

## 🙏 Acknowledgments

Based on fx-pi-memoharness by the same author.
```

## Task 6: 最终验证清单

在发布前，完成以下检查：

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo

# ✅ 1. 代码质量
pnpm typecheck  # 0 errors
pnpm lint       # 0 errors
pnpm test       # all pass

# ✅ 2. 命名一致性
./scripts/verify-naming.sh  # pass

# ✅ 3. 文件完整性
ls src/*.ts | wc -l  # 66 files
ls skills/           # memory-boundaries exists
ls docs/             # guides exist

# ✅ 4. 文档完整性
[ -f README.md ]
[ -f docs/MIGRATION.md ]
[ -f docs/phase-1-implementation-guide.md ]

# ✅ 5. Git 状态
git status  # clean working tree
git tag     # v0.1.0 exists

# ✅ 6. Package 配置
cat package.json | jq '.name'         # "xpi-memo"
cat package.json | jq '.pi.skills'    # ["./skills"]
cat package.json | jq '.pi.extensions' # ["./src/index.ts"]

echo "✅ Phase 1 实施完成！"
```

## 下一步

Phase 1 完成后：

1. **测试实际使用**：
   ```bash
   pi install /path/to/xpi-memo
   /xpi-memo
   /xpi-memo-status
   ```

2. **开始 Phase 2 (v0.2)**：L0 Session Trace
   - 参考 `openspec/changes/xpi-memo-staged-evolution/tasks.md`
   - Task 4.1 - 7.6

3. **收集用户反馈**：
   - 发布后观察 GitHub Issues
   - 询问早期用户的迁移体验

## 附录：故障排查

### 问题：pnpm typecheck 失败

**症状**：TypeScript 报错

**解决**：
1. 检查 import 路径是否有 `../../` monorepo 引用
2. 检查类型名称是否改名完整
3. 运行 `pnpm install` 重新安装依赖

### 问题：pnpm test 失败

**症状**：测试不通过

**解决**：
1. 检查测试中的路径和环境变量名
2. 检查 mock 数据中的字符串
3. 逐个文件运行测试定位问题：`pnpm test src/config.test.ts`

### 问题：grep 检查发现遗漏的 "memoharness"

**症状**：改名脚本遗漏了某些引用

**解决**：
1. 手动编辑相关文件
2. 更新改名脚本，重新运行
3. 注意区分应该保留的 LEGACY_ 常量

---

**文档版本**: 1.0  
**创建日期**: 2024-08-31  
**基于**: xpi-memo-staged-evolution OpenSpec change
