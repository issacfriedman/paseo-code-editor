import type { Parser } from "@lezer/common";
import {
  cssParser,
  highlightTree,
  htmlParser,
  jsParser,
  jsonParser,
  markdownParser,
  pythonParser,
  tagHighlighter,
  tags as t,
} from "./vendor/lezer";

// Pure-JS grammars only, prebuilt without classes for Hermes. CodeMirror's view needs a DOM,
// which the phone app does not have.
const parsers: Record<string, () => Parser> = {
  typescript: () => jsParser.configure({ dialect: "ts" }),
  tsx: () => jsParser.configure({ dialect: "ts jsx" }),
  javascript: () => jsParser,
  jsx: () => jsParser.configure({ dialect: "jsx" }),
  python: () => pythonParser,
  json: () => jsonParser,
  css: () => cssParser,
  html: () => htmlParser,
  // Template tags and attributes get colors; script and style blocks stay plain on the phone.
  vue: () => htmlParser,
  markdown: () => markdownParser,
};
const cache = new Map<string, Parser>();

export type TokenClass =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "property"
  | "tag"
  | "attribute"
  | "heading"
  | "link"
  | "punctuation";

const highlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.bool, t.null, t.self], class: "keyword" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], class: "string" },
  { tag: [t.number, t.integer, t.float], class: "number" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: "comment" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: "function" },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], class: "type" },
  { tag: [t.propertyName, t.definition(t.propertyName)], class: "property" },
  { tag: [t.tagName, t.angleBracket], class: "tag" },
  { tag: [t.attributeName], class: "attribute" },
  { tag: [t.heading, t.strong, t.emphasis], class: "heading" },
  { tag: [t.link, t.url], class: "link" },
  { tag: [t.punctuation, t.bracket, t.operator, t.separator], class: "punctuation" },
]);

export type Span = { text: string; cls: TokenClass | null };

// Past this size, colouring every keystroke gets slow on a phone.
export const MAX_HIGHLIGHT_CHARS = 40_000;

export function canHighlight(languageId: string) {
  return languageId in parsers;
}

export function highlightSpans(text: string, languageId: string): Span[] {
  const make = parsers[languageId];
  if (!make || text.length > MAX_HIGHLIGHT_CHARS) return [{ text, cls: null }];
  let parser = cache.get(languageId);
  if (!parser) cache.set(languageId, (parser = make()));
  const tree = parser.parse(text);
  const spans: Span[] = [];
  let pos = 0;
  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > pos) spans.push({ text: text.slice(pos, from), cls: null });
    spans.push({ text: text.slice(from, to), cls: (classes.split(" ")[0] as TokenClass) || null });
    pos = to;
  });
  if (pos < text.length) spans.push({ text: text.slice(pos), cls: null });
  return spans;
}

const DARK: Record<TokenClass, string> = {
  keyword: "#c678dd",
  string: "#98c379",
  number: "#d19a66",
  comment: "#7f848e",
  function: "#61afef",
  type: "#e5c07b",
  property: "#e06c75",
  tag: "#e06c75",
  attribute: "#d19a66",
  heading: "#e5c07b",
  link: "#56b6c2",
  punctuation: "#abb2bf",
};

const LIGHT: Record<TokenClass, string> = {
  keyword: "#a626a4",
  string: "#50a14f",
  number: "#986801",
  comment: "#a0a1a7",
  function: "#4078f2",
  type: "#c18401",
  property: "#e45649",
  tag: "#e45649",
  attribute: "#986801",
  heading: "#c18401",
  link: "#0184bc",
  punctuation: "#696c77",
};

export function tokenColors(dark: boolean) {
  return dark ? DARK : LIGHT;
}
