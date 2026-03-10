/**
 * Dashboard Error Boundary with Retry Logic
 * 
 * Provides graceful error handling for the teacher dashboard
 * with exponential backoff retry mechanism.
 * 
 * @module components/dashboard/teacher/DashboardErrorBoundary
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  maxRetries?: number;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isRetrying: boolean;
}

/**
 * Exponential backoff delay calculator
 * Returns delay in milliseconds: 1s, 2s, 4s, 8s, 16s (max)
 */
function getRetryDelay(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 16000);
}

/**
 * Error Boundary component for dashboard sections
 */
class DashboardErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) {
      console.error('[DashboardErrorBoundary] Error caught:', error, errorInfo);
    }
  }

  handleRetry = async () => {
    const { maxRetries = 3, onRetry } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      return;
    }

    this.setState({ isRetrying: true });

    const delay = getRetryDelay(retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      if (onRetry) {
        await onRetry();
      }
      
      this.setState({
        hasError: false,
        error: null,
        retryCount: 0,
        isRetrying: false,
      });
    } catch (error) {
      this.setState(prevState => ({
        retryCount: prevState.retryCount + 1,
        isRetrying: false,
      }));
    }
  };

  render() {
    const { children, fallbackMessage } = this.props;
    const { hasError, error, retryCount, isRetrying } = this.state;

    if (hasError) {
      return (
        <ErrorFallback
          message={fallbackMessage}
          error={error}
          retryCount={retryCount}
          isRetrying={isRetrying}
          onRetry={this.handleRetry}
        />
      );
    }

    return children;
  }
}

/**
 * Functional error fallback component
 */
function ErrorFallback({
  message,
  error,
  retryCount,
  isRetrying,
  onRetry,
}: {
  message?: string;
  error: Error | null;
  retryCount: number;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(theme);

  const canRetry = retryCount < 3;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.error || '#DC2626'} />
      </View>
      
      <Text style={styles.title}>
        {t('dashboard.error_title', { defaultValue: 'Something went wrong' })}
      </Text>
      
      <Text style={styles.message}>
        {message || t('dashboard.error_message', {
          defaultValue: 'This section failed to load. Please try again.'
        })}
      </Text>

      {__DEV__ && error && (
        <Text style={styles.errorDetail} numberOfLines={3}>
          {error.message}
        </Text>
      )}

      {retryCount > 0 && (
        <Text style={styles.retryCount}>
          {t('dashboard.retry_count', {
            defaultValue: `Attempt ${retryCount} of 3`,
            count: retryCount,
          })}
        </Text>
      )}

      {canRetry && (
        <TouchableOpacity
          style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
          onPress={onRetry}
          disabled={isRetrying}
          activeOpacity={0.7}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>
                {t('common.retry', { defaultValue: 'Try Again' })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {!canRetry && (
        <Text style={styles.exhaustedText}>
          {t('dashboard.retry_exhausted', {
            defaultValue: 'Please refresh the page or try again later.'
          })}
        </Text>
      )}
    </View>
  );
}

function getStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: theme?.background || '#0b1220',
    },
    iconContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme?.text || '#E5E7EB',
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: theme?.textSecondary || 'rgba(234, 240, 255, 0.72)',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    errorDetail: {
      fontSize: 12,
      color: theme?.error || '#DC2626',
      textAlign: 'center',
      marginBottom: 16,
      paddingHorizontal: 16,
    },
    retryCount: {
      fontSize: 12,
      color: theme?.warning || '#F59E0B',
      marginBottom: 12,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme?.primary || '#5A409D',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    retryButtonDisabled: {
      opacity: 0.6,
    },
    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    exhaustedText: {
      fontSize: 13,
      color: theme?.textSecondary || 'rgba(234, 240, 255, 0.60)',
      textAlign: 'center',
      marginTop: 8,
    },
  });
}

// Wrapper to use hooks with class component
export function DashboardErrorBoundary(props: Props) {
  return <DashboardErrorBoundaryClass {...props} />;
}