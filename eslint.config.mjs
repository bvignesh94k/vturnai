import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The logger is the single sink for structured output; console is its job.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
]);

export default eslintConfig;
