local servers = require'lsp-servers'.get()

local capabilities = require('cmp_nvim_lsp').default_capabilities(vim.lsp.protocol.make_client_capabilities())

for _, lsp in ipairs(servers) do
  vim.lsp.config(lsp, {
	capabilities = capabilities,
    on_attach = require'lsp-keymaps'
  })
  vim.lsp.enable(lsp)
end

