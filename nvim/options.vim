set completeopt=menu,menuone,noselect
set termguicolors
set hidden
set clipboard=unnamedplus
set mouse=a
set number
set noshowmode
set undofile
set scrolloff=7
set sidescrolloff=7
set nuw=3
set shiftwidth=4
set tabstop=4


autocmd FileType haskell setlocal shiftwidth=2 softtabstop=2 expandtab

let g:indent_blankline_filetype_exclude=['lspinfo', 'checkhealth', 'help', 'alpha', '']
let g:indent_blankline_buftype_exclude = ['terminal']
