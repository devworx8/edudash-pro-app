import React from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

interface ModalLayerProps {
  visible: boolean;
  children: React.ReactNode;
  onRequestClose?: () => void;
  animationType?: 'none' | 'slide' | 'fade';
  statusBarTranslucent?: boolean;
}

type CreatePortalFn = (children: React.ReactNode, container: Element | DocumentFragment) => React.ReactPortal;

let createPortal: CreatePortalFn | null = null;

if (Platform.OS === 'web') {
  try {
    createPortal = require('react-dom').createPortal as CreatePortalFn;
  } catch {
    createPortal = null;
  }
}

export function ModalLayer({
  visible,
  children,
  onRequestClose,
  animationType = 'fade',
  statusBarTranslucent,
}: ModalLayerProps) {
  const isWeb = Platform.OS === 'web';

  React.useEffect(() => {
    if (!isWeb || !visible || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose?.();
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isWeb, visible, onRequestClose]);

  if (!visible) return null;

  if (!isWeb) {
    return (
      <Modal
        visible
        transparent
        animationType={animationType}
        statusBarTranslucent={statusBarTranslucent}
        onRequestClose={onRequestClose}
      >
        {children}
      </Modal>
    );
  }

  const webLayer = <View style={styles.webLayer}>{children}</View>;

  if (typeof document !== 'undefined' && createPortal) {
    return createPortal(webLayer, document.body);
  }

  return webLayer;
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    position: 'fixed' as any,
    zIndex: 9999,
    elevation: 9999,
  },
});
