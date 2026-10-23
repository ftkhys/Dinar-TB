/**
 * Copies text using the async Clipboard API when available, falling back to a
 * hidden textarea + execCommand for older or restricted contexts.
 *
 * Returns whether the copy is believed to have succeeded so callers can show
 * honest success/failure feedback. It never logs the copied text.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    // Available on localhost and HTTPS (including Cloudflare Tunnel). It can
    // still reject inside an iframe without clipboard-write permission, so a
    // rejection must fall through to the legacy path instead of being treated
    // as a successful copy.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  if (typeof document === "undefined") return false;

  const area = document.createElement("textarea");
  const previouslyFocused = document.activeElement as HTMLElement | null;
  try {
    area.value = text;
    area.setAttribute("aria-hidden", "true");
    area.tabIndex = -1;
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.width = "1px";
    area.style.height = "1px";
    area.style.padding = "0";
    area.style.border = "none";
    area.style.outline = "none";
    area.style.boxShadow = "none";
    area.style.background = "transparent";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const copied =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
    return copied;
  } catch {
    return false;
  } finally {
    area.remove();
    previouslyFocused?.focus?.();
  }
}
