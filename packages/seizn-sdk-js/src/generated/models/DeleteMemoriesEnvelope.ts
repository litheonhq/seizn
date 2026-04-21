/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ResponseMeta } from './ResponseMeta';
export type DeleteMemoriesEnvelope = {
    success: boolean;
    data?: {
        deleted?: number;
        ids?: Array<string>;
    };
    meta?: ResponseMeta;
};

