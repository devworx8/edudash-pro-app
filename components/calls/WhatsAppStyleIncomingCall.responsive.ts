// Responsive helpers for WhatsAppStyleIncomingCall
import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Use percentage-based scaling for width/height
export function scaleWidth(percent: number) {
  return (SCREEN_WIDTH * percent) / 100;
}
export function scaleHeight(percent: number) {
  return (SCREEN_HEIGHT * percent) / 100;
}

// Responsive font size (basic)
export function scaleFont(size: number) {
  // Use width as base for font scaling
  return size * (SCREEN_WIDTH / 375);
}

// Platform-specific padding
export function getTopPadding() {
  return Platform.OS === 'ios' ? scaleHeight(7) : scaleHeight(4.5);
}
export function getBottomPadding() {
  return Platform.OS === 'ios' ? scaleHeight(4.5) : scaleHeight(3);
}
