export const WEB_SIDEBAR_BREAKPOINT = 768;

/**
 * Web tablet and desktop layouts switch to the sidebar navigation at 768px.
 * Keep the bottom nav hidden from that breakpoint upward to avoid dual nav.
 */
export function usesWebSidebarLayout(windowWidth: number): boolean {
  return windowWidth >= WEB_SIDEBAR_BREAKPOINT;
}

export function shouldShowWebBottomTabBar(windowWidth: number): boolean {
  return windowWidth < WEB_SIDEBAR_BREAKPOINT;
}
