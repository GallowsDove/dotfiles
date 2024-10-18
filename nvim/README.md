# Just Nvim
Just Nvim is just a personal nvim configuaration. It's not meant to be portable, or to appeal to anyone at all. Tested on Kali linux.

### Instalation
First, you need to install [vim-plug](https://github.com/junegunn/vim-plug).
Then **just** clone this repository and move all files to your nvim config folder (e.g. ~/.config/nvim/).
There should be an error message on your first launch. Simply run `:PlugInstall`, which should install all required plugins.  
  
A possible way to achieve that would be:  
- Create backup
```shell
cp -r ~/.config/nvim ~/.config/.nvim 
```

- Remove current config
```shell
rm -rf ~/.config/nvim 
```

- Clone this repository
```shell
git clone https://github.com/GallowsDove/just-nvim ~/.config/nvim
```

### Optional dependencies
You can check dependencies using :checkhealth

- Language servers of choice. (Have to be added to lua/plugins/lspconfig.lua)
- TreeSitter grammars can pe installed via :TSInstall
- Git - For git stuff
- [**Fd**](https://github.com/sharkdp/fd) - For better file browsing, and for searching repositories. Also for default wilder config.
- [Ripgrep](https://github.com/BurntSushi/ripgrep) - For extended telescope functions
- [Glow](https://github.com/charmbracelet/glow) - For markdown preview
- [Bat](https://github.com/sharkdp/bat) - For better file previews


### Custom Keybindings

Keybindings can be added to keymaps.lua.
Keybindings specific to LSP should be added to lsp-keymaps.lua.

| Keybind         | Action                                 |
|:---------------:|:--------------------------------------:|
| `<A-i>`         | Open/Close terminal                    |
| `\xx`           | Toggle Trouble                         |
| `\xd`           | Trouble document diagnostics           |
| `\xw`           | Trouble workspace diagnostics          |
| `\xr`           | Trouble LSP References                 |
| `<A-[>` `<A-]>` | Open previous/next buffer              |
| `<C-t>`         | Open Nvim Tree                         |
| `<A-p>`         | Markdown Glow preview                  |
| `<A-q>`         | Close current buffer                   |
| `!<A-q>`        | Force close current buffer             |
| `[d`  `]d`      | Jump to previous/next diagnostic       |
| `gd`            | Go to definition                       |
| `gD`            | Go to declaration                      |
| `gi`            | Go to implementation                   |
| `ca`            | Code action                            |
| `<space>ca`     | Extended code action menu              |
| `gr`            | Rename                                 |
| `K`             | Show hover doc                         |
| `<space>d`      | Show line diagnostics                  |
| `gc`            | Linewise comment                       |
| `gb`            | Blockwise comment                      |
| `\gd`           | Show deleted lines (git)               |
| `\gD`           | Show git diff                          |
