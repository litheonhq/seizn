/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReplayEnvelope } from '../models/ReplayEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ReplayService {
    /**
     * Fetch a deterministic replay snapshot
     * @returns ReplayEnvelope Replay snapshot
     * @throws ApiError
     */
    public static fetchReplay({
        traceId,
    }: {
        traceId: string,
    }): CancelablePromise<ReplayEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/replay/{traceId}',
            path: {
                'traceId': traceId,
            },
            errors: {
                401: `Missing or invalid credentials`,
                404: `Resource not found`,
            },
        });
    }
}
