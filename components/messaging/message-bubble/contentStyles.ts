import { StyleSheet } from 'react-native';

export const messageBubbleContentStyles = StyleSheet.create({
  callCard: {
    minWidth: 0,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(143, 232, 255, 0.16)',
    backgroundColor: 'rgba(8, 16, 37, 0.28)',
  },
  callAccentRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    top: -28,
    right: -24,
  },
  callAccentRingOwn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  callAccentRingOther: {
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
  },
  callCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  callCardSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  callBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  callBackButtonWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  callBackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mediaWrap: {
    marginTop: 0,
    width: '100%',
  },
  mediaImageContainer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  mediaImageContainerOwn: {
    borderColor: 'rgba(255,255,255,0.14)',
  },
  mediaImageContainerOther: {
    borderColor: 'rgba(96, 165, 250, 0.25)',
  },
  mediaImage: {},
  mediaBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  mediaBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mediaVideoContainer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.2)',
    minHeight: 188,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    width: '100%',
  },
  mediaVideoContainerOwn: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaVideoContainerOther: {
    borderColor: 'rgba(96, 165, 250, 0.25)',
  },
  mediaVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  mediaVideoIconWrap: {
    borderRadius: 999,
    padding: 6,
    marginBottom: 8,
  },
  mediaVideoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImageWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
  },
  voiceContainer: {
    marginBottom: 2,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnOwn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  playBtnOther: {
    backgroundColor: 'rgba(59,130,246,0.8)',
  },
  waveformPlaceholder: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 46,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  translationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.14)',
  },
  translationBadgeIcon: {
    fontSize: 12,
  },
  translationBadgeText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
