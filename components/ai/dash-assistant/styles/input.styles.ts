/**
 * Input Styles
 * 
 * Styles for input components:
 * - DashInputBar
 * - Voice controls
 * - Attachment management
 */

import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

export const inputStyles = StyleSheet.create({
  // Main Input Container
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 0,
    borderWidth: 0,
    borderRadius: 0,
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#020617',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },

  // Staff Actions Row
  staffActionsShell: {
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  staffActionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  staffActionsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  staffActionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  staffActionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  staffActionsToggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  staffActionsCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  staffActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  staffActionScroll: {
    gap: 8,
    paddingRight: 2,
  },
  staffActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  staffActionText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Voice Status Row
  voiceStatusRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  voiceStatusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  voiceWaveformRail: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    minWidth: 70,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
  },
  voiceWaveformBar: {
    width: 3,
    height: 14,
    borderRadius: 999,
    opacity: 0.95,
  },
  voiceStatusContent: {
    marginTop: 8,
    gap: 5,
  },
  autoSendCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  autoSendCountdownCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoSendCountdownValue: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  autoSendCountdownMeta: {
    flex: 1,
    gap: 4,
  },
  autoSendCountdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  autoSendProgressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  autoSendProgressFill: {
    height: 4,
    borderRadius: 999,
  },
  autoSendCancelButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  autoSendCancelText: {
    fontSize: 11,
    fontWeight: '700',
  },
  voiceStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  voiceTranscript: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  voiceHint: {
    fontSize: 11,
    lineHeight: 15,
  },

  // Tutor Chip Row
  tutorChipRow: {
    paddingBottom: 10,
    gap: 8,
  },
  tutorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tutorChipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Input Row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: screenWidth < 360 ? 6 : 10,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    position: 'relative',
    minHeight: 36,
    paddingVertical: 2,
    paddingRight: 6,
  },
  inputAccessoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 8,
  },
  inputIconButton: {
    width: screenWidth < 360 ? 28 : 30,
    height: screenWidth < 360 ? 28 : 30,
    borderRadius: screenWidth < 360 ? 14 : 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 34,
    maxHeight: 140,
    fontSize: 15,
    lineHeight: 20,
    borderWidth: 0,
  },
  sendButton: {
    width: screenWidth < 360 ? 34 : 36,
    height: screenWidth < 360 ? 34 : 36,
    borderRadius: screenWidth < 360 ? 17 : 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  // Voice Orb
  orbButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#0ea5e9',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  orbPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  recordButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Attachment Badges
  attachBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  attachBadgeSmall: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBadgeSmallText: {
    fontSize: 8,
    fontWeight: '600',
  },

  // Attachment strip — ChatGPT-like: drop zone when empty, thumbnails when present
  attachmentStrip: {
    marginHorizontal: 16,
    marginBottom: 10,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  attachmentDropZoneText: {
    fontSize: 13,
    fontWeight: '500',
  },
  attachmentDropZoneSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  // Attachment Chips
  attachmentChipsContainer: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 200,
    borderRadius: 14,
    borderWidth: 1,
  },
  attachmentChipsScroll: {
    alignItems: 'center',
  },
  attachmentChip: {
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 200,
    maxWidth: 250,
    overflow: 'hidden',
  },
  attachmentImageCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 8,
    width: 160,
    height: 160,
    overflow: 'hidden',
  },
  attachmentImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  attachmentImagePreview: {
    width: '100%',
    height: '100%',
  },
  attachmentImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImageBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImageRemove: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  attachmentImageRotateLeft: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  attachmentImageRotateRight: {
    position: 'absolute',
    bottom: 6,
    left: 40,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  attachmentImageSize: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  attachmentImageSizeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  attachmentChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  attachmentChipText: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  attachmentChipName: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  attachmentChipSize: {
    fontSize: 11,
  },
  attachmentChipRemove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentProgressContainer: {
    marginRight: 8,
  },
  attachmentProgressBar: {
    height: 2,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 1,
  },
  attachmentProgressFill: {
    height: '100%',
    borderRadius: 1,
  },
});
