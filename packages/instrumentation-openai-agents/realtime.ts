import { OpenInferenceSpanKind, SemanticConventions as SC } from "./semantics";
import { TraceConfig } from "./trace-config";
import type { CompletedSpan } from "./types";

export type RealtimeTurnState = {
  turnId: string;
  sessionId?: string;
  modelName?: string;
  inputTranscripts: string[];
  outputTranscripts: string[];
  endReason?: "complete" | "interrupted" | "session_closed";
};

export type RealtimeSessionState = {
  sessionId?: string;
  modelName?: string;
  activeTurn?: RealtimeTurnState;
  turns: RealtimeTurnState[];
};

export class RealtimeSessionTracer {
  private readonly traceConfig: TraceConfig;
  private readonly sessions = new Map<string, RealtimeSessionState>();
  private readonly spans: CompletedSpan[] = [];

  constructor(traceConfig: TraceConfig = new TraceConfig()) {
    this.traceConfig = traceConfig;
  }

  getSpans() {
    return [...this.spans];
  }

  private getSession(sessionId: string) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { turns: [] };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  onSessionCreated(sessionId: string, modelName?: string) {
    const session = this.getSession(sessionId);
    session.sessionId = sessionId;
    session.modelName = modelName;
  }

  onUserSpeechStarted(sessionId: string, turnId: string) {
    const session = this.getSession(sessionId);
    session.activeTurn = {
      turnId,
      sessionId,
      modelName: session.modelName,
      inputTranscripts: [],
      outputTranscripts: [],
    };
  }

  onUserAudioTranscript(sessionId: string, transcript: string) {
    const session = this.getSession(sessionId);
    session.activeTurn?.inputTranscripts.push(transcript);
  }

  onAssistantTranscript(sessionId: string, transcript: string) {
    const session = this.getSession(sessionId);
    session.activeTurn?.outputTranscripts.push(transcript);
  }

  onToolCall(sessionId: string, toolName: string, args: unknown, output?: unknown) {
    const session = this.getSession(sessionId);
    const turn = session.activeTurn;
    if (!turn) return;

    this.spans.push({
      spanId: `tool_${turn.turnId}_${toolName}_${this.spans.length}`,
      traceId: sessionId,
      parentId: `turn_${turn.turnId}`,
      name: toolName,
      kind: OpenInferenceSpanKind.TOOL,
      status: "ok",
      attributes: this.traceConfig.maskAttributes({
        [SC.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.TOOL,
        [SC.TOOL_NAME]: toolName,
        [SC.INPUT_VALUE]: JSON.stringify(args),
        [SC.INPUT_MIME_TYPE]: "application/json",
        ...(output !== undefined
          ? {
              [SC.OUTPUT_VALUE]:
                typeof output === "string" ? output : JSON.stringify(output),
              [SC.OUTPUT_MIME_TYPE]:
                typeof output === "string" ? "text/plain" : "application/json",
            }
          : {}),
      }),
    });
  }

  finalizeTurn(
    sessionId: string,
    options: {
      endReason?: RealtimeTurnState["endReason"];
      inputAudioDataUri?: string;
      outputAudioDataUri?: string;
      tokenCounts?: {
        prompt?: number;
        completion?: number;
        promptAudio?: number;
        completionAudio?: number;
      };
      timeToFirstTokenMs?: number;
    } = {},
  ) {
    const session = this.getSession(sessionId);
    const turn = session.activeTurn;
    if (!turn) return;

    turn.endReason = options.endReason ?? "complete";
    session.turns.push(turn);

    const turnSpanId = `turn_${turn.turnId}`;
    const inputValue = turn.inputTranscripts.join(" ").trim();
    const outputValue = turn.outputTranscripts.join(" ").trim();

    this.spans.push({
      spanId: turnSpanId,
      traceId: sessionId,
      name: "conversation.turn",
      kind: OpenInferenceSpanKind.AUDIO,
      status: "ok",
      attributes: this.traceConfig.maskAttributes({
        [SC.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.AUDIO,
        [SC.LLM_MODEL_NAME]: turn.modelName ?? "",
        [SC.INPUT_VALUE]: inputValue,
        [SC.OUTPUT_VALUE]: outputValue,
        [SC.END_REASON]: turn.endReason,
        ...(options.timeToFirstTokenMs !== undefined
          ? { [SC.TIME_TO_FIRST_TOKEN_MS]: options.timeToFirstTokenMs }
          : {}),
        ...(options.tokenCounts?.prompt !== undefined
          ? { [SC.LLM_TOKEN_COUNT_PROMPT]: options.tokenCounts.prompt }
          : {}),
        ...(options.tokenCounts?.completion !== undefined
          ? { [SC.LLM_TOKEN_COUNT_COMPLETION]: options.tokenCounts.completion }
          : {}),
        ...(options.tokenCounts?.promptAudio !== undefined
          ? {
              [SC.LLM_TOKEN_COUNT_PROMPT_DETAILS_AUDIO]:
                options.tokenCounts.promptAudio,
            }
          : {}),
        ...(options.tokenCounts?.completionAudio !== undefined
          ? {
              [SC.LLM_TOKEN_COUNT_COMPLETION_DETAILS_AUDIO]:
                options.tokenCounts.completionAudio,
            }
          : {}),
      }),
    });

    if (inputValue || options.inputAudioDataUri) {
      const audioAttrs: Record<string, string | number | boolean> = {
        [SC.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.USER,
        ...(inputValue
          ? {
              [SC.INPUT_VALUE]: inputValue,
              [SC.INPUT_MIME_TYPE]: "text/plain",
            }
          : {}),
      };
      if (options.inputAudioDataUri) {
        audioAttrs[SC.INPUT_AUDIO_URL] = this.traceConfig.truncateAudioDataUri(
          options.inputAudioDataUri,
        );
        audioAttrs[SC.INPUT_AUDIO_MIME_TYPE] = "audio/wav";
        if (inputValue) audioAttrs[SC.INPUT_AUDIO_TRANSCRIPT] = inputValue;
      }
      this.spans.push({
        spanId: `user_${turn.turnId}`,
        traceId: sessionId,
        parentId: turnSpanId,
        name: "user",
        kind: OpenInferenceSpanKind.USER,
        status: "ok",
        attributes: this.traceConfig.maskAttributes(audioAttrs),
      });
    }

    if (outputValue || options.outputAudioDataUri) {
      const audioAttrs: Record<string, string | number | boolean> = {
        [SC.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.LLM,
        [SC.LLM_SYSTEM]: "openai",
        ...(outputValue
          ? {
              [SC.OUTPUT_VALUE]: outputValue,
              [SC.OUTPUT_MIME_TYPE]: "text/plain",
            }
          : {}),
      };
      if (options.outputAudioDataUri) {
        audioAttrs[SC.OUTPUT_AUDIO_URL] = this.traceConfig.truncateAudioDataUri(
          options.outputAudioDataUri,
        );
        audioAttrs[SC.OUTPUT_AUDIO_MIME_TYPE] = "audio/wav";
        if (outputValue) {
          audioAttrs[SC.OUTPUT_AUDIO_TRANSCRIPT] = outputValue;
        }
      }
      this.spans.push({
        spanId: `assistant_${turn.turnId}`,
        traceId: sessionId,
        parentId: turnSpanId,
        name: "assistant",
        kind: OpenInferenceSpanKind.LLM,
        status: "ok",
        attributes: this.traceConfig.maskAttributes(audioAttrs),
      });
    }

    session.activeTurn = undefined;
  }

  closeSession(sessionId: string) {
    const session = this.getSession(sessionId);
    if (session.activeTurn) {
      this.finalizeTurn(sessionId, { endReason: "session_closed" });
    }
  }
}

export function pcm16ToWavDataUri(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);

  let binary = "";
  for (const byte of wavBytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(wavBytes).toString("base64");

  return `data:audio/wav;base64,${base64}`;
}
