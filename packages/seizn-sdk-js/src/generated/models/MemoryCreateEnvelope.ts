/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemoryRecord } from './MemoryRecord';
import type { ResponseMeta } from './ResponseMeta';
export type MemoryCreateEnvelope = {
    success: boolean;
    data: {
        memory?: MemoryRecord;
        budget?: Record<string, any>;
        bridge?: Record<string, any>;
    };
    meta?: ResponseMeta;
};

