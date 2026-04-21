/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemoryScope } from './MemoryScope';
import type { MemoryType } from './MemoryType';
export type AddMemoryRequest = {
    content?: string;
    encrypted_content?: string;
    is_encrypted?: boolean;
    memory_type?: MemoryType;
    tags?: Array<string>;
    namespace?: string;
    scope?: MemoryScope;
    session_id?: string;
    agent_id?: string;
    entity_id?: string;
    pinned?: boolean;
    memory_class?: string;
    half_life_hours?: number | null;
    source?: string;
    companion_meta?: any | null;
};
