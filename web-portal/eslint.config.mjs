import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "docs/archived-code/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Allow unused variables that start with underscore
      "@typescript-eslint/no-unused-vars": ["warn", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      // Allow any type (with warning)
      "@typescript-eslint/no-explicit-any": "warn",
      // React specific
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      // Next.js specific
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
