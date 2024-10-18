local M = {}

function M.get()
	return {
		"pyright",
		"hls",
		"clangd",
		"bashls",
		"rust_analyzer",
		"ts_ls",
	}
end

return M
