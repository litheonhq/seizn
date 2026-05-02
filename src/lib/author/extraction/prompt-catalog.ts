import type { AuthorExtractionPromptTask } from './types';

export const AUTHOR_EXTRACTION_TASKS: AuthorExtractionPromptTask[] = [
  { type: 'character', promptFile: 'extract-character.md', schemaName: 'candidate-character' },
  { type: 'world_rule', promptFile: 'extract-world-rule.md', schemaName: 'candidate-world-rule' },
  { type: 'event', promptFile: 'extract-event.md', schemaName: 'candidate-event' },
  { type: 'relationship', promptFile: 'extract-relationship.md', schemaName: 'candidate-relationship' },
  { type: 'voice_sample', promptFile: 'extract-voice-sample.md', schemaName: 'candidate-voice-sample' },
];

const TASK_INSTRUCTIONS: Record<string, string> = {
  character: [
    'Extract character candidates only.',
    'Prefer stable identity, voice, persona, appearance, knowledge-state, or role facts.',
    'Do not infer hidden author-only secrets from hints.',
  ].join('\n'),
  world_rule: [
    'Extract world-rule candidates only.',
    'Prefer explicit canon constraints, institution rules, timeline rules, and writing-system rules.',
    'Do not promote TBD or forbidden-in-scope facts as canon.',
  ].join('\n'),
  event: [
    'Extract timeline event candidates only.',
    'Preserve Day/date anchors and participant knowledge partitions when present.',
    'Do not invent missing dates.',
  ].join('\n'),
  relationship: [
    'Extract relationship candidates only.',
    'Prefer directional/asymmetric knowledge, trust, attachment, conflict, and event-based changes.',
    'Do not flatten uncertain relationships into canon.',
  ].join('\n'),
  voice_sample: [
    'Extract voice sample candidates only.',
    'Prefer dialogue, monologue, vocabulary, taboo expressions, and speech-pattern evidence.',
    'Do not normalize out dialect or intentional speech quirks.',
  ].join('\n'),
};

export function buildExtractionPrompt(input: {
  task: AuthorExtractionPromptTask;
  sourceRole: string;
  fileName: string;
  text: string;
}): string {
  return [
    'You are Seizn Author Memory v3 extraction runtime.',
    `Prompt file: ${input.task.promptFile}`,
    `Source role: ${input.sourceRole}`,
    `Source file: ${input.fileName}`,
    '',
    TASK_INSTRUCTIONS[input.task.type],
    '',
    'Return JSON only with this shape:',
    '{"candidates":[{"content":"string","confidence":0.0,"suggested_status":"candidate","tags":["short1","tier:1"],"target_entity_id":"optional"}]}',
    '',
    'Source text:',
    input.text,
  ].join('\n');
}
