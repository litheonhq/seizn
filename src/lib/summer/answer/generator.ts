/**
 * Answer Generator
 *
 * Generates grounded answers with citations and retry logic.
 * Integrates groundedness verification and claim mapping.
 */

import type {
  AnswerContract,
  AnswerGenerationParams,
  AnswerGenerationResult,
  SourceReference,
  RetryConfig,
} from './types';
import { DEFAULT_RETRY_CONFIG } from './types';
import { verifyGroundedness } from './groundedness';
import { withRetry } from './retry';
import { processAnswerWithCitations } from './claim-mapper';

export interface LLMClient {
  generate(params: {
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    content: string;
    usage: { promptTokens: number; completionTokens: number };
  }>;
  modelId: string;
}

/**
 * Build context string from sources
 */
function buildContext(sources: SourceReference[]): string {
  if (sources.length === 0) return 'No sources available.';

  const contextParts: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    let part = `[Source ${i + 1}]`;

    if (source.documentTitle) {
      part += ` (${source.documentTitle})`;
    }

    part += `:\n${source.content}`;
    contextParts.push(part);
  }

  return contextParts.join('\n\n');
}

/**
 * Default system prompt for grounded answer generation
 */
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that provides accurate, well-sourced answers based on the provided context.

Guidelines:
1. Only use information from the provided sources
2. If the sources don't contain enough information, say so clearly
3. Be concise but thorough
4. Use specific details and quotes from sources when relevant
5. Do not make up information or add speculation
6. If asked about something not in the sources, explicitly state that

Your answers should be factual and directly supported by the source material.`;

/**
 * Generate an answer with groundedness verification
 */
export async function generateAnswer(
  params: AnswerGenerationParams,
  client: LLMClient
): Promise<AnswerGenerationResult> {
  const {
    query,
    context,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTokens = 1000,
    temperature = 0.3,
    requireGroundedness = true,
    minGroundednessScore = 0.5,
    includeCitations = true,
    retryConfig = {},
  } = params;

  const finalRetryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const startTime = Date.now();

  // Build the prompt
  const contextString = buildContext(context);
  const userMessage = `Based on the following sources, please answer this question: ${query}

Sources:
${contextString}

Please provide a clear, accurate answer based only on the information in these sources.`;

  // Generate answer with retry
  const generateFn = async () => {
    return client.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      maxTokens,
      temperature,
    });
  };

  const result = await withRetry(generateFn, finalRetryConfig);

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error?.message ?? 'Failed to generate answer',
      retriesUsed: result.attempts - 1,
    };
  }

  const { content: answer, usage } = result.data;
  const latencyMs = Date.now() - startTime;

  // Verify groundedness
  const groundedness = verifyGroundedness(answer, context, {
    minGroundednessScore,
    requireAllClaims: false,
  });

  // Check if answer meets groundedness requirements
  if (requireGroundedness && !groundedness.isGrounded) {
    // Try to regenerate with stricter prompt
    const strictPrompt = `${systemPrompt}

IMPORTANT: Your previous response contained claims that couldn't be verified against the sources. Please try again, being extra careful to:
- Only state facts that are directly supported by the sources
- Quote relevant passages when possible
- Avoid any speculation or inference`;

    const strictResult = await withRetry(
      () =>
        client.generate({
          messages: [
            { role: 'system', content: strictPrompt },
            { role: 'user', content: userMessage },
          ],
          maxTokens,
          temperature: temperature * 0.5, // Lower temperature for stricter adherence
        }),
      { ...finalRetryConfig, maxRetries: 1 }
    );

    if (strictResult.success && strictResult.data) {
      const strictGroundedness = verifyGroundedness(strictResult.data.content, context, {
        minGroundednessScore,
      });

      if (strictGroundedness.isGrounded) {
        // Use the stricter answer
        const strictAnswer = strictResult.data.content;
        const strictUsage = strictResult.data.usage;

        const citationResult = includeCitations
          ? processAnswerWithCitations(strictAnswer, context)
          : null;

        return {
          success: true,
          contract: {
            query,
            answer: citationResult?.citedAnswer ?? strictAnswer,
            sources: context,
            groundedness: strictGroundedness,
            citations: citationResult?.mapping.citations ?? [],
            metadata: {
              generatedAt: new Date(),
              modelId: client.modelId,
              latencyMs: Date.now() - startTime,
              tokenCount: {
                prompt: usage.promptTokens + strictUsage.promptTokens,
                completion: usage.completionTokens + strictUsage.completionTokens,
                total:
                  usage.promptTokens +
                  usage.completionTokens +
                  strictUsage.promptTokens +
                  strictUsage.completionTokens,
              },
              retryCount: result.attempts + strictResult.attempts - 2,
            },
          },
          retriesUsed: result.attempts + strictResult.attempts - 2,
        };
      }
    }

    // Return original with warning if stricter attempt also failed
    return {
      success: false,
      error: `Answer failed groundedness check (score: ${groundedness.overallScore.toFixed(2)})`,
      retriesUsed: result.attempts - 1,
    };
  }

  // Process citations if requested
  const citationResult = includeCitations ? processAnswerWithCitations(answer, context) : null;

  const contract: AnswerContract = {
    query,
    answer: citationResult?.citedAnswer ?? answer,
    sources: context,
    groundedness,
    citations: citationResult?.mapping.citations ?? [],
    metadata: {
      generatedAt: new Date(),
      modelId: client.modelId,
      latencyMs,
      tokenCount: {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        total: usage.promptTokens + usage.completionTokens,
      },
      retryCount: result.attempts - 1,
    },
  };

  return {
    success: true,
    contract,
    retriesUsed: result.attempts - 1,
  };
}

/**
 * Generate answer with streaming (returns async generator)
 */
export async function* generateAnswerStream(
  params: AnswerGenerationParams,
  client: LLMClient & {
    generateStream(params: {
      messages: Array<{ role: string; content: string }>;
      maxTokens?: number;
      temperature?: number;
    }): AsyncGenerator<{ delta: string; done: boolean }>;
  }
): AsyncGenerator<{
  type: 'delta' | 'complete' | 'error';
  delta?: string;
  contract?: AnswerContract;
  error?: string;
}> {
  const {
    query,
    context,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTokens = 1000,
    temperature = 0.3,
    includeCitations = true,
  } = params;

  const contextString = buildContext(context);
  const userMessage = `Based on the following sources, please answer this question: ${query}

Sources:
${contextString}

Please provide a clear, accurate answer based only on the information in these sources.`;

  let fullAnswer = '';
  const startTime = Date.now();

  try {
    const stream = client.generateStream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      maxTokens,
      temperature,
    });

    for await (const chunk of stream) {
      if (chunk.delta) {
        fullAnswer += chunk.delta;
        yield { type: 'delta', delta: chunk.delta };
      }

      if (chunk.done) break;
    }

    // Post-process complete answer
    const groundedness = verifyGroundedness(fullAnswer, context);
    const citationResult = includeCitations
      ? processAnswerWithCitations(fullAnswer, context)
      : null;

    const contract: AnswerContract = {
      query,
      answer: citationResult?.citedAnswer ?? fullAnswer,
      sources: context,
      groundedness,
      citations: citationResult?.mapping.citations ?? [],
      metadata: {
        generatedAt: new Date(),
        modelId: client.modelId,
        latencyMs: Date.now() - startTime,
        tokenCount: {
          prompt: 0, // Not available in streaming
          completion: 0,
          total: 0,
        },
        retryCount: 0,
      },
    };

    yield { type: 'complete', contract };
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate answer contract
 */
export function validateAnswerContract(contract: AnswerContract): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check answer length
  if (contract.answer.length < 10) {
    issues.push('Answer is too short');
  }

  // Check groundedness
  if (!contract.groundedness.isGrounded) {
    issues.push(`Low groundedness score: ${contract.groundedness.overallScore.toFixed(2)}`);
  }

  // Check for ungrounded claims
  if (contract.groundedness.ungroundedClaims.length > 0) {
    issues.push(`${contract.groundedness.ungroundedClaims.length} ungrounded claim(s)`);
  }

  // Check sources
  if (contract.sources.length === 0) {
    issues.push('No sources provided');
  }

  // Check citations match sources
  for (const citation of contract.citations) {
    const sourceExists = contract.sources.some((s) => s.chunkId === citation.sourceChunkId);
    if (!sourceExists) {
      issues.push(`Citation references unknown source: ${citation.sourceChunkId}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Format answer contract for display
 */
export function formatAnswerContract(contract: AnswerContract): string {
  const lines: string[] = [];

  // Answer
  lines.push(contract.answer);

  // Citations/References
  if (contract.citations.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('**References:**');

    for (const citation of contract.citations) {
      let ref = `${citation.inlineMarker} `;
      if (citation.documentTitle) {
        ref += `*${citation.documentTitle}*`;
      } else {
        ref += `Document ${citation.documentId.slice(0, 8)}`;
      }
      if (citation.page) {
        ref += `, p. ${citation.page}`;
      }
      lines.push(ref);
    }
  }

  // Metadata
  lines.push('');
  lines.push('---');
  lines.push(
    `*Generated: ${contract.metadata.generatedAt.toISOString()} | ` +
      `Groundedness: ${Math.round(contract.groundedness.overallScore * 100)}% | ` +
      `Latency: ${contract.metadata.latencyMs}ms*`
  );

  return lines.join('\n');
}
