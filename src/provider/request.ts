import * as vscode from "vscode";
import { resolveMaxOutputTokens } from "../models/catalog";
import type { ReasoningEffort } from "../models/options";
import { trimChatHistoryToFit } from "../kit/history-trim";
import { applyEffortIfSupported } from "./effort";
import { convertChatMessages } from "../kit/messages";

export function buildRequest(
  model: string,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  reasoningEffort: ReasoningEffort | undefined,
  advertisedMaxTokens: number,
  configuredMaxTokens: number,
  imageInput: boolean,
  supportsReasoningEffort: boolean,
  contextCapTokens?: number,
): Record<string, unknown> {
  const maxTokens = resolveMaxOutputTokens(configuredMaxTokens, advertisedMaxTokens);
  const convertedMessages = convertChatMessages(messages, vscode, { label: "Orvix", imageInput });
  const requestMessages = contextCapTokens === undefined
    ? convertedMessages
    : [...trimChatHistoryToFit(convertedMessages, contextCapTokens).items];
  const tools = (options.tools ?? []).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: sanitizeSchema(tool.inputSchema),
    },
  }));
  const body = {
    model,
    messages: requestMessages,
    stream: true,
    max_tokens: maxTokens,
    ...(tools.length
      ? {
          tools,
          tool_choice: toolMode(options.toolMode),
          parallel_tool_calls: true,
        }
      : {}),
  };
  return applyEffortIfSupported(body, reasoningEffort, supportsReasoningEffort);
}

function sanitizeSchema(schema: unknown): Record<string, unknown> {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? (schema as Record<string, unknown>)
    : { type: "object", properties: {} };
}

function toolMode(mode: vscode.LanguageModelChatToolMode | undefined): "auto" | "required" {
  return mode === vscode.LanguageModelChatToolMode.Required ? "required" : "auto";
}
