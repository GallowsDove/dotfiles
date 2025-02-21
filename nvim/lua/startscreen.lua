local M = {}

function M.get_dashboard()
	local alpha = require"alpha"
	local dashboard = require"alpha.themes.dashboard"

	local function button(sc, txt, keybind, keybind_opts)
		local b = dashboard.button(sc, txt, keybind, keybind_opts)
	--  b.opts.hl = "AlphaButton"
	    b.opts.hl_shortcut = "Repeat"
		return b
	end

	local function footer()
		local plugins = vim.tbl_count(vim.g.plugs)
		local v = vim.version()
		local datetime = os.date " %d-%m-%Y   %H:%M:%S"
		return { string.format(" %s plugins   v%s.%s.%s  %s", plugins, v.major, v.minor, v.patch, datetime) }
	end

	dashboard.section.header.val = {
	"  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⢦⠀      ", 
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠎⠀⠀⠱⡀⠀⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠒⠉⠉⠉⠉⠑⠒⠲⠤⢄⣀⡏⠉⠁⠒⠢⢷⠀⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠔⠋⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠈⠑⠄⠀⠀⠀⠀⡇⠀   ",
	"⢀⣠⡤⠖⠚⡏⠉⠉⠁⠉⠉⠉⠁⠀⠠⢄⠀⠎⠁⠀⠰⣀⠀⠀⠄⠈⠙⠆⠈⠂⠀⠀⠀⢸⠀   ",
	"⠻⣧⡀⠀⢰⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠒⠀⣀⡤⠤⠖⡒⠿⠥⣄⡀⠀⢠⠒⠄⠀⠀⠀⢸⠀   ",
	"⠀⠀⠙⠲⢼⣀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡴⠛⠁⢀⢴⡘⠰⡀⡦⡀⡍⠲⢄⠁⠁⠀⠀⠀⢸⠀   ",
	"⠀⠀⠀⠀⠀⠈⢉⠗⠀⠀⠀⠀⢀⠞⠁⡄⣠⣧⠎⠘⠁⠀⠣⠁⠱⡏⢆⠈⠳⡀⠀⠀⠀⢸⠀   ",
	"⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⣠⠃⠀⢀⡇⠃⠁⠀⠀⠀⠀⠀⠀⠀⠡⠬⣼⡀⠙⡄⠀⠀⠸⡀   ",
	"⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⢰⡇⠀⠀⢸⢹⠄⠀⠄⠀⠀⠀⠀⠀⠀⢀⣀⠉⢇⠀⣽⡄⠀⠀⡇   ",
	"⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⣏⢠⠀⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⡏⢪⢷⣸⠀⣹⣴⠀⠀⡇   ",
	"⠀⠀⠀⠀⠀⠀⢸⠀⠀⢰⠉⢌⣄⠟⣤⠀⣠⣀⠀⠀⠀⠀⠀⠀⢏⡵⠋⣾⣻⢡⠃⡇⡆⠀⡇   ",
	"⠀⠀ ⢀⠀⠀⠀⡆⠀⠘⠀⠀⠪⢴⢸⠙⠊⠉⠓⠀⠀⠀⠀⠀⠘⠯⠞⠁⠹⡹⠐⠀⠁⠀⡇   ",
	"⠀⠀⡰⠁⠙⢦⡀⠘⡄⠀⠑⠄⣀⢹⢸⡄⠀⠀⠀⠀⠀⠤⠀⠀⠀⠀⠀⣠⡃⡇⡀⠀⠀⢀⠇   ",
	"⠀⡜⠁⠀⠀⠀⠑⢄⠈⢦⠀⠀⠀⠹⡘⡌⣢⠤⣀⣀⣀⣀⣀⣀⡠⠴⠚⠓⡇⡏⢀⣠⠔⠊⠀   ",
	"⢰⠁⠀⠀⠀⠀⠀⠈⢢⠀⠑⠒⠒⠒⢣⣩⣀⡞⠉⡽⢄⣀⣵⠛⢭⠑⡖⢲⣳⠉⠁⠀⠀⠀⠀   ",
	"⡇⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⢎⠀⡼⠀⠀⠀⠋⣻⠢⠀⠈⢇⠺⡘⠁⠀⠀⠀⠀⠀⠀   ",
	"⠉⠉⠉⠑⠒⠢⣄⠀⢀⠜⠀⠀⠀⠀⡌⠀⣇⠀⠀⠀⢸⠝⣆⠀⠀⠸⡀⢱⠀⠀⠀⠀⠀⠀⠀   ",
	"⠀⠀⠀⠀⢀⠎⠀⠠⠧⡤⢄⡀⠀⠀⠡⡀⠙⠀⠀⠀⢪⠀⡟⠀⠀⠀⡇⡜⠀⠀⠀⠀⠀⠀⠀   ",
	"⠀⠀⠀⠀⠘⠒⠠⠴⢮⣁⠀⡇⠀⠀⢰⠉⢢⣄⡀⠀⢸⠄⡇⠀⠀⡠⠋⢱⠀⠀⠀⠀⠀⠀⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⠀⢠⠎⠀⠑⢤⠎⠁⠀⠀⠙⠫⣍⠁⠀⡽⠒⠋⠀⠀⠀⠑⢆⠀⠀⠀⠀⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠑⠒⣼⣀⠠⡪⠭⠩⢔⠄⠑⡎⢀⠀⣀⠤⡀⠀⠀⠈⣧⣀⠀⠀⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⠀⢀⡠⠊⠉⡠⠐⠛⠂⠤⠀⠀⠙⢄⠅⠀⠀⡠⠇⠓⠒⠓⡙⠀⠀⠑⣄⠀   ",
	"⠀⠀⠀⠀⠀⠀⠀⢠⠎⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⢀⣀⡇⡀⠀⠀⠈⢢   ",
	"⠀⠀⠀⠀⠀⠀⠀⠸⣀⣠⠤⠬⠮⠶⠒⠒⠤⠤⠤⠴⠢⠬⠥⠀⠄⠍⠍⠉⠀⠀⠀⠄⠠⠀⠈   ",
	}

	dashboard.section.header.opts.hl = "Question"


	dashboard.section.buttons.val = {
		button("b", "  Browse files", "<Cmd>NvimTreeOpen<CR>"),
		button("f", "  Find file", "<Cmd>Telescope find_files<CR>"),
		button("o", "  Recently opened files", "<Cmd>Telescope oldfiles<CR>"),
		button("n", "  New file", "<Cmd>ene <BAR> startinsert<CR>"),
		button("r", "  Find repository", "<Cmd>Telescope repo list<CR>"),
		button("u", "  Update plugins", "<Cmd>PlugUpdate<CR>"),
		button("q", "  Quit", "<Cmd>qa<CR>"),
	}

	dashboard.section.footer.val = footer()
	dashboard.section.footer.opts.hl = dashboard.section.header.opts.hl

	local head_butt_padding = 3
	local occu_height = #dashboard.section.header.val + 2 * #dashboard.section.buttons.val + head_butt_padding
	local header_padding = math.max(0, math.ceil((vim.fn.winheight('$') - occu_height) * 0.25 ) + 1)
	local foot_butt_padding_ub = vim.o.lines - header_padding - occu_height - #dashboard.section.footer.val - 3
	local foot_butt_padding = math.floor((vim.fn.winheight('$') - 2 * header_padding - occu_height))
	foot_butt_padding = math.max(0, math.max(math.min(0, foot_butt_padding), math.min(math.max(0, foot_butt_padding), foot_butt_padding_ub)))
	head_butt_padding = math.min(math.max(head_butt_padding - 2, header_padding), header_padding)

	dashboard.config.layout = {
  		{ type = 'padding', val = header_padding },
  		dashboard.section.header,
  		{ type = 'padding', val = head_butt_padding },
  		dashboard.section.buttons,
  		{ type = 'padding', val = foot_butt_padding },
  		dashboard.section.footer,
	}

  return dashboard
end

function M.setup()
	local alpha = require'alpha'
	local dashboard = M.get_dashboard()

	alpha.setup(dashboard.config)

	-- hide tabline and statusline on startup screen
	vim.cmd [[
		augroup alpha_tablineau
		au!
		au FileType alpha set showtabline=0 laststatus=0 noruler | au BufUnload <buffer> set showtabline=2 ruler laststatus=2
		augroup END
	]]
end

vim.api.nvim_create_autocmd("User", {
  pattern = "BDeletePost*",
  callback = function(event)
    local fallback_name = vim.api.nvim_buf_get_name(event.buf)
    local fallback_ft = vim.api.nvim_buf_get_option(event.buf, "filetype")
    local fallback_on_empty = fallback_name == "" and fallback_ft == ""

    if fallback_on_empty then
      vim.cmd("Alpha")
    end
  end,
})

--      au FileType alpha lua require'bufferline'.toggle_bufferline() 
-- 		au BufUnload <buffer> lua require'bufferline'.toggle_bufferline()

return M

