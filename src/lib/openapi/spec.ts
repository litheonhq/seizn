import specJson from "../../../openapi/seizn-openapi.json";

export type OpenApiDocument = typeof specJson;

export const openApiSpec: OpenApiDocument = specJson;

export function getOpenApiSpec(): OpenApiDocument {
  return openApiSpec;
}
