/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CanonCheckEnvelope } from '../models/CanonCheckEnvelope';
import type { CanonCheckRequest } from '../models/CanonCheckRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CanonService {
    /**
     * Check proposed NPC content against Canon Locks
     * @returns CanonCheckEnvelope Canon verdict
     * @throws ApiError
     */
    public static checkCanon({
        requestBody,
    }: {
        requestBody: CanonCheckRequest,
    }): CancelablePromise<CanonCheckEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/canon/check',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Missing or invalid credentials`,
            },
        });
    }
}
