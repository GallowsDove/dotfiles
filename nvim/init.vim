runtime plug.vim
runtime options.vim

lua << EOF
  require'impatient'
  
  require'transparent'.setup()
	
  -- Bufferline
  require'plugins.bufferline'
  
  -- Nvim Tree
  require'nvim-tree'.setup{ view = { width = 40, }, }

  -- Telescope
  require'telescope'.setup()
  require'telescope'.load_extension'repo'
  ---require'telescope'.load_extension'fzf'

  -- Gitsigns
  require'gitsigns'.setup()

  -- nvim-web-devicons
  require'nvim-web-devicons'.setup()

  -- Treesitter
  require'plugins.treesitter'

  -- Lualine
  require'line'

  -- Glow
  require'glow'.setup()

  -- Alpha
  require'startscreen'.setup()

  -- LSPConfig
  require'plugins.lspconfig'
   
  -- UltiSnips
  require'plugins.ultisnips'

  -- Cmp
  require'plugins.cmp' 

  -- LSPSaga
  require'plugins.lspsaga'

  -- Trouble
  require'trouble'.setup()

  -- Better Escape
  require'better_escape'.setup()
 
  -- Indent Blankline
  require'ibl'.setup()

  -- Comment
  require'Comment'.setup()

  -- Hls Lens
  require'hlslens'.setup()

  -- Set Keymaps
  require'keymaps'
EOF

autocmd CmdlineEnter * ++once runtime wilder.vim | call wilder#main#start()

colorscheme dracula
