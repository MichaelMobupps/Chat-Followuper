/**
 * SSE (Server-Sent Events) progress event protocol.
 *
 * The research stage and message generator emit structured progress events
 * at every substage. The seeder UI subscribes to the SSE stream and renders
 * each event live as the pipeline runs.
 *
 * Event schema is typed and serializable. A passive emitter implementation
 * is provided here so the pipeline code can call `emitter.emit(...)` without
 * caring whether anyone is listening — if no SSE connection is open, the
 * event is logged and dropped.
 *
 * Wire-format on the SSE channel:
 *   event: progress
 *   data: <JSON-encoded ProgressEvent>
 */

import { logger } from "../lib/logger";

// ─────────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────────

export type StageName =
  | "research"
  | "message_draft"
  | "message_critic"
  | "message_rewrite";

export type SubstageStatus = "started" | "succeeded" | "failed" | "info";

/**
 * Single progress event emitted during a pipeline run.
 *
 * Shape designed to be both human-readable (the message field) and machine-
 * parseable (the structured fields). The seeder UI uses `message` for the
 * line of text rendered, and the structured fields for layout (icons,
 * elapsed time, cost rollup).
 */
export interface ProgressEvent {
  /** ISO 8601 timestamp event was emitted at. */
  timestamp: string;
  /** Pipeline stage. */
  stage: StageName;
  /** Substage name within the stage (e.g., "vocabulary_loaded", "critic_done"). */
  substage: string;
  /** Status of this substage. */
  status: SubstageStatus;
  /** Human-readable message rendered in the UI. Should describe what JUST happened. */
  message: string;
  /** Optional latency for this substage, in milliseconds. */
  latencyMs?: number;
  /** Optional input tokens consumed by an LLM call in this substage. */
  inputTokens?: number;
  /** Optional output tokens produced by an LLM call in this substage. */
  outputTokens?: number;
  /** Optional incremental USD cost for this substage. */
  costUsd?: number;
  /** Optional structured output summary (e.g., "3 peers identified"). */
  outputSummary?: string;
  /** Optional model name used in this substage. */
  model?: string;
}

// ─────────────────────────────────────────────────────────────────
// Emitter contract
// ─────────────────────────────────────────────────────────────────

/**
 * Emitter interface the research stage and message generator use. The HTTP
 * route layer creates a concrete emitter bound to the SSE response stream;
 * non-streaming callers (e.g., a CLI or background job) can pass a no-op
 * emitter that just logs.
 */
export interface ProgressEmitter {
  emit(event: Omit<ProgressEvent, "timestamp">): void;
  /** Called when the pipeline finishes, allowing the emitter to close the SSE connection. */
  close?(): void;
}

// ─────────────────────────────────────────────────────────────────
// No-op emitter (logs only)
// ─────────────────────────────────────────────────────────────────

/**
 * Default emitter for non-streaming callers. Logs each event at INFO level
 * via the structured logger; never throws; never blocks.
 */
export class LoggingProgressEmitter implements ProgressEmitter {
  emit(event: Omit<ProgressEvent, "timestamp">): void {
    logger.info(
      {
        stage: event.stage,
        substage: event.substage,
        status: event.status,
        latencyMs: event.latencyMs,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        costUsd: event.costUsd,
        model: event.model,
      },
      `[${event.stage}/${event.substage}] ${event.message}`,
    );
  }
  close(): void {
    // no-op
  }
}

// ─────────────────────────────────────────────────────────────────
// SSE emitter (binds to an Express Response)
// ─────────────────────────────────────────────────────────────────

/**
 * Minimal contract for an Express-style response object that supports SSE.
 * Defined here as an interface so this file does not pull in express types.
 */
export interface SseResponseLike {
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?: () => void;
}

/**
 * Emitter that writes ProgressEvents to an SSE response stream while ALSO
 * logging them. Use this from HTTP routes that want to stream live progress
 * to the dashboard.
 *
 * Usage:
 *   res.setHeader("Content-Type", "text/event-stream");
 *   res.setHeader("Cache-Control", "no-cache");
 *   res.setHeader("Connection", "keep-alive");
 *   res.flushHeaders?.();
 *   const emitter = new SseProgressEmitter(res);
 *   try {
 *     await researchProspect(input, emitter);
 *   } finally {
 *     emitter.close();
 *   }
 */
export class SseProgressEmitter implements ProgressEmitter {
  private closed = false;
  constructor(private readonly res: SseResponseLike) {}

  emit(event: Omit<ProgressEvent, "timestamp">): void {
    const fullEvent: ProgressEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    // Always log, even if the SSE connection is closed.
    logger.info(
      {
        stage: fullEvent.stage,
        substage: fullEvent.substage,
        status: fullEvent.status,
        latencyMs: fullEvent.latencyMs,
        inputTokens: fullEvent.inputTokens,
        outputTokens: fullEvent.outputTokens,
        costUsd: fullEvent.costUsd,
        model: fullEvent.model,
      },
      `[${fullEvent.stage}/${fullEvent.substage}] ${fullEvent.message}`,
    );
    if (this.closed) return;
    try {
      const payload = `event: progress\ndata: ${JSON.stringify(fullEvent)}\n\n`;
      this.res.write(payload);
    } catch (err) {
      logger.warn({ err: String(err) }, "SSE write failed; emitter will stop forwarding");
      this.closed = true;
    }
  }

  /**
   * Close the SSE connection cleanly.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.res.write("event: done\ndata: {}\n\n");
      this.res.end();
    } catch {
      // Connection may already be closed by the client; safe to ignore.
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers for the pipeline code
// ─────────────────────────────────────────────────────────────────

/**
 * Convenience helper for emitting a substage that took an LLM call.
 * Computes the latency from a start timestamp and rolls up token + cost
 * fields into the event in one call.
 */
export function emitLlmSubstage(
  emitter: ProgressEmitter,
  args: {
    stage: StageName;
    substage: string;
    status: SubstageStatus;
    message: string;
    startedAt: number; // Date.now() at start
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
    outputSummary?: string;
  },
): void {
  const latencyMs = Date.now() - args.startedAt;
  emitter.emit({
    stage: args.stage,
    substage: args.substage,
    status: args.status,
    message: args.message,
    latencyMs,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: args.costUsd,
    model: args.model,
    outputSummary: args.outputSummary,
  });
}

/**
 * Convenience helper for an info-only substage with no LLM call (e.g.,
 * "loaded vocabulary block", "validated JSON schema").
 */
export function emitInfo(
  emitter: ProgressEmitter,
  args: { stage: StageName; substage: string; message: string },
): void {
  emitter.emit({
    stage: args.stage,
    substage: args.substage,
    status: "info",
    message: args.message,
  });
}
