import * as vscode from "vscode";

export interface ApiMessage {
  role: "user" | "assistant" | "tool";
  content: string | ApiContentPart[] | null;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
}

interface ApiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}
interface ApiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  imageInput: boolean,
): ApiMessage[] {
  const converted = messages.flatMap((message) => convertMessage(message, imageInput));
  const filtered = converted.filter((message) =>
    Boolean(message.tool_calls?.length || message.tool_call_id || message.content),
  );
  if (filtered[0]?.role === "assistant")
    filtered.unshift({
      role: "user",
      content: "Continue from the previous assistant response.",
    });
  return filtered.length ? filtered : [{ role: "user", content: "" }];
}

export function messageToText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content.map(inputPartText).join("\n");
}

function convertMessage(message: vscode.LanguageModelChatRequestMessage, imageInput: boolean): ApiMessage[] {
  const role = message.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user";
  const text: string[] = [];
  const images: ApiContentPart[] = [];
  const toolCalls: ApiToolCall[] = [];
  const results: ApiMessage[] = [];
  const inlineToolImages: ApiContentPart[][] = [];
  for (const part of message.content) {
    if (part instanceof vscode.LanguageModelTextPart) text.push(part.value);
    else if (part instanceof vscode.LanguageModelToolCallPart)
      toolCalls.push({
        id: part.callId,
        type: "function",
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input ?? {}),
        },
      });
    else if (part instanceof vscode.LanguageModelToolResultPart) {
      const resultText: string[] = [];
      const resultImages: ApiContentPart[] = [];
      for (const resultPart of part.content) {
        if (resultPart instanceof vscode.LanguageModelTextPart) resultText.push(resultPart.value);
        else if (
          resultPart instanceof vscode.LanguageModelDataPart
          && resultPart.mimeType.startsWith("image/")
        ) {
          // Tool-result images (e.g. from the image-generation tool) flow to
          // vision-capable models so they can iterate on their own output;
          // non-vision models degrade them to a placeholder below.
          if (imageInput) {
            resultImages.push({
              type: "image_url",
              image_url: {
                url: `data:${resultPart.mimeType};base64,${Buffer.from(resultPart.data).toString("base64")}`,
              },
            });
          } else {
            resultText.push(`[${resultPart.mimeType} data omitted]`);
          }
        } else if (typeof resultPart === "string") resultText.push(resultPart);
      }
      if (resultImages.length) inlineToolImages.push(resultImages);
      results.push({
        role: "tool",
        tool_call_id: part.callId,
        content: resultText.join("\n"),
      });
    }
    else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/")) {
      if (!imageInput) throw new Error("The selected Orvix model does not advertise image input support.");
      images.push({
        type: "image_url",
        image_url: {
          url: `data:${part.mimeType};base64,${Buffer.from(part.data).toString("base64")}`,
        },
      });
    }
  }
  const plainText = text.join("\n");
  const content: string | ApiContentPart[] = images.length
    ? [...(plainText ? [{ type: "text" as const, text: plainText }] : []), ...images]
    : plainText;
  if (role === "assistant" && toolCalls.length) return [{ role, content: content || null, tool_calls: toolCalls }];
  if (results.length) {
    const messages: ApiMessage[] = content ? [{ role, content }, ...results] : [...results];
    // Vision models get tool-result images re-attached as a trailing user
    // message, mirroring the OpenAI-compatible pattern of image-carrying tool
    // results; non-vision requests keep the placeholder text only (inline
    // images are only collected when `imageInput` is true).
    if (imageInput && inlineToolImages.length) {
      messages.push({ role: "user", content: inlineToolImages.flat() });
    }
    return messages;
  }
  return [{ role, content }];
}

function inputPartText(part: vscode.LanguageModelInputPart | unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) return part.value;
  if (part instanceof vscode.LanguageModelToolCallPart) return JSON.stringify(part.input ?? {});
  if (part instanceof vscode.LanguageModelToolResultPart) return part.content.map(inputPartText).join("\n");
  if (part instanceof vscode.LanguageModelDataPart) return `[${part.mimeType} data omitted]`;
  return typeof part === "string" ? part : "";
}
