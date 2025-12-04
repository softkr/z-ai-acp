#!/usr/bin/env node

// Load managed settings and apply environment variables
import { loadManagedSettings, applyEnvironmentSettings, ensureApiKey, clearApiKey } from "./utils.js";
import { runAcp } from "./acp-agent.js";

const managedSettings = loadManagedSettings();
if (managedSettings) {
  applyEnvironmentSettings(managedSettings);
}

// stdout is used to send messages to the client
// we redirect everything else to stderr to make sure it doesn't interfere with ACP
console.log = console.error;
console.info = console.error;
console.warn = console.error;
console.debug = console.error;

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Wrap top-level await in async IIFE for CommonJS compatibility
(async () => {
  // Check for --clear-key flag
  if (process.argv.includes("--clear-key")) {
    clearApiKey();
    console.log("✓ API 키가 삭제되었습니다.");
    process.exit(0);
  }

  // Check for --setup flag
  if (process.argv.includes("--setup")) {
    await ensureApiKey();
    console.log("✓ 설정이 완료되었습니다. 이제 Zed에서 Z AI Agent를 사용할 수 있습니다.");
    process.exit(0);
  }

  // In ACP mode (Zed extension), skip interactive prompts
  // API key will be checked when creating a new session
  // If missing, ACP will return authRequired error to the client
  const isAcpMode = process.argv.includes("--acp");

  if (!isAcpMode) {
    // Only prompt for API key in interactive/standalone mode
    await ensureApiKey();
  }

  runAcp();

  // Keep process alive
  process.stdin.resume();
})().catch((error) => {
  console.error("Fatal error during startup:", error);
  process.exit(1);
});
