-- LPSConfig Keymaps
local opts = { noremap=true, silent=true }
local map = vim.api.nvim_set_keymap

-- map('n', '<space>e', '<Cmd>lua vim.diagnostic.open_float()<CR>', opts)
-- map('n', '[d', '<Cmd>lua vim.diagnostic.goto_prev()<CR>', opts)
-- map('n', ']d', '<Cmd>lua vim.diagnostic.goto_next()<CR>', opts)
-- map('n', '<space>q', '<Cmd>lua vim.diagnostic.setloclist()<CR>', opts)


-- HSLLens Keymaps
map('n', 'n',
    [[<Cmd>execute('normal! ' . v:count1 . 'n')<CR><Cmd>lua require('hlslens').start()<CR>]],
    opts)
map('n', 'N',
    [[<Cmd>execute('normal! ' . v:count1 . 'N')<CR><Cmd>lua require('hlslens').start()<CR>]],
    opts)
map('n', '*', [[*<Cmd>lua require('hlslens').start()<CR>]], opts)
map('n', '#', [[#<Cmd>lua require('hlslens').start()<CR>]], opts)
map('n', 'g*', [[g*<Cmd>lua require('hlslens').start()<CR>]], opts)
map('n', 'g#', [[g#<Cmd>lua require('hlslens').start()<CR>]], opts)

map('x', '*', [[*<Cmd>lua require('hlslens').start()<CR>]], opts)
map('x', '#', [[#<Cmd>lua require('hlslens').start()<CR>]], opts)
map('x', 'g*', [[g*<Cmd>lua require('hlslens').start()<CR>]], opts)
map('x', 'g#', [[g#<Cmd>lua require('hlslens').start()<CR>]], opts)

map('n', '<Leader>l', ':noh<CR>', opts)


-- FTerm Keymaps
map('n', '<A-i>', '<Cmd>lua require("FTerm").toggle()<CR>', opts)
map('t', '<A-i>', '<C-\\><C-n><Cmd>lua require("FTerm").toggle()<CR>', opts)


-- TroubleToggle Keymaps
map('n', '<leader>xx', '<Cmd>TroubleToggle<CR>', opts)
map('n', '<leader>xw', '<Cmd>TroubleToggle workspace_diagnostics<CR>', opts)
map('n', '<leader>xd', '<Cmd>TroubleToggle document_diagnostics<CR>', opts)
-- map('n', 'gR', '<Cmd>TroubleToggle lsp_references<CR>', opts)
-- nnoremap <leader>xq <cmd>TroubleToggle quickfix<cr>
-- nnoremap <leader>xl <cmd>TroubleToggle loclist<cr>


-- BufferLine Keymaps
-- These commands will navigate through buffers in order regardless of which mode you are using
-- e.g. if you change the order of buffers :bnext and :bprevious will not respect the custom ordering
map('n', '<A-]>', '<Cmd>BufferLineCycleNext<CR>', opts)
map('n', '<A-[>', '<Cmd>BufferLineCyclePrev<CR>', opts)

-- These commands will move the current buffer backwards or forwards in the bufferline
map('n', '<mymap>', '<Cmd>BufferLineMoveNext<CR>', opts)
map('n', '<mymap>' , '<Cmd>BufferLineMovePrev<CR>', opts)


-- Nvim Tree Keymaps
map('n', '<C-t>', '<Cmd>NvimTreeToggle<CR>', opts)


-- Glow
map('n', '<A-p>', '<Cmd>Glow<CR>', opts)


-- Gitsigns
map('n', '<leader>td', '<Cmd>Gitsigns toggle_deleted<CR>', opts)
map('n', '<leader>tD', '<Cmd>Gitsigns diffthis<CR>', opts)


-- Others
map('n', '<A-q>', '<Cmd>Bdelete<CR>', opts)
map('n', '!<A-q>', '<Cmd>Bdelete!<CR>', opts)
