# Track B 平台假设验证：session_shutdown 阶段的模型上下文

- 日期：2026-09-14
- 变更：`openspec/changes/track-b-real-validation`（task 1.1 / 1.2）
- 环境：Pi `0.85.1`（仓库 devDependency 为 `0.84.4`，两者 `dispose()` 语义一致）
- 结论：**假设成立，`session_shutdown` 路径可用；task 1.2（降级为只走 `session_before_compact`）不适用。**

## 待验证假设

受门控的离线提取要在会话关闭阶段向会话模型发起一次调用。若 `session_shutdown` 处理器被 await 之前 `ctx.modelRegistry` / `ctx.model` 已失效，该路径在生产中不可用，默认 runner 必须退化为只在 `session_before_compact` 运行。

验证要求：**观测证据**，不是类型声明。类型只说 `ctx.modelRegistry` 存在，不说它在异步处理器里存活到何时。

## 观测方式

真实 Pi RPC 会话 + 探针扩展（`-e` 注入）。探针在 `session_shutdown` 里先 `await` 一个 300 ms 定时器，再读取上下文；第二次运行进一步在处理器内 `await ctx.modelRegistry.complete(...)` 完成一次真实模型调用。关闭 stdin 触发 `dispose()`，这会 await 全部 shutdown 处理器，然后才使会话失效。

命令（等价形式；可重复执行，探针为临时文件）：

```bash
printf '%s\n' '{"id":"state","type":"get_state"}' \
  | pi --mode rpc --no-extensions --no-skills --no-prompt-templates --no-themes \
       --no-session --no-builtin-tools -e /tmp/probe.ts
```

探针把测量结果写入 `XPI_MEMO_PROBE_OUTPUT`，避免把结论混进日志。

仓库内可回归版本：`src/shutdown-model-context.integration.test.ts`（默认跳过，用 `XPI_MEMO_RUN_PI_INTEGRATION=1` 开启）。该测试覆盖**观测结果 1**（不发起网络调用）；结果 2 需要真实模型与凭证，因此保留为一次性手工探针，源码见下。

```bash
XPI_MEMO_RUN_PI_INTEGRATION=1 pnpm exec vitest run src/shutdown-model-context.integration.test.ts
# ✓ 1 passed
```

## 观测结果 1：await 之后上下文仍可读

```json
{
  "availableModels": 50,
  "hasModelRegistry": true,
  "modelId": "deepseek-flash",
  "modelProvider": "deepseek",
  "piVersion": "0.85.1",
  "processCwd": "/Users/felix/c6x_local/app-prd/xpi-memo",
  "reachedAfterAwait": true,
  "reason": "quit",
  "registryError": null
}
```

要点：`reason` 为 `quit`（进程正常退出路径），`await` 300 ms 之后 `ctx.modelRegistry` 仍是活对象，`getAvailable()` 返回 50，`ctx.model` 可读。

## 观测结果 2：处理器内可完成一次真实模型调用

复现用探针（需真实凭证；`maxTokens: 16`，20 s 硬超时）：

```ts
pi.on("session_shutdown", async (event, ctx) => {
  const evidence = { completeMs: null, completeStopReason: null, completeTextChars: null };
  await new Promise((resolve) => setTimeout(resolve, 300));
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const message = await ctx.modelRegistry.complete(
      ctx.model,
      {
        messages: [{ role: "user", content: "Reply with the single word: pong", timestamp: Date.now() }],
        systemPrompt: "Answer with one word.",
      },
      { maxTokens: 16, signal: controller.signal },
    );
    const text = message.content.filter((part) => part?.type === "text").map((part) => part.text).join("");
    evidence.completeTextChars = text.length;
    evidence.completeStopReason = message.stopReason;
  } catch (error) {
    evidence.completeStopReason = `error: ${String(error)}`;
  } finally {
    clearTimeout(timer);
  }
  evidence.completeMs = Date.now() - started;
  writeFileSync(process.env.XPI_MEMO_PROBE_OUTPUT, JSON.stringify(evidence, null, 2));
});
```

```json
{
  "completeMs": 857,
  "completeStopReason": "stop",
  "completeTextChars": 4,
  "modelId": "deepseek-flash",
  "reachedAfterAwait": true,
  "reason": "quit",
  "registryError": null
}
```

要点：`ctx.modelRegistry.complete(model, context, { maxTokens, signal })` 在 shutdown 处理器内 857 ms 返回 `stopReason: "stop"`，正文 4 字符（探针固定回复 `pong`）。这直接排除了本变更最大的设计风险：关闭阶段发起的有界调用能在会话被销毁前完成。

## 边界与残余风险

- 观测覆盖 `dispose()` 路径（`reason: "quit"`）与 `teardownCurrent()` 路径（`/new`、`/resume`）共用的 await 语义；两者实现相同，未逐条实测 `teardownCurrent`。
- **未覆盖**：进程被强杀（`SIGKILL`）或父进程先退出。该情形本来就落在设计声明的最佳努力边界内——失败只记诊断，不重试、不阻塞关闭。
- 未覆盖 provider 未认证/超时分支；这些属于运行时诊断，不是平台可用性问题。
- 探针未写入 API Key、Token、模型地址或任何记忆正文；证据只含模型 id、provider 与调用耗时。

## 对 task 1.2 的影响

1.2 是条件任务："若关闭路径在实践中不可用，则把默认 runner 限制为只走 `session_before_compact`"。本次观测表明关闭路径可用，因此**不实施该限制**，spec 契约保持不变。

## 回滚

删除 `src/shutdown-model-context.integration.test.ts` 与本文件即可；两者都不参与运行时路径，也不改变扩展行为。
