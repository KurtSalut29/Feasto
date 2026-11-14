/**
 * The first thing the Tab key reaches on every signed-in page: jumps past the menus straight to
 * the page's content (WCAG 2.4.1). Hidden until it has keyboard focus.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      Skip to main content
    </a>
  );
}
