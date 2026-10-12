import type { AgentEvent, TokenUsage } from '@higheval/shared';
import { z } from 'zod';

/** Hermes caps `tool_result.output` in stream-json at this many characters. */
export const HERMES_TOOL_OUTPUT_LIMIT = 5_000;

/** Terminal `result` envelope emitted once at the end of a Hermes run. */
export interface HermesResult {
  exitCode: number;
  text: string;
  sessionId: string | null;
  tokens: TokenUsage;
  durationMs: number | null;
  error: string | null;
}

export interface ParsedChunk {
  events: AgentEvent[];
  result: HermesResult | null;
}

const timestampMs = z.number().optional();

const lineSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('system'),
    model: z.string().nullish(),
    session_id: z.string().nullish(),
    timestamp: timestampMs,
  }),
  z.object({ type: z.literal('text'), text: z.string(), timestamp: timestampMs }),
  z.object({
    type: z.literal('tool_use'),
    name: z.string(),
    input: z.unknown().optional(),
    call_id: z.string().nullish(),
    timestamp: timestampMs,
  }),
  z.object({
    type: z.literal('tool_result'),
    name: z.string(),
    output: z.string().nullish(),
    duration_ms: z.number().nullish(),
    is_error: z.boolean().nullish(),
    call_id: z.string().nullish(),
    timestamp: timestampMs,
  }),
  z.object({
    type: z.literal('result'),
    exit_code: z.number().int(),
    text: z.string().nullish(),
    session_id: z.string().nullish(),
    tokens: z
      .object({
        input: z.number().default(0),
        output: z.number().default(0),
        total: z.number().default(0),
        cache_read: z.number().default(0),
      })
      .partial()
      .nullish(),
    duration_ms: z.number().nullish(),
    error: z.string().nullish(),
    timestamp: timestampMs,
  }),
]);

/**
 * Incremental parser for `hermes chat --format stream-json` (JSONL on stdout).
 * Handles lines split across chunks, coalesces streamed text deltas into one
 * event per contiguous block, ignores unknown event types for forward
 * compatibility, and surfaces malformed lines as error events instead of
 * throwing.
 */
export class HermesStreamParser {
  private buffer = '';
  private pendingText: { at: string; text: string } | null = null;
  private resultSeen = false;

  push(chunk: string): ParsedChunk {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return this.parseLines(lines);
  }

  /** Flushes any trailing partial line and buffered text. */
  end(): ParsedChunk {
    const lines = this.buffer.trim() === '' ? [] : [this.buffer];
    this.buffer = '';
    const parsed = this.parseLines(lines);
    const text = this.flushText();
    return { events: [...parsed.events, ...text], result: parsed.result };
  }

  private parseLines(lines: readonly string[]): ParsedChunk {
    const events: AgentEvent[] = [];
    let result: HermesResult | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (line === '') continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        events.push(
          ...this.flushText(),
          errorEvent(`Unparseable output line: ${line.slice(0, 200)}`),
        );
        continue;
      }
      if (!isKnownType(json)) continue;
      const parsed = lineSchema.safeParse(json);
      if (!parsed.success) {
        events.push(
          ...this.flushText(),
          errorEvent(`Malformed ${json.type} event: ${line.slice(0, 200)}`),
        );
        continue;
      }
      const event = parsed.data;
      const at = toIso(event.timestamp);
      switch (event.type) {
        case 'text':
          if (this.pendingText) this.pendingText.text += event.text;
          else this.pendingText = { at, text: event.text };
          break;
        case 'system':
          events.push(...this.flushText(), {
            type: 'session',
            at,
            model: event.model ?? null,
            sessionId: event.session_id ?? null,
          });
          break;
        case 'tool_use':
          events.push(...this.flushText(), {
            type: 'tool_call',
            at,
            callId: event.call_id ?? null,
            tool: event.name,
            arguments: event.input ?? null,
          });
          break;
        case 'tool_result': {
          const output = event.output ?? '';
          events.push(...this.flushText(), {
            type: 'tool_result',
            at,
            callId: event.call_id ?? null,
            tool: event.name,
            output,
            isError: event.is_error ?? false,
            durationMs: event.duration_ms ?? null,
            truncated: output.length >= HERMES_TOOL_OUTPUT_LIMIT,
          });
          break;
        }
        case 'result':
          events.push(...this.flushText());
          if (this.resultSeen) {
            events.push(errorEvent('Duplicate result event ignored'));
            break;
          }
          this.resultSeen = true;
          result = {
            exitCode: event.exit_code,
            text: event.text ?? '',
            sessionId: event.session_id ?? null,
            tokens: {
              input: event.tokens?.input ?? 0,
              output: event.tokens?.output ?? 0,
              cacheRead: event.tokens?.cache_read ?? 0,
              total: event.tokens?.total ?? 0,
            },
            durationMs: event.duration_ms ?? null,
            error: event.error ?? null,
          };
          break;
      }
    }
    return { events, result };
  }

  private flushText(): AgentEvent[] {
    if (!this.pendingText) return [];
    const { at, text } = this.pendingText;
    this.pendingText = null;
    return text.trim() === '' ? [] : [{ type: 'text', at, text }];
  }
}

const KNOWN_TYPES = new Set(['system', 'text', 'tool_use', 'tool_result', 'result']);

function isKnownType(json: unknown): json is { type: string } {
  return (
    typeof json === 'object' &&
    json !== null &&
    'type' in json &&
    typeof json.type === 'string' &&
    KNOWN_TYPES.has(json.type)
  );
}

function toIso(timestamp: number | undefined): string {
  return new Date(timestamp ?? Date.now()).toISOString();
}

function errorEvent(message: string): AgentEvent {
  return { type: 'error', at: new Date().toISOString(), message };
}
