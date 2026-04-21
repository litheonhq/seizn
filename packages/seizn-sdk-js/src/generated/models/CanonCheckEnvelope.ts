/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CanonCheckEnvelope = {
    success: boolean;
    data: {
        ok: boolean;
        npcId?: string | null;
        locksChecked: number;
        verdict?: Record<string, any>;
        violation?: any | null;
    };
};
