-- Setup nvim-cmp.
local cmp = require 'cmp'

cmp.setup({
    snippet = {
        expand = function(args)
            vim.snippet.expand(args.body)
            -- vim.fn["UltiSnips#Anon"](args.body)
        end,
    },
    mapping = {
        ['<Tab>'] = function(fallback)
            if cmp.visible() then
                cmp.select_next_item()
            else
                fallback()
            end
        end,
        ['<S-Tab>'] = function(fallback)
            if cmp.visible() then
                cmp.select_prev_item()
            else
                fallback()
            end
        end,
        ['<Esc>'] = cmp.mapping.close(),
        ['<CR>'] = cmp.mapping.confirm({ select = true }),
        ['<C-d>'] = cmp.mapping.scroll_docs(-4),
        ['<C-f>'] = cmp.mapping.scroll_docs(4),
    },
    window = {
      completion = cmp.config.window.bordered(),
      documentation = cmp.config.window.bordered(),
    },
    sources = {
        { name = 'nvim_lsp' },               -- For nvim-lsp
        -- { name = 'ultisnips' }, -- For ultisnips user.
        { name = 'nvim_lua' },               -- for nvim lua function
        { name = 'path' },                   -- for path completion
        { name = 'buffer',  keyword_length = 4 }, -- for buffer word completion
        { name = 'omni' },
        -- { name = 'emoji', insert = true, } -- emoji completion
    },
    completion = {
        keyword_length = 1,
        completeopt = "menu,noselect"
    },
    formatting = {
        format = require 'lspkind'.cmp_format {
            maxwidth = 50
        }
    }
})

require('transparent').clear_prefix('Cmp')
