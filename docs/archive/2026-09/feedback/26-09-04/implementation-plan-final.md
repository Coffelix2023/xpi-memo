# xpi-memo 架构修复最终实施方案

**日期**: 2026-09-05  
**基于决策**: implementation-decision.md + ux-recall-visibility-gap.md + advisors-2.md + grilling 访谈  
**状态**: 已完成决策树所有分支，可执行

---

## 一、决策树总结

通过结构化访谈，所有架构决策已明确：

| 决策点 | 问题 | 最终选择 | 理由 |
|--------|------|----------|------|
| **Q1** | Track B 是否引入嵌入模型 | 否，等 ai-memory | 验证纯度、避免重复投资 |
| **Q2** | 记忆查看界面 | 工具层 + 文本呈现 | 短期妥协，L2 做 TUI |
| **Q3** | show_injected 数据源 | L0 重建（记 ID） | 重启可追溯、审计能力 |
| **Q7** | interview 触发方式 | 混合策略（≤3 条直接展示） | 小列表流畅、大列表不强制 |
| **Q8** | L0 注入事件粒度 | 只记 memory ID | L0 轻量、单一真相源 |
| **Q9** | Track B 验收标注 | 标注 + 分类分析 | 不仅统计漏捕获率，还分析根因 |
| **Q6** | 记忆标题生成 | 提取第一句 + 截断 | 0.1 天、效果够用 |
| **Q10** | 工期确认 | P0 工具层、L2 做交互 | 不挤占 Track B 时间 |

---

## 二、修正后的执行顺序（最终版）

基于架构师 advisors-2.md 的修正 + grilling 访谈的决策：

```
Day 1:   注入可见性（工具层）—— 1 天
         ├─ L0 新增 memory_injected 事件类型
         ├─ show_injected 工具（从 L0 重建，通过 ID 反查 bank）
         ├─ recall 支持空查询（列出全部，分页）
         └─ 标题生成函数（提取第一句 + 截断）

Day 2:   MEMORY.md 止血（方案 C）—— 1 天
         ├─ L0 新增 memory_deleted 事件类型
         ├─ collectMemoryEntries 剔除逻辑（两遍扫描）
         ├─ TODO 注释标注 L2 根治方向
         └─ 存量已删条目处理（手动全量导出验证）

Day 2.5: forget 恢复设计 —— 0.5 天（与 Day 2 并行）
         ├─ forget 前写入 recovery/<id>.json
         ├─ 返回 recovery ID
         └─ 文档说明恢复路径

Day 3:   孤儿 bank revoke 工具 —— 1 天（与 Day 2-2.5 并行）
         ├─ xpi_memo_init --revoke 参数
         ├─ 归档到 banks-archived/<bank>-<timestamp>/
         └─ 测试 init → revoke → 验证归档

Day 4-5: Track B 真实验证 —— 1-2 天（在干净导出层之上）
         ├─ 配置启用 offline extraction（临时）
         ├─ 运行 5-10 个真实会话（包含自然表达）
         ├─ 人工标注 L0（应捕获时刻 + 分类分析）
         ├─ 验收：show_injected 能列出 Track B 提取的记忆
         └─ 验证后 enabled 改回 false

Day 5-6: doctor orphan_bank 检测（可选 P1）—— 0.5 天
         ├─ detectOrphanBanks() 实现
         └─ status 面板集成显示

总计：约 5-6 天（P0 项）
```

**关键修正点**（相比 implementation-decision.md）：
1. ✅ **注入可见性提升到 P0**：从 P1 提升，作为 Track B 验证的前置
2. ✅ **执行顺序调整**：MEMORY.md 止血在 Track B 验证之前（避免验证数据污染）
3. ✅ **验收标准补强**：Track B 增加人工标注 + show_injected 验证

---

## 三、P0 详细实施方案

### P0-1: 注入可见性（工具层）—— 1 天

#### 任务 1.1：L0 新增 memory_injected 事件类型

**文件**：`src/l0/types.ts`

```typescript
export const L0_EVENT_TYPES = [
  // ... 现有类型
  "memory_injected",  // 新增
] as const;

export interface L0MemoryInjectedPayload {
  injectedMemoryIds: string[];  // 只记录 ID，从 bank 反查内容
  query: string;                // 注入查询（如 AUTO_INJECT_QUERY_EN）
  count: number;                // 注入数量
  timestamp: string;            // ISO 8601
}
```

**集成位置**：`src/index.ts` `recallForContext()` 函数

```typescript
// 在注入成功后追加 L0 事件
if (injected.length > 0 && l0) {
  await l0.append({
    type: "memory_injected",
    payload: {
      injectedMemoryIds: injected.map(item => item.id).filter(Boolean),
      query,
      count: injected.length,
      timestamp: new Date().toISOString(),
    },
  });
}
```

---

#### 任务 1.2：实现 getMemoryById() 基础能力

**文件**：`src/operations.ts`

```typescript
/**
 * Get a single memory by ID from bank.
 * Returns null if not found.
 */
export async function getMemoryById(
  id: string,
  runtime: Runtime,
): Promise<RecallItem | null> {
  try {
    // 调用 mnemosyne get <id> --format json
    const output = await runtime.run(
      ["get", id, "--format", "json"],
      {
        dataDir: runtime.config.dataDir,
      }
    );
    
    const memory = JSON.parse(output);
    
    // 解码 source metadata 提取 kind
    const decoded = decodeSourceMetadata(memory.source);
    
    return {
      id: memory.id,
      content: memory.content,
      kind: decoded.kind ?? "session_context",
      score: 1.0,  // bank 中的记忆没有 score，默认 1.0
      source: memory.source,
    };
  } catch (error) {
    return null;  // ID 不存在或查询失败
  }
}
```

---

#### 任务 1.3：实现 xpi_memo_show_injected 工具

**文件**：`src/index.ts`

```typescript
pi.registerTool(
  realTool(
    "xpi_memo_show_injected",
    "XpiMemo Show Injected",
    "Show the most recent automatically injected memories for this session.",
    Type.Object({}),
    async (_params, ctx) => {
      try {
        const l0 = l0ForHooks();
        const runtime = createRuntime(ctx.cwd, dependencies);
        
        // 从 L0 读取最近一次 memory_injected 事件
        const events = l0.readAll();  // 或实现 findLast()
        const lastInjection = events
          .reverse()
          .find(e => e.type === "memory_injected");
        
        if (!lastInjection) {
          return toolResult(
            { status: "no-injection" },
            "No memories were automatically injected in this session."
          );
        }
        
        const payload = lastInjection.payload as L0MemoryInjectedPayload;
        
        // 通过 ID 列表从 bank 反查内容
        const memories = await Promise.all(
          payload.injectedMemoryIds.map(id => 
            getMemoryById(id, runtime)
          )
        );
        
        const items = memories
          .filter((m): m is RecallItem => m !== null)
          .map((item, index) => ({
            index: index + 1,
            content: item.content,
            kind: item.kind,
            source: item.source,
            id: item.id,
          }));
        
        return toolResult(
          { 
            status: "success", 
            count: items.length,
            query: payload.query,
            timestamp: payload.timestamp,
          },
          JSON.stringify(items, null, 2)
        );
      } catch (error) {
        return toolResult(
          { status: "error", reason: boundedFailureReason(error) },
          "Failed to retrieve injected memories."
        );
      }
    }
  )
);
```

---

#### 任务 1.4：recall 支持空查询

**文件**：`src/index.ts`

**修改参数定义**：
```typescript
const recallParameters = Type.Object({
  query: Type.Optional(Type.String({
    description: 'Query string. Omit or use "*" to list all memories (paginated).',
  })),
  limit: Type.Optional(Type.Integer({
    description: "Max results to return (default 10)",
  })),
  offset: Type.Optional(Type.Integer({
    description: "Skip first N results (for pagination, default 0)",
  })),
});
```

**修改 executeRecall() 实现**：
```typescript
async function executeRecall(
  params: RecallParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  l0?: L0Coordinator,
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies);
    const limit = params.limit ?? runtime.config.limit;
    const offset = params.offset ?? 0;
    
    // 空查询 = 列出全部
    if (!params.query || params.query === "*") {
      const banks = [
        ...new Set([
          ...(runtime.context.projectBank ? [runtime.context.projectBank] : []),
          GLOBAL_BANK,
        ]),
      ];
      
      const allMemories: RecallItem[] = [];
      
      for (const bank of banks) {
        // 调用 mnemosyne list --format json
        const output = await runtime.run(
          ["list", "--format", "json"],
          {
            dataDir: runtime.config.dataDir,
            bank: bank === GLOBAL_BANK ? undefined : bank,
          }
        );
        
        const memories = JSON.parse(output) as Array<{
          id: string;
          content: string;
          source: string;
          timestamp: string;
        }>;
        
        for (const memory of memories) {
          const decoded = decodeSourceMetadata(memory.source);
          allMemories.push({
            id: memory.id,
            content: memory.content,
            kind: decoded.kind ?? "session_context",
            score: 1.0,
            source: memory.source,
          });
        }
      }
      
      // 分页
      const paginated = allMemories
        .sort((a, b) => b.score - a.score)  // 按 score 排序
        .slice(offset, offset + limit);
      
      runtime.audit.record("recall", {
        backend: "mnemosyne",
        reason: "list-all",
        resultCount: paginated.length,
        status: "recalled",
      });
      
      const response: RecallResponse = {
        queriedBanks: banks,
        results: paginated,
        retrieval: {
          embeddingAvailable: false,
          fallback: false,
          mode: "list",
        },
      };
      
      return toolResult(
        {
          backendState: "backend-queried-with-hits",
          queriedBanks: banks,
          resultCount: paginated.length,
          status: "recalled",
          totalCount: allMemories.length,  // 新增：总记忆数
        },
        JSON.stringify(response)
      );
    }
    
    // ... 现有查询逻辑
  } catch (error) {
    // ... 错误处理
  }
}
```

---

#### 任务 1.5：标题生成工具函数

**文件**：`src/formatting.ts`（新建）

```typescript
/**
 * Extract a short title from memory content.
 * Strategy: Extract first sentence, fallback to truncation.
 */
export function extractMemoryTitle(content: string, maxLength = 50): string {
  // 按句号、问号、感叹号、换行符分割
  const sentences = content.split(/[。！？\n]/);
  const firstSentence = sentences[0]?.trim() || content;
  
  // 如果第一句超长，截断
  if (firstSentence.length > maxLength) {
    return firstSentence.slice(0, maxLength) + "...";
  }
  
  return firstSentence;
}

/**
 * Format memory items for display.
 */
export function formatMemoryList(
  items: RecallItem[],
  options: { withTitle?: boolean; withIndex?: boolean } = {}
): string {
  const { withTitle = true, withIndex = true } = options;
  
  return items
    .map((item, index) => {
      const prefix = withIndex ? `${index + 1}. ` : "";
      const title = withTitle ? extractMemoryTitle(item.content) : item.content;
      const kind = item.kind ? ` [${item.kind}]` : "";
      return `${prefix}${title}${kind}`;
    })
    .join("\n");
}
```

**集成到 show_injected 工具**：
```typescript
// 在 show_injected 返回时，Agent 可以调用 formatMemoryList 呈现
```

---

### P0-2: MEMORY.md 止血（方案 C）—— 1 天

#### 任务 2.1：L0 新增 memory_deleted 事件类型

**文件**：`src/l0/types.ts`

```typescript
export const L0_EVENT_TYPES = [
  // ... 现有类型
  "memory_deleted",  // 新增
] as const;

export interface L0MemoryDeletedPayload {
  memoryId: string;
  bank: string;
  deletedAt: string;  // ISO 8601
}
```

**集成位置**：`src/index.ts` `xpi_memo_forget` 工具

```typescript
// 在删除成功后追加 L0 事件
await runtime.run(["delete", params.memoryId], {
  bank: bank === GLOBAL_BANK ? undefined : bank,
  dataDir: runtime.config.dataDir,
});

// 追加 L0 删除事件
await l0ForHooks().append({
  type: "memory_deleted",
  payload: {
    memoryId: params.memoryId,
    bank,
    deletedAt: new Date().toISOString(),
  },
});

runtime.audit.record("rejection", {
  bank,
  reason: "memory-deleted-by-user",
  status: "deleted",
});
```

---

#### 任务 2.2：collectMemoryEntries 剔除逻辑

**文件**：`src/markdown-export/memory-generator.ts`

```typescript
/**
 * Collect confirmed T1 writes. Exact duplicates stay in the export and are
 * marked `supersededBy` later; SQLite is never rewritten.
 * 
 * TODO(L2): MEMORY.md 数据源切换为 bank 重建
 * 当前从 L0 事件流重建，删除事件通过 memory_deleted 剔除（止血）。
 * L2 阶段应从 bank 当前状态投影，语义对齐：
 * - MEMORY.md = "现在记住什么"（状态投影）
 * - L0 = "怎么变成这样的"（历史溯源）
 * 参考：
 * - docs/feedback/26-09-04/feedback-0904-3-conclusion.md §二
 * - docs/feedback/26-09-04/feedback-0904-3-advisors.md §1/4
 * - docs/feedback/26-09-04/implementation-plan-final.md §三
 * 
 * 根治方案：collectMemoryEntriesFromBanks() 从 bank SQLite 读取当前状态，
 * forget/supersede/mechanical sleep 的结果自动反映，无需维护投影逻辑。
 */
export function collectMemoryEntries(sources: MemorySource[]): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const deletedIds = new Set<string>();
  
  // 第一遍：收集所有 memory_deleted 事件
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type === "memory_deleted") {
        const payload = event.payload as { memoryId?: unknown };
        const id = typeof payload.memoryId === "string" ? payload.memoryId : "";
        if (id) deletedIds.add(id);
      }
    }
  }
  
  // 第二遍：收集 t1_memory_write 并剔除已删除
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type !== "t1_memory_write") continue;
      
      const payload = event.payload as {
        bank?: unknown;
        content?: unknown;
        kind?: unknown;
      };
      
      const content = typeof payload.content === "string" ? payload.content : "";
      if (!content) continue;
      
      const kind = typeof payload.kind === "string" 
        ? (payload.kind as MemoryKind) 
        : "session_context";
      
      const entryId = `${source.sessionId}@${event.position}`;
      
      // 剔除已删除的条目
      if (deletedIds.has(entryId)) continue;
      
      entries.push({
        bank: bankOf(payload),
        confirmedAt: event.timestamp,
        content,
        id: entryId,
        kind,
        position: event.position,
        scope: describeMemoryKind(kind).scope,
        sessionId: source.sessionId,
      });
    }
  }
  
  return entries.sort((a, b) => a.position - b.position);
}
```

---

#### 任务 2.3：存量已删条目处理

**验收步骤**：

1. 修复代码后，手动运行一次全量导出：
   ```bash
   pi /xpi-memo-export --force
   ```

2. 检查 `~/.pi/agent/xpi-memo/markdown/MEMORY.md`，确认：
   - ✅ 历史已删除的记忆不再出现
   - ✅ 或者生成一个清单文件 `deleted-entries.md` 供用户决定是否手动清理

3. 如果历史已删条目仍滞留，提供清理脚本：
   ```bash
   # 清理脚本（可选）
   # 从 audit.json 读取所有 deletion 记录，生成已删 ID 列表
   # 手动从 MEMORY.md 删除对应条目
   ```

---

### P0-3: forget 恢复设计 —— 0.5 天

#### 任务 3.1：forget 前写入 recovery 文件

**文件**：`src/index.ts` `xpi_memo_forget` 工具

```typescript
// 在删除前，先写入 recovery 文件
const recoveryDir = join(runtime.config.dataDir, "recovery");
mkdirSync(recoveryDir, { recursive: true });

// 先获取完整记忆内容
const memoryToDelete = await getMemoryById(params.memoryId, runtime);

if (memoryToDelete) {
  const recoveryId = `${params.memoryId}-${Date.now()}`;
  const recoveryPath = join(recoveryDir, `${recoveryId}.json`);
  
  writeFileSync(
    recoveryPath,
    JSON.stringify(
      {
        id: params.memoryId,
        content: memoryToDelete.content,
        kind: memoryToDelete.kind,
        source: memoryToDelete.source,
        deletedAt: new Date().toISOString(),
        recoveryId,
      },
      null,
      2
    )
  );
}

// 然后执行删除
await runtime.run(["delete", params.memoryId], { /* ... */ });

// 返回时包含 recovery ID
return toolResult(
  {
    bank,
    id: params.memoryId,
    reason: "memory-deleted-by-user",
    status: "deleted",
    recoveryId: memoryToDelete ? recoveryId : undefined,
  },
  `Memory ${params.memoryId} deleted. Recovery ID: ${recoveryId}`
);
```

---

#### 任务 3.2：文档说明恢复路径

**文件**：`docs/GUIDE.md`

新增章节：

```markdown
## 恢复已删除的记忆

当你使用 `xpi_memo_forget` 删除记忆时，完整内容会自动备份到 `recovery/` 目录。

### 查看 recovery 文件

```bash
ls ~/.pi/agent/xpi-memo/recovery/
# 输出示例：
# mem-abc123-1725530400000.json
# mem-def456-1725530500000.json
```

### 恢复步骤

1. 查看 recovery 文件内容：
   ```bash
   cat ~/.pi/agent/xpi-memo/recovery/<recovery-id>.json
   ```

2. 如需恢复，手动调用 `xpi_memo_remember`：
   ```typescript
   await xpi_memo_remember({
     content: "<从 recovery 文件复制>",
     kind: "<从 recovery 文件复制>",
     evidence: "recovered from deletion",
     source: "manual-recovery"
   });
   ```

**注意**：recovery 文件会永久保留，不会自动清理。定期检查并手动删除不需要的备份。
```

---

### P0-4: 孤儿 bank revoke 工具 —— 1 天

#### 任务 4.1：xpi_memo_init --revoke 参数

**文件**：`src/index.ts`

```typescript
pi.registerTool(
  realTool(
    "xpi_memo_init",
    "XpiMemo Init",
    "Initialize or revoke a non-Git project identity.",
    Type.Object({
      revoke: Type.Optional(Type.Boolean({
        description: "Revoke local project identity and archive bank",
      })),
    }),
    async (params, ctx) => {
      if (params.revoke) {
        const existing = resolveLocalProjectIdentity(ctx.cwd);
        if (!existing) {
          return toolResult(
            { status: "skipped", reason: "not-initialized" },
            "No local project identity to revoke."
          );
        }
        
        const runtime = createRuntime(ctx.cwd, dependencies);
        
        // 1. 删除 project.json
        const metadataDir = join(
          existing.root,
          LOCAL_PROJECT_METADATA_DIR
        );
        rmSync(metadataDir, { recursive: true, force: true });
        
        // 2. 归档 bank（不删除）
        const bank = `project-${existing.id}`;
        const bankPath = join(runtime.config.dataDir, "banks", bank);
        const archivedPath = join(
          runtime.config.dataDir,
          "banks-archived",
          `${bank}-${Date.now()}`
        );
        
        if (existsSync(bankPath)) {
          mkdirSync(dirname(archivedPath), { recursive: true });
          renameSync(bankPath, archivedPath);
        }
        
        return toolResult(
          {
            status: "revoked",
            id: existing.id,
            label: existing.label,
            archivedTo: archivedPath,
          },
          `Revoked "${existing.label}" project identity.\nBank archived to: ${archivedPath}`
        );
      }
      
      // ... 现有 init 逻辑
    }
  )
);
```

---

### P0-5: Track B 真实验证 —— 1-2 天

#### 任务 5.1：配置启用

**文件**：`~/.pi/config.yml`

```yaml
xpi-memo:
  offlineExtraction:
    enabled: true  # 临时启用，验证后改回 false
    maxEvents: 200
    maxInputChars: 60000
    timeoutMs: 15000
    budgets:
      maxExecutionsPerSession: 1
      maxProposalsPerSession: 20
      maxCharsPerSession: 5000
```

---

#### 任务 5.2：真实会话运行

**验证脚本**（手动执行）：

```bash
# 1. 启用 Track B
pi config set xpi-memo.offlineExtraction.enabled true

# 2. 运行 5-10 个真实会话，包含自然表达：
#    - "我习惯用 pnpm 而不是 npm"
#    - "本项目禁止使用 any 类型"
#    - "这个仓库的 API 文档在 docs/api/"
#    - "注意 vitest 的 mock 有坑"
#    - "我偏好用箭头函数"

# 3. 每个会话结束后，检查：
cat ~/.pi/agent/xpi-memo/audit.json | jq '.[] | select(.category == "extraction")'

# 4. 打开 TUI 查看候选提案
pi /xpi-memo  # Pending 标签

# 5. 验证 show_injected 工具
# 在会话中追问："你启动时读取了什么记忆？"
# Agent 应该能调用 show_injected 并列出内容

# 6. 验证后关闭 Track B
pi config set xpi-memo.offlineExtraction.enabled false
```

---

#### 任务 5.3：人工标注 L0（分类分析）

**标注模板**：`docs/feedback/track-b-validation-annotation.md`

```markdown
# Track B 验证标注表

## 会话 1：session-001

**L0 文件**：`~/.pi/agent/xpi-memo/l0/events-session-001.jsonl`

| 时刻 | 用户表达 | 应捕获？ | Track B 产出 | 原因分析 |
|------|----------|----------|--------------|----------|
| 10:23 | "我习惯用 pnpm" | ✅ global_preference | ❌ 无候选 | 缺少闸门词"请记住"、"偏好" |
| 10:25 | "本项目禁止 any" | ✅ project_constraint | ✅ 候选已生成 | - |
| 10:30 | "这个仓库用 Vitest" | ✅ project_decision | ❌ 无候选 | 自然表达，无触发词 |

**小计**：应捕获 3 个，实际产出 1 个，漏捕获 2 个（67%）

---

## 会话 2：session-002

...

---

## 汇总统计

| 指标 | 数值 |
|------|------|
| 总会话数 | 10 |
| 应捕获总数（人工标注） | 14 |
| Track B 实际产出 | 10 |
| 漏捕获数 | 4 |
| **漏捕获率** | **29%** |

## 漏捕获根因分布

| 根因 | 数量 | 占比 | 示例 |
|------|------|------|------|
| 缺少闸门词 | 2 | 50% | "我习惯..."（没说"请记住"） |
| 自然表达无触发词 | 1 | 25% | "这个仓库用..."（没说"项目"） |
| kind 边缘情况 | 1 | 25% | "注意 X 有坑"（gotcha 未覆盖） |

## 决策建议

基于 29% 漏捕获率 + 根因分析：

- ✅ **Track B 活着**：准确率可接受（捕获的 10 个都是有效的）
- ⚠️ **但有明显漏捕获**：主要是"自然表达"模式
- 📋 **ai-memory 角色**：建议**分工模式**
  - Track B 保留（处理显式意图表达）
  - ai-memory 补充（处理自然表达、隐式偏好）
  - 两者产出都走 xpi-memo 治理路由

## 验收通过条件

- [x] 提取率 > 50%（实际 71%）
- [x] 准确率 > 80%（实际 100%，10/10 都有效）
- [x] show_injected 能列出 Track B 提取的记忆
- [x] 漏捕获模式已分析清楚
```

---

## 四、验收标准（完整版）

### 注入可见性验收

**场景 1：启动后追问"你读取了什么记忆？"**

```
用户: [Pi 启动]
状态栏: ✦ 已注入 2 条记忆

用户: 你读取了什么记忆？
Agent: [调用 xpi_memo_show_injected]
Agent: 我在启动时注入了以下 2 条记忆：

1. 本项目使用 TypeScript strict 模式
   [project_constraint] · 记录于 2026-09-01 14:23

2. API 文档位于 docs/api/
   [project_decision] · 记录于 2026-08-28 10:15
```

- [ ] Agent 能成功调用 show_injected 工具
- [ ] 返回内容包含 content、kind、timestamp
- [ ] L0 中有 memory_injected 事件记录
- [ ] 进程重启后追问，仍能从 L0 重建数据

**场景 2：列出项目记忆**

```
用户: 请列出当前本项目所有记忆
Agent: [调用 xpi_memo_recall({})]  // 空查询
Agent: 当前项目共有 15 条记忆（已按相关度排序，显示前 10 条）：

1. 本项目使用 TypeScript strict 模式 [project_constraint]
2. API 文档位于 docs/api/ [project_decision]
...
10. 禁止使用 any 类型 [project_constraint]

如需查看更多，请使用 xpi_memo_recall({ limit: 20, offset: 10 })
```

- [ ] recall 工具接受空查询参数
- [ ] 返回所有 project bank 的记忆
- [ ] 支持 limit 和 offset 分页
- [ ] 结果包含 totalCount 信息

### MEMORY.md 止血验收

- [ ] `src/l0/types.ts` 新增 `memory_deleted` 事件类型
- [ ] `src/markdown-export/memory-generator.ts` 实现两遍扫描剔除逻辑
- [ ] `src/index.ts` forget 工具追加 L0 删除事件
- [ ] **测试**：forget 后 MEMORY.md 不再显示已删条目
- [ ] **存量数据**：手动全量导出后，历史已删条目不再出现
- [ ] TODO 注释已标注（引用本文档 + advisors-2.md）
- [ ] 测试通过：589 passed / 6 skipped，新增测试覆盖删除剔除逻辑

### forget 恢复验收

- [ ] forget 前写入 `recovery/<id>.json`（完整条目内容）
- [ ] forget 返回 recovery ID
- [ ] recovery 文件包含：id、content、kind、source、deletedAt、recoveryId
- [ ] 文档说明恢复路径（GUIDE.md）
- [ ] **测试**：forget → 验证 recovery 文件存在、内容完整

### 孤儿 bank revoke 验收

- [ ] `src/index.ts` `xpi_memo_init` 新增 `revoke` 参数
- [ ] 实现：删除 project.json + 归档 bank 到 `banks-archived/<bank>-<timestamp>/`
- [ ] 返回归档路径
- [ ] **测试**：init → revoke → 验证 project.json 删除、bank 归档、可恢复
- [ ] 归档目录命名包含时间戳，避免覆盖

### Track B 验收（最严格）

- [ ] 配置文件启用 offline extraction（临时）
- [ ] 运行 5-10 个包含自然表达的真实会话
- [ ] audit.json 中有 extraction 记录（completed/failed/timed-out）
- [ ] **人工标注**：完成 track-b-validation-annotation.md，包含：
  - [ ] 应捕获时刻标注（人工判断）
  - [ ] Track B 实际产出统计
  - [ ] 漏捕获率计算（< 40% 为通过）
  - [ ] **根因分类**（缺闸门词/自然表达/边缘 kind）
- [ ] **show_injected 集成验证**：Track B 提取的记忆能通过 show_injected 查看
- [ ] **决策输出**：基于漏捕获率和根因分布，明确 ai-memory 角色（分工 vs 接管）
- [ ] 验证后 `enabled` 改回 `false`

### 性能要求

- show_injected: < 200ms（L0 读取 + ID 反查）
- recall 空查询: < 2s（SQLite list + 分页）
- getMemoryById: < 100ms（单条查询）

---

## 五、L2 阶段计划（延后项）

### L2-1: interview 交互面板 —— 1 天

**实现**：基于 P0 的工具层，Agent 使用 interview 呈现记忆列表

**触发逻辑**（混合策略）：
```typescript
// ≤ 3 条：直接调用 interview
if (memories.length <= 3) {
  await interview({
    title: "启动时注入的记忆",
    questions: memories.map((m, i) => ({
      id: `m${i}`,
      type: "info",
      question: extractMemoryTitle(m.content),
      content: { source: m.content, lang: "text" }
    }))
  });
}

// > 3 条：先询问是否查看详情
else {
  const choice = await ask_user_question({
    question: `发现 ${memories.length} 条记忆，要查看详情吗？`,
    options: [
      { label: "是，打开详情面板", description: "..." },
      { label: "不用，继续对话", description: "..." }
    ]
  });
  
  if (choice === "是") {
    await interview({ /* ... */ });
  }
}
```

### L2-2: TUI Injected 标签页 —— 1-2 天

**功能**：
- 在 `/xpi-memo` TUI 中新增第 5 个标签页："Injected"
- 显示当前 session 的所有注入历史（session_start + manual recall）
- 支持键盘导航（↑↓）、展开/折叠（Enter）、搜索（/）、筛选 kind（f）
- 从 L0 读取所有 `memory_injected` 事件，显示注入上下文

### L2-3: MEMORY.md 根治（bank 重建）—— 2 天

**实现**：`collectMemoryEntriesFromBanks()` 函数，从 bank 当前状态重建 MEMORY.md

参考 implementation-decision.md §九 的 TODO 标注。

---

## 六、风险和缓解

### 风险 1：Track B 验证发现漏捕获率 > 50%

**缓解**：
- 预案 A：如果漏的是"自然表达"，立即启动 ai-memory 评估（接管模式）
- 预案 B：如果漏的是"闸门词不匹配"，调整 Track A 正则词表（快速修复）

### 风险 2：getMemoryById() 性能不达标

**缓解**：
- 预案：增加内存缓存层（LRU cache），缓存最近 50 条查询结果
- 目标：< 100ms 响应时间

### 风险 3：L0 注入事件导致 events.jsonl 膨胀

**缓解**：
- 预案：L0 事件只记 ID 列表，不记完整内容（已采纳）
- 估算：每次注入 2-3 条记忆，事件 payload < 200 bytes

---

## 七、关键里程碑

| 日期 | 里程碑 | 交付物 |
|------|--------|--------|
| Day 1 | 注入可见性完成 | show_injected + recall 空查询工具通过测试 |
| Day 2 | MEMORY.md 止血完成 | forget 删除回溯 + 存量数据验证通过 |
| Day 3 | forget 恢复 + revoke 工具完成 | recovery/ 目录 + 归档机制通过测试 |
| Day 4-5 | Track B 验证完成 | 人工标注表 + 漏捕获率 + ai-memory 角色决策 |
| Day 5-6 | P0 全部验收通过 | 所有验收标准打勾，可进入 L2 |

---

## 八、决策文档归档

本文档整合了以下所有决策来源：

- `docs/feedback/26-09-04/implementation-decision.md` - 初始实施决策
- `docs/feedback/26-09-04/ux-recall-visibility-gap.md` - 用户体验缺陷分析
- `docs/feedback/26-09-04/advisors-2.md` - 架构师修正意见
- `docs/feedback/26-09-04/grilling-interview-transcript.md` - 结构化访谈记录（Q1-Q10）

**决策树完整性**：所有分支已遍历，无悬而未决的假设。

**执行权限**：已获得架构师批准（advisors-2.md §四）+ 用户确认（grilling Q10）。

**状态**：✅ 可执行
