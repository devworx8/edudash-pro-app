/**
 * Layout Styles
 * 
 * Core container, background, and layout styles for Dash AI interface
 */

import { StyleSheet } from 'react-native';

export const layoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundGlowA: {
    position: 'absolute',
    top: -140,
    right: -160,
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.18,
  },
  backgroundGlowB: {
    position: 'absolute',
    bottom: -180,
    left: -140,
    width: 450,
    height: 450,
    borderRadius: 225,
    opacity: 0.15,
  },
  contentLayer: {
    flex: 1,
    zIndex: 1,
  },
  messagesClip: {
    flex: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  composerArea: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: -8,
    zIndex: 100,
    elevation: 0,
  },
  bottomThinkingDock: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 140,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#020617',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  bottomThinkingText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
    flexShrink: 1,
  },
  topDeck: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 10,
  },
  controlHub: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  controlHubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  controlHubTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  controlHubIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlHubTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  controlHubHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  modeStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 36,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modeChipSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  modeHint: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});
