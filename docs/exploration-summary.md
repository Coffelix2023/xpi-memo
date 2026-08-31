# xpi-memo Phase 1 探索总结

**日期**: 2024-08-31  
**模式**: Explore Mode（深度思考，不实施）

## 探索成果

本次探索对 xpi-memo v0.1 实施进行了全面的技术调研，并将结论落地为三份文档：

### 1. 核心设计决策（已同步到 OpenSpec）

**文档**: `openspec/changes/xpi-memo-staged-evolution/design.md`

**新增**: Decision 8 - Complete brand reboot with full rename

**关键决策**:
- ✅ 完全改名：`memoharness` → `xpi-memo`（约 138 处引用）
- ✅ 全新品牌重启，不保留旧 API 名称
- ✅ 通过迁移工具实现数据兼容
- ✅ 保持历史 provenance 不变（审计完整性）

**Breaking Changes**:
- 命令: `/memoharness` → `/xpi-memo`
- 工具: `memoharness_*` → `xpi_memo_*`
- 环境变量: `MEMOHARNESS_*` → `XPI_MEMO_*`
- 数据目录: `~/.pi/agent/memoharness/` → `~/.pi/agent/xpi-memo/`

### 2. 更新的任务清单（已同步到 OpenSpec）

**文档**: `openspec/changes/xpi-memo-staged-evolution/tasks.md`

**Phase 1 更新**:
- **1.1-1.11**: 仓库设置与系统化改名（11 个任务，原 6 个）
- **2.1-2.9**: 迁移工具（更详细的描述，说明 provenance 保留策略）
- **3.1-3.6**: 文档与发布（更新说明 breaking changes）

**关键新增**:
- Task 1.5: 创建并运行改名脚本（自动化 138 处改名）
- Task 1.6: 手动验证 LEGACY_* 常量保留
- Task 1.11: 运行命名一致性验证脚本

### 3. 详细实施指南（操作手册）

**文档**: `docs/phase-1-implementation-guide.md`

**内容**:
- 16,380 字节的完整实施指南
- 6 个主要任务组（文件复制、改名、验证、文档、发布、故障排查）
- 可执行的 Shell 脚本（改名脚本、验证脚本）
- 完整的 README.md 和 MIGRATION.md 模板
- Git 提交和发布的详细步骤

## 技术发现

### 源代码分析

```
fx-pi-memoharness 统计：
├─ 66 个 TypeScript 源文件
├─ 60+ 个测试文件
├─ 138 处 "memoharness" 引用（分布在 35 个文件）
├─ 无跨包依赖（✓ 可以干净拆分）
└─ 完整的 monorepo 工具链（turbo, pnpm workspace）
```

### 改名影响面

**6 大类改名**:
1. **命令和工具名称**（用户可见 API）
2. **环境变量**（用户配置）
3. **默认数据目录**（文件系统路径）
4. **内部标识符**（customType, provenance, T1, ui.setStatus）
5. **测试临时目录**（测试代码）
6. **函数和类型名称**（代码标识符）

### 向后兼容策略

**保留的内容**:
- `LEGACY_MEMOHARNESS_DATA_DIR` 常量（用于检测旧安装）
- audit.json 中的历史 provenance 值（审计完整性）
- 旧 mnemosyne.db 文件（通过迁移工具复制）

**迁移工具职责**:
- 复制数据文件（不修改）
- 转换配置文件（环境变量名）
- 生成迁移报告

## 架构洞察

### Provenance 困境的解决方案

**问题**: 历史数据中的 `pi:memoharness_remember` 怎么办？

**决策**: 保持原样（选项 A）

**理由**:
- 这是历史事实，不应篡改
- 审计追踪的完整性
- xpi-memo 需要识别两种 provenance（向后兼容层）

### 当前 xpi-memo 项目状态

**已有**:
- ✅ biome.jsonc（与 monorepo 一致）
- ✅ tsconfig.json（已内联 base config）
- ✅ package.json（基础框架）
- ✅ .gitignore
- ✅ pnpm 工作空间

**缺少**:
- ❌ 所有核心代码（只有骨架 index.ts）
- ❌ 测试文件
- ❌ skills/ 目录
- ❌ docs/ 目录

**结论**: xpi-memo 是一个准备接收代码的容器，需要完整迁移。

## 风险识别

### 已识别的风险

1. **改名遗漏**: 138 处引用，可能有手动遗漏
   - 缓解：自动化脚本 + 验证脚本 + grep 检查

2. **测试失败**: 路径、环境变量、mock 数据中的字符串
   - 缓解：逐个文件测试定位问题

3. **用户迁移失败**: 迁移工具有 bug 或遗漏场景
   - 缓解：dry-run 模式 + 详细的迁移报告 + 回滚文档

4. **LEGACY 常量被误改**: 破坏迁移检测能力
   - 缓解：手动验证步骤（Task 1.6）+ 验证脚本检查

## 下一步行动

### 立即可做（仍在 explore mode）

**已完成** ✅:
1. 创建 `docs/phase-1-implementation-guide.md`
2. 更新 `openspec/changes/xpi-memo-staged-evolution/design.md`（添加 Decision 8）
3. 更新 `openspec/changes/xpi-memo-staged-evolution/tasks.md`（细化 Phase 1 任务）
4. 创建本总结文档

### 退出 explore mode 后

**Phase 1 实施**（参考 phase-1-implementation-guide.md）:

```bash
# Task 1: 文件复制与结构搭建
cd /Users/felix/c6x_local/app-prd/xpi-memo
# 执行 Task 1.1 - 1.11...

# Task 2: 系统化改名
./scripts/rename-to-xpi-memo.sh
# 执行 Task 2.1 - 2.9...

# Task 3: 代码验证
pnpm typecheck && pnpm lint && pnpm test
# 执行验证...

# Task 4-6: 文档、发布、验证
# ...
```

## 关键文件清单

### 探索产出（已创建）

```
xpi-memo/
├─ docs/
│  ├─ phase-1-implementation-guide.md  (16KB, 详细操作手册)
│  └─ exploration-summary.md           (本文件)
│
└─ openspec/changes/xpi-memo-staged-evolution/
   ├─ design.md                        (已更新: +Decision 8)
   └─ tasks.md                         (已更新: Phase 1 细化)
```

### 待创建（实施时）

```
xpi-memo/
├─ scripts/
│  ├─ rename-to-xpi-memo.sh           (自动改名脚本)
│  └─ verify-naming.sh                (命名一致性检查)
│
├─ src/                                (66 个 .ts 文件，待复制)
├─ skills/                             (memory-boundaries，待复制)
├─ docs/
│  ├─ MIGRATION.md                    (迁移指南，待写)
│  └─ memoharness-wip-notes.md        (参考文档，待复制)
│
├─ README.md                           (待更新)
└─ package.json                        (待更新: pi.skills)
```

## 与原规划的差异

### 原 design.md 隐含假设

> "existing memoharness users must be able to upgrade smoothly **without breaking changes**"

**解读**: drop-in replacement，保留 API 名称

### 新决策（Decision 8）

> "Complete brand reboot with full rename"

**理由**: 
- xpi-memo 是独立项目，不是 monorepo 的延续
- package 名称、函数名称、API 名称应该一致
- 用户通过迁移工具显式升级，而不是静默替换

### 这是更好的决策

**长期来看**:
- ✅ 品牌一致性
- ✅ 避免未来的技术债
- ✅ 清晰的升级路径

**短期成本**:
- ⚠️ 需要迁移工具（原本也需要，因为数据目录不同）
- ⚠️ 用户需要更新脚本中的命令名

## 学到的经验

### 1. 探索模式的价值

深入调研（读取 66 个文件的统计、grep 138 处引用）避免了：
- 盲目假设（"应该没有 monorepo 依赖"）
- 实施时的意外（"居然有这么多地方要改"）
- 设计缺陷（"忘了考虑 provenance 兼容"）

### 2. 自动化的必要性

138 处改名如果手动操作：
- 容易遗漏
- 容易出错
- 难以验证

脚本化 + 验证脚本：
- 可重复
- 可测试
- 可回滚

### 3. 文档的层次

三份文档各有用途：
- **design.md**: 为什么（决策理由）
- **tasks.md**: 做什么（任务清单）
- **phase-1-implementation-guide.md**: 怎么做（操作手册）

### 4. 向后兼容的复杂性

看似简单的改名，实际涉及：
- API 兼容（命令、工具名）
- 数据兼容（provenance、路径）
- 配置兼容（环境变量）
- 审计完整性（不能改写历史）

## 总结

本次探索成功地：
1. ✅ 识别了 v0.1 的核心工作（改名 + 迁移工具）
2. ✅ 制定了清晰的实施计划（11 + 9 + 6 = 26 个可验证任务）
3. ✅ 创建了可执行的操作手册（16KB 详细指南）
4. ✅ 同步了设计决策到 OpenSpec（Decision 8）
5. ✅ 更新了任务清单到 OpenSpec（Phase 1 细化）

**Phase 1 估算**:
- **时间**: 1-2 天（非 1-2 周，因为大部分是复制和脚本化改名）
- **风险**: 低（脚本化 + 测试覆盖 + 回滚能力）
- **价值**: 高（独立可发布的 v0.1）

**准备就绪**! 可以退出 explore mode，开始实施。

---

**相关文档**:
- [Phase 1 Implementation Guide](./phase-1-implementation-guide.md) - 详细操作手册
- [OpenSpec Design](../openspec/changes/xpi-memo-staged-evolution/design.md) - 设计决策
- [OpenSpec Tasks](../openspec/changes/xpi-memo-staged-evolution/tasks.md) - 任务清单
