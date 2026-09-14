# xpi-memo 扩展功能测试报告

**测试时间:** 2026-09-02
**测试环境:** macOS, Pi Coding Agent v0.84.4
**扩展版本:** xpi-memo v1.0.0
**测试目录:** `/Users/felix/c6x_local/app-prd/pi-work`（非 git 仓库）

---

## 测试概览

| 工具 | 测试项 | 结果 | 说明 |
|------|--------|------|------|
| `xpi_memo_remember` | `global_preference` | ✅ 通过 | 全局偏好存储正常 |
| `xpi_memo_remember` | `project_decision` | ❌ 失败 | 非 git 目录，无法路由到 project bank |
| `xpi_memo_remember` | `project_constraint` | ❌ 失败 | 同上 |
| `xpi_memo_remember` | `project_gotcha` | ❌ 失败 | 同上 |
| `xpi_memo_remember` | `session_context` | ❌ 失败 | 同上 |

---

## 详细测试记录

### 1. global_preference 存储测试

**输入:**
```json
{
  "content": "测试偏好：用户喜欢中文回复，技术术语保留英文",
  "kind": "global_preference",
  "source": "xpi-memo test session"
}
```

**响应:**
```json
{
  "candidateId": "9189e9d2-3aa7-4c9d-8daa-65286dfa2d93",
  "kind": "global_preference",
  "status": "stored"
}
```

**L0 事件链:**
1. `candidate_created` (position 21) — 候选创建
2. `candidate_confirmed` (position 22) — 候选确认
3. `tool_result` (position 23) — 工具返回成功

**审计记录:**
```json
{
  "action": "confirmation",
  "metadata": {
    "bank": "default",
    "evidenceType": "verified-tool-result",
    "kind": "global_preference",
    "scope": "global",
    "status": "stored"
  },
  "timestamp": "2026-09-02T11:45:24.917Z"
}
```

---

### 2. project_decision 存储测试

**输入:**
```json
{
  "content": "项目决策：使用 FastAPI 作为后端框架，Python 3.12+",
  "kind": "project_decision",
  "source": "xpi-memo test session"
}
```

**响应:**
```
Memory write failed.
```

**根因分析:**
- 当前工作目录 `/Users/felix/c6x_local/app-prd/pi-work` 不是 git 仓库
- `resolveProjectIdentity()` 返回 null
- `routeMemoryKind()` 在 `context.projectBank === null` 时抛出:
  ```
  "Project memory requires a recognized Git project"
  ```
- 错误被 `executeRemember()` 的 try-catch 捕获，返回通用错误信息

**L0 事件:**
- 工具调用记录存在 (position 24-25)
- 但无 `candidate_created` 或 `routing_decision` 事件
- 说明错误发生在路由阶段，早于候选创建

---

## 架构分析

### 路由逻辑 (`src/routing.ts`)

```typescript
export function routeMemoryKind(
  kind: MemoryKind,
  context: RoutingContext,
): RoutingDecision {
  const route = MEMORY_KIND_TABLE[kind];
  if (route.target === "global") {
    return { bank: GLOBAL_BANK, kind, scope: route.scope };
  }
  if (context.projectBank === null) {
    throw new Error("Project memory requires a recognized Git project");
  }
  return { bank: context.projectBank, kind, scope: route.scope };
}
```

### 记忆类型路由表 (`src/kinds.ts`)

| Kind | Target | Scope |
|------|--------|-------|
| `global_preference` | global | global |
| `global_workflow` | global | global |
| `project_constraint` | project | global |
| `project_decision` | project | global |
| `project_gene` | project | global |
| `project_gotcha` | project | global |
| `session_context` | project | session |

### 项目身份解析 (`src/identity.ts`)

- 通过 git 仓库的 common dir hash + remote alias 生成 project ID
- project bank 命名格式: `project-{hash}`
- 非 git 目录返回 null → project bank 不可用

---

## 数据目录结构

```
~/.pi/agent/xpi-memo/
├── mnemosyne.db                # 全局 bank
├── banks/
│   ├── project-p-160da229871f/
│   ├── project-p-2f28a11cef65/
│   └── ... (8 个 project banks)
├── audit.json                  # 审计日志
├── candidates.json             # 候选队列
├── idempotency.json            # 幂等性检查
├── extraction-budget.json      # 离线提取预算
├── sessions/
│   └── 2026-09-02T11-43-29-016Z-6b30522c/
│       └── events.jsonl        # L0 事件日志
└── markdown/
    ├── MEMORY.md
    ├── daily/
    └── export-state.json
```

---

## 结论

1. **全局记忆正常:** `global_preference` 和 `global_workflow` 在任何目录下都能存储
2. **项目记忆需要 git:** 所有 `project_*` 和 `session_context` 类型必须在 git 仓库中使用
3. **错误处理:** 工具捕获所有异常，返回通用错误信息，但 L0 事件日志不记录失败的路由尝试
4. **设计合理性:** 项目记忆绑定 git 仓库是合理的，确保记忆与代码版本关联

---

## 待验证

- [ ] 在 git 仓库中测试 project 级记忆的完整流程
- [ ] 测试 `xpi_memo_recall` 召回功能
- [ ] 测试 `xpi_memo_forget` 删除功能
- [ ] 测试 `xpi_memo_sleep` 合并功能
- [ ] 测试激活循环 (activation loop) 的自动捕获
- [ ] 测试 Markdown 导出功能
