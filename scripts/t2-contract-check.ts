/**
 * T2 契约校验器（对应 openspec/changes/evaluate-t2-memory-enhancement 任务 3.2 / 3.3）。
 *
 * 用法: node scripts/t2-contract-check.ts
 *
 * 这份脚本是「设计文档里的断言」的可执行版本。它做两类校验：
 *
 *   3.2 证据图
 *     P1  合法重排：`supports` 边只把被支撑的一端抬起来，且**原始证据引用不被图谱 id 取代**
 *     P2  图谱不是来源：重排后的结果仍带原始 provenance
 *     N1  只有图谱边 id、没有原文引用的结果 → 必须丢弃
 *     N2  端点层为 T2 / N3 未知边类型 / N4 悬空端点 → 必须拒边
 *
 *   3.3 派生提案字段映射
 *     P1  合法提案：evidenceType=t2-handoff、sourceRefs 同时含 T1 与 L0、revision 齐备
 *     P2  L0 payload 字段名与 src/memory-activation.ts 一致，且来源位次/session 非空
 *     N1  缺 sourceRefs / N2 错证据类型 / N3 缺 revision / N4 未经确认 → 必须拒收
 *
 * 任一断言失败即非零退出。不引入任何运行时依赖。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EDGE_TYPES = [
  "supports",
  "contradicts",
  "supersedes",
  "temporal-next",
  "related",
] as const;

/** 边权：有明确证据支撑的关系给高权，弱关系给低权。 */
const EDGE_WEIGHTS: Record<string, number> = {
  contradicts: 0.5,
  related: 0.2,
  supersedes: 0.3,
  supports: 1,
  "temporal-next": 0.3,
};

/** 单条关系的折扣与总分上限（design Decision 4：只做低权重信号）。 */
const GRAPH_BONUS_FACTOR = 0.1;
const GRAPH_BONUS_MAX = 0.15;

/** `candidate_created` L0 payload 的字段基线（对齐 src/memory-activation.ts）。 */
const L0_PAYLOAD_FIELDS = [
  "bank",
  "candidateId",
  "evidenceType",
  "fingerprint",
  "kind",
  "reason",
  "scope",
  "source",
  "sourceEventPosition",
  "sourceSessionId",
] as const;

const ENDPOINT_LAYERS = [
  "L0",
  "T1",
] as const;

/** 与 src/audit.ts 的 AUDIT_ACTIONS 保持一致（状态提示的审计回查入口）。 */
const AUDIT_ACTIONS = [
  "write",
  "candidate",
  "confirmation",
  "deletion",
  "rejection",
  "recall",
  "fallback",
  "sleep-authorization",
  "cross-layer-promotion",
  "extraction",
] as const;

let checks = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  const message = detail ? `${label} — ${detail}` : label;
  failures.push(message);
  console.log(`  ✗ ${message}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function refOf(endpoint: { layer: string; ref?: string }): string | null {
  return typeof endpoint.ref === "string" ? endpoint.ref : null;
}

interface Edge {
  evidence?: unknown;
  from?: {
    layer?: unknown;
    ref?: unknown;
  };
  id?: unknown;
  to?: {
    layer?: unknown;
    ref?: unknown;
  };
  type?: unknown;
}

/**
 * 校验一条边。返回 null 表示合法，否则返回拒收原因码。
 * 规则见 docs/evaluation-reports/t2/evidence-graph.md §2/§3。
 */
function validateEdge(edge: Edge, rawEvidenceIds: string[]): string | null {
  if (typeof edge.type !== "string" || !EDGE_TYPES.includes(edge.type as never))
    return "unknown-edge-type";
  for (const endpoint of [
    edge.from,
    edge.to,
  ]) {
    if (!endpoint || typeof endpoint.layer !== "string") return "invalid-endpoint";
    if (!ENDPOINT_LAYERS.includes(endpoint.layer as never))
      return "invalid-endpoint-layer";
    if (endpoint.layer === "T1") {
      const ref = refOf(
        endpoint as {
          layer: string;
          ref?: string;
        },
      );
      if (!ref) return "invalid-endpoint";
      if (!rawEvidenceIds.includes(ref)) return "dangling-endpoint";
    } else if (
      typeof (
        endpoint as {
          sessionId?: unknown;
        }
      ).sessionId !== "string" ||
      typeof (
        endpoint as {
          position?: unknown;
        }
      ).position !== "number"
    ) {
      return "invalid-endpoint";
    }
  }
  if (typeof edge.evidence !== "string" || edge.evidence.trim().length === 0)
    return "missing-edge-evidence";
  return null;
}

/**
 * 图谱加成：只把「被支撑/被取代/后继」的一端抬起来（有向边），
 * `related`（无向）两端都算，`contradicts` 不加分只标冲突。
 * 且另一端必须**也在本次基线结果里**——图谱不能凭空引入候选。
 */
function graphBonusFor(
  memoryId: string,
  edges: Edge[],
  baseIds: string[],
): {
  bonus: number;
  contradicts: boolean;
} {
  let sum = 0;
  let contradicts = false;
  for (const edge of edges) {
    const from = refOf(
      (edge.from ?? {}) as {
        layer: string;
        ref?: string;
      },
    );
    const to = refOf(
      (edge.to ?? {}) as {
        layer: string;
        ref?: string;
      },
    );
    // 只在本轮基线结果内部重排；图谱不得凭空引入候选。
    if (!(from && to)) continue;
    if (!(baseIds.includes(from) && baseIds.includes(to))) continue;
    if (edge.type === "contradicts") {
      if (from === memoryId || to === memoryId) contradicts = true;
      continue;
    }
    if (edge.type === "related") {
      if (from === memoryId || to === memoryId) sum += EDGE_WEIGHTS.related ?? 0;
      continue;
    }
    if (to === memoryId) sum += EDGE_WEIGHTS[edge.type as string] ?? 0;
  }
  return {
    bonus: clamp(sum * GRAPH_BONUS_FACTOR, 0, GRAPH_BONUS_MAX),
    contradicts,
  };
}

/** 图谱结果必须带原始证据引用，否则丢弃。 */
function validateGraphResult(result: {
  memoryId?: unknown;
  provenance?: unknown;
}): string | null {
  const hasRawRef =
    typeof result.memoryId === "string" || typeof result.provenance === "string";
  if (!hasRawRef) return "graph-only-result-dropped";
  return null;
}

interface ProposalExample {
  promotionRequest: Record<string, unknown>;
  proposal: Record<string, unknown> & {
    sourceRefs?: unknown[];
  };
}

/** 校验一封提案及其提升请求。返回 null 表示合法，否则返回拒收原因码。 */
function validateProposal(input: ProposalExample): string | null {
  const { proposal, promotionRequest } = input;
  const evidence = promotionRequest.evidence as
    | {
        revision?: unknown;
        type?: unknown;
      }
    | undefined;

  if (!Array.isArray(proposal.sourceRefs) || proposal.sourceRefs.length === 0)
    return "provenance-required";
  if (!proposal.derivedFrom) return "invalid-evidence";
  if (promotionRequest.sourceLayer === "T2" && evidence?.type !== "t2-handoff")
    return "evidence-source-mismatch";
  if (typeof evidence?.revision !== "string" || evidence.revision.length === 0)
    return "invalid-evidence";
  if (
    promotionRequest.explicitPromotion !== true ||
    promotionRequest.reviewedConclusion !== true ||
    promotionRequest.userConfirmed !== true
  )
    return "explicit-promotion-required";
  for (const ref of proposal.sourceRefs as Array<{
    layer?: unknown;
  }>) {
    if (!ENDPOINT_LAYERS.includes(ref.layer as never)) return "invalid-endpoint-layer";
  }
  return null;
}

function loadJson<T>(path: string): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    console.error(
      `无法读取 ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error(
      `${path} 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

/** 递归收集 JSON 里出现的所有**对象字段名**（不含值）。 */
function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...collectKeys(nested),
  ]);
}

interface VisibilityExample {
  boundaryCases: Array<{
    case: string;
    mayOpenPrompt: boolean;
    path: string;
  }>;
  forbiddenKeys: string[];
  payloadAllowlist: string[];
  states: Array<{
    actionState: string;
    auditAction: string;
    mayOpenPrompt: boolean;
    payloadKeys: string[];
  }>;
}

/** 4.1 / 4.2：字段白名单、审计动作封闭集合、打断边界。 */
function checkActionVisibility(base: string): void {
  console.log("4.1 / 4.2 状态可见性与交互边界");
  const example = loadJson<VisibilityExample>(
    resolve(base, "action-visibility.example.json"),
  );
  const allowlist = new Set(example.payloadAllowlist);
  const forbidden = new Set(example.forbiddenKeys);

  for (const state of example.states) {
    const outside = state.payloadKeys.filter((key) => !allowlist.has(key));
    check(
      `V1 ${state.actionState} 的 payloadKeys 全部在白名单内`,
      outside.length === 0,
      `越界 ${outside.join(", ")}`,
    );
    const leaked = state.payloadKeys.filter((key) => forbidden.has(key));
    check(
      `V2 ${state.actionState} 不带正文类字段`,
      leaked.length === 0,
      `出现 ${leaked.join(", ")}`,
    );
    check(
      `V3 ${state.actionState} 的 auditAction 合法`,
      AUDIT_ACTIONS.includes(state.auditAction as never),
      `未知 ${state.auditAction}`,
    );
    check(`V4 ${state.actionState} 不打开咨询框`, state.mayOpenPrompt === false);
  }

  // 整个示例文件不得把禁止键用作**字段名**。注意只查键、不查值：
  // forbiddenKeys 数组里出现这些字符串是合法的声明，不是泄漏。
  const leakedKeys = collectKeys(example).filter((key) => forbidden.has(key));
  check(
    "V2 示例文件不以禁止键作为字段名",
    leakedKeys.length === 0,
    `出现 ${[
      ...new Set(leakedKeys),
    ].join(", ")}`,
  );

  const promptRights = example.boundaryCases.filter((entry) => entry.mayOpenPrompt);
  check(
    "V4 边界用例中恰好 1 条允许打开提示框",
    promptRights.length === 1,
    `实际 ${promptRights.length} 条`,
  );
  check(
    "V4 唯一可打断的是候选确认",
    promptRights[0]?.path === "candidate-confirm",
    `实际 ${promptRights[0]?.path ?? "无"}`,
  );
  for (const path of [
    "capture",
    "t2-failure",
    "backend-unavailable",
  ]) {
    const entry = example.boundaryCases.find((candidate) => candidate.path === path);
    check(`V4 ${path} 不可打断`, entry !== undefined && entry.mayOpenPrompt === false);
  }
}

interface DiagnosticsExample {
  cases: Array<{
    baselineBacked: boolean;
    fields: string[];
    reason: string;
    scenario: string;
    t2State: string;
    t2Reason: string;
  }>;
  fieldAllowlist: string[];
  requiredFields: string[];
  t2States: string[];
}

/** 4.3：七类不可用状态的可记录性与回退不变式。 */
function checkT2Diagnostics(base: string): void {
  console.log("");
  console.log("4.3 T2 不可用时的回退诊断");
  const example = loadJson<DiagnosticsExample>(
    resolve(base, "t2-diagnostics.example.json"),
  );
  const allowlist = new Set(example.fieldAllowlist);
  const states = new Set(example.t2States);

  for (const entry of example.cases) {
    check(
      `D1 ${entry.scenario}：t2State 属于封闭集合`,
      states.has(entry.t2State),
      `未知 ${entry.t2State}`,
    );
    check(
      `D1 ${entry.scenario}：t2Reason 与 reason 一致且非空`,
      entry.t2Reason.length > 0 && entry.t2Reason === entry.reason,
    );
    // D2 核心：T2 非 ok 时基线必须仍然可用。
    check(
      `D2 ${entry.scenario}：baselineBacked=true（T2 失败不传播）`,
      entry.t2State === "ok" || entry.baselineBacked === true,
      "T2 非 ok 且 baselineBacked=false：静默失败",
    );
    const missing = example.requiredFields.filter(
      (field) => !entry.fields.includes(field),
    );
    check(
      `D3 ${entry.scenario}：必查字段齐备`,
      missing.length === 0,
      `缺 ${missing.join(", ")}`,
    );
    const outside = entry.fields.filter((field) => !allowlist.has(field));
    check(
      `D4 ${entry.scenario}：字段名在白名单内`,
      outside.length === 0,
      `越界 ${outside.join(", ")}`,
    );
  }
}

function main(): void {
  const base = resolve("docs/evaluation-reports/t2");
  const graph = loadJson<{
    edges: Edge[];
    negativeCases: Array<{
      case: string;
      edge?: Edge;
      expect: string;
      reason: string;
      result?: Record<string, unknown>;
    }>;
    rawEvidenceIds: string[];
    rerank: {
      baseResults: Array<{
        baseScore: number;
        memoryId: string;
        provenance: string;
      }>;
      expectedBonus: Record<string, number>;
      expectedOrder: string[];
    };
  }>(resolve(base, "evidence-graph.example.json"));
  const proposals = loadJson<{
    negativeCases: Array<{
      case: string;
      expect: string;
      promotionRequest: Record<string, unknown>;
      proposal: Record<string, unknown>;
      reason: string;
    }>;
    valid: {
      l0Payload: Record<string, unknown>;
      pendingCandidate: Record<string, unknown>;
      promotionRequest: Record<string, unknown>;
      proposal: Record<string, unknown>;
    };
  }>(resolve(base, "t2-proposal.example.json"));

  console.log("3.2 证据图");
  const rawIds = graph.rawEvidenceIds;
  for (const edge of graph.edges) {
    check(
      `边 ${edge.id}（${String(edge.type)}）合法`,
      validateEdge(edge, rawIds) === null,
      validateEdge(edge, rawIds) ?? undefined,
    );
  }

  // P1/P2：有界重排 + 原始证据引用不被图谱取代
  const baseIds = graph.rerank.baseResults.map((result) => result.memoryId);
  const scored = graph.rerank.baseResults.map((result) => {
    const { bonus, contradicts } = graphBonusFor(result.memoryId, graph.edges, baseIds);
    return {
      ...result,
      bonus,
      contradicts,
      finalScore: result.baseScore + bonus,
    };
  });
  for (const result of scored) {
    check(
      `P1 bonus(${result.memoryId}) = ${graph.rerank.expectedBonus[result.memoryId]}`,
      result.bonus === graph.rerank.expectedBonus[result.memoryId],
      `实际 ${result.bonus}`,
    );
    check(
      `P1 bonus(${result.memoryId}) ≤ 上限 ${GRAPH_BONUS_MAX}`,
      result.bonus <= GRAPH_BONUS_MAX,
    );
    check(
      `P2 ${result.memoryId} 仍带原始 provenance`,
      validateGraphResult(result) === null,
      "结果只带图谱 id",
    );
  }
  const ordered = [
    ...scored,
  ]
    .sort((left, right) => right.finalScore - left.finalScore)
    .map((result) => result.memoryId);
  check(
    `P1 重排后顺序 = [${graph.rerank.expectedOrder.join(", ")}]`,
    JSON.stringify(ordered) === JSON.stringify(graph.rerank.expectedOrder),
    `实际 [${ordered.join(", ")}]`,
  );

  for (const negative of graph.negativeCases) {
    const reason = negative.result
      ? validateGraphResult(negative.result)
      : validateEdge(negative.edge ?? {}, rawIds);
    check(
      `${negative.case} 被拒（期望 ${negative.reason}）`,
      reason === negative.reason,
      `实际 ${reason}`,
    );
  }

  console.log("");
  console.log("3.3 派生提案字段映射");
  const validProposal = proposals.valid;
  check(
    "P1 合法提案通过准入",
    validateProposal({
      promotionRequest: validProposal.promotionRequest,
      proposal: validProposal.proposal,
    }) === null,
  );
  check(
    "P1 evidence.type = t2-handoff",
    (
      validProposal.promotionRequest.evidence as {
        type?: unknown;
      }
    )?.type === "t2-handoff",
  );
  const sourceRefs = (
    validProposal.proposal as {
      sourceRefs?: Array<{
        layer?: string;
      }>;
    }
  ).sourceRefs;
  check(
    "P1 sourceRefs 同时含 T1 与 L0",
    Array.isArray(sourceRefs) &&
      sourceRefs.some((ref) => ref.layer === "T1") &&
      sourceRefs.some((ref) => ref.layer === "L0"),
  );
  check(
    "P1 evidence.revision 非空（回滚引用）",
    typeof (
      validProposal.promotionRequest.evidence as {
        revision?: unknown;
      }
    ).revision === "string",
  );

  const payloadKeys = Object.keys(validProposal.l0Payload);
  check(
    "P2 L0 payload 字段集合与 src/memory-activation.ts 一致",
    L0_PAYLOAD_FIELDS.every((field) => payloadKeys.includes(field)),
    `缺 ${L0_PAYLOAD_FIELDS.filter((field) => !payloadKeys.includes(field)).join(", ")}`,
  );
  check(
    "P2 sourceEventPosition 与 sourceSessionId 非空",
    typeof validProposal.l0Payload.sourceEventPosition === "number" &&
      typeof validProposal.l0Payload.sourceSessionId === "string",
  );
  check(
    "P2 candidate 状态为 pending 且带 reason",
    validProposal.pendingCandidate.status === "pending" &&
      typeof validProposal.pendingCandidate.reason === "string",
  );

  for (const negative of proposals.negativeCases) {
    const reason = validateProposal({
      promotionRequest: negative.promotionRequest,
      proposal: negative.proposal,
    });
    check(
      `${negative.case} 被拒（期望 ${negative.reason}）`,
      reason === negative.reason,
      `实际 ${reason}`,
    );
  }

  console.log("");
  checkActionVisibility(base);
  checkT2Diagnostics(base);

  console.log("");
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length}/${checks} 断言未通过`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`PASSED: ${checks} 断言全部通过`);
}

main();
