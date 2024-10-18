local servers = require'lsp-servers'.get()

local capabilities = require('cmp_nvim_lsp').default_capabilities(vim.lsp.protocol.make_client_capabilities())

for _, lsp in ipairs(servers) do
  require('lspconfig')[lsp].setup {
	capabilities = capabilities,
    on_attach = require'lsp-keymaps',
    flags = {
      -- This will be the default in neovim 0.7+
      debounce_text_changes = 150,
    }
  }
end

