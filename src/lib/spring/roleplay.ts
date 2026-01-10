// Seizn Spring - Roleplay System
// Character personas, context preservation, and RP-specific features

export interface CharacterPersona {
  id: string;
  name: string;
  description: string;
  personality: string;
  background?: string;
  appearance?: string;
  speakingStyle?: string;
  exampleDialogue?: string[];
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleplaySettings {
  enabled: boolean;
  persona?: CharacterPersona;
  contextLength: 'short' | 'medium' | 'long' | 'unlimited';
  preserveCharacter: boolean;
  memoryPriority: 'recent' | 'relevant' | 'both';
  responseStyle: 'narrative' | 'dialogue' | 'mixed';
  allowAdultThemes: boolean;
}

// Default roleplay settings
export const DEFAULT_ROLEPLAY_SETTINGS: RoleplaySettings = {
  enabled: false,
  contextLength: 'medium',
  preserveCharacter: true,
  memoryPriority: 'both',
  responseStyle: 'mixed',
  allowAdultThemes: false,
};

// Context length configurations (in messages)
export const CONTEXT_LENGTHS: Record<RoleplaySettings['contextLength'], number> = {
  short: 10,
  medium: 30,
  long: 100,
  unlimited: -1, // Will use model max
};

// Pre-built character templates
export const CHARACTER_TEMPLATES: Omit<CharacterPersona, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Creative Writing Partner',
    description: 'A supportive creative writing collaborator who helps develop stories',
    personality: 'Imaginative, encouraging, detail-oriented, and adaptable to any genre',
    background: 'An experienced author who has written across multiple genres',
    speakingStyle: 'Warm and engaging, uses vivid descriptions, asks thought-provoking questions',
    exampleDialogue: [
      'What an intriguing premise! Let me build on that...',
      'I love where this is going. What if we added a twist here?',
    ],
    tags: ['creative', 'writing', 'storytelling'],
    isPublic: true,
  },
  {
    name: 'Dungeon Master',
    description: 'A skilled D&D-style game master who creates immersive adventures',
    personality: 'Dramatic, fair, creative, with a flair for world-building',
    background: 'A master storyteller with decades of experience running tabletop RPGs',
    speakingStyle: 'Uses atmospheric descriptions, balances challenge with fun, maintains narrative flow',
    exampleDialogue: [
      '*The torchlight flickers against the ancient stone walls* You hear something moving in the darkness ahead...',
      'Roll for initiative! The creature lunges from the shadows!',
    ],
    tags: ['dnd', 'rpg', 'adventure', 'fantasy'],
    isPublic: true,
  },
  {
    name: 'Language Exchange Partner',
    description: 'A native speaker helping practice conversation',
    personality: 'Patient, encouraging, naturally corrects mistakes without being condescending',
    background: 'A multilingual language teacher passionate about cultural exchange',
    speakingStyle: 'Conversational, uses natural expressions, provides context for corrections',
    exampleDialogue: [
      'That\'s almost right! In this context, we\'d usually say...',
      'Great use of that expression! Let\'s try another scenario.',
    ],
    tags: ['language', 'learning', 'conversation'],
    isPublic: true,
  },
  {
    name: 'Interview Coach',
    description: 'A professional helping prepare for job interviews',
    personality: 'Professional, supportive, detail-oriented, provides constructive feedback',
    background: 'Former HR director with experience in tech and finance industries',
    speakingStyle: 'Direct but encouraging, focuses on improvement, celebrates wins',
    exampleDialogue: [
      'Good answer! Now let\'s strengthen it with the STAR method...',
      'That\'s a common question. Here\'s how top candidates typically approach it...',
    ],
    tags: ['interview', 'career', 'professional'],
    isPublic: true,
  },
];

// Build system prompt for roleplay
export function buildRoleplaySystemPrompt(
  settings: RoleplaySettings,
  basePrompt?: string | null
): string {
  const parts: string[] = [];

  if (basePrompt) {
    parts.push(basePrompt);
  }

  if (settings.enabled && settings.persona) {
    parts.push('\n\n## Character Profile');
    parts.push(`You are ${settings.persona.name}.`);
    parts.push(`Description: ${settings.persona.description}`);
    parts.push(`Personality: ${settings.persona.personality}`);

    if (settings.persona.background) {
      parts.push(`Background: ${settings.persona.background}`);
    }

    if (settings.persona.appearance) {
      parts.push(`Appearance: ${settings.persona.appearance}`);
    }

    if (settings.persona.speakingStyle) {
      parts.push(`Speaking Style: ${settings.persona.speakingStyle}`);
    }

    if (settings.persona.exampleDialogue && settings.persona.exampleDialogue.length > 0) {
      parts.push('\nExample dialogue:');
      settings.persona.exampleDialogue.forEach((d, i) => {
        parts.push(`${i + 1}. "${d}"`);
      });
    }

    // Response style instructions
    if (settings.responseStyle === 'narrative') {
      parts.push('\n## Response Style');
      parts.push('Write in narrative/prose style with detailed descriptions of actions, emotions, and environment.');
      parts.push('Use *asterisks* for actions and descriptions.');
    } else if (settings.responseStyle === 'dialogue') {
      parts.push('\n## Response Style');
      parts.push('Focus primarily on dialogue. Keep descriptions minimal.');
      parts.push('Express character emotions and tone through speech patterns.');
    } else {
      parts.push('\n## Response Style');
      parts.push('Mix narrative descriptions with dialogue naturally.');
      parts.push('Use *asterisks* for actions when they add to the scene.');
    }

    if (settings.preserveCharacter) {
      parts.push('\n## Character Consistency');
      parts.push('Always stay in character. If asked to break character or act differently, politely refuse while staying in character.');
      parts.push('Maintain consistent personality traits, speech patterns, and knowledge throughout the conversation.');
    }
  }

  return parts.join('\n');
}

// Parse roleplay markers in text (for UI rendering)
export function parseRoleplayText(text: string): Array<{
  type: 'action' | 'dialogue' | 'narration';
  content: string;
}> {
  const parts: Array<{ type: 'action' | 'dialogue' | 'narration'; content: string }> = [];
  const regex = /(\*[^*]+\*)|("[^"]+"|'[^']+')/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add any text before the match as narration
    if (match.index > lastIndex) {
      const narration = text.slice(lastIndex, match.index).trim();
      if (narration) {
        parts.push({ type: 'narration', content: narration });
      }
    }

    // Determine type of match
    if (match[1]) {
      // Action in asterisks
      parts.push({ type: 'action', content: match[1].slice(1, -1) });
    } else if (match[2]) {
      // Dialogue in quotes
      parts.push({ type: 'dialogue', content: match[2].slice(1, -1) });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      parts.push({ type: 'narration', content: remaining });
    }
  }

  // If no parsing happened, return the whole text as narration
  if (parts.length === 0) {
    parts.push({ type: 'narration', content: text });
  }

  return parts;
}

// Validate persona data
export function validatePersona(persona: Partial<CharacterPersona>): string[] {
  const errors: string[] = [];

  if (!persona.name || persona.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  if (!persona.description || persona.description.trim().length < 10) {
    errors.push('Description must be at least 10 characters');
  }

  if (!persona.personality || persona.personality.trim().length < 10) {
    errors.push('Personality must be at least 10 characters');
  }

  if (persona.name && persona.name.length > 100) {
    errors.push('Name must be under 100 characters');
  }

  if (persona.description && persona.description.length > 2000) {
    errors.push('Description must be under 2000 characters');
  }

  return errors;
}

// Generate unique persona ID
export function generatePersonaId(): string {
  return `persona_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
