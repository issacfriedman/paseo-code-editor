Adds a Code editor panel to each workspace, so you can open, edit, and save files from any Paseo device.

On desktop and web, the panel uses CodeMirror with code colors and language servers. You get error underlines, autocomplete, hover info, go to definition (F12), rename (F2), find references (Shift+F12), and formatting (Shift+Alt+F). Mod+S saves and Mod+P opens files. Built in: TypeScript and JavaScript, Python (Pyright), JSON, CSS, and HTML. Swift, Go, and Rust work when sourcekit-lsp, gopls, or rust-analyzer is installed on the daemon machine.

On iPhone and iPad, the panel is a plain text editor with code colors for common languages. Language server features are desktop and web only.

The panel reloads a file when an agent changes it and you have no unsaved edits. If both changed, it asks you to reload or overwrite. Files are only read and written inside the workspace directory. Each open panel runs its own language server processes on the daemon machine; they stop 90 seconds after the panel closes.
