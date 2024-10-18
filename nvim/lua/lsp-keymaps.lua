-- Use an on_attach function to only map the following keys
-- after the language server attaches to the current buffer
local map = vim.api.nvim_buf_set_keymap
local opts = {silent = true, noremap = true}

function on_attach(client, bufnr)
  -- Enable completion triggered by <c-x><c-o>
  vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')

  -- Mappings.
  -- See `:help vim.lsp.*` for documentation on any of the below functions
  map(bufnr, 'n', 'gD', '<cmd>lua vim.lsp.buf.declaration()<CR>', opts)
  map(bufnr, 'n', 'gd', '<cmd>lua vim.lsp.buf.definition()<CR>', opts)
  map(bufnr, 'n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<CR>', opts)
  -- map(bufnr, 'n', 'K', '<cmd>lua vim.lsp.buf.hover()<CR>', opts)
  -- map(bufnr, 'n', '<C-k>', '<cmd>lua vim.lsp.buf.signature_help()<CR>', opts)
  -- map(bufnr, 'n', '<space>wa', '<cmd>lua vim.lsp.buf.add_workspace_folder()<CR>', opts)
  -- map(bufnr, 'n', '<space>wr', '<cmd>lua vim.lsp.buf.remove_workspace_folder()<CR>', opts)
  -- map(bufnr, 'n', '<space>wl', '<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<CR>', opts)
  -- map(bufnr, 'n', '<space>D', '<cmd>lua vim.lsp.buf.type_definition()<CR>', opts)
  -- map(bufnr, 'n', '<space>rn', '<cmd>lua vim.lsp.buf.rename()<CR>', opts)
  -- map(bufnr, 'n', '<space>ca', '<cmd>lua vim.lsp.buf.code_action()<CR>', opts)
  -- map(bufnr, 'n', '<space>gr', '<cmd>lua vim.lsp.buf.references()<CR>', opts)
  map(bufnr, 'n', '<space>ca', '<cmd>CodeActionMenu<CR>', opts)
  map(bufnr, 'n', '<space>f', '<cmd>lua vim.lsp.buf.formatting()<CR>', opts)

  -- LSPSaga keymaps
  map(bufnr, "n", "gr", "<cmd>Lspsaga rename<cr>", opts)
  map(bufnr, "n", "ca", "<cmd>Lspsaga code_action<cr>", opts)
  map(bufnr, "x", "ca", ":<c-u>Lspsaga range_code_action<cr>", opts)
  map(bufnr, "n", "K",  "<cmd>Lspsaga hover_doc<cr>", opts)
  map(bufnr, "n", "<space>d", "<cmd>Lspsaga show_line_diagnostics<cr>", opts)
  map(bufnr, "n", "d]", "<cmd>Lspsaga diagnostic_jump_next<cr>", opts)
  map(bufnr, "n", "d[", "<cmd>Lspsaga diagnostic_jump_prev<cr>", opts)
  map(bufnr, "n", "<C-u>", "<cmd>lua require('lspsaga.action').smart_scroll_with_saga(-1, '<c-u>')<cr>", {})
  map(bufnr, "n", "<C-d>", "<cmd>lua require('lspsaga.action').smart_scroll_with_saga(1, '<c-d>')<cr>", {})
end

return on_attach
