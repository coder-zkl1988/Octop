/** Open external links in the system browser when running inside the desktop shell. */
export function installDesktopExternalLinks(): () => void {
  const handler = (event: MouseEvent) => {
    const target =
      event.target instanceof Element ? event.target.closest("a") : null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href || !/^https?:\/\//i.test(href)) return;
    const invoke = (
      window as Window & { _wails?: { invoke?: (message: string) => void } }
    )._wails?.invoke;
    if (typeof invoke !== "function") return;
    event.preventDefault();
    invoke(`wails:event:emit:external-link:${href}`);
  };
  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
