import { Dimensions, Platform, StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

export const createThreadOptionsStyles = (
  theme: any,
  insets: EdgeInsets,
) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingBottom: insets.bottom + 16,
      paddingTop: 10,
      maxHeight: Dimensions.get('window').height * 0.82,
      width: '100%',
      alignSelf: 'center',
      maxWidth: Platform.OS === 'web' ? Math.min(Dimensions.get('window').width, 720) : undefined,
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
      ...Platform.select({
        ios: {
          shadowColor: '#040817',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.42,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    handle: {
      width: 48,
      height: 4,
      backgroundColor: 'rgba(191, 212, 255, 0.32)',
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 6,
      marginBottom: 14,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
      paddingTop: 4,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#f8fbff',
      textAlign: 'center',
    },
    headerSubtitle: {
      fontSize: 13,
      color: '#b8c8f4',
      textAlign: 'center',
      marginTop: 4,
    },
    optionsContainer: {
      paddingTop: 10,
      paddingBottom: 8,
    },
    scrollContainer: {
      flexGrow: 1,
      maxHeight: Dimensions.get('window').height * 0.56,
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(125, 211, 252, 0.12)',
      marginVertical: 8,
      marginHorizontal: 14,
    },
  });
