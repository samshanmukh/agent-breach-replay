export const REDACTED = "__REDACTED__";

export enum OpenInferenceSpanKind {
  AGENT = "AGENT",
  CHAIN = "CHAIN",
  EMBEDDING = "EMBEDDING",
  EVALUATOR = "EVALUATOR",
  GUARDRAIL = "GUARDRAIL",
  LLM = "LLM",
  RERANKER = "RERANKER",
  RETRIEVER = "RETRIEVER",
  TOOL = "TOOL",
  AUDIO = "AUDIO",
  USER = "USER",
}

export enum MimeType {
  JSON = "application/json",
  TEXT = "text/plain",
}

export const SemanticConventions = {
  OPENINFERENCE_SPAN_KIND: "openinference.span.kind",
  LLM_SYSTEM: "llm.system",
  LLM_PROVIDER: "llm.provider",
  LLM_MODEL_NAME: "llm.model_name",
  LLM_INVOCATION_PARAMETERS: "llm.invocation_parameters",
  LLM_INPUT_MESSAGES: "llm.input_messages",
  LLM_OUTPUT_MESSAGES: "llm.output_messages",
  LLM_TOOLS: "llm.tools",
  LLM_TOKEN_COUNT_PROMPT: "llm.token_count.prompt",
  LLM_TOKEN_COUNT_COMPLETION: "llm.token_count.completion",
  LLM_TOKEN_COUNT_TOTAL: "llm.token_count.total",
  LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ:
    "llm.token_count.prompt_details.cache_read",
  LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING:
    "llm.token_count.completion_details.reasoning",
  LLM_TOKEN_COUNT_PROMPT_DETAILS_AUDIO:
    "llm.token_count.prompt_details.audio",
  LLM_TOKEN_COUNT_COMPLETION_DETAILS_AUDIO:
    "llm.token_count.completion_details.audio",
  INPUT_VALUE: "input.value",
  INPUT_MIME_TYPE: "input.mime_type",
  OUTPUT_VALUE: "output.value",
  OUTPUT_MIME_TYPE: "output.mime_type",
  TOOL_NAME: "tool.name",
  TOOL_CALL_ID: "tool_call.id",
  TOOL_CALL_FUNCTION_NAME: "tool_call.function.name",
  TOOL_CALL_FUNCTION_ARGUMENTS_JSON: "tool_call.function.arguments",
  TOOL_JSON_SCHEMA: "tool.json_schema",
  MESSAGE_ROLE: "message.role",
  MESSAGE_CONTENT: "message.content",
  MESSAGE_CONTENTS: "message.contents",
  MESSAGE_CONTENT_TYPE: "message.content.type",
  MESSAGE_CONTENT_TEXT: "message.content.text",
  MESSAGE_TOOL_CALLS: "message.tool_calls",
  MESSAGE_TOOL_CALL_ID: "message.tool_call_id",
  GRAPH_NODE_ID: "graph.node.id",
  GRAPH_NODE_PARENT_ID: "graph.node.parent_id",
  SESSION_ID: "session.id",
  USER_ID: "user.id",
  METADATA: "metadata",
  TAG_TAGS: "tag.tags",
  INPUT_AUDIO_URL: "input.audio.url",
  INPUT_AUDIO_MIME_TYPE: "input.audio.mime_type",
  INPUT_AUDIO_TRANSCRIPT: "input.audio.transcript",
  OUTPUT_AUDIO_URL: "output.audio.url",
  OUTPUT_AUDIO_MIME_TYPE: "output.audio.mime_type",
  OUTPUT_AUDIO_TRANSCRIPT: "output.audio.transcript",
  GUARDRAIL_TRIGGERED: "guardrail.triggered",
  END_REASON: "end_reason",
  TIME_TO_FIRST_TOKEN_MS: "time_to_first_token_ms",
} as const;

export type SpanAttributes = Record<string, string | number | boolean>;
