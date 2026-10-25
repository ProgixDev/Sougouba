import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

/**
 * The devis names "OpenAI GPT"; this is the provider's cheapest current model
 * built for high-volume, focused work — which a support chat is. Overridable
 * with `OPENAI_MODEL` without a code change.
 */
const DEFAULT_MODEL = 'gpt-6-luna';

/** A support answer is a few sentences. The cap is a cost ceiling, not a target. */
const MAX_OUTPUT_TOKENS = 700;

/** Long enough for a slow answer, short enough that the app is not left spinning. */
const TIMEOUT_MS = 30_000;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The one call this API makes to OpenAI — the Responses API over plain
 * `fetch`, rather than a vendor SDK for a single endpoint.
 *
 * `store: false`: the conversation is already kept in our own
 * `support_messages`, under our retention rules, and there is no reason for a
 * second copy to sit at the provider.
 */
@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('OPENAI_API_KEY', { infer: true }) || undefined;
    this.model = config.get('OPENAI_MODEL', { infer: true }) || DEFAULT_MODEL;
    if (!this.apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is empty — the support assistant answers 503 until it is set.',
      );
    }
  }

  /** False until a key is configured. The app reads this to show "coming soon" instead of a chat box. */
  get configured(): boolean {
    return !!this.apiKey;
  }

  async reply(instructions: string, turns: ChatTurn[]): Promise<string> {
    if (!this.apiKey)
      throw new ServiceUnavailableException(
        "L'assistant n'est pas encore disponible.",
      );

    let response: Response;
    try {
      response = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          instructions,
          input: turns.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`OpenAI unreachable: ${String(error)}`);
      throw new BadGatewayException(
        "L'assistant ne répond pas pour le moment. Réessayez dans un instant.",
      );
    }

    if (!response.ok) {
      // The body can echo the request; log the status and OpenAI's own error
      // code, never the conversation.
      const detail = await response.json().catch(() => null);
      this.logger.error(
        `OpenAI refused (${response.status}): ${detail?.error?.code ?? detail?.error?.type ?? 'unknown'}`,
      );
      throw new BadGatewayException(
        "L'assistant ne répond pas pour le moment. Réessayez dans un instant.",
      );
    }

    const text = extractText(await response.json());
    if (!text) {
      this.logger.error('OpenAI answered with no text');
      throw new BadGatewayException(
        "L'assistant ne répond pas pour le moment. Réessayez dans un instant.",
      );
    }
    return text;
  }
}

interface ResponsesOutput {
  output?: {
    type?: string;
    role?: string;
    content?: { type?: string; text?: string; refusal?: string }[];
  }[];
}

/** The assistant's text, from `output[].content[]` — the raw API has no `output_text` convenience field. */
export function extractText(body: ResponsesOutput): string | null {
  const parts = (body.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((part) =>
      part.type === 'output_text'
        ? part.text
        : part.type === 'refusal'
          ? part.refusal
          : undefined,
    )
    .filter((text): text is string => !!text && text.trim().length > 0);
  return parts.length ? parts.join('\n').trim() : null;
}
