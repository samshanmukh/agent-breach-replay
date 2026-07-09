import {
  MimeType,
  OpenInferenceSpanKind,
  SemanticConventions as SC,
} from "./semantics";
import type {
  AgentSpanData,
  AgentTraceSpan,
  CustomSpanData,
  FunctionSpanData,
  GenerationSpanData,
  HandoffSpanData,
  MCPListToolsSpanData,
  ResponseSpanData,
  SpanData,
} from "./types";
import { isNumber, isRecord, isString, safelyJSONStringify } from "./utils";

type GenerationUsageData = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cache_read?: number };
  output_tokens_details?: { reasoning?: number };
};

export type LiftedIO = {
  input?: string;
  inputMimeType?: MimeType;
  output?: string;
  outputMimeType?: MimeType;
};

const RESPONSE_NON_INVOCATION_PARAM_KEYS = new Set([
  "instructions",
  "object",
  "output_text",
  "tools",
  "usage",
  "output",
  "error",
  "status",
]);

export function getSpanName(span: AgentTraceSpan): string {
  const data = span.spanData;
  if ("name" in data && isString(data.name)) return data.name;
  if (data.type === "handoff" && isString(data.to_agent)) {
    return `handoff to ${data.to_agent}`;
  }
  return data.type;
}

export function getSpanKind(data: SpanData): OpenInferenceSpanKind {
  switch (data.type) {
    case "agent":
      return OpenInferenceSpanKind.AGENT;
    case "generation":
    case "response":
      return OpenInferenceSpanKind.LLM;
    case "function":
    case "handoff":
    case "mcp_tools":
      return OpenInferenceSpanKind.TOOL;
    case "guardrail":
      return OpenInferenceSpanKind.GUARDRAIL;
    default:
      return OpenInferenceSpanKind.CHAIN;
  }
}

function assignToolCallAttributes(
  attributes: Record<string, string | number | boolean>,
  toolCallPrefix: string,
  toolCall: Record<string, unknown>,
) {
  if (isString(toolCall.id)) {
    attributes[`${toolCallPrefix}.${SC.TOOL_CALL_ID}`] = toolCall.id;
  }
  if (!isRecord(toolCall.function)) return;
  if (isString(toolCall.function.name)) {
    attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_NAME}`] =
      toolCall.function.name;
  }
  if (isString(toolCall.function.arguments)) {
    attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`] =
      toolCall.function.arguments;
  }
}

function isMessageTextPart(
  part: Record<string, unknown>,
): part is Record<string, unknown> & { text: string } {
  return (
    (part.type === "text" || part.type === "input_text") && isString(part.text)
  );
}

export function extractMessageList(
  messages: ReadonlyArray<Record<string, unknown>>,
  prefix: string,
  startIndex = 0,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!isRecord(message)) continue;
    const messagePrefix = `${prefix}.${startIndex + messageIndex}`;

    if (message.type === "function_call") {
      attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = "assistant";
      const toolCallPrefix = `${messagePrefix}.${SC.MESSAGE_TOOL_CALLS}.0`;
      const callId = isString(message.callId)
        ? message.callId
        : message.call_id;
      if (isString(callId)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_ID}`] = callId;
      }
      if (isString(message.name)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_NAME}`] =
          message.name;
      }
      if (isString(message.arguments)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`] =
          message.arguments;
      }
      continue;
    }

    if (message.type === "function_call_result") {
      attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = "tool";
      const callId = isString(message.callId)
        ? message.callId
        : message.call_id;
      if (isString(callId)) {
        attributes[`${messagePrefix}.${SC.MESSAGE_TOOL_CALL_ID}`] = callId;
      }
      if (isRecord(message.output) && isString(message.output.text)) {
        attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] = message.output.text;
      } else if (isString(message.output)) {
        attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] = message.output;
      } else if (message.output != null) {
        attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] =
          safelyJSONStringify(message.output) ?? String(message.output);
      }
      continue;
    }

    if (isString(message.role)) {
      attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = message.role;
    }

    const content = message.content;
    if (isString(content)) {
      attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] = content;
    } else if (Array.isArray(content)) {
      for (let partIndex = 0; partIndex < content.length; partIndex++) {
        const part = content[partIndex];
        if (!isRecord(part)) continue;
        const partPrefix = `${messagePrefix}.${SC.MESSAGE_CONTENTS}.${partIndex}`;
        if (isMessageTextPart(part)) {
          attributes[`${partPrefix}.${SC.MESSAGE_CONTENT_TYPE}`] = "text";
          attributes[`${partPrefix}.${SC.MESSAGE_CONTENT_TEXT}`] = part.text;
        }
      }
    }

    if (isString(message.tool_call_id)) {
      attributes[`${messagePrefix}.${SC.MESSAGE_TOOL_CALL_ID}`] =
        message.tool_call_id;
    }

    if (Array.isArray(message.tool_calls)) {
      let toolCallIndex = 0;
      for (const toolCall of message.tool_calls) {
        if (!isRecord(toolCall)) continue;
        assignToolCallAttributes(
          attributes,
          `${messagePrefix}.${SC.MESSAGE_TOOL_CALLS}.${toolCallIndex}`,
          toolCall,
        );
        toolCallIndex++;
      }
    }
  }

  return attributes;
}

function getGenerationUsageAttributes(usage: GenerationUsageData) {
  const attributes: Record<string, string | number | boolean> = {};
  if (isNumber(usage.input_tokens)) {
    attributes[SC.LLM_TOKEN_COUNT_PROMPT] = usage.input_tokens;
  }
  if (isNumber(usage.output_tokens)) {
    attributes[SC.LLM_TOKEN_COUNT_COMPLETION] = usage.output_tokens;
  }
  if (isNumber(usage.total_tokens)) {
    attributes[SC.LLM_TOKEN_COUNT_TOTAL] = usage.total_tokens;
  }
  if (isNumber(usage.input_tokens_details?.cache_read)) {
    attributes[SC.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ] =
      usage.input_tokens_details.cache_read;
  }
  if (isNumber(usage.output_tokens_details?.reasoning)) {
    attributes[SC.LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING] =
      usage.output_tokens_details.reasoning;
  }
  return attributes;
}

export function extractFromChatCompletionResponses(
  responses: ReadonlyArray<Record<string, unknown>>,
) {
  const attributes: Record<string, string | number | boolean> = {};
  let messageIndex = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalCacheReadTokens = 0;
  let totalReasoningTokens = 0;
  let hasPromptTokens = false;
  let hasCompletionTokens = false;
  let hasCacheReadTokens = false;
  let hasReasoningTokens = false;
  let hasTotalTokens = false;

  for (const response of responses) {
    if (!isRecord(response)) continue;
    if (isRecord(response.usage)) {
      const usage = response.usage;
      const promptTokens = isNumber(usage.prompt_tokens)
        ? usage.prompt_tokens
        : undefined;
      const completionTokens = isNumber(usage.completion_tokens)
        ? usage.completion_tokens
        : undefined;
      if (promptTokens !== undefined) {
        totalPromptTokens += promptTokens;
        hasPromptTokens = true;
      }
      if (completionTokens !== undefined) {
        totalCompletionTokens += completionTokens;
        hasCompletionTokens = true;
      }
      if (isNumber(usage.total_tokens)) {
        totalTokens += usage.total_tokens;
        hasTotalTokens = true;
      } else if (promptTokens !== undefined || completionTokens !== undefined) {
        totalTokens += (promptTokens ?? 0) + (completionTokens ?? 0);
        hasTotalTokens = true;
      }
      if (isRecord(usage.prompt_tokens_details)) {
        const cached = usage.prompt_tokens_details.cached_tokens;
        if (isNumber(cached)) {
          totalCacheReadTokens += cached;
          hasCacheReadTokens = true;
        }
      }
      if (isRecord(usage.completion_tokens_details)) {
        const reasoning = usage.completion_tokens_details.reasoning_tokens;
        if (isNumber(reasoning)) {
          totalReasoningTokens += reasoning;
          hasReasoningTokens = true;
        }
      }
    }

    if (Array.isArray(response.choices)) {
      for (const choice of response.choices) {
        if (!isRecord(choice) || !isRecord(choice.message)) continue;
        const message = choice.message;
        const messagePrefix = `${SC.LLM_OUTPUT_MESSAGES}.${messageIndex}`;
        if (isString(message.role)) {
          attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = message.role;
        }
        if (isString(message.content)) {
          attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] = message.content;
        }
        messageIndex++;
      }
    }
  }

  if (hasPromptTokens) attributes[SC.LLM_TOKEN_COUNT_PROMPT] = totalPromptTokens;
  if (hasCompletionTokens) {
    attributes[SC.LLM_TOKEN_COUNT_COMPLETION] = totalCompletionTokens;
  }
  if (hasTotalTokens) attributes[SC.LLM_TOKEN_COUNT_TOTAL] = totalTokens;
  if (hasCacheReadTokens) {
    attributes[SC.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ] =
      totalCacheReadTokens;
  }
  if (hasReasoningTokens) {
    attributes[SC.LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING] =
      totalReasoningTokens;
  }

  return attributes;
}

export function getGenerationAttributes(data: GenerationSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  if (isString(data.model)) attributes[SC.LLM_MODEL_NAME] = data.model;

  if (isRecord(data.model_config)) {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data.model_config)) {
      if (value != null) filtered[key] = value;
    }
    if (Object.keys(filtered).length > 0) {
      attributes[SC.LLM_INVOCATION_PARAMETERS] =
        safelyJSONStringify(filtered) ?? "";
    }
  }

  if (Array.isArray(data.input) && data.input.length > 0) {
    const inputJson = safelyJSONStringify(data.input);
    if (inputJson) {
      attributes[SC.INPUT_VALUE] = inputJson;
      attributes[SC.INPUT_MIME_TYPE] = MimeType.JSON;
    }
    Object.assign(
      attributes,
      extractMessageList(data.input, SC.LLM_INPUT_MESSAGES),
    );
  }

  if (Array.isArray(data.output) && data.output.length > 0) {
    const outputJson = safelyJSONStringify(data.output);
    if (outputJson) {
      attributes[SC.OUTPUT_VALUE] = outputJson;
      attributes[SC.OUTPUT_MIME_TYPE] = MimeType.JSON;
    }
    const firstOutputItem = data.output[0];
    if (isRecord(firstOutputItem) && firstOutputItem.choices !== undefined) {
      Object.assign(
        attributes,
        extractFromChatCompletionResponses(data.output),
      );
    } else {
      Object.assign(
        attributes,
        extractMessageList(data.output, SC.LLM_OUTPUT_MESSAGES),
      );
    }
  }

  if (data.usage) {
    Object.assign(attributes, getGenerationUsageAttributes(data.usage));
  }

  return attributes;
}

function extractResponseOutput(output: ReadonlyArray<Record<string, unknown>>) {
  const attributes: Record<string, string | number | boolean> = {};
  let messageIndex = 0;
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      const messagePrefix = `${SC.LLM_OUTPUT_MESSAGES}.${messageIndex}`;
      attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = "assistant";
      const texts: string[] = [];
      for (const part of item.content) {
        if (
          isRecord(part) &&
          (part.type === "output_text" || part.type === "text") &&
          isString(part.text)
        ) {
          texts.push(part.text);
        }
      }
      if (texts.length > 0) {
        attributes[`${messagePrefix}.${SC.MESSAGE_CONTENT}`] = texts.join("");
      }
      messageIndex++;
    }
    if (item.type === "function_call") {
      const messagePrefix = `${SC.LLM_OUTPUT_MESSAGES}.${messageIndex}`;
      attributes[`${messagePrefix}.${SC.MESSAGE_ROLE}`] = "assistant";
      const toolCallPrefix = `${messagePrefix}.${SC.MESSAGE_TOOL_CALLS}.0`;
      if (isString(item.call_id)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_ID}`] = item.call_id;
      }
      if (isString(item.name)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_NAME}`] = item.name;
      }
      if (isString(item.arguments)) {
        attributes[`${toolCallPrefix}.${SC.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`] =
          item.arguments;
      }
      messageIndex++;
    }
  }
  return attributes;
}

export function getResponseAttributes(data: ResponseSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  attributes[SC.LLM_PROVIDER] = "openai";

  const hasSystemInstruction =
    isRecord(data._response) && isString(data._response.instructions);

  if (isString(data._input)) {
    attributes[SC.INPUT_VALUE] = data._input;
    attributes[SC.INPUT_MIME_TYPE] = MimeType.TEXT;
  } else if (Array.isArray(data._input)) {
    const inputJson = safelyJSONStringify(data._input);
    if (inputJson) {
      attributes[SC.INPUT_VALUE] = inputJson;
      attributes[SC.INPUT_MIME_TYPE] = MimeType.JSON;
    }
    Object.assign(
      attributes,
      extractMessageList(
        data._input,
        SC.LLM_INPUT_MESSAGES,
        hasSystemInstruction ? 1 : 0,
      ),
    );
  }

  if (!isRecord(data._response)) return attributes;
  const response = data._response;
  const responseJson = safelyJSONStringify(response);
  if (responseJson) {
    attributes[SC.OUTPUT_VALUE] = responseJson;
    attributes[SC.OUTPUT_MIME_TYPE] = MimeType.JSON;
  }
  if (isString(response.model)) attributes[SC.LLM_MODEL_NAME] = response.model;

  const invocationParameters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response)) {
    if (value == null || RESPONSE_NON_INVOCATION_PARAM_KEYS.has(key)) continue;
    invocationParameters[key] = value;
  }
  if (Object.keys(invocationParameters).length > 0) {
    attributes[SC.LLM_INVOCATION_PARAMETERS] =
      safelyJSONStringify(invocationParameters) ?? "";
  }

  if (isRecord(response.usage)) {
    const usage = response.usage;
    if (isNumber(usage.input_tokens)) {
      attributes[SC.LLM_TOKEN_COUNT_PROMPT] = usage.input_tokens;
    }
    if (isNumber(usage.output_tokens)) {
      attributes[SC.LLM_TOKEN_COUNT_COMPLETION] = usage.output_tokens;
    }
    if (isNumber(usage.total_tokens)) {
      attributes[SC.LLM_TOKEN_COUNT_TOTAL] = usage.total_tokens;
    }
    if (
      isRecord(usage.input_tokens_details) &&
      isNumber(usage.input_tokens_details.cached_tokens)
    ) {
      attributes[SC.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ] =
        usage.input_tokens_details.cached_tokens;
    }
    if (
      isRecord(usage.output_tokens_details) &&
      isNumber(usage.output_tokens_details.reasoning_tokens)
    ) {
      attributes[SC.LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING] =
        usage.output_tokens_details.reasoning_tokens;
    }
  }

  if (Array.isArray(response.tools)) {
    for (let toolIndex = 0; toolIndex < response.tools.length; toolIndex++) {
      const tool = response.tools[toolIndex];
      if (!isRecord(tool) || tool.type !== "function") continue;
      const schema = safelyJSONStringify({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: tool.strict,
        },
      });
      if (schema) {
        attributes[`${SC.LLM_TOOLS}.${toolIndex}.${SC.TOOL_JSON_SCHEMA}`] =
          schema;
      }
    }
  }

  if (Array.isArray(response.output)) {
    Object.assign(attributes, extractResponseOutput(response.output));
  }

  if (isString(response.instructions) && response.instructions.length > 0) {
    attributes[`${SC.LLM_INPUT_MESSAGES}.0.${SC.MESSAGE_ROLE}`] = "system";
    attributes[`${SC.LLM_INPUT_MESSAGES}.0.${SC.MESSAGE_CONTENT}`] =
      response.instructions;
  }

  return attributes;
}

export function getFunctionAttributes(data: FunctionSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  attributes[SC.TOOL_NAME] = data.name;
  if (data.input != null) {
    attributes[SC.INPUT_VALUE] =
      typeof data.input === "string"
        ? data.input
        : (safelyJSONStringify(data.input) ?? String(data.input));
    attributes[SC.INPUT_MIME_TYPE] =
      typeof data.input === "string" &&
      !data.input.trim().startsWith("{") &&
      !data.input.trim().startsWith("[")
        ? MimeType.TEXT
        : MimeType.JSON;
  }
  if (data.output != null) {
    attributes[SC.OUTPUT_VALUE] =
      typeof data.output === "string"
        ? data.output
        : (safelyJSONStringify(data.output) ?? String(data.output));
    attributes[SC.OUTPUT_MIME_TYPE] =
      typeof data.output === "string" &&
      !data.output.trim().startsWith("{") &&
      !data.output.trim().startsWith("[")
        ? MimeType.TEXT
        : MimeType.JSON;
  }
  return attributes;
}

export function getHandoffAttributes(data: HandoffSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  if (data.to_agent) {
    attributes[SC.TOOL_NAME] = `handoff_to_${data.to_agent}`;
  }
  if (data.from_agent || data.to_agent) {
    attributes[SC.INPUT_VALUE] =
      safelyJSONStringify({
        from_agent: data.from_agent,
        to_agent: data.to_agent,
      }) ?? "";
    attributes[SC.INPUT_MIME_TYPE] = MimeType.JSON;
  }
  return attributes;
}

export function getMCPListToolsAttributes(data: MCPListToolsSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  if (data.result != null) {
    attributes[SC.OUTPUT_VALUE] = safelyJSONStringify(data.result) ?? "";
    attributes[SC.OUTPUT_MIME_TYPE] = MimeType.JSON;
  }
  return attributes;
}

export function getCustomAttributes(data: CustomSpanData) {
  const attributes: Record<string, string | number | boolean> = {};
  if (isRecord(data.data) && Object.keys(data.data).length > 0) {
    const customDataJson = safelyJSONStringify(data.data);
    if (customDataJson) {
      attributes[SC.OUTPUT_VALUE] = customDataJson;
      attributes[SC.OUTPUT_MIME_TYPE] = MimeType.JSON;
    }
  }
  return attributes;
}

export function mergeLiftedIO(target: LiftedIO, source: LiftedIO) {
  if (target.input === undefined && source.input !== undefined) {
    target.input = source.input;
    target.inputMimeType = source.inputMimeType;
  }
  if (source.output !== undefined) {
    target.output = source.output;
    target.outputMimeType = source.outputMimeType;
  }
}

export function liftedIOAttributes(liftedIO: LiftedIO | undefined) {
  const attributes: Record<string, string | number | boolean> = {};
  if (!liftedIO) return attributes;
  if (liftedIO.input !== undefined) {
    attributes[SC.INPUT_VALUE] = liftedIO.input;
    if (liftedIO.inputMimeType) {
      attributes[SC.INPUT_MIME_TYPE] = liftedIO.inputMimeType;
    }
  }
  if (liftedIO.output !== undefined) {
    attributes[SC.OUTPUT_VALUE] = liftedIO.output;
    if (liftedIO.outputMimeType) {
      attributes[SC.OUTPUT_MIME_TYPE] = liftedIO.outputMimeType;
    }
  }
  return attributes;
}

function getResponseOutputText(response: Record<string, unknown>) {
  if (isString(response.output_text) && response.output_text.length > 0) {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) return undefined;
  const texts: string[] = [];
  for (const item of response.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (
        isRecord(part) &&
        (part.type === "output_text" || part.type === "text") &&
        isString(part.text)
      ) {
        texts.push(part.text);
      }
    }
  }
  return texts.length > 0 ? texts.join("") : undefined;
}

export function getResponseLiftedIO(data: ResponseSpanData): LiftedIO {
  const liftedIO: LiftedIO = {};
  if (isString(data._input)) {
    liftedIO.input = data._input;
  } else if (Array.isArray(data._input)) {
    const inputJson = safelyJSONStringify(data._input);
    if (inputJson) {
      liftedIO.input = inputJson;
      liftedIO.inputMimeType = MimeType.JSON;
    }
  }
  if (isRecord(data._response)) {
    liftedIO.output = getResponseOutputText(data._response);
  }
  return liftedIO;
}

export function getGenerationLiftedIO(data: GenerationSpanData): LiftedIO {
  const liftedIO: LiftedIO = {};
  if (Array.isArray(data.input) && data.input.length > 0) {
    const inputJson = safelyJSONStringify(data.input);
    if (inputJson) {
      liftedIO.input = inputJson;
      liftedIO.inputMimeType = MimeType.JSON;
    }
  }
  if (Array.isArray(data.output)) {
    const texts: string[] = [];
    for (const item of data.output) {
      if (!isRecord(item)) continue;
      if (Array.isArray(item.choices)) {
        for (const choice of item.choices) {
          if (isRecord(choice) && isRecord(choice.message) && isString(choice.message.content)) {
            texts.push(choice.message.content);
          }
        }
      } else if (isString(item.content)) {
        texts.push(item.content);
      }
    }
    if (texts.length > 0) liftedIO.output = texts.join("");
  }
  return liftedIO;
}

export function getAgentGraphAttributes(
  data: AgentSpanData,
  traceId: string,
  reverseHandoffs: Map<string, string>,
) {
  const attributes: Record<string, string | number | boolean> = {
    [SC.GRAPH_NODE_ID]: data.name,
  };
  const parentNode = reverseHandoffs.get(`${data.name}:${traceId}`);
  if (parentNode) {
    attributes[SC.GRAPH_NODE_PARENT_ID] = parentNode;
  }
  return attributes;
}

export function recordHandoff(
  data: HandoffSpanData,
  traceId: string,
  reverseHandoffs: Map<string, string>,
  maxHandoffsInFlight: number,
) {
  if (!data.to_agent || !data.from_agent) return;
  const key = `${data.to_agent}:${traceId}`;
  reverseHandoffs.delete(key);
  reverseHandoffs.set(key, data.from_agent);
  while (reverseHandoffs.size > maxHandoffsInFlight) {
    const oldest = reverseHandoffs.keys().next().value;
    if (oldest === undefined) break;
    reverseHandoffs.delete(oldest);
  }
}
