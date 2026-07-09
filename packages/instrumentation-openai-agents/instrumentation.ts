import { AgentBreachTracingProcessor } from "./processor";
import type { AgentsTracingModule, TracingProcessor } from "./types";
import type { TraceConfigOptions } from "./trace-config";

let isPatchedGlobal = false;

export type OpenAIAgentsInstrumentationOptions = {
  exclusiveProcessor?: boolean;
  traceConfig?: TraceConfigOptions;
  maxRootSpansInFlight?: number;
};

export class OpenAIAgentsInstrumentation {
  private processor?: AgentBreachTracingProcessor;
  private patchedModule?: AgentsTracingModule;
  private exclusiveProcessor = true;
  private additiveProcessorRegistered = false;
  private readonly options: OpenAIAgentsInstrumentationOptions;

  constructor(options: OpenAIAgentsInstrumentationOptions = {}) {
    this.options = options;
    this.exclusiveProcessor = options.exclusiveProcessor ?? true;
  }

  instrument(options: OpenAIAgentsInstrumentationOptions = {}) {
    this.exclusiveProcessor =
      options.exclusiveProcessor ?? this.exclusiveProcessor;
    throw new Error(
      "Use manuallyInstrument(agents) in this local scaffold. The @openai/agents module is an optional peer dependency.",
    );
  }

  manuallyInstrument(
    module: AgentsTracingModule,
    options: OpenAIAgentsInstrumentationOptions = {},
  ) {
    this.exclusiveProcessor =
      options.exclusiveProcessor ?? this.exclusiveProcessor;
    this.patch(module);
  }

  uninstrument() {
    const module = this.patchedModule;
    if (module) this.unpatch(module);
  }

  getProcessor() {
    return this.processor;
  }

  isPatched() {
    return isPatchedGlobal;
  }

  private patch(module: AgentsTracingModule) {
    if (module.agentBreachPatched || isPatchedGlobal) return;

    const processor = this.getOrCreateProcessor();
    processor.enable();

    if (this.exclusiveProcessor) {
      module.setTraceProcessors([processor]);
      this.additiveProcessorRegistered = false;
    } else if (!this.additiveProcessorRegistered) {
      module.addTraceProcessor(processor);
      this.additiveProcessorRegistered = true;
    }

    this.patchedModule = module;
    isPatchedGlobal = true;
    module.agentBreachPatched = true;
  }

  private unpatch(module: AgentsTracingModule) {
    if (this.exclusiveProcessor) {
      module.setTraceProcessors([]);
      this.additiveProcessorRegistered = false;
    } else {
      this.processor?.disable();
    }

    if (this.exclusiveProcessor) {
      this.processor = undefined;
    }
    this.patchedModule = undefined;
    isPatchedGlobal = false;
    module.agentBreachPatched = false;
  }

  private getOrCreateProcessor() {
    if (!this.processor) {
      this.processor = new AgentBreachTracingProcessor({
        traceConfig: this.options.traceConfig,
        maxRootSpansInFlight: this.options.maxRootSpansInFlight,
      });
    }
    return this.processor;
  }
}

export function createMockAgentsModule(
  processors: TracingProcessor[] = [],
): AgentsTracingModule {
  const state = { processors: [...processors] };
  return {
    agentBreachPatched: false,
    setTraceProcessors(next) {
      state.processors = [...next];
    },
    addTraceProcessor(processor) {
      state.processors.push(processor);
    },
    get processors() {
      return state.processors;
    },
  } as AgentsTracingModule & { processors: TracingProcessor[] };
}
