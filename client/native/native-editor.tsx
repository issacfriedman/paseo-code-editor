import { useMemo } from "react";
import { Platform, Text, TextInput } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { highlightSpans, tokenColors } from "./highlight";
import { isDark } from "../colors";

type Props = {
  text: string;
  languageId: string;
  colored: boolean;
  theme: PluginTheme;
  onChangeText(text: string): void;
};

// Colored text goes in as children of the TextInput, so the phone editor keeps syntax colors while typing.
export function NativeEditor({ text, languageId, colored, theme, onChangeText }: Props) {
  const dark = isDark(theme.colors.surface0);
  const palette = tokenColors(dark);
  const spans = useMemo(
    () => (colored ? highlightSpans(text, languageId) : null),
    [text, languageId, colored],
  );
  const style = useMemo(
    () => ({
      flex: 1,
      padding: 12,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface0,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      fontSize: 13,
      lineHeight: 19,
      textAlignVertical: "top" as const,
    }),
    [theme],
  );
  return (
    <TextInput
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      smartInsertDelete={false}
      keyboardType="ascii-capable"
      scrollEnabled
      style={style}
      onChangeText={onChangeText}
      {...(spans ? {} : { value: text })}
    >
      {spans
        ? spans.map((span, index) => (
            <Text key={index} style={{ color: span.cls ? palette[span.cls] : theme.colors.foreground }}>
              {span.text}
            </Text>
          ))
        : null}
    </TextInput>
  );
}
