/**
 * Shared layout metrics for teacher dashboard cards.
 * Used by TeacherMetricsCard, TeacherQuickActionCard, and the dashboard itself.
 */

export interface CardLayoutMetrics {
  isTablet: boolean;
  isSmallScreen: boolean;
  cardPadding: number;
  cardGap: number;
  containerWidth: number;
  cardWidth: number;
}

export const getCardLayoutMetrics = (width: number): CardLayoutMetrics => {
  const isTablet = width > 768;
  const isSmallScreen = width < 380;
  const cardPadding = isTablet ? 20 : isSmallScreen ? 10 : 14;
  const cardGap = isTablet ? 12 : isSmallScreen ? 6 : 8;
  const containerWidth = width - cardPadding * 2;
  const cardWidth = isTablet ? (containerWidth - cardGap * 3) / 4 : (containerWidth - cardGap) / 2;
  return { isTablet, isSmallScreen, cardPadding, cardGap, containerWidth, cardWidth };
};
