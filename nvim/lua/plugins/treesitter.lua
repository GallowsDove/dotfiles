require'nvim-treesitter.configs'.setup {
  highlight = {
    enable = true,
    additional_vim_regex_highlighting = false,
  },
}

local parser_config = require "nvim-treesitter.parsers".get_parser_configs()
parser_config.haskell = {
  install_info = {
    url = "~/.local/share/nvim/treesitter/tree-sitter-haskell",
    files = {"src/parser.c", "src/scanner.c"}
  }
}

