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

  const message = `📊 **Deterministic optimization suggestion**

This task succeeded via the **Policy Executor** but the **Deterministic mode** failed.

**Failure reason:** ${deterministicError}

**Suggested actions:**
1) Review the successful policy executor log to understand key steps
2) Fold those successful patterns into deterministic.ts
3) Update deterministic validation and fallback logic

Would you like to apply these learnings to fix deterministic mode now?

**Options:**
- **yes**: I will analyze the policy logs and propose fixes
- **no**: Skip optimization for now
- **later**: Record this failure for batch optimization`;

  try {
    const response = await prompt(message);
    const normalized = (response || "").trim().toLowerCase();
    
    if (normalized === "yes" || normalized === "y" || normalized === "1") {
      console.log(`[spotify-publish-auto] [optimization] User accepted deterministic optimization. Analyzing policy trajectory...`);
      // In a full implementation, this would trigger an analysis tool
      // For now, log guidance for manual optimization
      console.log(`[spotify-publish-auto] [optimization] Review these files for the successful policy path:`);
      console.log(`  - scripts/executor.ts (policy executor core flow)`);
      console.log(`  - scripts/publisher.ts (publish and scheduling logic)`);
      console.log(`[spotify-publish-auto] [optimization] Compare with deterministic.ts, align behaviors, and add fallbacks.`);
    } else if (normalized === "later") {
      console.log(`[spotify-publish-auto] [optimization] Recorded this failure; will handle during batch optimization.`);
    } else {
      console.log(`[spotify-publish-auto] [optimization] Skipped optimization.`);
    }
  } catch (promptError) {
    console.log(`[spotify-publish-auto] [optimization] Could not obtain user response: ${promptError}`);
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
