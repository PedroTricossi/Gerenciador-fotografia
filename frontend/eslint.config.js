import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "src/api/schema.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-console": "error",
      // With noUncheckedIndexedAccess, `list[0]!` after a length check is the honest form.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Plain browser scripts copied as-is by Vite.
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Layering: domain and ui stay independent of the app around them.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-*", "**/api/*", "**/ui/*", "**/features/*", "**/app/*"] },
      ],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["**/api/*", "**/domain/*", "**/features/*", "**/app/*"] },
      ],
    },
  },
);
