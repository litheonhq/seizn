'use client';

import { useMemo } from 'react';
import { useAuthorCharacters } from '@/hooks/useAuthorMemoryV3';

interface AuthorCharacterLike {
  id?: unknown;
  character_id?: unknown;
  name?: unknown;
}

export function useCharacterNameMap(projectId: string): Map<string, string> {
  const characters = useAuthorCharacters(projectId);
  const characterList = characters.data?.characters as AuthorCharacterLike[] | undefined;

  return useMemo(() => {
    const names = new Map<string, string>();
    for (const character of characterList ?? []) {
      const id = character.id ?? character.character_id;
      if (!id || typeof character.name !== 'string') continue;
      names.set(String(id), character.name);
    }
    return names;
  }, [characterList]);
}
