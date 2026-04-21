/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemoryRecord } from './MemoryRecord';
import type { ResponseMeta } from './ResponseMeta';
export type MemoryListEnvelope = {
    success: boolean;
    data: {
        memories?: Array<MemoryRecord>;
        results?: Array<MemoryRecord>;
    };
    meta?: ResponseMeta;
};
