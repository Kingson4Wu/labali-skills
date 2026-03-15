import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { type ExecutorContext, type PublishEpisodeInputs, type PromptFn } from "./core";
import { executeDeterministic } from "./deterministic";
import { execute as executePolicy } from "./executor";

interface AutoExecutorContext extends ExecutorContext {
  preferDeterministic?: boolean;
}

interface FallbackRecord {
  timestamp: string;
  title: string;
  deterministic_attempted: boolean;
  deterministic_success: boolean;
  deterministic_error?: string;
  final_mode: "deterministic" | "policy";
  final_status: "published" | "scheduled";
  final_url: string;
}

async function appendFallbackRecord(record: FallbackRecord): Promise<void> {
  const dir = resolve(".cache/spotify-publish");
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(resolve(dir, "deterministic-policy-fallback-history.jsonl"), line, "utf8");
}

/**
 * Prompt user to optimize deterministic mode based on policy success
 */
async function promptOptimizationSuggestion(
  deterministicError: string,
  prompt: PromptFn | undefined
): Promise<void> {
  if (!prompt) {
    console.log(`[spotify-publish-auto] [optimization] Policy executor succeeded while deterministic failed.`);
    console.log(`[spotify-publish-auto] [optimization] Error was: ${deterministicError}`);
    console.log(`[spotify-publish-auto] [optimization] Consider reviewing deterministic.ts to incorporate successful policy patterns.`);
    return;
  }

  const message = `📊 **Deterministic 模式优化建议**

本次任务通过 **Policy Executor** 成功完成，但 **Deterministic 模式** 失败了：

**失败原因：** ${deterministicError}

**建议操作：**
1. 查看 policy executor 的成功执行日志，了解关键步骤
2. 将 policy 的成功模式固化到 deterministic.ts 中
3. 更新 deterministic 的验证逻辑和 fallback 策略

是否现在尝试根据本次成功经验修复 deterministic 模式？

**选项：**
- **是**：我将分析 policy 执行日志并提出修复建议
- **否**：跳过本次优化，保持当前状态
- **稍后**：记录本次失败，批量优化时再处理`;

  try {
    const response = await prompt(message);
    const normalized = (response || "").trim().toLowerCase();
    
    if (normalized === "是" || normalized === "yes" || normalized === "y" || normalized === "1") {
      console.log(`[spotify-publish-auto] [optimization] 用户同意优化 deterministic 模式。正在分析 policy 执行模式...`);
      // In a full implementation, this would trigger an analysis tool
      // For now, log guidance for manual optimization
      console.log(`[spotify-publish-auto] [optimization] 请查看以下文件获取 policy 成功模式：`);
      console.log(`  - scripts/executor.ts (policy executor 主逻辑)`);
      console.log(`  - scripts/publisher.ts (发布和调度逻辑)`);
      console.log(`[spotify-publish-auto] [optimization] 对比 deterministic.ts 找出差异并修复。`);
    } else if (normalized === "稍后" || normalized === "later") {
      console.log(`[spotify-publish-auto] [optimization] 已记录本次失败，将在批量优化时处理。`);
    } else {
      console.log(`[spotify-publish-auto] [optimization] 已跳过本次优化。`);
    }
  } catch (promptError) {
    console.log(`[spotify-publish-auto] [optimization] 无法获取用户响应：${promptError}`);
  }
}

export async function execute(
  inputs: PublishEpisodeInputs,
  context: AutoExecutorContext = {}
): Promise<{ status: "published" | "scheduled"; show: string; url: string }> {
  const log = context.logger ?? ((msg: string) => console.log(`[spotify-publish-auto] ${msg}`));
  const disableDeterministicCache = inputs.disable_deterministic_cache ?? false;
  const preferDeterministic = context.preferDeterministic ?? !disableDeterministicCache;

  let deterministicAttempted = false;
  let deterministicSuccess = false;
  let deterministicError: string | undefined;

  if (preferDeterministic) {
    deterministicAttempted = true;
    try {
      log("Deterministic trajectory cache attempt");
      const deterministicResult = await executeDeterministic(inputs, {
        logger: (msg) => log(`[deterministic] ${msg}`),
        prompt: context.prompt,
      });
      deterministicSuccess = true;
      await appendFallbackRecord({
        timestamp: new Date().toISOString(),
        title: inputs.title,
        deterministic_attempted: deterministicAttempted,
        deterministic_success: deterministicSuccess,
        final_mode: "deterministic",
        final_status: deterministicResult.status,
        final_url: deterministicResult.url,
      });
      return deterministicResult;
    } catch (error) {
      deterministicError = error instanceof Error ? error.message : String(error);
      log(`Deterministic trajectory cache failed, downgrade to policy executor: ${deterministicError}`);
    }
  }

  log("Policy executor running as reliability baseline");
  const d2Result = await executePolicy(inputs, {
    logger: (msg) => log(`[policy] ${msg}`),
    prompt: context.prompt,
  });

  await appendFallbackRecord({
    timestamp: new Date().toISOString(),
    title: inputs.title,
    deterministic_attempted: deterministicAttempted,
    deterministic_success: deterministicSuccess,
    deterministic_error: deterministicError,
    final_mode: "policy",
    final_status: d2Result.status,
    final_url: d2Result.url,
  });

  // If deterministic failed but policy succeeded, suggest optimization
  if (deterministicAttempted && !deterministicSuccess && deterministicError) {
    await promptOptimizationSuggestion(deterministicError, context.prompt);
  }

  return d2Result;
}

export default execute;
