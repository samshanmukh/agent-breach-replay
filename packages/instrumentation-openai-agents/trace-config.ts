import { REDACTED } from "./semantics";

export type TraceConfigOptions = {
  hideInputs?: boolean;
  hideOutputs?: boolean;
  hideInputMessages?: boolean;
  hideOutputMessages?: boolean;
  hideInputText?: boolean;
  hideOutputText?: boolean;
  hideInputImages?: boolean;
  hideLlmInvocationParameters?: boolean;
  hideLlmTools?: boolean;
  hideInputAudio?: boolean;
  hideOutputAudio?: boolean;
  base64AudioMaxLength?: number;
};

function envFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  return ["1", "true", "yes", "on"].includes(value);
}

function envNumber(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class TraceConfig {
  hideInputs: boolean;
  hideOutputs: boolean;
  hideInputMessages: boolean;
  hideOutputMessages: boolean;
  hideInputText: boolean;
  hideOutputText: boolean;
  hideInputImages: boolean;
  hideLlmInvocationParameters: boolean;
  hideLlmTools: boolean;
  hideInputAudio: boolean;
  hideOutputAudio: boolean;
  base64AudioMaxLength: number;

  constructor(options: TraceConfigOptions = {}) {
    this.hideInputs =
      options.hideInputs ?? envFlag("OPENINFERENCE_HIDE_INPUTS") ?? false;
    this.hideOutputs =
      options.hideOutputs ?? envFlag("OPENINFERENCE_HIDE_OUTPUTS") ?? false;
    this.hideInputMessages =
      options.hideInputMessages ??
      envFlag("OPENINFERENCE_HIDE_INPUT_MESSAGES") ??
      false;
    this.hideOutputMessages =
      options.hideOutputMessages ??
      envFlag("OPENINFERENCE_HIDE_OUTPUT_MESSAGES") ??
      false;
    this.hideInputText =
      options.hideInputText ?? envFlag("OPENINFERENCE_HIDE_INPUT_TEXT") ?? false;
    this.hideOutputText =
      options.hideOutputText ??
      envFlag("OPENINFERENCE_HIDE_OUTPUT_TEXT") ??
      false;
    this.hideInputImages =
      options.hideInputImages ??
      envFlag("OPENINFERENCE_HIDE_INPUT_IMAGES") ??
      false;
    this.hideLlmInvocationParameters =
      options.hideLlmInvocationParameters ??
      envFlag("OPENINFERENCE_HIDE_LLM_INVOCATION_PARAMETERS") ??
      false;
    this.hideLlmTools =
      options.hideLlmTools ?? envFlag("OPENINFERENCE_HIDE_LLM_TOOLS") ?? false;
    this.hideInputAudio =
      options.hideInputAudio ??
      envFlag("OPENINFERENCE_HIDE_INPUT_AUDIO") ??
      false;
    this.hideOutputAudio =
      options.hideOutputAudio ??
      envFlag("OPENINFERENCE_HIDE_OUTPUT_AUDIO") ??
      false;
    this.base64AudioMaxLength =
      options.base64AudioMaxLength ??
      envNumber("OPENINFERENCE_BASE64_AUDIO_MAX_LENGTH") ??
      32000;
  }

  maskAttributes(attributes: Record<string, string | number | boolean>) {
    const masked: Record<string, string | number | boolean> = { ...attributes };

    const redactKeys = (predicate: (key: string) => boolean) => {
      for (const key of Object.keys(masked)) {
        if (predicate(key)) masked[key] = REDACTED;
      }
    };

    if (this.hideInputs || this.hideInputMessages || this.hideInputText) {
      redactKeys(
        (key) =>
          key.startsWith("input.") ||
          key.startsWith("llm.input_messages."),
      );
    }

    if (this.hideOutputs || this.hideOutputMessages || this.hideOutputText) {
      redactKeys(
        (key) =>
          key.startsWith("output.") ||
          key.startsWith("llm.output_messages."),
      );
    }

    if (this.hideLlmInvocationParameters) {
      redactKeys((key) => key === "llm.invocation_parameters");
    }

    if (this.hideLlmTools) {
      redactKeys((key) => key.startsWith("llm.tools."));
    }

    if (this.hideInputAudio) {
      redactKeys(
        (key) =>
          key === "input.audio.url" ||
          key === "input.audio.mime_type" ||
          key === "input.audio.transcript",
      );
    }

    if (this.hideOutputAudio) {
      redactKeys(
        (key) =>
          key === "output.audio.url" ||
          key === "output.audio.mime_type" ||
          key === "output.audio.transcript",
      );
    }

    return masked;
  }

  truncateAudioDataUri(value: string) {
    const prefixMatch = /^data:audio\/[^;]+;base64,/.exec(value);
    if (!prefixMatch) return value;
    const prefix = prefixMatch[0];
    const payload = value.slice(prefix.length);
    if (payload.length <= this.base64AudioMaxLength) return value;
    return `${prefix}${payload.slice(0, this.base64AudioMaxLength)}`;
  }
}
