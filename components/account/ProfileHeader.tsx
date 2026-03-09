import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ViewStyle, TextStyle, ImageStyle } from 'react-native';

interface ProfileHeaderProps {
  profileImage: string | null;
  displayUri: string | null;
  displayName: string;
  email: string | null;
  role: string | null;
  initials: string;
  uploadingImage: boolean;
  onImagePress: () => void;
  theme: {
    surface: string;
    divider: string;
    primary: string;
    onPrimary: string;
    secondary: string;
    onSecondary: string;
    primaryLight: string;
    text: string;
    textSecondary: string;
  };
  styles: {
    profileHeader: ViewStyle;
    avatarContainer: ViewStyle;
    avatar: ImageStyle;
    avatarPlaceholder: ViewStyle;
    avatarText: TextStyle;
    cameraIconContainer: ViewStyle;
    loadingIcon: ViewStyle;
    loadingText: TextStyle;
    displayName: TextStyle;
    email: TextStyle;
    roleBadge: ViewStyle;
    roleText: TextStyle;
  };
}

export function ProfileHeader({
  profileImage,
  displayUri,
  displayName,
  email,
  role,
  initials,
  uploadingImage,
  onImagePress,
  theme,
  styles,
}: ProfileHeaderProps) {
  return (
    <LinearGradient
      colors={['rgba(18, 28, 54, 0.98)', 'rgba(48, 30, 95, 0.9)', 'rgba(9, 18, 40, 0.98)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.profileHeader}
    >
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={onImagePress}
        disabled={uploadingImage}
      >
        {displayUri || profileImage ? (
          <Image source={{ uri: (displayUri || profileImage) ?? '' }} style={styles.avatar} />
        ) : (
          <LinearGradient
            colors={['#5c7cff', '#7c5cff', '#08c5ff']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.avatarPlaceholder}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
        )}

        <View style={styles.cameraIconContainer}>
          {uploadingImage ? (
            <View style={styles.loadingIcon}>
              <Text style={styles.loadingText}>⟳</Text>
            </View>
          ) : (
            <Ionicons name="camera" size={16} color={theme.onSecondary} />
          )}
        </View>
      </TouchableOpacity>

      <Text style={styles.displayName}>{displayName}</Text>
      <Text style={styles.email}>{email}</Text>

      {role && (
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {role.replace("_", " ").toUpperCase()}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}
