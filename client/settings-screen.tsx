import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { editorSettings, FONTS, THEMES, type EditorPrefs } from "../shared/settings";

const SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24];
const LINE_HEIGHTS = [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0];

export function EditorSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(editorSettings);
  if (settings.status !== "ready") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>{settings.status === "loading" ? "Loading…" : "Settings unavailable."}</Text>;
  }
  const values = settings.values as EditorPrefs;
  const set = (patch: Partial<EditorPrefs>) => void settings.save({ ...values, ...patch }, settings.revision);
  return (
    <>
      <SettingsSection title="Font">
        <SettingsCard>
          <SettingsSelect
            label="Font"
            value={values.font}
            options={FONTS.map((f) => ({ label: f.label, value: f.value }))}
            onValueChange={(font) => set({ font })}
          />
          <SettingsSwitch
            label="Ligatures"
            hint="Joins symbols like === and => into one shape. Desktop and web."
            value={values.ligatures}
            onValueChange={(ligatures) => set({ ligatures })}
          />
          <SettingsSelect
            label="Text size"
            value={String(values.fontSize)}
            options={SIZES.map((n) => ({ label: `${n} px`, value: String(n) }))}
            onValueChange={(v) => set({ fontSize: Number(v) })}
          />
          <SettingsSelect
            label="Line height"
            value={String(values.lineHeight)}
            options={LINE_HEIGHTS.map((n) => ({ label: n.toFixed(1), value: String(n) }))}
            onValueChange={(v) => set({ lineHeight: Number(v) })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Editor">
        <SettingsCard>
          <SettingsSelect
            label="Color theme"
            hint="Desktop and web. The phone editor follows the Paseo theme."
            value={values.theme}
            options={THEMES.map((t) => ({ label: t.label, value: t.value }))}
            onValueChange={(theme) => set({ theme })}
          />
          <SettingsSwitch label="Minimap" value={values.minimap} onValueChange={(minimap) => set({ minimap })} />
          <SettingsSwitch label="Word wrap" value={values.wordWrap} onValueChange={(wordWrap) => set({ wordWrap })} />
          <SettingsSwitch
            label="Sticky scroll"
            hint="Keeps the current function or class name at the top."
            value={values.stickyScroll}
            onValueChange={(stickyScroll) => set({ stickyScroll })}
          />
        </SettingsCard>
      </SettingsSection>
      {settings.saveError ? <Text style={{ color: theme.colors.statusDanger }}>{String(settings.saveError)}</Text> : null}
    </>
  );
}
