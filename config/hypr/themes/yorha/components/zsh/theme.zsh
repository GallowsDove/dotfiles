TRAPUSR2() {
    theme
}

theme() {
    [[ -n "$COLORFILE" && -r "$COLORFILE" ]] && theme.sh < "$COLORFILE"
}

TRAPUSR2() {
    theme
    return 0
}

if [[ -o interactive ]]; then
    eval "$(starship init zsh)"
    theme
    sttt scanline --scanline-reverse true -d 0.5
fi
