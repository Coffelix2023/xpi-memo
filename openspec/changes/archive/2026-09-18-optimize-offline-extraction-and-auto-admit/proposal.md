# Proposal: Optimize Offline Extraction and Auto-Admit

## Why

用户报告两个严重影响体验的问题：
1. 离线提取导致 session 切换/新开/退出时系统卡顿数秒，用户看不到任何进度提示，不知道系统在做什么
2. 155 条待审记忆堆积，虽然之前 change 声称已实现自动审核，但 `XPI_MEMO_AUTO_ADMIT` 环境变量未设置，导致所有候选记忆永远进入待审队列，自动审核从未生效

离线提取是增强功能，不应成为核心体验的阻塞点。当前实现让用户等待但不告知原因，违反了可观测性契约。自动审核功能已实现但因配置缺失从未启用，造成待审积压。

## What Changes

- 在离线提取运行期间，在用户输入编辑器上方显示流光文本进度指示器，让用户感知系统正在工作
- 将 `autoAdmit` 配置项加入 `config.ts`，默认值 `true`，让环境变量 `XPI_MEMO_AUTO_ADMIT` 仅作为覆盖选项
- 优化离线提取性能：增加预算限制检查的提前退出路径，避免不必要的 L0 读取和模型调用
- 统一 `session_shutdown` 和 `session_before_compact` 钩子的进度显示逻辑，避免代码重复
- 在配置文档中说明自动审核的默认行为和覆盖方式

## Capabilities

### New Capabilities

无。本 change 优化现有能力的实现和配置，不引入新的 spec 级行为。

### Modified Capabilities

- `candidate-auto-admission/kind-routing`: 修改准入策略的默认配置行为——`autoAdmit` 从"必须显式环境变量才启用"改为"默认启用，环境变量可覆盖"
- `memory-observability`: 增强离线提取的可观测性——在 TUI 模式下显示进度指示器，让用户感知提取过程

## Impact

**受影响代码：**
- `src/offline-extract.ts`: 添加进度显示，优化预算检查提前退出
- `src/kind-routing.ts`: 修改 `autoAdmitEnabled()` 读取逻辑，从配置文件获取默认值
- `src/config.ts`: 新增 `autoAdmit` 配置项，默认 `true`
- `src/hooks.ts`: 统一钩子函数的进度显示调用

**用户体验变化：**
- session 切换时会看到"正在提取记忆候选..."流光文本，不再无声等待
- 新安装的扩展默认启用自动审核，待审队列不会无限堆积
- 现有用户可通过 `XPI_MEMO_AUTO_ADMIT=false` 显式关闭自动审核

**配置兼容性：**
- 环境变量 `XPI_MEMO_AUTO_ADMIT` 优先级高于配置文件，现有显式设置不受影响
- 未设置环境变量的用户将从"自动审核关闭"变为"自动审核开启"，这是修复 bug 的预期行为

**性能优化：**
- 预算限制检查提前退出，减少不必要的 L0 读取和模型调用
- 不改变离线提取的核心逻辑，仅优化执行路径
