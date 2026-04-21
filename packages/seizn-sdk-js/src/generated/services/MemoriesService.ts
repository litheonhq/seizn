/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddMemoryRequest } from '../models/AddMemoryRequest';
import type { DeleteMemoriesEnvelope } from '../models/DeleteMemoriesEnvelope';
import type { DeleteMemoriesRequest } from '../models/DeleteMemoriesRequest';
import type { MemoryCreateEnvelope } from '../models/MemoryCreateEnvelope';
import type { MemoryListEnvelope } from '../models/MemoryListEnvelope';
import type { MemoryScope } from '../models/MemoryScope';
import type { MemoryType } from '../models/MemoryType';
import type { SearchMode } from '../models/SearchMode';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MemoriesService {
    /**
     * Search or browse memories
     * @returns MemoryListEnvelope Memory search response
     * @throws ApiError
     */
    public static searchMemories({
        query,
        limit = 20,
        offset,
        namespace = 'default',
        memoryType,
        tags,
        agentId,
        scope,
        mode,
        threshold,
    }: {
        /**
         * Optional search query. Omit to browse chronologically.
         */
        query?: string,
        limit?: number,
        offset?: number,
        namespace?: string,
        memoryType?: MemoryType,
        /**
         * Comma-separated tag filters.
         */
        tags?: string,
        agentId?: string,
        scope?: MemoryScope,
        mode?: SearchMode,
        threshold?: number,
    }): CancelablePromise<MemoryListEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/memories',
            query: {
                'query': query,
                'limit': limit,
                'offset': offset,
                'namespace': namespace,
                'memory_type': memoryType,
                'tags': tags,
                'agent_id': agentId,
                'scope': scope,
                'mode': mode,
                'threshold': threshold,
            },
            errors: {
                401: `Missing or invalid credentials`,
            },
        });
    }
    /**
     * Create a memory
     * @returns MemoryCreateEnvelope Created memory
     * @throws ApiError
     */
    public static createMemory({
        requestBody,
    }: {
        requestBody: AddMemoryRequest,
    }): CancelablePromise<MemoryCreateEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/memories',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Missing or invalid credentials`,
                422: `Request validation failed`,
            },
        });
    }
    /**
     * Delete memories by id
     * @returns DeleteMemoriesEnvelope Delete result
     * @throws ApiError
     */
    public static deleteMemories({
        requestBody,
    }: {
        requestBody: DeleteMemoriesRequest,
    }): CancelablePromise<DeleteMemoriesEnvelope> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/memories',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Missing or invalid credentials`,
            },
        });
    }
}
