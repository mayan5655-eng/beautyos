import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import designTokens from "./eslint-rules/design-tokens.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The design system, enforced: inline styles read the tokens in
  // app/globals.css and never a raw font size, radius or shadow.
  // scripts/tokenize-styles.mjs is the one-time sweep; this keeps it swept.
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    plugins: { local: { rules: { "design-tokens": designTokens } } },
    rules: { "local/design-tokens": "error" },
  },
]);

export default eslintConfig;
