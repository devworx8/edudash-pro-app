/**
 * EmojiPicker Component
 * WhatsApp-style emoji picker for message composer
 * Includes a GIF tab at the end of the category row.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { GifSearchPanel } from './GifSearchPanel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const EMOJI_CATEGORIES = [
  {
    id: 'recent',
    icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
    emojis: ['👍', '❤️', '😂', '😊', '🙏', '😢', '🎉', '🔥'],
  },
  {
    id: 'smileys',
    icon: 'happy-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
      '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
      '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵',
      '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕',
    ],
  },
  {
    id: 'gestures',
    icon: 'hand-left-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
      '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
      '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃',
    ],
  },
  {
    id: 'hearts',
    icon: 'heart-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '♥️', '💌', '💋', '👄', '👅',
    ],
  },
  {
    id: 'objects',
    icon: 'cube-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '📚', '📖', '📝', '✏️', '📎', '📌', '📍', '🔍',
      '🔎', '🔐', '🔑', '🔒', '🔓', '💡', '🔦', '🕯️',
      '📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿',
      '📷', '📸', '📹', '🎥', '📞', '☎️', '📺', '📻',
      '⏰', '⌚', '⏱️', '⏲️', '🕰️', '💰', '💵', '💴',
    ],
  },
  {
    id: 'nature',
    icon: 'leaf-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼',
      '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌾',
      '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎',
      '🌏', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗',
      '🌘', '🌙', '🌚', '🌛', '🌜', '☀️', '🌝', '🌞',
      '⭐', '🌟', '🌠', '☁️', '⛅', '⛈️', '🌤️', '🌥️',
    ],
  },
  {
    id: 'food',
    icon: 'fast-food-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓',
      '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
      '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑',
      '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐',
      '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙',
    ],
  },
  {
    id: 'activities',
    icon: 'football-outline' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
      '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿',
      '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
      '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️',
      '🎮', '🕹️', '🎲', '🧩', '♟️', '🎭', '🎨', '🎬',
    ],
  },
  {
    id: 'symbols',
    icon: 'heart' as keyof typeof Ionicons.glyphMap,
    emojis: [
      '✅', '❌', '❓', '❗', '💯', '🔴', '🟠', '🟡',
      '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷',
      '🔸', '🔹', '▪️', '▫️', '◾', '◽', '◼️', '◻️',
      '🔲', '🔳', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕',
      '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️',
      '♦️', '🃏', '🎴', '🀄', '🔃', '🔄', '➕', '➖',
    ],
  },
];

const GIF_TAB_ID = 'gif';

interface EmojiPickerProps {
  visible: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect?: (url: string) => void;
  height?: number;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  visible,
  onClose,
  onEmojiSelect,
  onGifSelect,
  height = Platform.OS === 'web' ? 404 : 312,
}) => {
  const { theme } = useTheme();
  const [activeCategory, setActiveCategory] = useState('smileys');
  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(height)).current;
  
  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim, height]);
  
  const handleEmojiPress = useCallback((emoji: string) => {
    onEmojiSelect(emoji);
  }, [onEmojiSelect]);

  const isGifActive = activeCategory === GIF_TAB_ID;
  const currentCategory = EMOJI_CATEGORIES.find(c => c.id === activeCategory) || EMOJI_CATEGORIES[1];
  
  const styles = StyleSheet.create({
    container: {
      height,
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderTopWidth: 1,
      borderTopColor: 'rgba(125, 211, 252, 0.14)',
    },
    categoryTabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
      backgroundColor: 'rgba(15, 23, 42, 0.82)',
    },
    categoryTab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryTabActive: {
      borderBottomWidth: 2,
      borderBottomColor: theme.primary,
    },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    emojiButton: {
      width: (SCREEN_WIDTH - 12) / 8,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: {
      fontSize: 26,
    },
    gifTabLabel: {
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
      overflow: 'hidden',
    },
  });

  if (!visible) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        {EMOJI_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              activeCategory === category.id && styles.categoryTabActive,
            ]}
            onPress={() => setActiveCategory(category.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={category.icon}
              size={22}
              color={activeCategory === category.id ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        ))}
        {/* GIF tab at the end */}
        <TouchableOpacity
          style={[
            styles.categoryTab,
            isGifActive && styles.categoryTabActive,
          ]}
          onPress={() => setActiveCategory(GIF_TAB_ID)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.gifTabLabel,
              {
                color: isGifActive ? theme.primary : theme.textSecondary,
                borderColor: isGifActive ? theme.primary : theme.textSecondary,
              },
            ]}
          >
            GIF
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Content: emojis or GIF panel */}
      {isGifActive ? (
        <GifSearchPanel
          onSelectGif={(url) => {
            if (onGifSelect) {
              onGifSelect(url);
            } else {
              onEmojiSelect(url);
            }
          }}
          theme={theme}
        />
      ) : (
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.emojiGrid}
        >
          {currentCategory.emojis.map((emoji, index) => (
            <TouchableOpacity
              key={`${emoji}-${index}`}
              style={styles.emojiButton}
              onPress={() => handleEmojiPress(emoji)}
              activeOpacity={0.6}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
};

export default EmojiPicker;
