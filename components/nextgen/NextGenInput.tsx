/**
 * NextGenInput — Glass-morphism text input with animated focus glow.
 *
 * Features:
 * - Glass surface background
 * - Animated border glow on focus (accent-colored)
 * - Floating label that rises when focused or has value
 * - Left/right icon support (Ionicons)
 * - Secure text entry with visibility toggle
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useNextGenTheme } from '@/contexts/K12NextGenThemeContext';
import { nextGenPalette, nextGenAnimation } from '@/contexts/theme/nextGenTokens';

export interface NextGenInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Floating label / placeholder text */
  label?: string;
  placeholder?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  /** Error message — shows red border + error text below */
  error?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function NextGenInput({
  value,
  onChangeText,
  label,
  placeholder,
  leftIcon,
  rightIcon,
  onRightIconPress,
  secureTextEntry: secureProp = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  error,
  style,
  inputStyle,
  testID,
  accessibilityLabel,
}: NextGenInputProps) {
  const { theme } = useNextGenTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(false);
  const secureTextEntry = secureProp && !isSecureVisible;

  // Animated focus state
  const focus = useSharedValue(0);
  const hasValue = value.length > 0;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    focus.value = withTiming(1, {
      duration: nextGenAnimation.normal,
      easing: Easing.out(Easing.cubic),
    });
  }, [focus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focus.value = withTiming(0, {
      duration: nextGenAnimation.normal,
      easing: Easing.out(Easing.cubic),
    });
  }, [focus]);

  // Floating label position
  const labelActive = isFocused || hasValue;

  const labelStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      focus.value || (hasValue ? 1 : 0),
      [0, 1],
      [0, -22],
    );
    const fontSize = interpolate(
      focus.value || (hasValue ? 1 : 0),
      [0, 1],
      [14, 11],
    );
    return {
      transform: [{ translateY }],
      fontSize,
    };
  });

  // Animated border glow
  const borderStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? nextGenPalette.danger
      : interpolateColor(
          focus.value,
          [0, 1],
          [nextGenPalette.border, theme.primary || nextGenPalette.purple2],
        );
    return { borderColor };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (!isFocused || error) return {};
    return {
      shadowColor: theme.primary || nextGenPalette.purple2,
      shadowOpacity: interpolate(focus.value, [0, 1], [0, 0.2]),
      shadowRadius: interpolate(focus.value, [0, 1], [0, 12]),
      shadowOffset: { width: 0, height: 0 },
      elevation: interpolate(focus.value, [0, 1], [0, 4]),
    };
  });

  return (
    <View style={style}>
      <Animated.View style={[styles.container, borderStyle, glowStyle]}>
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={isFocused ? theme.primary : nextGenPalette.textMuted}
            style={styles.leftIcon}
          />
        )}

        <View style={styles.inputWrapper}>
          {label && (
            <Animated.Text
              style={[
                styles.label,
                {
                  color: error
                    ? nextGenPalette.danger
                    : isFocused
                      ? theme.primary
                      : nextGenPalette.textMuted,
                },
                labelActive ? styles.labelActive : undefined,
                labelStyle,
              ]}
              pointerEvents="none"
            >
              {label}
            </Animated.Text>
          )}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={labelActive ? placeholder : undefined}
            placeholderTextColor={nextGenPalette.textSubtle}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            editable={editable}
            multiline={multiline}
            numberOfLines={numberOfLines}
            style={[
              styles.input,
              { color: nextGenPalette.text },
              label ? styles.inputWithLabel : undefined,
              multiline ? styles.multilineInput : undefined,
              inputStyle,
            ]}
            testID={testID}
            accessibilityLabel={accessibilityLabel || label}
          />
        </View>

        {secureProp && (
          <TouchableOpacity
            onPress={() => setIsSecureVisible(!isSecureVisible)}
            style={styles.rightIcon}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSecureVisible ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={nextGenPalette.textMuted}
            />
          </TouchableOpacity>
        )}

        {rightIcon && !secureProp && (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={styles.rightIcon}
            disabled={!onRightIconPress}
          >
            <Ionicons
              name={rightIcon}
              size={18}
              color={isFocused ? theme.primary : nextGenPalette.textMuted}
            />
          </TouchableOpacity>
        )}
      </Animated.View>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    minHeight: 52,
    overflow: 'hidden',
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  label: {
    position: 'absolute',
    left: 0,
    top: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  labelActive: {
    top: 6,
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '400',
  },
  inputWithLabel: {
    paddingTop: 22,
    paddingBottom: 8,
  },
  multilineInput: {
    paddingTop: 22,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  leftIcon: {
    marginLeft: 14,
  },
  rightIcon: {
    marginRight: 14,
    padding: 4,
  },
  errorText: {
    color: '#FF5C5C',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    marginLeft: 4,
  },
});

export default NextGenInput;
