import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next/**", ".vinext/**", ".wrangler/**", ".stratus-input/**", "build/**", "dist/**", "node_modules/**", "next-env.d.ts"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
