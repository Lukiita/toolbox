// How much output a git command run by this feature may return: a merged
// skill file, or the diff of one. One number for the two adapters that read
// git's stdout; skill files are a few kilobytes, so this is headroom, not a
// tuning knob.
export const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
