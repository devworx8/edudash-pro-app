import { shouldShowWebBottomTabBar, usesWebSidebarLayout, WEB_SIDEBAR_BREAKPOINT } from '@/lib/navigation/webLayout';

describe('web navigation breakpoints', () => {
  it('switches to the sidebar layout at the shared tablet breakpoint', () => {
    expect(usesWebSidebarLayout(WEB_SIDEBAR_BREAKPOINT - 1)).toBe(false);
    expect(usesWebSidebarLayout(WEB_SIDEBAR_BREAKPOINT)).toBe(true);
  });

  it('hides the bottom nav once the sidebar layout takes over', () => {
    expect(shouldShowWebBottomTabBar(WEB_SIDEBAR_BREAKPOINT - 1)).toBe(true);
    expect(shouldShowWebBottomTabBar(WEB_SIDEBAR_BREAKPOINT)).toBe(false);
  });
});
