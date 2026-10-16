// Bundled and down-leveled by scripts/build-native-vendor.mjs. The phone app runs plugin code on
// Hermes, which rejects class syntax, and every lezer package uses classes.
export { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
export { parser as jsParser } from "@lezer/javascript";
export { parser as pythonParser } from "@lezer/python";
export { parser as jsonParser } from "@lezer/json";
export { parser as cssParser } from "@lezer/css";
export { parser as htmlParser } from "@lezer/html";
export { parser as markdownParser } from "@lezer/markdown";
