# 用户体验缺陷：记忆注入可见性断层

**日期**: 2026-09-04  
**发现者**: 用户 grill-me 追问  
**优先级**: P1（信任界面问题）

---

## 问题描述

### 情况 1：启动后追问"你读取了什么记忆？"

**用户体验流程**：
```
1. Pi 启动 → session_start 事件触发
2. 状态栏显示：✦ 已注入 1 条记忆
3. 用户追问："你读取了什么记忆？"
4. Agent 回答：❌ 无法回答（没有工具可以查看已注入内容）
```

**当前实现分析**：

从代码可以看出（`src/index.ts:2363-2398`）：
- `session_start` 时调用 `recallForContext()` 执行自动注入
- 查询使用固定模板：
  - 英文：`"restore project context decisions constraints preferences unfinished work"`
  - 中文：`"项目 决策 约束 偏好 未完成工作"`
- 注入结果通过 `renderMemoryContext()` 格式化为：
  ```xml
  <memories>
  1. [content] [kind]
  2. [content] [kind]
  </memories>
  ```
- 这个 XML 块被**静默注入到 agent context**，用户看不到
- 状态栏只显示：`✦ 已注入 1 条记忆`（`src/surface.ts:87`）

**问题根源**：
- **注入内容是黑盒**：`<memories>` 块只进入 agent 的 context，不进入对话历史
- **agent 无法主动查看**：没有"查看我当前拥有的记忆注入"的内省工具
- **用户也无法查看**：状态栏只有计数，TUI 没有注入内容查看面板

### 情况 2："请列出当前本项目相关记忆"

**用户体验流程**：
```
1. 用户在开发过程中问："请列出当前本项目相关记忆"
2. Agent 调用 xpi_memo_recall 工具
3. 工具参数需要显式 query，agent 会用什么查询？
   - 如果用通用词（如 "项目"），可能召回不相关内容
   - 如果用空查询，工具会报错（query 是必填参数）
4. 查询结果是 JSON 格式，agent 需要解析后呈现给用户
```

**当前实现分析**：

从代码可以看出（`src/index.ts:2554-2558`）：
- `xpi_memo_recall` 工具参数：
  ```typescript
  {
    query: string,  // 必填
    limit?: number
  }
  ```
- 工具返回 JSON：
  ```json
  {
    "results": [
      {
        "content": "...",
        "kind": "...",
        "score": 0.85,
        "id": "..."
      }
    ],
    "queriedBanks": ["project-xxx", "default"],
    "retrieval": { "mode": "hybrid", ... },
    "searchBackend": "mnemosyne"
  }
  ```

**问题**：
- **查询语义不明确**：用户说"当前本项目"，但工具需要 query 字符串，agent 如何翻译？
  - 用 "项目" → 太宽泛
  - 用启动时的自动注入模板 → 可能不是用户想要的范围
  - 用空字符串 → 参数验证会拒绝
- **JSON 呈现体验差**：工具返回技术性 JSON，agent 需要二次加工才能给出人读答案

---

## 问题严重性

### 为什么这是 P1

1. **信任杀手**：用户看到"已注入 1 条记忆"但无法验证内容，削弱对系统的信任
2. **反馈回路断裂**：用户无法验证记忆是否正确、是否相关，无法及时纠错
3. **调试困难**：出现记忆相关问题时，用户和 agent 都无法快速定位"注入了什么"

### 对比 pi-memory 和 mnemosyne

| 项目 | 用户可见性 | 实现方式 |
|---|---|---|
| **pi-memory** | ✅ 完全可见 | MEMORY.md 文件即注入内容，用户可直接查看 |
| **mnemosyne** | ⚠️ 部分可见 | 有 `mnemosyne list` 命令，但没有"查看当前注入"的概念 |
| **xpi-memo** | ❌ 不可见 | 注入是静默黑盒，没有内省工具 |

---

## 根因分析

### 架构层面

xpi-memo 的设计理念是：
- **自动注入是静默的**：`session_start` 时自动发生，不打扰用户
- **状态栏是摘要**：只显示计数，不显示内容（避免刷屏）
- **recall 工具是检索工具**，不是"查看当前注入"工具

这个理念在**无人读需求**时是合理的（agent 自己用就够了），但遇到两个真实场景就暴露问题：
1. **用户想验证**："你说注入了，我想看看到底注入了什么"
2. **agent 想解释**："用户问我读了什么，我也不知道，因为注入发生在我启动之前"

### 技术层面

当前架构中：
- `recallForContext()` 返回 `RecallOutcome`，包含：
  - `context: string | null` - 注入到 agent 的 XML 块
  - `statusLine: string` - 状态栏显示文本（只有计数）
- `context` 通过 `before_agent_start` 事件注入到 agent context：
  ```typescript
  return {
    content: [
      ...statusLines,
      ...contextLines,  // 这里包含 <memories> 块
    ].join("\n")
  };
  ```
- **但这个 content 不会出现在对话历史**，agent 无法回溯查看

---

## 解决方案

### 方案 A：新增 xpi_memo_show_injected 工具（最小改动）

**实现**：
- 新增工具 `xpi_memo_show_injected`，无参数
- 返回当前 session 最近一次注入的内容（从 L0 或内存中读取）
- Agent 可以在用户追问时主动调用

**优点**：
- 工作量小（1-2 小时）
- 不改变现有自动注入逻辑
- 解决"用户追问"场景

**缺点**：
- 需要在内存中缓存最近一次注入结果，或从 L0 重建
- 只解决了"事后查看"，没有解决"事前可见"

**实现细节**：
```typescript
// src/index.ts
let lastInjectedMemories: RecallItem[] | null = null;

// 在 recallForContext 成功后缓存：
lastInjectedMemories = injected;

// 新增工具：
pi.registerTool(
  realTool(
    "xpi_memo_show_injected",
    "XpiMemo Show Injected",
    "Show the most recent automatically injected memories for this session.",
    Type.Object({}),
    async (_params, _ctx) => {
      if (!lastInjectedMemories || lastInjectedMemories.length === 0) {
        return toolResult(
          { status: "no-injection" },
          "No memories were automatically injected in this session."
        );
      }
      
      const items = lastInjectedMemories.map((item, index) => ({
        index: index + 1,
        content: item.content,
        kind: item.kind,
        source: item.source,
        score: item.score,
      }));
      
      return toolResult(
        { status: "success", count: items.length },
        JSON.stringify(items, null, 2)
      );
    }
  )
);
```

### 方案 B：recall 工具支持空查询 = "列出全部"（语义清晰）

**实现**：
- 修改 `xpi_memo_recall` 参数，`query` 改为 optional
- 当 `query` 为空或 `"*"` 时，返回当前 project+global 的所有记忆（分页）
- Agent 可以用 `xpi_memo_recall({})` 回答"列出所有记忆"

**优点**：
- 语义清晰：空查询 = 列出全部
- 解决"列出项目记忆"场景
- 不需要新工具

**缺点**：
- 如果记忆总量大（>100 条），返回 JSON 会很大
- 需要实现分页逻辑（limit + offset）

**实现细节**：
```typescript
// src/index.ts
const recallParameters = Type.Object({
  query: Type.Optional(Type.String({
    description: 'Query string. Omit or use "*" to list all memories (paginated).',
  })),
  limit: Type.Optional(Type.Integer({
    description: "Max results to return (default 10)",
  })),
  offset: Type.Optional(Type.Integer({
    description: "Skip first N results (for pagination)",
  })),
});

// 在 executeRecall 中：
if (!params.query || params.query === "*") {
  // 列出全部：调用 mnemosyne list --format json
  const allMemories = await runtime.run(
    ["list", "--format", "json"],
    { dataDir: runtime.config.dataDir }
  );
  // 分页、格式化后返回
}
```

### 方案 C：状态栏显示前 3 条摘要（用户可见性）

**实现**：
- 修改 `successText()` 和 TUI widget，注入成功后显示前 3 条记忆的摘要（截断到 50 字符）
- 用户可以在状态栏直接看到注入了什么

**优点**：
- 解决"信任黑盒"问题
- 不需要新工具，用户直接可见

**缺点**：
- 状态栏可能变得很长（3 条 × 50 字符 = 150 字符）
- TUI 布局可能需要调整

**实现细节**：
```typescript
// src/surface.ts
export const successText = (
  action: SurfaceAction,
  count?: number,
  preview?: string[]  // 新增：前 N 条内容摘要
): string => {
  if (action !== "compact" && action !== "store" && (count ?? 0) === 0)
    return `✦ ${NO_RELEVANT_MEMORY}`;
  
  let base = "";
  if (action === "recall") base = `✦ 已检索 ${count ?? 0} 条记忆`;
  else if (action === "inject") base = `✦ 已注入 ${count ?? 0} 条记忆`;
  else if (action === "compact") base = "✦ 已保留记忆上下文";
  else base = "✦ 已保存记忆";
  
  if (preview && preview.length > 0) {
    const lines = preview.map((p, i) => `  ${i + 1}. ${p.slice(0, 50)}...`);
    return `${base}\n${lines.join("\n")}`;
  }
  
  return base;
};
```

### 方案 D：TUI 新增 "Injected" 标签页（完整解决）

**实现**：
- 在 `/xpi-memo` TUI 中新增第 5 个标签页："Injected"
- 显示当前 session 的所有自动注入记录（session_start + before_agent_start）
- 用户可以随时查看

**优点**：
- 完整解决可见性问题
- 不干扰状态栏简洁性
- 用户可以深度检查

**缺点**：
- 需要修改 TUI 布局和状态管理
- 工作量较大（1-2 天）

---

## 推荐方案

### 短期（本轮 P1）

**方案 A（新增 show_injected 工具）+ 方案 B（recall 支持空查询）**

- **理由**：
  1. 方案 A 解决"用户追问注入了什么"（情况 1）
  2. 方案 B 解决"列出所有项目记忆"（情况 2）
  3. 两个都是工具层改动，不涉及 UI，工作量可控（1 天）
  4. 符合当前"工具优先"的设计风格

- **实施顺序**：
  1. 先做方案 B（recall 空查询），测试"列出全部"场景
  2. 再做方案 A（show_injected），测试"追问注入"场景

### 中期（L2 阶段）

**方案 D（TUI Injected 标签页）**

- 提供完整的注入历史查看能力
- 配合 L0 事件流，可以显示每次注入的上下文（query、结果、时间）

---

## 验收标准

### 方案 A + B 验收

#### 场景 1：启动后追问

```
用户: [Pi 启动]
状态栏: ✦ 已注入 1 条记忆

用户: 你读取了什么记忆？
Agent: [调用 xpi_memo_show_injected]
Agent: 我在启动时注入了以下记忆：
      1. [本项目使用 TypeScript strict 模式] [project_constraint]
```

- [ ] agent 能成功调用 show_injected 工具
- [ ] 返回的内容包含 content、kind、score
- [ ] agent 能解析 JSON 并呈现为人读格式

#### 场景 2：列出项目记忆

```
用户: 请列出当前本项目相关记忆
Agent: [调用 xpi_memo_recall({ limit: 20 })]  // 空查询 = 列出全部
Agent: 当前项目有以下记忆：
      1. [项目约束] ...
      2. [项目决策] ...
      ...
```

- [ ] recall 工具接受空查询参数
- [ ] 返回所有 project bank 的记忆（按 score 或 timestamp 排序）
- [ ] 支持 limit 和 offset 分页
- [ ] 结果包含 queriedBanks 信息

### 性能要求

- show_injected: < 100ms（内存读取）
- recall 空查询: < 2s（SQLite list + 分页）

---

## 工作量估算

| 任务 | 工作量 | 优先级 |
|---|---|---|
| 方案 B：recall 空查询支持 | 0.5 天 | P1 |
| 方案 A：show_injected 工具 | 0.5 天 | P1 |
| 测试两个场景 | 0.5 天 | P1 |
| 方案 D：TUI Injected 标签页 | 1-2 天 | P2（L2 阶段）|

**P1 总计**：1.5 天

---

## 附录：实际代码位置

### 自动注入流程
- `src/index.ts:2363` - `session_start` 事件触发
- `src/index.ts:2384` - 调用 `recallForContext(AUTO_INJECT_QUERY_EN)`
- `src/index.ts:1801` - `recallForContext()` 函数实现
- `src/index.ts:1732` - `renderMemoryContext()` 格式化为 `<memories>` 块

### 状态栏显示
- `src/surface.ts:85` - `successText()` 生成状态文本
- `src/surface.ts:87` - `✦ 已注入 X 条记忆`
- `src/surface.ts:106` - TUI widget 显示

### recall 工具
- `src/index.ts:2554` - `xpi_memo_recall` 工具注册
- `src/index.ts:1168` - `executeRecall()` 实现

---

## 参考

- pi-memory 的 MEMORY.md 可见性设计
- mnemosyne 的 `list` 命令
- 用户 grill-me 追问场景
