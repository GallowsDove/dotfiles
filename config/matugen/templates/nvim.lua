local palette = {
  bg       = "{{colors.background.default.hex}}",
  fg       = "{{colors.on_background.default.hex}}",
  cursor   = "{{colors.primary.default.hex}}",

  color0   = "{{dank16.color0.default.hex}}",
  color1   = "{{dank16.color1.default.hex}}",
  color2   = "{{dank16.color2.default.hex}}",
  color3   = "{{dank16.color3.default.hex}}",
  color4   = "{{dank16.color4.default.hex}}",
  color5   = "{{dank16.color5.default.hex}}",
  color6   = "{{dank16.color6.default.hex}}",
  color7   = "{{dank16.color7.default.hex}}",
  color8   = "{{dank16.color8.default.hex}}",
  color9   = "{{dank16.color9.default.hex}}",
  color10  = "{{dank16.color10.default.hex}}",
  color11  = "{{dank16.color11.default.hex}}",
  color12  = "{{dank16.color12.default.hex}}",
  color13  = "{{dank16.color13.default.hex}}",
  color14  = "{{dank16.color14.default.hex}}",
  color15  = "{{dank16.color15.default.hex}}",
}

vim.o.termguicolors = true
vim.g.colors_name = "hypr_dank16"

vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end

local set = vim.api.nvim_set_hl
local function hi(group, spec)
  set(0, group, spec)
end

-- Base UI
hi("Normal",       { fg = palette.fg, bg = palette.bg })
hi("NormalNC",     { fg = palette.fg, bg = palette.bg })
hi("NormalFloat",  { fg = palette.fg, bg = palette.color0 })
hi("FloatBorder",  { fg = palette.color8, bg = palette.color0 })
hi("Cursor",       { fg = palette.bg, bg = palette.cursor })
hi("lCursor",      { fg = palette.bg, bg = palette.cursor })
hi("TermCursor",   { fg = palette.bg, bg = palette.cursor })

hi("CursorLine",   { bg = palette.color0 })
hi("CursorColumn", { bg = palette.color0 })
hi("ColorColumn",  { bg = palette.color0 })
hi("LineNr",       { fg = palette.color8, bg = palette.bg })
hi("CursorLineNr", { fg = palette.color3, bg = palette.bg, bold = true })
hi("SignColumn",   { fg = palette.fg, bg = palette.bg })
hi("FoldColumn",   { fg = palette.color8, bg = palette.bg })
hi("Folded",       { fg = palette.color8, bg = palette.color0 })

hi("StatusLine",   { fg = palette.fg, bg = palette.color0 })
hi("StatusLineNC", { fg = palette.color8, bg = palette.color0 })
hi("WinSeparator", { fg = palette.color8, bg = palette.bg })
hi("VertSplit",    { fg = palette.color8, bg = palette.bg })

hi("TabLine",      { fg = palette.color8, bg = palette.color0 })
hi("TabLineFill",  { fg = palette.color8, bg = palette.bg })
hi("TabLineSel",   { fg = palette.fg, bg = palette.bg, bold = true })

-- Popup menu
hi("Pmenu",        { fg = palette.fg, bg = palette.color0 })
hi("PmenuSel",     { fg = palette.bg, bg = palette.color4, bold = true })
hi("PmenuSbar",    { bg = palette.color0 })
hi("PmenuThumb",   { bg = palette.color8 })

-- Selection / search
hi("Visual",       { bg = palette.color8 })
hi("VisualNOS",    { bg = palette.color8 })
hi("Search",       { fg = palette.bg, bg = palette.color3 })
hi("IncSearch",    { fg = palette.bg, bg = palette.color1, bold = true })
hi("CurSearch",    { fg = palette.bg, bg = palette.color1, bold = true })
hi("MatchParen",   { fg = palette.color4, bold = true })

-- Syntax
hi("Comment",      { fg = palette.color8, italic = true })
hi("Constant",     { fg = palette.color5 })
hi("String",       { fg = palette.color2 })
hi("Character",    { fg = palette.color2 })
hi("Number",       { fg = palette.color5 })
hi("Boolean",      { fg = palette.color5 })
hi("Float",        { fg = palette.color5 })

hi("Identifier",   { fg = palette.color4 })
hi("Function",     { fg = palette.color4, bold = true })

hi("Statement",    { fg = palette.color1 })
hi("Conditional",  { fg = palette.color1 })
hi("Repeat",       { fg = palette.color1 })
hi("Keyword",      { fg = palette.color1 })
hi("Exception",    { fg = palette.color1 })
hi("Operator",     { fg = palette.color1 })

hi("PreProc",      { fg = palette.color3 })
hi("Include",      { fg = palette.color3 })
hi("Define",       { fg = palette.color3 })
hi("Macro",        { fg = palette.color3 })

hi("Type",         { fg = palette.color6 })
hi("StorageClass", { fg = palette.color6 })
hi("Structure",    { fg = palette.color6 })
hi("Typedef",      { fg = palette.color6 })

hi("Special",      { fg = palette.color13 })
hi("Delimiter",    { fg = palette.fg })
hi("Underlined",   { underline = true })
hi("Todo",         { fg = palette.bg, bg = palette.color3, bold = true })
hi("Error",        { fg = palette.color1, bold = true })
hi("ErrorMsg",     { fg = palette.color1, bold = true })
hi("WarningMsg",   { fg = palette.color3, bold = true })

-- Diagnostics
hi("DiagnosticError",            { fg = palette.color1 })
hi("DiagnosticWarn",             { fg = palette.color3 })
hi("DiagnosticInfo",             { fg = palette.color4 })
hi("DiagnosticHint",             { fg = palette.color6 })
hi("DiagnosticOk",               { fg = palette.color2 })
hi("DiagnosticVirtualTextError", { fg = palette.color1, bg = palette.bg })
hi("DiagnosticVirtualTextWarn",  { fg = palette.color3, bg = palette.bg })
hi("DiagnosticVirtualTextInfo",  { fg = palette.color4, bg = palette.bg })
hi("DiagnosticVirtualTextHint",  { fg = palette.color6, bg = palette.bg })
hi("DiagnosticUnderlineError",   { undercurl = true, sp = palette.color1 })
hi("DiagnosticUnderlineWarn",    { undercurl = true, sp = palette.color3 })
hi("DiagnosticUnderlineInfo",    { undercurl = true, sp = palette.color4 })
hi("DiagnosticUnderlineHint",    { undercurl = true, sp = palette.color6 })

-- Diff / git
hi("GitSignsAdd",    { fg = palette.color2, bg = palette.bg })
hi("GitSignsChange", { fg = palette.color3, bg = palette.bg })
hi("GitSignsDelete", { fg = palette.color1, bg = palette.bg })
hi("DiffAdd",        { fg = palette.color2, bg = palette.bg })
hi("DiffChange",     { fg = palette.color3, bg = palette.bg })
hi("DiffDelete",     { fg = palette.color1, bg = palette.bg })
hi("DiffText",       { fg = palette.color4, bg = palette.bg, bold = true })

-- NvimTree
hi("NvimTreeNormal",           { fg = palette.fg, bg = palette.bg })
hi("NvimTreeNormalNC",         { fg = palette.fg, bg = palette.bg })
hi("NvimTreeRootFolder",       { fg = palette.color4, bold = true })
hi("NvimTreeFolderName",       { fg = palette.color4 })
hi("NvimTreeOpenedFolderName", { fg = palette.color4, bold = true })
hi("NvimTreeEmptyFolderName",  { fg = palette.color8 })
hi("NvimTreeIndentMarker",     { fg = palette.color8 })
hi("NvimTreeGitDirty",         { fg = palette.color3 })
hi("NvimTreeGitNew",           { fg = palette.color2 })
hi("NvimTreeGitDeleted",       { fg = palette.color1 })

-- Bufferline
hi("BufferLineFill",              { bg = palette.bg })
hi("BufferLineBackground",        { fg = palette.color8, bg = palette.bg })
hi("BufferLineBufferVisible",     { fg = palette.fg, bg = palette.bg })
hi("BufferLineBufferSelected",    { fg = palette.fg, bg = palette.bg, bold = true })
hi("BufferLineSeparator",         { fg = palette.bg, bg = palette.bg })
hi("BufferLineSeparatorVisible",  { fg = palette.bg, bg = palette.bg })
hi("BufferLineSeparatorSelected", { fg = palette.bg, bg = palette.bg })
hi("BufferLineIndicatorSelected", { fg = palette.color4, bg = palette.bg })
hi("BufferLineModified",          { fg = palette.color3, bg = palette.bg })
hi("BufferLineModifiedSelected",  { fg = palette.color3, bg = palette.bg })

-- Telescope
hi("TelescopeNormal",        { fg = palette.fg, bg = palette.bg })
hi("TelescopeBorder",        { fg = palette.color8, bg = palette.bg })
hi("TelescopePromptNormal",  { fg = palette.fg, bg = palette.color0 })
hi("TelescopePromptBorder",  { fg = palette.color8, bg = palette.color0 })
hi("TelescopeResultsNormal", { fg = palette.fg, bg = palette.bg })
hi("TelescopeResultsBorder", { fg = palette.color8, bg = palette.bg })
hi("TelescopePreviewNormal", { fg = palette.fg, bg = palette.bg })
hi("TelescopePreviewBorder", { fg = palette.color8, bg = palette.bg })
hi("TelescopeSelection",     { bg = palette.color0 })
hi("TelescopeMatching",      { fg = palette.color4, bold = true })

-- nvim-cmp
hi("CmpItemAbbr",           { fg = palette.fg })
hi("CmpItemAbbrMatch",      { fg = palette.color4, bold = true })
hi("CmpItemAbbrMatchFuzzy", { fg = palette.color4, bold = true })
hi("CmpItemMenu",           { fg = palette.color8 })
hi("CmpItemKindText",       { fg = palette.fg })
hi("CmpItemKindFunction",   { fg = palette.color4 })
hi("CmpItemKindMethod",     { fg = palette.color4 })
hi("CmpItemKindVariable",   { fg = palette.color5 })
hi("CmpItemKindKeyword",    { fg = palette.color1 })

-- Trouble
hi("TroubleNormal",   { fg = palette.fg, bg = palette.bg })
hi("TroubleNormalNC", { fg = palette.fg, bg = palette.bg })

-- Indent Blankline / ibl
hi("IblIndent",     { fg = palette.color8 })
hi("IblWhitespace", { fg = palette.color8 })
hi("IblScope",      { fg = palette.color4 })

-- Lualine fallback highlight groups
hi("lualine_a_normal", { fg = palette.bg, bg = palette.color4, bold = true })
hi("lualine_b_normal", { fg = palette.fg, bg = palette.color0 })
hi("lualine_c_normal", { fg = palette.fg, bg = palette.bg })

-- Transparent-sensitive groups
hi("NormalFloat", { fg = palette.fg, bg = palette.color0 })
hi("FloatBorder", { fg = palette.color8, bg = palette.color0 })
hi("Pmenu",       { fg = palette.fg, bg = palette.color0 })
hi("PmenuSel",    { fg = palette.bg, bg = palette.color4, bold = true })

