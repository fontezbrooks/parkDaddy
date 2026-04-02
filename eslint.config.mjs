import { createRequire } from "module";
const require = createRequire(import.meta.url);

const expoFlat = require("eslint-config-expo/flat");

export default [
  ...expoFlat,
  {
    ignores: [
      "node_modules/",
      ".expo/",
      "convex/_generated/",
      "dist/",
    ],
  },
];
