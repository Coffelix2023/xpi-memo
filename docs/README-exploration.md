# xpi-memo Phase 1 探索产出索引

**探索日期**: 2024-08-31  
**探索模式**: Explore Mode（深度调研，不实施）  
**状态**: ✅ 完成，准备实施

---

## 📚 产出文档

### 1. 探索总结（本目录）

**[exploration-summary.md](./exploration-summary.md)** - 5.3KB
- 探索成果概览
- 技术发现（源码分析、改名影响面）
- 架构洞察（provenance 困境解决方案）
- 风险识别与缓解策略
- 与原规划的差异说明
- 学到的经验

### 2. 实施指南（本目录）

**[phase-1-implementation-guide.md](./phase-1-implementation-guide.md)** - 16.4KB
- Task 1: 文件复制与结构搭建（11 个子任务）
- Task 2: 系统化改名（含可执行脚本）
- Task 3: 代码验证（typecheck, lint, test）
- Task 4: 文档更新（README, MIGRATION）
- Task 5: GitHub 发布（commit, tag, release）
- Task 6: 最终验证清单
- 附录：故障排查

### 3. OpenSpec 更新（已同步）

**[../openspec/changes/xpi-memo-staged-evolution/design.md](../openspec/changes/xpi-memo-staged-evolution/design.md)**
- ✅ 新增 Decision 8: Complete brand reboot with full rename
- 说明改名范围（138 处引用）
- 说明 breaking changes 和向后兼容策略

**[../openspec/changes/xpi-memo-staged-evolution/tasks.md](../openspec/changes/xpi-memo-staged-evolution/tasks.md)**
- ✅ 更新 Phase 1 (v0.1) 任务清单
- 从 6 个任务扩展为 26 个详细任务（11+9+6）
- 每个任务都有明确的验证条件

---

## 🎯 核心决策

### Decision 8: 完全品牌重启

**选择**: 全面改名 `memoharness` → `xpi-memo`（约 138 处）

**Breaking Changes**:
```
命令:      /memoharness        → /xpi-memo
工具:      memoharness_*       → xpi_memo_*
环境变量:  MEMOHARNESS_*       → XPI_MEMO_*
数据目录:  ~/.pi/agent/memoharness/ → ~/.pi/agent/xpi-memo/
```

**向后兼容**:
- ✅ 迁移工具复制所有数据
- ✅ 保留历史 provenance 值（审计完整性）
- ✅ LEGACY_* 常量用于检测旧安装

---

## 🚀 快速开始

### 退出 Explore Mode，开始实施

```bash
cd /Users/felix/c6x_local/app-prd/xpi-memo

# 参考实施指南，逐步执行
cat docs/phase-1-implementation-guide.md

# 或者直接跳到 Task 1
pnpm install
# ... 按 Task 1.2 开始复制文件
```

### 实施路径

```
Task 1: 文件复制与改名 (1-2 小时)
  ├─ 1.1-1.4   复制源文件、更新配置
  ├─ 1.5-1.7   运行改名脚本、手动验证
  └─ 1.8-1.11  代码验证

Task 2: 迁移工具 (4-6 小时)
  ├─ 2.1-2.4   实现迁移逻辑
  ├─ 2.5-2.7   CLI 命令与模式
  └─ 2.8-2.9   验证与报告

Task 3: 文档 (2-3 小时)
  ├─ 3.1-3.2   README + MIGRATION.md
  └─ 3.3-3.6   发布准备

总计: 1-2 天完成 v0.1
```

---

## 📋 关键文件清单

### 已创建（探索产出）

```
docs/
├── exploration-summary.md           ✅ 5.3KB
├── phase-1-implementation-guide.md  ✅ 16.4KB
└── README-exploration.md            ✅ 本文件

openspec/changes/xpi-memo-staged-evolution/
├── design.md                        ✅ 已更新 (+Decision 8)
└── tasks.md                         ✅ 已更新 (Phase 1 细化)
```

### 待创建（实施时）

```
scripts/
├── rename-to-xpi-memo.sh           ⏳ 自动改名脚本
└── verify-naming.sh                ⏳ 验证脚本

src/                                ⏳ 66 个 .ts 文件（待复制）
skills/                             ⏳ memory-boundaries（待复制）
docs/
├── MIGRATION.md                    ⏳ 迁移指南
└── memoharness-wip-notes.md        ⏳ 参考文档

README.md                           ⏳ 待更新
package.json                        ⏳ 待更新 (pi.skills)
```

---

## 🔍 技术发现摘要

### 源代码统计

```
fx-pi-memoharness:
├─ 66 个 TypeScript 源文件
├─ 60+ 个测试文件
├─ 138 处 "memoharness" 引用（35 个文件）
└─ 无跨包依赖 ✓
```

### 改名范围（6 大类）

1. **用户 API**: 命令、工具名
2. **配置**: 环境变量
3. **路径**: 数据目录、配置目录
4. **内部**: customType, provenance, T1 标识
5. **测试**: 临时目录前缀
6. **代码**: 函数名、类型名

### 当前项目状态

✅ **已有**: biome.jsonc, tsconfig.json, package.json, .gitignore  
❌ **缺少**: 所有核心代码（只有骨架）

**结论**: 空壳容器，需要完整迁移

---

## ⚠️ 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 改名遗漏 | 中 | 自动化脚本 + 验证脚本 + grep 检查 |
| 测试失败 | 低 | 逐个文件测试定位 |
| 用户迁移失败 | 中 | dry-run + 详细报告 + 回滚文档 |
| LEGACY 常量被误改 | 高 | 手动验证步骤 (Task 1.6) |

---

## 🎓 经验总结

### 探索模式的价值

深入调研避免了：
- ❌ 盲目假设
- ❌ 实施时的意外
- ❌ 设计缺陷

### 自动化的必要性

138 处改名 → 脚本化：
- ✅ 可重复
- ✅ 可测试
- ✅ 可回滚

### 文档的层次

- **design.md**: 为什么（决策理由）
- **tasks.md**: 做什么（任务清单）
- **implementation-guide.md**: 怎么做（操作手册）

---

## 📞 联系方式

**问题或疑问？**
- 查看实施指南的故障排查部分
- 参考 OpenSpec design.md 的风险缓解策略
- 重新进入 explore mode 深入调研

---

**准备就绪！** 🚀

退出 explore mode，参考 `phase-1-implementation-guide.md` 开始实施 Task 1.1。
