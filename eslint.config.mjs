import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**/*",
      "node_modules/**/*",
      "mcp-server/**/*",
      "scripts/**/*",
      "sdks/**/*",
      "packages/**/*",
      "cli/**/*",
      "sdk/**/*",
      "**/dist/**/*",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default eslintConfig;
