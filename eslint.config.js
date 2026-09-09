import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
 eslint.configs.recommended,
 {
 files: ["**/*.ts"],
 languageOptions: {
 parser: tsparser,
 parserOptions: {
 ecmaVersion: 2022,
 sourceType: "module",
 },
 globals: {
 ...globals.node,
 ...globals.es2022,
 },
 },
 plugins: {
 "@typescript-eslint": tseslint,
 },
 rules: {
 ...tseslint.configs["recommended"].rules,
 "@typescript-eslint/no-explicit-any": "off",
 "@typescript-eslint/explicit-module-boundary-types": "off",
 "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
 "no-undef": "off",
 },
 },
];
