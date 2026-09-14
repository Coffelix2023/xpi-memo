/**
 * T2 记忆评估 runner（对应 openspec/changes/evaluate-t2-memory-enhancement 任务 1.3）。
 *
 * 用法:
 *   node scripts/t2-eval.ts                       # 跑 baseline 并写入默认报告
 *   node scripts/t2-eval.ts --label baseline      # 报告标题里的标签
 *   node scripts/t2-eval.ts --dataset <path>      # 换场景集
 *   node scripts/t2-eval.ts --keep                # 保留临时 data dir（排障）
 *
 * 只读边界：runner 把 MNEMOSYNE_DATA_DIR 指向临时目录，不读写用户真实 bank，
 * 不修改 src/**，不安装任何候选。同一 machine + 同一 embedding 模型应得到同一批命中。
 *
 * 输出：docs/evaluation-reports/t2/<label>-run.json（原始记录）与 <label>-run.md（可读报告）。
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type Bank = "global" | "project";

interface DatasetMemory {
  bank: Bank;
  confidence: number;
  content: string;
  evidence: string;
  id: string;
  kind: string;
  provenance: string;
}

interface DatasetScenario {
  answer: string;
  bridge: string[];
  category: string;
  expectation: "hit" | "observe";
  falseRecallRisk: string;
  groundTruth: string[];
  id: string;
  query: string;
  scope: Bank;
  topK: number;
}

interface Dataset {
  banks: Record<Bank, string>;
  datasetId: string;
  locale: string;
  memories: DatasetMemory[];
  scenarios: DatasetScenario[];
  version: string;
}

interface CliOutcome {
  code: number | null;
  durationMs: number;
  error?: string;
  ok: boolean;
  stderr: string;
  stdout: string;
}

interface RecallRow {
  content?: unknown;
  id?: unknown;
  importance?: unknown;
  score?: unknown;
  source?: unknown;
}

interface PlainResult {
  bank: string;
  content: string;
  datasetId: string | null;
  datasetRank: number | null;
  hasKind: boolean;
  hasProvenance: boolean;
  score: number;
}

interface ScenarioRun {
  degradation: {
    activeBackend: string | null;
    attempts: Array<{
      backend: string;
      ok: boolean;
      error?: string;
    }>;
    embeddingAvailable: boolean;
    embeddingContributed: boolean;
    fallback: boolean;
    fallbackStages: string[];
    warning?: string;
  };
  metrics: {
    bridgeHitRank: number | null;
    evidenceCompleteRate: number | null;
    falseRecallCount: number;
    falseRecallRate: number;
    hit: boolean;
    hitRank: number | null;
    latencyMs: number;
    mrr: number;
    precision: number;
    returned: number;
  };
  results: PlainResult[];
  scenario: DatasetScenario;
}

interface DegradationProbe {
  backendName: string | null;
  expectedWarning?: string;
  label: string;
  observed: string;
  resultCount: number;
}

const CANDIDATE_BACKENDS = [
  {
    backend: "mnemosyne",
    command: "mnemosyne",
  },
  {
    backend: "ripgrep",
    command: "rg",
  },
  {
    backend: "qmd",
    command: "qmd",
  },
] as const;
const STORED_ID_PATTERN = /^Stored:\s*(\S+)/m;
const TRUNCATE = 40;

/**
 * 三档 embedding 执行协议（任务 3.1）。
 *   none  → 本地向量关闭，只走 FTS（MNEMOSYNE_EMBEDDINGS_OFF）
 *   local → 默认：本地 fastembed/ONNX，无外发
 *   cloud → 走 HTTP embedding provider；评测把 endpoint 指向本机 sink，
 *           只验证「外发尝试与失败行为可记录」，**不向真实第三方发送任何内容**
 */
type EmbeddingMode = "none" | "local" | "cloud";

const EMBEDDING_MODES: readonly EmbeddingMode[] = [
  "none",
  "local",
  "cloud",
];
/** 故意无效的本机占位凭据；真实的 key 绝不进代码/日志/报告。 */
const CLOUD_PLACEHOLDER_KEY = "t2eval-placeholder-not-a-credential";

/** runConfig 在 main 开头写入一次，供 baseEnv / 报告复用。 */
const runConfig: {
  embeddingEnv: Record<string, string>;
  embeddingMode: EmbeddingMode;
  outboundEndpoint: string | null;
} = {
  embeddingEnv: {},
  embeddingMode: "local",
  outboundEndpoint: null,
};

function embeddingEnvFor(
  mode: EmbeddingMode,
  sinkUrl: string | null,
): {
  env: Record<string, string>;
  endpoint: string | null;
} {
  if (mode === "none")
    return {
      endpoint: null,
      env: {
        MNEMOSYNE_EMBEDDINGS_OFF: "true",
      },
    };
  if (mode === "local")
    return {
      endpoint: null,
      env: {},
    };
  const endpoint = sinkUrl ?? "http://127.0.0.1:9/v1/embeddings";
  return {
    endpoint,
    env: {
      MNEMOSYNE_EMBEDDING_API_KEY: CLOUD_PLACEHOLDER_KEY,
      MNEMOSYNE_EMBEDDING_API_URL: endpoint,
      MNEMOSYNE_EMBEDDINGS_VIA_API: "true",
    },
  };
}

/**
 * 本机 embedding sink：只计数并返回 503，不转发任何内容。
 * 用于在**不向真实第三方发送数据**的前提下，验证云端档的
 * 外发尝试次数与失败行为可被记录。
 *
 * 必须跑在**独立进程**里：runner 调用 CLI 用 spawnSync，会阻塞 Node 事件循环，
 * 同进程的 HTTP server 根本无法应答，会直接死锁到超时。
 */
async function startCloudSink(): Promise<{
  attempts: () => number;
  close: () => Promise<void>;
  url: string;
}> {
  const script = [
    'const { createServer } = require("node:http");',
    "let n = 0;",
    "const server = createServer((req, res) => {",
    "  n += 1;",
    "  req.resume();",
    '  res.writeHead(503, { "content-type": "application/json" });',
    '  res.end(JSON.stringify({ error: "t2eval local sink: blocked by design" }));',
    '  console.log("ATTEMPTS=" + n);',
    "});",
    'server.listen(0, "127.0.0.1", () => console.log("PORT=" + server.address().port));',
    // 自限时：即使 runner 被强杀，也不留孤儿进程。
    "setTimeout(() => process.exit(0), 600000);",
  ].join("\n");
  const child = spawn(process.execPath, [
    "-e",
    script,
  ]);
  let attempts = 0;
  let port = 0;
  await new Promise<void>((resolveReady) => {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.startsWith("PORT=")) {
          port = Number(line.slice(5));
          resolveReady();
        } else if (line.startsWith("ATTEMPTS=")) {
          attempts = Number(line.slice(9));
        }
      }
    });
  });
  return {
    url: `http://127.0.0.1:${port}/v1/embeddings`,
    attempts: () => attempts,
    close: () =>
      new Promise<void>((resolveClose) => {
        child.once("exit", () => resolveClose());
        child.kill("SIGTERM");
      }),
  };
}

/** sink 的 stdout 要等事件循环转一圈才送达；读计数前让出一次。 */
function settle(): Promise<void> {
  return new Promise((resolveSettle) => {
    setTimeout(resolveSettle, 80);
  });
}

function parseArgs(argv: string[]) {
  const parsed = {
    dataset: "docs/evaluation-reports/t2/scenarios.zh.json",
    embeddingMode: "local" as EmbeddingMode,
    keep: false,
    label: "baseline",
    outDir: "docs/evaluation-reports/t2",
    probeOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--keep") {
      parsed.keep = true;
      continue;
    }
    if (arg === "--probe-only") {
      parsed.probeOnly = true;
      continue;
    }
    if (!value) continue;
    if (arg === "--dataset") {
      parsed.dataset = value;
      i += 1;
    } else if (arg === "--label") {
      parsed.label = value;
      i += 1;
    } else if (arg === "--out-dir") {
      parsed.outDir = value;
      i += 1;
    } else if (arg === "--embedding-mode") {
      if (!(EMBEDDING_MODES as readonly string[]).includes(value)) {
        console.error(
          `--embedding-mode 只接受 ${EMBEDDING_MODES.join("|")}，收到 ${value}`,
        );
        process.exit(1);
      }
      parsed.embeddingMode = value as EmbeddingMode;
      i += 1;
    }
  }
  return parsed;
}

function runCli(args: string[], env: Record<string, string | undefined>): CliOutcome {
  const started = performance.now();
  const result = spawnSync("mnemosyne", args, {
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  const durationMs = performance.now() - started;
  if (result.error) {
    return {
      code: null,
      durationMs,
      error: result.error.message,
      ok: false,
      stderr: "",
      stdout: "",
    };
  }
  const code = result.status;
  const stderr = (result.stderr ?? "").trim();
  return {
    code,
    durationMs,
    ok: code === 0,
    stderr,
    stdout: (result.stdout ?? "").trim(),
  };
}

function whichBackend(name: string, env: Record<string, string | undefined>): boolean {
  return (
    spawnSync(
      "which",
      [
        name,
      ],
      {
        encoding: "utf8",
        env,
      },
    ).status === 0
  );
}

/** 降级记录只保留有界、脱敏的错误码，不落 traceback 与绝对路径。 */
function boundedReason(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastLine = lines.at(-1) ?? "unknown";
  return lastLine
    .replaceAll(homedir(), "~")
    .replaceAll(tmpdir(), "<tmp>")
    .replace(/(?:\/private)?\/var\/folders\/[^\s"']+/g, "<tmp>")
    .replace(/\/Users\/[^/\s"']+/g, "~")
    .replace(/\/home\/[^/\s"']+/g, "~")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function baseEnv(dataDir: string): Record<string, string | undefined> {
  return {
    ...process.env,
    ...runConfig.embeddingEnv,
    MNEMOSYNE_DATA_DIR: dataDir,
    MNEMOSYNE_DEFAULT_SCOPE: "global",
    MNEMOSYNE_LLM_ENABLED: "false",
  };
}

function bankEnv(dataDir: string, bank: string): Record<string, string | undefined> {
  const env = baseEnv(dataDir);
  if (bank !== "default") env.MNEMOSYNE_BANK = bank;
  return env;
}

/** 解析 `kind=..;ev=..;prov=..;ts=..;src=..`，只取评估需要的字段。 */
function decodeSource(raw: unknown): {
  kind: string | null;
  provenance: string | null;
} {
  if (typeof raw !== "string" || !raw.startsWith("kind="))
    return {
      kind: null,
      provenance: null,
    };
  const fields: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return {
    kind: fields.kind ?? null,
    provenance: fields.prov ?? null,
  };
}

function datasetIdFromProvenance(
  provenance: string | null,
  version: string,
): string | null {
  if (!provenance) return null;
  const prefix = `t2eval/${version}#`;
  return provenance.startsWith(prefix) ? provenance.slice(prefix.length) : null;
}

function toPlainResults(output: string, bank: string, version: string): PlainResult[] {
  let rows: RecallRow[] = [];
  try {
    const parsed = JSON.parse(output) as {
      results?: unknown;
    };
    if (Array.isArray(parsed.results))
      rows = parsed.results.filter(
        (row): row is RecallRow => typeof row === "object" && row !== null,
      );
  } catch {
    rows = [];
  }
  return rows.flatMap((row) => {
    if (typeof row.content !== "string") return [];
    const decoded = decodeSource(row.source);
    return [
      {
        bank,
        content: row.content,
        datasetId: datasetIdFromProvenance(decoded.provenance, version),
        datasetRank: null,
        hasKind: decoded.kind !== null,
        hasProvenance: decoded.provenance !== null,
        score: typeof row.score === "number" ? row.score : 0,
      },
    ];
  });
}

function explainFlags(output: string): {
  embeddingAvailable: boolean;
  /** 是否真有结果吃到向量贡献（voice_scores.vec > 0）。
   *  云端 embedding 挂掉时 Mnemosyne 仍报 available=true / computed=true，
   *  只能靠这个观测到实际降级。 */
  embeddingContributed: boolean;
  fallbackStages: string[];
} {
  try {
    const parsed = JSON.parse(output) as {
      explain?: {
        embedding?: {
          available?: unknown;
        };
        stages?: Array<{
          fallback_used?: unknown;
          name?: unknown;
        }>;
      };
      results?: Array<{
        voice_scores?: {
          vec?: unknown;
        };
      }>;
    };
    const stages = parsed.explain?.stages ?? [];
    const rows = parsed.results ?? [];
    return {
      embeddingAvailable: parsed.explain?.embedding?.available !== false,
      embeddingContributed: rows.some((row) => {
        const vec = row.voice_scores?.vec;
        return typeof vec === "number" && vec > 0;
      }),
      fallbackStages: stages
        .filter((stage) => stage.fallback_used === true)
        .map((stage) => String(stage.name)),
    };
  } catch {
    return {
      embeddingAvailable: false,
      embeddingContributed: false,
      fallbackStages: [],
    };
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [
    ...values,
  ].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

function dirBytes(path: string): number {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.size;
  return readdirSync(path).reduce(
    (total, entry) => total + dirBytes(join(path, entry)),
    0,
  );
}

function validate(dataset: Dataset): string[] {
  const problems: string[] = [];
  const memoryById = new Map<string, DatasetMemory>();
  for (const memory of dataset.memories) {
    if (memoryById.has(memory.id)) problems.push(`memory id 重复: ${memory.id}`);
    memoryById.set(memory.id, memory);
    if (!memory.content.trim()) problems.push(`memory 正文为空: ${memory.id}`);
    if (!memory.evidence.trim()) problems.push(`memory 缺少证据类型: ${memory.id}`);
    if (!memory.provenance.trim()) problems.push(`memory 缺少证据来源: ${memory.id}`);
    if (!(memory.confidence > 0 && memory.confidence <= 1))
      problems.push(`memory confidence 越界: ${memory.id}`);
    if (memory.bank === "global" && !memory.kind.startsWith("global_"))
      problems.push(`global bank 只能放 global_* 类型: ${memory.id}`);
  }
  const seenScenario = new Set<string>();
  for (const scenario of dataset.scenarios) {
    if (seenScenario.has(scenario.id))
      problems.push(`scenario id 重复: ${scenario.id}`);
    seenScenario.add(scenario.id);
    if (!scenario.query.trim()) problems.push(`scenario query 为空: ${scenario.id}`);
    if (!scenario.answer.trim()) problems.push(`scenario 缺少标准答案: ${scenario.id}`);
    if (scenario.groundTruth.length === 0)
      problems.push(`scenario 缺少 groundTruth: ${scenario.id}`);
    for (const id of [
      ...scenario.groundTruth,
      ...scenario.bridge,
    ]) {
      const memory = memoryById.get(id);
      if (!memory) {
        problems.push(`scenario ${scenario.id} 引用了不存在的记忆: ${id}`);
        continue;
      }
      if (scenario.groundTruth.includes(id) && memory.bank !== scenario.scope)
        problems.push(
          `scenario ${scenario.id} 的答案记忆不在 ${scenario.scope} bank: ${id}`,
        );
    }
    if (scenario.topK < 1) problems.push(`scenario topK 非法: ${scenario.id}`);
  }
  return problems;
}

function probeBackends(env: Record<string, string | undefined>) {
  return CANDIDATE_BACKENDS.map((entry) => ({
    backend: entry.backend,
    command: entry.command,
    error: undefined as string | undefined,
    ok: whichBackend(entry.command, env),
  }));
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TRUNCATE ? `${flat.slice(0, TRUNCATE)}…` : flat;
}

/**
 * 云端 embedding 档的有界探针（任务 3.1）。
 *
 * 为什么不是跑全套：云端档需要真实 provider 才能产出有意义的召回质量，
 * 而评测不得向真实第三方发送内容。用本机 sink 跑全套只会得到假向量的
 * 假数字。因此只做两件事，逐项验证「可记录」：
 *   1. 一次 store：外发尝试次数、失败后是否仍写入、耗时
 *   2. 一次 recall：失败后是否降级到 FTS、分项得分与阶段标记、耗时
 * 完整 A/B 评测留给任务 5.1（那里需要用真实 provider 或候选自带的本地模型）。
 */
async function runEmbeddingProbe(options: {
  args: ReturnType<typeof parseArgs>;
  dataDir: string;
  dataset: Dataset;
  outDir: string;
  sink: {
    attempts: () => number;
    url: string;
  } | null;
  startedAt: Date;
}): Promise<void> {
  const { args, dataDir, dataset, outDir, sink, startedAt } = options;
  const memory = dataset.memories[0];
  const scenario = dataset.scenarios[0];
  if (!memory || !scenario) {
    console.error("场景集为空，探针无需执行");
    return;
  }

  const store = runCli(
    [
      "store",
      memory.content,
      `kind=${memory.kind};ev=${memory.evidence};prov=${memory.provenance}`,
      String(memory.confidence),
    ],
    baseEnv(dataDir),
  );
  await settle();
  const attemptsAfterStore = sink?.attempts() ?? 0;

  const recallOutcome = runCli(
    [
      "recall",
      scenario.query,
      String(scenario.topK),
      "--explain",
      "--json",
    ],
    baseEnv(dataDir),
  );
  await settle();
  const attemptsAfterRecall = sink?.attempts() ?? 0;

  let scores: {
    dense: number | null;
    fts: number | null;
    vec: number | null;
  } = {
    dense: null,
    fts: null,
    vec: null,
  };
  let resultCount = 0;
  let embeddingAvailable = false;
  let fallbackStages: string[] = [];
  if (recallOutcome.ok) {
    const flags = explainFlags(recallOutcome.stdout);
    embeddingAvailable = flags.embeddingAvailable;
    fallbackStages = flags.fallbackStages;
    const rows = toPlainResults(recallOutcome.stdout, "default", dataset.version);
    resultCount = rows.length;
    try {
      const parsed = JSON.parse(recallOutcome.stdout) as {
        results?: Array<{
          dense_score?: unknown;
          voice_scores?: {
            fts?: unknown;
            vec?: unknown;
          };
        }>;
      };
      const first = parsed.results?.[0];
      scores = {
        dense: typeof first?.dense_score === "number" ? first.dense_score : null,
        fts:
          typeof first?.voice_scores?.fts === "number" ? first.voice_scores.fts : null,
        vec:
          typeof first?.voice_scores?.vec === "number" ? first.voice_scores.vec : null,
      };
    } catch {
      scores = {
        dense: null,
        fts: null,
        vec: null,
      };
    }
  }

  const finishedAt = new Date();
  const record = {
    finishedAt: finishedAt.toISOString(),
    mode: "embedding-probe",
    runId: `${args.label}-${finishedAt.toISOString().replace(/[:.]/g, "-")}`,
    startedAt: startedAt.toISOString(),
    dataset: {
      datasetId: dataset.datasetId,
      path: args.dataset,
      version: dataset.version,
    },
    environment: {
      backendProbes: probeBackends(baseEnv(dataDir)),
      embeddingMode: runConfig.embeddingMode,
      label: args.label,
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      embeddingProfile: {
        endpoint: runConfig.outboundEndpoint,
        env: Object.keys(runConfig.embeddingEnv).sort(),
        mode: runConfig.embeddingMode,
      },
    },
    privacy: {
      contentLeftMachine: false,
      embeddingMode: runConfig.embeddingMode,
      note: "endpoint 指向本机 sink；只记录外发尝试，内容未向真实第三方发送",
      outboundAttempts: attemptsAfterRecall,
      outboundEndpoint: runConfig.outboundEndpoint,
    },
    probe: {
      recall: {
        denseScore: scores.dense,
        embeddingAvailable,
        fallbackStages,
        ftsScore: scores.fts,
        latencyMs: Math.round(recallOutcome.durationMs),
        ok: recallOutcome.ok,
        resultCount,
        vecScore: scores.vec,
      },
      store: {
        latencyMs: Math.round(store.durationMs),
        observed: store.ok
          ? `stored:${STORED_ID_PATTERN.exec(store.stdout)?.[1] ?? "unknown"}`
          : `store-failed:${boundedReason(store.error ?? store.stderr ?? "unknown")}`,
        outboundAttempts: attemptsAfterStore,
      },
    },
  };

  const jsonPath = join(outDir, `${args.label}-run.json`);
  const mdPath = join(outDir, `${args.label}-run.md`);
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(mdPath, renderProbeReport(record, args.dataset));
  console.log(`probe mode: ${runConfig.embeddingMode}`);
  console.log(
    `store: ${record.probe.store.observed} (${record.probe.store.latencyMs}ms)`,
  );
  console.log(
    `recall: ok=${record.probe.recall.ok} results=${record.probe.recall.resultCount} vec=${record.probe.recall.vecScore} fts=${record.probe.recall.ftsScore}`,
  );
  console.log(`outbound attempts: ${record.privacy.outboundAttempts}`);
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
}

interface ProbeRecord {
  dataset: {
    datasetId: string;
    path: string;
    version: string;
  };
  environment: {
    backendProbes: Array<{
      backend: string;
      ok: boolean;
    }>;
    embeddingMode: string;
    embeddingProfile: {
      endpoint: string | null;
      env: string[];
      mode: string;
    };
    label: string;
    node: string;
    platform: string;
  };
  finishedAt: string;
  mode: string;
  privacy: {
    contentLeftMachine: boolean;
    embeddingMode: string;
    note: string;
    outboundAttempts: number;
    outboundEndpoint: string | null;
  };
  probe: {
    recall: {
      denseScore: number | null;
      embeddingAvailable: boolean;
      fallbackStages: string[];
      ftsScore: number | null;
      latencyMs: number;
      ok: boolean;
      resultCount: number;
      vecScore: number | null;
    };
    store: {
      latencyMs: number;
      observed: string;
      outboundAttempts: number;
    };
  };
  runId: string;
  startedAt: string;
}

function renderProbeReport(record: ProbeRecord, datasetPath: string): string {
  const lines: string[] = [];
  lines.push("# T2 embedding 档位探针（自动生成）");
  lines.push("");
  lines.push(
    "本文件由 `node scripts/t2-eval.ts --embedding-mode cloud --probe-only` 生成。用途：验证云端档的**隐私边界、延迟与失败行为可记录**，不产出召回质量结论。",
  );
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| runId | \`${record.runId}\` |`);
  lines.push(`| label | ${record.environment.label} |`);
  lines.push(`| 场景集 | \`${datasetPath}\` v${record.dataset.version} |`);
  lines.push(`| embedding 档位 | \`${record.environment.embeddingMode}\` |`);
  lines.push(
    `| 注入 env | ${record.environment.embeddingProfile.env.join(", ") || "无"} |`,
  );
  lines.push(`| 外发端点 | ${record.environment.embeddingProfile.endpoint ?? "—"} |`);
  lines.push(
    `| 平台 | ${record.environment.platform} / Node ${record.environment.node} |`,
  );
  lines.push("");
  lines.push("## 隐私边界与失败行为");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("| --- | --- |");
  lines.push(
    `| 外发尝试次数 | ${record.privacy.outboundAttempts}（sink 收到 ${record.privacy.outboundAttempts} 次请求） |`,
  );
  lines.push(`| 内容离开本机 | ${record.privacy.contentLeftMachine ? "是" : "否"} |`);
  lines.push(`| 说明 | ${record.privacy.note} |`);
  lines.push("");
  lines.push("| 探针 | 结果 | 延迟 | 外发尝试 |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(
    `| store（写入是否被 embedding 失败阻断） | ${record.probe.store.observed} | ${record.probe.store.latencyMs} ms | ${record.probe.store.outboundAttempts} |`,
  );
  lines.push(
    `| recall（是否降级到 FTS） | ok=${record.probe.recall.ok} · 结果 ${record.probe.recall.resultCount} 条 · vec=${record.probe.recall.vecScore} · dense=${record.probe.recall.denseScore} · fts=${record.probe.recall.ftsScore} · embeddingAvailable=${record.probe.recall.embeddingAvailable} · fallbackStages=[${record.probe.recall.fallbackStages.join(", ")}] | ${record.probe.recall.latencyMs} ms | ${record.privacy.outboundAttempts} |`,
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath = resolve(args.dataset);
  const outDir = resolve(args.outDir);
  let dataset: Dataset;
  try {
    dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as Dataset;
  } catch (error) {
    console.error(
      `无法读取场景集 ${args.dataset}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  const problems = validate(dataset);
  if (problems.length > 0) {
    console.error("场景集校验失败（fail-closed，未执行任何 recall）：");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const startedAt = new Date();
  const startedMs = performance.now();
  const rssBefore = process.memoryUsage().rss;
  const dataDir = mkdtempSync(join(tmpdir(), "t2eval-"));
  runConfig.embeddingMode = args.embeddingMode;
  const sink = args.embeddingMode === "cloud" ? await startCloudSink() : null;
  const embeddingSetup = embeddingEnvFor(args.embeddingMode, sink?.url ?? null);
  runConfig.embeddingEnv = embeddingSetup.env;
  runConfig.outboundEndpoint = embeddingSetup.endpoint;
  const projectBank = dataset.banks.project;
  const storeFailures: Array<{
    id: string;
    error: string;
  }> = [];
  const storedIds = new Map<string, string | null>();

  try {
    if (args.probeOnly) {
      await runEmbeddingProbe({
        args,
        dataset,
        dataDir,
        outDir,
        startedAt,
        sink,
      });
      return;
    }
    runCli(
      [
        "bank",
        "create",
        projectBank,
      ],
      baseEnv(dataDir),
    );

    for (const memory of dataset.memories) {
      const bank = memory.bank === "global" ? "default" : projectBank;
      const source = [
        `kind=${memory.kind}`,
        `ev=${memory.evidence}`,
        `prov=${memory.provenance}`,
        `ts=${startedAt.toISOString()}`,
        `src=${args.dataset}`,
      ].join(";");
      const outcome = runCli(
        [
          "store",
          memory.content,
          source,
          String(memory.confidence),
        ],
        bankEnv(dataDir, bank),
      );
      if (!outcome.ok) {
        storeFailures.push({
          error: outcome.error ?? outcome.stderr ?? "store-failed",
          id: memory.id,
        });
        continue;
      }
      storedIds.set(memory.id, STORED_ID_PATTERN.exec(outcome.stdout)?.[1] ?? null);
    }

    const scenarioRuns: ScenarioRun[] = [];
    for (const scenario of dataset.scenarios) {
      const banks =
        scenario.scope === "project"
          ? [
              projectBank,
              "default",
            ]
          : [
              "default",
            ];
      const attempts = probeBackends(baseEnv(dataDir));
      let activeBackend: string | null = null;
      const collected: PlainResult[] = [];
      let latencyMs = 0;
      let embeddingAvailable = true;
      let embeddingContributed = false;
      let fallback = false;
      const fallbackStages: string[] = [];
      let warning: string | undefined;

      for (const bank of banks) {
        if (bank === "default" && !activeBackend) activeBackend = "mnemosyne";
        const outcome = runCli(
          [
            "recall",
            scenario.query,
            String(Math.min(50, scenario.topK)),
            "--explain",
            "--json",
          ],
          bankEnv(dataDir, bank),
        );
        latencyMs += outcome.durationMs;
        if (!outcome.ok) {
          warning = boundedReason(outcome.error ?? outcome.stderr ?? "recall-failed");
          attempts.push({
            backend: "mnemosyne",
            error: warning,
            ok: false,
          });
          continue;
        }
        const flags = explainFlags(outcome.stdout);
        embeddingAvailable = embeddingAvailable && flags.embeddingAvailable;
        embeddingContributed = embeddingContributed || flags.embeddingContributed;
        fallbackStages.push(...flags.fallbackStages);
        fallback = fallback || !flags.embeddingAvailable;
        collected.push(...toPlainResults(outcome.stdout, bank, dataset.version));
      }

      // 观测到的降级：声称可用但没有任何结果吃到向量贡献。
      // 仅在确实拿到过行时判定，避免空结果误报。
      const vectorSilent =
        collected.length > 0 && embeddingAvailable && !embeddingContributed;
      if (vectorSilent) fallbackStages.push("vector-no-contribution");

      const seen = new Set<string>();
      const ordered = collected
        .filter((result) => {
          const key = result.datasetId ?? `content:${result.content.trim()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, scenario.topK)
        .map((result, index) => ({
          ...result,
          datasetRank: index + 1,
        }));

      const relevant = new Set([
        ...scenario.groundTruth,
        ...scenario.bridge,
      ]);
      const returnedIds = ordered.map((result) => result.datasetId);
      const gtRank =
        ordered.find(
          (result) =>
            result.datasetId && scenario.groundTruth.includes(result.datasetId),
        )?.datasetRank ?? null;
      const bridgeRank =
        ordered.find(
          (result) => result.datasetId && scenario.bridge.includes(result.datasetId),
        )?.datasetRank ?? null;
      const relatedHits = returnedIds.filter(
        (id) => id !== null && relevant.has(id),
      ).length;
      const falseRecallCount = ordered.length - relatedHits;
      const evidenceComplete = ordered.filter(
        (result) => result.hasKind && result.hasProvenance,
      ).length;

      scenarioRuns.push({
        results: ordered,
        degradation: {
          activeBackend,
          attempts,
          embeddingAvailable,
          embeddingContributed,
          fallback: fallback || embeddingAvailable === false || vectorSilent,
          fallbackStages,
          ...(warning
            ? {
                warning,
              }
            : {}),
        },
        metrics: {
          bridgeHitRank: bridgeRank,
          evidenceCompleteRate:
            ordered.length === 0 ? null : evidenceComplete / ordered.length,
          falseRecallCount,
          falseRecallRate: ordered.length === 0 ? 0 : falseRecallCount / ordered.length,
          hit: gtRank !== null,
          hitRank: gtRank,
          latencyMs: Math.round(latencyMs),
          mrr: gtRank === null ? 0 : 1 / gtRank,
          precision: ordered.length === 0 ? 0 : relatedHits / ordered.length,
          returned: ordered.length,
        },
        scenario,
      });
    }

    // 降级记录格式验证：两个受控失败，确认降级结果可被记录（不改变 baseline 行为）。
    const degradationProbes: DegradationProbe[] = [];
    const firstScenario = dataset.scenarios[0];
    if (firstScenario) {
      const probes: Array<{
        env: Record<string, string | undefined>;
        label: string;
      }> = [
        {
          label: "backend-missing",
          env: {
            ...baseEnv(dataDir),
            PATH: join(tmpdir(), "t2eval-no-backends"),
          },
        },
        {
          label: "backend-error",
          env: {
            ...baseEnv(dataDir),
            MNEMOSYNE_DATA_DIR: join(dataDir, "mnemosyne.db"),
          },
        },
      ];
      for (const probe of probes) {
        const outcome = runCli(
          [
            "recall",
            firstScenario.query,
            String(firstScenario.topK),
            "--explain",
            "--json",
          ],
          probe.env,
        );
        const rows = outcome.ok
          ? toPlainResults(outcome.stdout, "default", dataset.version)
          : [];
        degradationProbes.push({
          backendName: outcome.ok ? "mnemosyne" : null,
          label: probe.label,
          observed: outcome.ok
            ? "recall-succeeded"
            : `backend-failed:${boundedReason(outcome.error ?? outcome.stderr ?? "unknown")}`,
          resultCount: rows.length,
          ...(outcome.ok
            ? {}
            : {
                // 引用 src/search/selector.ts 的固定文案，不是本 runner 实测输出。
                expectedWarning:
                  "no search backend available — recall returned empty; install mnemosyne (uv tool install mnemosyne-memory) or ripgrep, or configure xpi_memo.searchBackend",
              }),
        });
      }
    }

    const rssAfter = process.memoryUsage().rss;
    const finishedAt = new Date();
    const byCategory = new Map<string, ScenarioRun[]>();
    for (const run of scenarioRuns) {
      const list = byCategory.get(run.scenario.category) ?? [];
      list.push(run);
      byCategory.set(run.scenario.category, list);
    }
    const expected = scenarioRuns.filter((run) => run.scenario.expectation === "hit");
    const latencies = scenarioRuns.map((run) => run.metrics.latencyMs);
    const evidenceRates = scenarioRuns
      .map((run) => run.metrics.evidenceCompleteRate)
      .filter((rate): rate is number => rate !== null);
    const record = {
      corpus: {
        memoryCount: dataset.memories.length,
        projectBank,
        storedCount: storedIds.size,
        storeFailures,
      },
      dataset: {
        datasetId: dataset.datasetId,
        locale: dataset.locale,
        path: args.dataset,
        version: dataset.version,
      },
      privacy: {
        contentLeftMachine: false,
        embeddingMode: runConfig.embeddingMode,
        note:
          runConfig.embeddingMode === "cloud"
            ? "endpoint 指向本机 sink；只记录外发尝试，内容未向真实第三方发送"
            : "无外发 embedding 调用",
        outboundAttempts: sink?.attempts() ?? 0,
        outboundEndpoint: runConfig.outboundEndpoint,
      },
      degradationProbes,
      finishedAt: finishedAt.toISOString(),
      runId: `${args.label}-${finishedAt.toISOString().replace(/[:.]/g, "-")}`,
      scenarios: scenarioRuns,
      startedAt: startedAt.toISOString(),
      environment: {
        backendProbes: probeBackends(baseEnv(dataDir)),
        embeddingMode: runConfig.embeddingMode,
        embeddingModel:
          process.env.MNEMOSYNE_EMBEDDING_MODEL ??
          "BAAI/bge-small-en-v1.5 (config.yaml)",
        label: args.label,
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        embeddingProfile: {
          endpoint: runConfig.outboundEndpoint,
          env: Object.keys(embeddingSetup.env).sort(),
          mode: runConfig.embeddingMode,
        },
      },
      resources: {
        dataDirBytes: dirBytes(dataDir),
        rssAfterBytes: rssAfter,
        rssBeforeBytes: rssBefore,
        rssDeltaBytes: rssAfter - rssBefore,
      },
      summary: {
        byCategory: [
          ...byCategory,
        ].map(([category, runs]) => ({
          category,
          evidenceCompleteRate: averageOrNull(
            runs
              .map((run) => run.metrics.evidenceCompleteRate)
              .filter((rate): rate is number => rate !== null),
          ),
          falseRecallRate:
            runs.reduce((sum, run) => sum + run.metrics.falseRecallRate, 0) /
            runs.length,
          hitRate: runs.filter((run) => run.metrics.hit).length / runs.length,
          scenarios: runs.length,
        })),
        evidenceCompleteRate: averageOrNull(evidenceRates),
        expectedHitRate:
          expected.length === 0
            ? null
            : expected.filter((run) => run.metrics.hit).length / expected.length,
        falseRecallRate:
          scenarioRuns.reduce((sum, run) => sum + run.metrics.falseRecallRate, 0) /
          scenarioRuns.length,
        hitRate:
          scenarioRuns.filter((run) => run.metrics.hit).length / scenarioRuns.length,
        mrr:
          scenarioRuns.reduce((sum, run) => sum + run.metrics.mrr, 0) /
          scenarioRuns.length,
        scenarios: scenarioRuns.length,
        totalDurationMs: Math.round(performance.now() - startedMs),
        latencyMs: {
          max: latencies.length === 0 ? null : Math.max(...latencies),
          min: latencies.length === 0 ? null : Math.min(...latencies),
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
        },
      },
    };

    const jsonPath = join(outDir, `${args.label}-run.json`);
    const mdPath = join(outDir, `${args.label}-run.md`);
    writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(mdPath, renderReport(record, args.dataset));
    console.log(`scenarios: ${scenarioRuns.length}`);
    console.log(`hit rate: ${(record.summary.hitRate * 100).toFixed(1)}%`);
    console.log(
      `expected-hit rate: ${record.summary.expectedHitRate === null ? "n/a" : `${(record.summary.expectedHitRate * 100).toFixed(1)}%`}`,
    );
    console.log(`wrote ${jsonPath}`);
    console.log(`wrote ${mdPath}`);
  } finally {
    if (sink) await sink.close();
    if (args.keep) {
      console.log(`kept data dir: ${dataDir}`);
      console.log(dirname(dataDir));
    } else {
      rmSync(dataDir, {
        force: true,
        recursive: true,
      });
    }
  }
}

interface RunRecord {
  corpus: {
    memoryCount: number;
    projectBank: string;
    storeFailures: Array<{
      error: string;
      id: string;
    }>;
    storedCount: number;
  };
  dataset: {
    datasetId: string;
    locale: string;
    path: string;
    version: string;
  };
  degradationProbes: DegradationProbe[];
  environment: {
    backendProbes: Array<{
      backend: string;
      ok: boolean;
    }>;
    embeddingMode: string;
    embeddingModel: string;
    embeddingProfile: {
      endpoint: string | null;
      env: string[];
      mode: string;
    };
    label: string;
    node: string;
    platform: string;
  };
  finishedAt: string;
  privacy: {
    contentLeftMachine: boolean;
    embeddingMode: string;
    note: string;
    outboundAttempts: number;
    outboundEndpoint: string | null;
  };
  resources: {
    dataDirBytes: number;
    rssAfterBytes: number;
    rssBeforeBytes: number;
    rssDeltaBytes: number;
  };
  runId: string;
  scenarios: ScenarioRun[];
  startedAt: string;
  summary: {
    byCategory: Array<{
      category: string;
      evidenceCompleteRate: number;
      falseRecallRate: number;
      hitRate: number;
      scenarios: number;
    }>;
    evidenceCompleteRate: number | null;
    expectedHitRate: number | null;
    falseRecallRate: number;
    hitRate: number;
    latencyMs: {
      max: number | null;
      min: number | null;
      p50: number | null;
      p95: number | null;
    };
    mrr: number;
    scenarios: number;
    totalDurationMs: number;
  };
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderReport(record: RunRecord, datasetPath: string): string {
  const lines: string[] = [];
  lines.push(`# T2 baseline 评测报告（自动生成）`);
  lines.push("");
  lines.push(
    "本文件由 `node scripts/t2-eval.ts` 生成，请勿手改；改动场景集或基线后重新生成。",
  );
  lines.push("");
  lines.push("## 1. 运行元数据");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| runId | \`${record.runId}\` |`);
  lines.push(`| 标签 | ${record.environment.label} |`);
  lines.push(
    `| 场景集 | \`${datasetPath}\` v${record.dataset.version}（${record.dataset.locale}）|`,
  );
  lines.push(`| 开始 / 结束 | ${record.startedAt} → ${record.finishedAt} |`);
  lines.push(`| 总耗时 | ${record.summary.totalDurationMs} ms |`);
  lines.push(
    `| 平台 | ${record.environment.platform} / Node ${record.environment.node} |`,
  );
  lines.push(`| embedding 模型 | ${record.environment.embeddingModel} |`);
  lines.push(
    `| embedding 档位 | \`${record.environment.embeddingMode}\`（env: ${record.environment.embeddingProfile.env.join(", ") || "无"}） |`,
  );
  lines.push(
    `| 隐私边界 | outboundEndpoint ${record.privacy.outboundEndpoint ?? "—"} · 外发尝试 ${record.privacy.outboundAttempts} 次 · 内容离开本机：${record.privacy.contentLeftMachine ? "是" : "否"} |`,
  );
  lines.push(
    `| 后端探测 | ${record.environment.backendProbes.map((probe) => `${probe.backend}=${probe.ok ? "available" : "missing"}`).join(" · ")} |`,
  );
  lines.push(
    `| 语料 | ${record.corpus.storedCount}/${record.corpus.memoryCount} 条写入成功，project bank \`${record.corpus.projectBank}\` |`,
  );
  lines.push("");
  lines.push("## 2. 汇总指标");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| 命中率（全部场景） | ${pct(record.summary.hitRate)} |`);
  lines.push(
    `| 命中率（expectation=hit 场景） | ${record.summary.expectedHitRate === null ? "n/a" : pct(record.summary.expectedHitRate)} |`,
  );
  lines.push(`| MRR | ${record.summary.mrr.toFixed(3)} |`);
  lines.push(
    `| 误召回率（top-k 内非相关条目占比） | ${pct(record.summary.falseRecallRate)} |`,
  );
  lines.push(
    `| 证据完整率（kind + prov 可解出，空结果不计入） | ${pct(record.summary.evidenceCompleteRate)} |`,
  );
  lines.push(
    `| 延迟 p50 / p95 / min / max | ${record.summary.latencyMs.p50} / ${record.summary.latencyMs.p95} / ${record.summary.latencyMs.min} / ${record.summary.latencyMs.max} ms |`,
  );
  lines.push(
    `| 资源占用 | RSS 增量 ${mb(record.resources.rssDeltaBytes)}，隔离 data dir ${mb(record.resources.dataDirBytes)} |`,
  );
  lines.push("");
  lines.push("## 3. 分类别");
  lines.push("");
  lines.push("| category | 场景数 | 命中率 | 误召回率 | 证据完整率 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of record.summary.byCategory)
    lines.push(
      `| ${row.category} | ${row.scenarios} | ${pct(row.hitRate)} | ${pct(row.falseRecallRate)} | ${pct(row.evidenceCompleteRate)} |`,
    );
  lines.push("");
  lines.push("## 4. 逐场景记录");
  lines.push("");
  lines.push(
    "| scenario | category | expectation | 命中 | 命中位次 | bridge 位次 | 精度 | 误召回 | 证据完整 | 延迟 | 降级 |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const run of record.scenarios) {
    const m = run.metrics;
    lines.push(
      `| ${run.scenario.id} | ${run.scenario.category} | ${run.scenario.expectation} | ${m.hit ? "✅" : "❌"} | ${
        m.hitRank ?? "—"
      } | ${m.bridgeHitRank ?? "—"} | ${m.precision.toFixed(2)} | ${m.falseRecallCount}/${m.returned} | ${pct(
        m.evidenceCompleteRate,
      )} | ${m.latencyMs} ms | ${
        run.degradation.fallback
          ? `fallback(${run.degradation.fallbackStages.join(",") || "embedding"})`
          : "none"
      } |`,
    );
  }
  lines.push("");
  lines.push("## 5. 未命中场景明细");
  lines.push("");
  const misses = record.scenarios.filter((run) => !run.metrics.hit);
  if (misses.length === 0) lines.push("无：全部场景都在 top-k 内命中标准答案。");
  for (const run of misses) {
    lines.push(
      `### ${run.scenario.id}（${run.scenario.category}, expectation=${run.scenario.expectation}）`,
    );
    lines.push("");
    lines.push(`- query: \`${run.scenario.query}\``);
    lines.push(
      `- 标准答案: ${run.scenario.answer}（groundTruth: ${run.scenario.groundTruth.join(", ")}；bridge: ${run.scenario.bridge.join(", ") || "无"}）`,
    );
    lines.push("- 实际返回:");
    if (run.results.length === 0) lines.push("  - （空）");
    for (const result of run.results)
      lines.push(
        `  - #${result.datasetRank} ${result.datasetId ?? "?"} score=${result.score.toFixed(3)} · ${truncate(result.content)}`,
      );
    lines.push("");
  }
  lines.push("## 6. 降级结果记录");
  lines.push("");
  lines.push(
    "用途：验证降级结果可被机器记录（格式定义见 `result-format.md`）。`expectedWarning` 引用 `src/search/selector.ts` 的固定文案，非本 runner 实测输出。",
  );
  lines.push("");
  lines.push("| probe | backendName | observed | resultCount | expectedWarning |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const probe of record.degradationProbes)
    lines.push(
      `| ${probe.label} | ${probe.backendName ?? "null"} | ${probe.observed} | ${probe.resultCount} | ${probe.expectedWarning ?? "—"} |`,
    );
  if (record.corpus.storeFailures.length > 0) {
    lines.push("");
    lines.push("### 语料写入失败");
    lines.push("");
    for (const failure of record.corpus.storeFailures)
      lines.push(`- ${failure.id}: ${failure.error}`);
  }
  lines.push("");
  lines.push("## 7. 原始记录");
  lines.push("");
  lines.push(
    `同目录 \`${record.environment.label}-run.json\` 保存全部原始字段（逐场景 attempts、命中位次、分项指标），供结果比对与回放。`,
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

await main();
