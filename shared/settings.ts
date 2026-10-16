import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const FONTS = [
  { value: "jetbrains-mono", label: "JetBrains Mono", css: "'JetBrains Mono'" },
  { value: "fira-code", label: "Fira Code", css: "'Fira Code'" },
  { value: "cascadia-code", label: "Cascadia Code", css: "'Cascadia Code'" },
  { value: "monaspace-neon", label: "Monaspace Neon", css: "'Monaspace Neon'" },
  { value: "geist-mono", label: "Geist Mono", css: "'Geist Mono'" },
  { value: "system", label: "SF Mono / Menlo (system)", css: "ui-monospace, SFMono-Regular, Menlo" },
] as const;

export const THEMES = [
  { value: "paseo", label: "Follow Paseo theme" },
  { value: "vs-dark", label: "Dark+ (VS Code)" },
  { value: "vs", label: "Light+ (VS Code)" },
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "github-light", label: "GitHub Light" },
  { value: "dracula", label: "Dracula" },
  { value: "monokai", label: "Monokai" },
  { value: "hc-black", label: "High contrast" },
] as const;

export const editorSettings = defineSettings({
  id: "editor",
  scope: "host",
  version: 1,
  schema: z.object({
    font: z.string().default("jetbrains-mono"),
    ligatures: z.boolean().default(true),
    fontSize: z.number().min(9).max(32).default(13),
    lineHeight: z.number().min(1).max(2.5).default(1.6),
    theme: z.string().default("paseo"),
    minimap: z.boolean().default(true),
    wordWrap: z.boolean().default(false),
    stickyScroll: z.boolean().default(true),
  }),
});

export type EditorPrefs = {
  font: string;
  ligatures: boolean;
  fontSize: number;
  lineHeight: number;
  theme: string;
  minimap: boolean;
  wordWrap: boolean;
  stickyScroll: boolean;
};

export const DEFAULT_PREFS: EditorPrefs = editorSettings.schema.parse({});
