# xpi-memo Git 目录 vs 非 Git 目录 & 全局/项目级记忆分离分析

**日期:** 2026-09-02  
**基于:** 源码审计 + 实际测试验证  
**版本:** xpi-memo v1.0.0

---

## TL;DR

1. **有 git 和没有 git 区别很大**：非 git 目录只能写全局记忆，project 级记忆直接报错；recall 只搜 global bank，不搜 project banks
2. **已经分为全局记忆和项目级记忆**：7 种 kind 中 2 种写 global bank，5 种写 project bank，物理隔离在不同 SQLite 数据库中

---

## 问题 1：有 Git 和没有 Git 使用 xpi-memo 有区别吗？

### 结论：**有本质区别**

| 维度 | 非 Git 目录 | Git 目录 |
|------|------------|---------|
| `global_preference` 写入 | ✅ 正常 | ✅ 正常 |
| `global_workflow` 写入 | ✅ 正常 | ✅ 正常 |
| `project_decision` 写入 | ❌ 报错 | ✅ 正常 |
| `project_constraint` 写入 | ❌ 报错 | ✅ 正常 |
| `project_gotcha` 写入 | ❌ 报错 | ✅ 正常 |
| `project_gene` 写入 | ❌ 报错 | ✅ 正常 |
| `session_context` 写入 | ❌ 报错 | ✅ 正常 |
| recall 范围 | 仅 global bank | project bank + global bank |
| project bank 创建 | 不可能 | 自动创建 |

### 源码证据

**`identity.ts` — 项目身份解析**
```typescript
/**
 * Non-Git directories get no project identity and therefore no project bank.
 */
export function resolveProjectIdentity(cwd: string): ProjectIdentity | null {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return null;  // ← 非 git 目录直接返回 null
  // ...
}
```

**`routing.ts` — 路由决策**
```typescript
export function routeMemoryKind(kind: MemoryKind, context: RoutingContext): RoutingDecision {
  const route = MEMORY_KIND_TABLE[kind];
  if (route.target === "global") {
    return { bank: GLOBAL_BANK, kind, scope: route.scope };  // ← global 类型永远可用
  }
  if (context.projectBank === null) {
    throw new Error("Project memory requires a recognized Git project");  // ← 非 git 报错
  }
  return { bank: context.projectBank, kind, scope: route.scope };
}
```

**`index.ts` — Runtime 构建**
```typescript
function createRuntime(cwd: string, dependencies: XpiMemoDependencies): Runtime {
  const project = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(cwd);
  const context: RoutingContext = {
    dataDir: configResult.config.dataDir,
    projectBank: project ? `project-${project.id}` : null,  // ← 非 git 时为 null
  };
  // ...
}
```

**`index.ts` — recall 搜索范围**
```typescript
const outcome = await runtime.search.runSearch({
  limit,
  query: params.query,
  scope: runtime.context.projectBank ? "project" : "global",  // ← 非 git 只搜 global
});
```

### 项目身份生成机制

`identity.ts` 通过以下优先级生成项目 ID：

1. **canonical git common dir**（跨 worktree 稳定）
2. **normalized remote URL**（用于 move 后的 registry 修复）
3. **absolute root path**（无 remote 时的 fallback）

ID 格式：`p-` + sha256(commonDir)[:12]，例如 `p-160da229871f`

同一个 git 仓库的不同 worktree 共享同一个 project bank（因为 canonicalRoot 相同）。

---

## 问题 2：是否可以分为全局记忆和项目级记忆？

### 结论：**已经是分离的架构**

xpi-memo 的 7 种记忆类型天然分为三个层级：

| Kind | Label | Scope | Target Bank | 物理存储 |
|------|-------|-------|-------------|---------|
| `global_preference` | Preference | global | `default` | `~/.pi/agent/xpi-memo/mnemosyne.db` |
| `global_workflow` | Workflow | global | `default` | `~/.pi/agent/xpi-memo/mnemosyne.db` |
| `project_constraint` | Constraint | project | `project-{hash}` | `~/.pi/agent/xpi-memo/banks/project-{hash}/mnemosyne.db` |
| `project_decision` | Decision | project | `project-{hash}` | 同上 |
| `project_gene` | Repository fact | project | `project-{hash}` | 同上 |
| `project_gotcha` | Gotcha | project | `project-{hash}` | 同上 |
| `session_context` | Session context | session | `project-{hash}` | 同上 |

### 物理隔离

```
~/.pi/agent/xpi-memo/
├── mnemosyne.db                          # global bank (所有项目共享)
├── banks/
│   ├── project-p-160da229871f/mnemosyne.db  # 项目 A 的 bank
│   ├── project-p-2f28a11cef65/mnemosyne.db  # 项目 B 的 bank
│   └── ...                                     # 每个 git 仓库一个
```

每个 project bank 是独立的 SQLite 数据库，物理隔离。

### Recall 行为差异

**Git 目录中的 recall：**
```typescript
scope: runtime.context.projectBank ? "project" : "global"
// → 搜索 project bank + global bank
```

**非 Git 目录中的 recall：**
```typescript
scope: "global"
// → 只搜索 global bank
```

### 三级信任模型

| 层级 | 名称 | 用途 | 对应 kind |
|------|------|------|----------|
| L0 | Session Trace | 丢失无损的事件日志 | 所有操作的 append-only JSONL |
| L1 | xpi-memo (T1) | 受治理的跨会话记忆 | 7 种 kind |
| L2 | ai-memory | 延迟处理 | 未实现 |
| L3 | Memvid | 延迟处理 | 未实现 |

---

## 验证实验记录

### 实验 1：非 Git 目录写入全局记忆

```
目录: /Users/felix/c6x_local/app-prd/pi-work (非 git)
调用: xpi_memo_remember(content="测试偏好", kind="global_preference")
结果: ✅ stored (candidateId: 9189e9d2-...)
```

### 实验 2：非 Git 目录写入项目记忆

```
目录: /Users/felix/c6x_local/app-prd/pi-work (非 git)
调用: xpi_memo_remember(content="项目决策", kind="project_decision")
结果: ❌ "Memory write failed."
根因: routeMemoryKind() 抛出 "Project memory requires a recognized Git project"
```

### 实验 3：recall 在非 Git 目录

```
目录: /Users/felix/c6x_local/app-prd/pi-work (非 git)
调用: xpi_memo_recall(query="中文回复偏好")
结果: queriedBanks=["default"], 找到 1 条 global_preference
```

### 实验 4：recall 搜索不存在的内容

```
调用: xpi_memo_recall(query="FastAPI 后端")
结果: queriedBanks=["default"], results=[] (从未成功存储)
```

### 实验 5：forget 删除

```
mnemosyne recall "中文" → ID: 9dcb17287cb9210d
xpi_memo_forget(memoryId="9dcb17287cb9210d") → ✅ deleted
mnemosyne recall "中文" → 空结果
```

### 实验 6：sleep 合并

```
xpi_memo_sleep(authorized=true)
结果: "Sleep not executed: dedicated-sleep-model-unsupported"
原因: 未配置 XPI_MEMO_SLEEP_MODEL 环境变量
```

---

## 设计评价

### 优点

1. **物理隔离清晰**：global bank 和 project bank 是独立的 SQLite 文件，不会交叉污染
2. **项目身份稳定**：基于 git common dir 的 hash，跨 worktree 共享
3. **渐进式降级**：非 git 目录仍可使用全局记忆，不会完全不可用
4. **审计完整**：每次写入都有 L0 事件 + audit.json 双重记录

### 注意事项

1. **非 git 目录的错误信息不够友好**：返回 "Memory write failed." 而非 "Project memory requires a git repository"
2. **session_context 也依赖 project bank**：即使只是会话级上下文，也需要 git 仓库
3. **sleep 功能需要额外配置**：需要安装 mnemosyne-memory 并配置 sleep model

---

## 相关文件

- `src/identity.ts` — 项目身份解析
- `src/routing.ts` — 记忆路由决策
- `src/kinds.ts` — 7 种记忆类型定义
- `src/banks.ts` — bank 管理
- `src/index.ts` — 工具注册和执行逻辑
