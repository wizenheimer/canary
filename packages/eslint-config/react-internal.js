import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

import { config as baseConfig } from "./base.js";

export const config = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "detect" } },
  },
];
