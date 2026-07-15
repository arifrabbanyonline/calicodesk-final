/**
 * This is intended to be a basic starting point for linting in your app.
 * It relies on recommended configs out of the box for simplicity, but you can
 * and should modify this configuration to best suit your team's needs.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  ignorePatterns: ["!**/.server", "!**/.client"],

  // Base config
  extends: ["eslint:recommended"],

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx}"],
      plugins: ["react", "jsx-a11y", "import"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
        "plugin:import/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          node: {
            extensions: [".js", ".jsx"],
          },
        },
      },
      rules: {
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
        "react/prop-types": "off",
      },
    },

    // Node
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.js",
        ".graphqlrc.js",
        "shopify.server.js",
        "**/*.server.js",
      ],
      env: {
        node: true,
      },
    },
  ],
  globals: {
    shopify: "readonly",
  },
};
