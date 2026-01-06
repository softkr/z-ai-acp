/**
 * Prompt Analyzer - Analyzes prompt complexity and task type
 * to determine optimal model and thinking configuration
 */

export type TaskComplexity = "simple" | "medium" | "complex";
export type TaskType =
  | "question"
  | "explanation"
  | "code_generation"
  | "refactoring"
  | "debugging"
  | "architecture"
  | "review";

export interface PromptAnalysis {
  complexity: TaskComplexity;
  taskType: TaskType;
  suggestedModel: "glm-4.7" | "glm-4.5-air";
  suggestedThinkingEffort: "low" | "medium" | "high";
  suggestedMaxThinkingTokens: number;
  reasoning: string;
}

// Keywords indicating complex tasks
const COMPLEX_KEYWORDS = [
  "refactor",
  "architecture",
  "design",
  "implement",
  "build",
  "create system",
  "optimize",
  "performance",
  "security",
  "algorithm",
  "複雑", // Japanese: complex
  "アーキテクチャ", // Japanese: architecture
  "리팩토링", // Korean: refactoring
  "아키텍처", // Korean: architecture
  "설계", // Korean: design
  "구현", // Korean: implement
];

// Keywords indicating simple tasks
const SIMPLE_KEYWORDS = [
  "what is",
  "how to",
  "explain",
  "show me",
  "list",
  "find",
  "search",
  "read",
  "view",
  "display",
  "무엇", // Korean: what
  "어떻게", // Korean: how
  "설명", // Korean: explain
  "보여", // Korean: show
];

// Keywords for specific task types
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  question: ["what", "why", "how", "when", "where", "무엇", "왜", "어떻게"],
  explanation: ["explain", "describe", "tell me about", "설명", "알려"],
  code_generation: ["create", "generate", "write", "implement", "add", "생성", "작성", "추가"],
  refactoring: ["refactor", "improve", "optimize", "clean up", "리팩토링", "개선", "최적화"],
  debugging: ["fix", "bug", "error", "debug", "issue", "problem", "수정", "버그", "에러"],
  architecture: ["architecture", "design", "structure", "pattern", "아키텍처", "설계", "구조"],
  review: ["review", "check", "analyze", "audit", "검토", "분석", "확인"],
};

// Code block patterns
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const FILE_PATH_PATTERN = /(?:\/[\w-]+)+\.[\w]+/g;

/**
 * Analyze prompt to determine complexity and optimal configuration
 */
export function analyzePrompt(promptText: string): PromptAnalysis {
  const lowerText = promptText.toLowerCase();
  const lines = promptText.split("\n");
  const lineCount = lines.length;
  const wordCount = promptText.split(/\s+/).length;
  const codeBlocks = promptText.match(CODE_BLOCK_PATTERN) || [];
  const filePaths = promptText.match(FILE_PATH_PATTERN) || [];

  // Determine task type
  let taskType: TaskType = "question";
  let maxScore = 0;
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    const score = keywords.filter((kw) => lowerText.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      taskType = type as TaskType;
    }
  }

  // Calculate complexity score
  let complexityScore = 0;

  // 1. Prompt length
  if (wordCount > 200) complexityScore += 3;
  else if (wordCount > 100) complexityScore += 2;
  else if (wordCount > 50) complexityScore += 1;

  // 2. Line count
  if (lineCount > 50) complexityScore += 2;
  else if (lineCount > 20) complexityScore += 1;

  // 3. Code blocks
  complexityScore += Math.min(codeBlocks.length * 2, 6);

  // 4. File references
  complexityScore += Math.min(filePaths.length, 3);

  // 5. Complex keywords
  const complexKeywordCount = COMPLEX_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
  complexityScore += complexKeywordCount * 2;

  // 6. Simple keywords (negative score)
  const simpleKeywordCount = SIMPLE_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
  complexityScore -= simpleKeywordCount;

  // 7. Task type based scoring
  if (["architecture", "refactoring", "code_generation"].includes(taskType)) {
    complexityScore += 3;
  } else if (["debugging", "review"].includes(taskType)) {
    complexityScore += 2;
  }

  // Normalize to complexity level
  let complexity: TaskComplexity;
  if (complexityScore >= 8) {
    complexity = "complex";
  } else if (complexityScore >= 3) {
    complexity = "medium";
  } else {
    complexity = "simple";
  }

  // Determine model and thinking configuration
  let suggestedModel: "glm-4.7" | "glm-4.5-air";
  let suggestedThinkingEffort: "low" | "medium" | "high";
  let suggestedMaxThinkingTokens: number;

  if (complexity === "complex") {
    suggestedModel = "glm-4.7";
    suggestedThinkingEffort = "high";
    suggestedMaxThinkingTokens = 20000;
  } else if (complexity === "medium") {
    suggestedModel = "glm-4.7";
    suggestedThinkingEffort = "medium";
    suggestedMaxThinkingTokens = 15000;
  } else {
    // Simple tasks
    if (taskType === "question" || taskType === "explanation") {
      suggestedModel = "glm-4.5-air";
      suggestedThinkingEffort = "low";
      suggestedMaxThinkingTokens = 10000;
    } else {
      // Simple code tasks still use 4.7 but with low thinking
      suggestedModel = "glm-4.7";
      suggestedThinkingEffort = "low";
      suggestedMaxThinkingTokens = 10000;
    }
  }

  const reasoning = `Complexity: ${complexity} (score: ${complexityScore}), Task: ${taskType}, Words: ${wordCount}, Lines: ${lineCount}, Code blocks: ${codeBlocks.length}`;

  return {
    complexity,
    taskType,
    suggestedModel,
    suggestedThinkingEffort,
    suggestedMaxThinkingTokens,
    reasoning,
  };
}

/**
 * Calculate thinking token budget based on effort level and max tokens
 */
export function calculateThinkingTokens(
  effort: "low" | "medium" | "high",
  maxTokens: number,
): number {
  const multipliers = {
    low: 0.5,
    medium: 1.0,
    high: 1.5,
  };
  return Math.floor(maxTokens * multipliers[effort]);
}

/**
 * Map Claude model name to Z.AI GLM model
 */
export function mapModelToGlm(claudeModel: string): string {
  const modelMapping: Record<string, string> = {
    "claude-4.5-sonnet-20250114": "glm-4.7",
    "claude-4-haiku-20250114": "glm-4.5-air",
    "claude-4-opus-20250114": "glm-4.7",
    "claude-3-5-sonnet-20241022": "glm-4.7",
    "claude-3-5-haiku-20241022": "glm-4.5-air",
    "claude-3-opus-20240229": "glm-4.7",
  };

  return modelMapping[claudeModel] || claudeModel;
}

/**
 * Get Claude model name from GLM model name
 */
export function getClaudeModelFromGlm(glmModel: "glm-4.7" | "glm-4.5-air"): string {
  if (glmModel === "glm-4.5-air") {
    return "claude-4-haiku-20250114";
  }
  return "claude-4-opus-20250114";
}
