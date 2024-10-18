call plug#begin()

function! UpdateRemotePlugins(...)
  " Needed to refresh runtime files
  let &rtp=&rtp
  UpdateRemotePlugins
endfunction

Plug 'lewis6991/impatient.nvim'
Plug 'kyazdani42/nvim-tree.lua'
Plug 'gelguy/wilder.nvim', { 'on': 'CmdlineEnter', 'do': function('UpdateRemotePlugins') }
Plug 'folke/lsp-colors.nvim'
Plug 'folke/trouble.nvim'
Plug 'nvim-treesitter/nvim-treesitter'
Plug 'kevinhwang91/nvim-hlslens'
Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/cmp-path'
Plug 'hrsh7th/cmp-cmdline'
Plug 'hrsh7th/nvim-cmp'
Plug 'SirVer/ultisnips'
Plug 'kyazdani42/nvim-web-devicons'
Plug 'nvim-lualine/lualine.nvim'
Plug 'quangnguyen30192/cmp-nvim-ultisnips'
Plug 'max397574/better-escape.nvim'
Plug 'goolord/alpha-nvim'
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'
Plug 'cljoly/telescope-repo.nvim'
Plug 'nvim-telescope/telescope-fzf-native.nvim', { 'do': 'make' }
Plug 'romgrk/fzy-lua-native', { 'do': 'make' }
Plug 'weilbith/nvim-code-action-menu'
Plug 'tami5/lspsaga.nvim'
Plug 'numToStr/FTerm.nvim'
Plug 'Mofiqul/dracula.nvim'
Plug 'akinsho/bufferline.nvim'
Plug 'lukas-reineke/indent-blankline.nvim'
Plug 'ellisonleao/glow.nvim'
Plug 'honza/vim-snippets'
Plug 'onsails/lspkind-nvim'
Plug 'numToStr/Comment.nvim'
Plug 'lewis6991/gitsigns.nvim'
Plug 'xiyaowong/nvim-transparent'
Plug 'famiu/bufdelete.nvim'

call plug#end()


