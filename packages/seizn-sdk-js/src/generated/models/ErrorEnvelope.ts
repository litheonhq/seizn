/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ResponseMeta } from './ResponseMeta';
export type ErrorEnvelope = {
    success: boolean;
    error: {
        code: string;
        message: string;
    };
    meta?: ResponseMeta;
};

