module.exports = {
  env: { browser: true, es2021: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "airbnb",
    "airbnb-typescript",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint", "import", "prettier"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "FunctionExpression[generator=false]:not(:has(ThisExpression))",
        message:
          "FunctionExpression: Function syntax is illegal. Only arrow functions are allowed",
      },
      {
        selector:
          "FunctionDeclaration[generator=false]:not(:has(ThisExpression))",
        message:
          "FunctionDeclaration: Function syntax is illegal. Only arrow functions are allowed",
      },
    ],
    "prettier/prettier": "error",
    "import/prefer-default-export": "off",
    "import/no-default-export": "error",
    "sort-imports": [
      "error",
      {
        ignoreCase: false,
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
        allowSeparatedGroups: true,
      },
    ],
    "import/order": [
      "error",
      {
        groups: [
          "external",
          "builtin",
          "internal",
          ["sibling", "parent"],
          "index",
        ],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-import-type-side-effects": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "default",
        format: ["camelCase"],
        leadingUnderscore: "allow",
      },
      {
        selector: ["variable", "parameter"],
        format: ["camelCase"],
        leadingUnderscore: "allow",
      },
      {
        selector: "variable",
        format: ["camelCase"],
        leadingUnderscore: "allow",
        modifiers: ["const"],
      },
      { selector: "enumMember", format: ["camelCase"] },
      { selector: "property", format: null, leadingUnderscore: "allow" },
      { selector: ["enum", "typeLike"], format: ["PascalCase"] },
    ],
  },
};
