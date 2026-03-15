/**
 * ImageViewer Component
 * Full-screen image viewer with pinch-to-zoom and swipe-to-dismiss
 * Used for viewing images in chat without leaving the app
 */

import React, { useState, useRef } from 'react';
import { View, Modal, Image, StyleSheet, Dimensions, TouchableOpacity, Text, StatusBar, Platform, Share, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { toast } from '@/components/ui/ToastProvider';
import type { ParentAlertApi } from '@/components/ui/parentAlert';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 100;

interface ImageViewerProps {
  visible: boolean;
  imageUrl: string;
  imageName?: string;
  onClose: () => void;
  senderName?: string;
  timestamp?: string;
  showAlert?: ParentAlertApi;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  visible,
  imageUrl,
  imageName,
  onClose,
  senderName,
  timestamp,
  showAlert,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const showImageAlert = (title: string, message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    if (showAlert) {
      showAlert({ title, message, type });
      return;
    }
    if (type === 'error') {
      toast.error(message, title);
      return;
    }
    if (type === 'warning') {
      toast.warn(message, title);
      return;
    }
    toast.info(message, title);
  };
  
  // Animation values
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  
  // Pan responder for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        translateY.setValue(gestureState.dy);
        // Reduce opacity and scale as user swipes
        const progress = Math.min(Math.abs(gestureState.dy) / SWIPE_THRESHOLD, 1);
        opacity.setValue(1 - progress * 0.5);
        scale.setValue(1 - progress * 0.1);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dy) > SWIPE_THRESHOLD) {
          // Dismiss
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: gestureState.dy > 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onClose();
            // Reset values
            translateY.setValue(0);
            opacity.setValue(1);
            scale.setValue(1);
          });
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 40,
              friction: 8,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
            }),
            Animated.spring(scale, {
              toValue: 1,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;
  
  const handleShare = async () => {
    try {
      await Share.share({
        url: imageUrl,
        message: imageName || 'Shared image',
      });
    } catch (error) {
      console.error('Error sharing image:', error);
    }
  };
  
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showImageAlert('Error', 'Sharing is not available on this device', 'warning');
        return;
      }
      
      // If already a local file, use it directly; otherwise download from remote URL
      let localUri: string;
      if (imageUrl.startsWith('file://') || imageUrl.startsWith('/')) {
        localUri = imageUrl;
      } else {
        const fileUri = FileSystem.documentDirectory + (imageName || 'image.jpg');
        const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
        localUri = downloadResult.uri;
      }

      // Share the image (which allows saving on most devices)
      await Sharing.shareAsync(localUri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Save or share image',
      });
    } catch (error) {
      console.error('Error saving image:', error);
      showImageAlert('Error', 'Failed to save image', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const toggleControls = () => {
    setShowControls(!showControls);
  };
  
  const formatTimestamp = (ts?: string) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <Animated.View style={[styles.container, { opacity }]}>
        {/* Background */}
        <View style={styles.background} />
        
        {/* Header */}
        {showControls && (
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.headerInfo}>
              {senderName && (
                <Text style={styles.senderName}>{senderName}</Text>
              )}
              {timestamp && (
                <Text style={styles.timestamp}>{formatTimestamp(timestamp)}</Text>
              )}
            </View>
            
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                {saving ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Ionicons name="download-outline" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Image */}
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={toggleControls}
          style={styles.imageContainer}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.imageWrapper,
              {
                transform: [
                  { translateY },
                  { scale },
                ],
              },
            ]}
          >
            {loading && (
              <View style={styles.loadingContainer}>
                <EduDashSpinner size="large" color="#fff" />
              </View>
            )}
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
            />
          </Animated.View>
        </TouchableOpacity>
        
        {/* Footer with filename */}
        {showControls && imageName && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.imageName} numberOfLines={1}>
              {imageName}
            </Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  senderName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  imageName: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ImageViewer;
