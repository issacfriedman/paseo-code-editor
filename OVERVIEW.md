Adds a Code editor panel to each workspace, plus a Code tab in the Files sidebar on desktop and web, so you can browse, edit, and save files from any Paseo device.

On desktop and web, the panel runs Monaco, the editor from VS Code, connected to language servers on the daemon machine. You get autocomplete while you type, error underlines, hover info, quick fixes, go to definition, rename, find references, and formatting. Built in: TypeScript, JavaScript, Vue (through the Vue TypeScript plugin), Python (Pyright), JSON, CSS, and HTML. Swift, Go, and Rust work when sourcekit-lsp, gopls, or rust-analyzer is installed on the daemon machine. Mod+S saves and Mod+B shows or hides the file tree.

Settings → Plugins → Code editor sets the font (JetBrains Mono, Fira Code, Cascadia Code, Monaspace Neon, Geist Mono, or the system font), ligatures, text size, line height, color theme, minimap, word wrap, and sticky scroll. The fonts ship with the plugin and work offline.

On iPhone and iPad, the panel is a plain text editor with code colors for common languages and the same text size and line height. Language server features are desktop and web only. Paseo's phone app does not show plugin tabs in the Files sidebar, so use the tree inside the editor there.

The panel reloads a file when an agent changes it and you have no unsaved edits. If both changed, it asks you to reload or overwrite. Files are only read and written inside the workspace directory. Monaco loads from the daemon the first time you open the editor on a device. Each open panel runs its own language server processes; they stop 90 seconds after the panel closes.

Requires Node.js with npm on the daemon machine for installation.
