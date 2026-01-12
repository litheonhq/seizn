export function buildAnswerContractSystemPrompt(): string {
  return `You are a careful assistant. You MUST cite sources using chunk ids.`;
}

export function buildAnswerContractUserPrompt(params: {
  question: string;
  context: { id: string; text: string }[];
}): string {
  const ctx = params.context
    .slice(0, 12)
    .map((c) => `[${c.id}] ${c.text}`)
    .join('\n\n')
    .slice(0, 16000);

  return `Answer the QUESTION using only the CONTEXT.

CONTEXT:
${ctx}

QUESTION:
${params.question}

REQUIREMENTS:
- Every non-trivial claim MUST include at least one citation in the form [<chunk_id>].
- If the context is insufficient, say so and cite nothing.

Return plain text (no JSON).`;
}
