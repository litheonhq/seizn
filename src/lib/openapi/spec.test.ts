import { describe, expect, it } from "vitest";
import { getOpenApiSpec } from "./spec";

describe("OpenAPI spec", () => {
  it("serves a JSON-serializable OpenAPI 3.1 contract", () => {
    const spec = getOpenApiSpec();
    const encoded = JSON.stringify(spec);
    const decoded = JSON.parse(encoded);

    expect(decoded.openapi).toBe("3.1.0");
    expect(decoded.paths["/api/v1/memories"].post.operationId).toBe("createMemory");
    expect(decoded.paths["/api/canon/check"].post.operationId).toBe("checkCanon");
    expect(decoded.paths["/api/v1/replay/{traceId}"].get.operationId).toBe("fetchReplay");
    expect(decoded.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });
});
