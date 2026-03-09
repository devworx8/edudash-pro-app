/**
 * GifSearchPanel
 *
 * Inline GIF search panel rendered inside the EmojiPicker when the GIF tab
 * is active. Uses GIPHY v1 API when an API key is configured, otherwise
 * falls back to static category cards that open the device gallery.
 *
 * Rating is locked to "g" (general audiences) for school safety.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { toast } from '@/components/ui/ToastProvider';

const GIPHY_API_KEY =
  (typeof process !== 'undefined' &&
    (process.env as Record<string, string | undefined>)
      .EXPO_PUBLIC_GIPHY_API_KEY) ||
  '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const GIF_COLUMNS = 3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = (SCREEN_WIDTH - 12) / GIF_COLUMNS;

interface GiphyGif {
  id: string;
  url: string;
  preview: string;
}

interface GifSearchPanelProps {
  onSelectGif: (url: string) => void;
  theme: {
    text: string;
    textSecondary: string;
    surface: string;
    elevated: string;
    border: string;
    primary: string;
  };
}

const FALLBACK_CATEGORIES = [
  { label: 'Reactions', emoji: '😂' },
  { label: 'Thank You', emoji: '🙏' },
  { label: 'Congratulations', emoji: '🎉' },
  { label: 'Good Morning', emoji: '☀️' },
  { label: 'Funny', emoji: '🤣' },
  { label: 'Love', emoji: '❤️' },
];

export const GifSearchPanel: React.FC<GifSearchPanelProps> = React.memo(
  ({ onSelectGif, theme }) => {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState<GiphyGif[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasApiKey = !!GIPHY_API_KEY;

    const fetchGifs = useCallback(
      async (searchTerm: string) => {
        if (!GIPHY_API_KEY) return;
        setLoading(true);
        try {
          const endpoint = searchTerm.trim()
            ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchTerm)}&limit=20&rating=g`
            : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;

          const res = await fetch(endpoint);
          if (!res.ok) throw new Error(`GIPHY ${res.status}`);
          const json = await res.json();

          const mapped: GiphyGif[] = (json.data || []).map(
            (r: any) => ({
              id: r.id,
              url: r.images?.original?.url || '',
              preview: r.images?.fixed_width?.url || r.images?.original?.url || '',
            }),
          );
          setGifs(mapped.filter((g) => g.url));
        } catch (err) {
          console.warn('[GifSearchPanel] GIPHY fetch error:', err);
          setGifs([]);
        } finally {
          setLoading(false);
        }
      },
      [],
    );

    useEffect(() => {
      if (hasApiKey) {
        fetchGifs('');
      }
    }, [hasApiKey, fetchGifs]);

    const handleSearchChange = useCallback(
      (text: string) => {
        setQuery(text);
        if (!hasApiKey) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchGifs(text), 400);
      },
      [hasApiKey, fetchGifs],
    );

    const openGalleryPicker = useCallback(async () => {
      try {
        const hasPermission = await ensureImageLibraryPermission();
        if (!hasPermission) {
          toast.warn('Please grant gallery access to pick GIFs.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets.length > 0) {
          onSelectGif(result.assets[0].uri);
        }
      } catch (error) {
        console.error('[GifSearchPanel] Gallery pick error:', error);
        toast.error('Failed to pick image.');
      }
    }, [onSelectGif]);

    const renderGifItem = useCallback(
      ({ item }: { item: GiphyGif }) => (
        <TouchableOpacity
          style={[styles.gifCell, { backgroundColor: theme.elevated }]}
          onPress={() => onSelectGif(item.url)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: item.preview }}
            style={styles.gifImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ),
      [onSelectGif, theme.elevated],
    );

    if (!hasApiKey) {
      return (
        <View style={styles.fallbackContainer}>
          <Text style={[styles.fallbackNote, { color: theme.textSecondary }]}>
            Full GIF search coming soon
          </Text>
          <View style={styles.categoryGrid}>
            {FALLBACK_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.label}
                style={[
                  styles.categoryCard,
                  { backgroundColor: theme.elevated },
                ]}
                onPress={openGalleryPicker}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text
                  style={[styles.categoryLabel, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.galleryBtn, { borderColor: theme.border }]}
            onPress={openGalleryPicker}
            activeOpacity={0.7}
          >
            <Ionicons
              name="images-outline"
              size={18}
              color={theme.primary}
            />
            <Text style={[styles.galleryBtnText, { color: theme.primary }]}>
              Pick from Gallery
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View
          style={[styles.searchBar, { backgroundColor: theme.elevated }]}
        >
          <Ionicons
            name="search"
            size={16}
            color={theme.textSecondary}
          />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search GIFs..."
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                fetchGifs('');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={16}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {loading && gifs.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : gifs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {query ? 'No GIFs found' : 'Loading trending GIFs...'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            renderItem={renderGifItem}
            keyExtractor={(item) => item.id}
            numColumns={GIF_COLUMNS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gifGrid}
          />
        )}

        <Text style={[styles.poweredBy, { color: theme.textSecondary }]}>
          Powered by GIPHY
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 3,
    marginTop: 2,
    marginBottom: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.12)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 1,
  },
  gifGrid: {
    paddingHorizontal: 1,
    paddingBottom: 2,
  },
  gifCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    margin: 0.5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
  },
  poweredBy: {
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 1,
  },
  fallbackContainer: {
    flex: 1,
    padding: 8,
  },
  fallbackNote: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 56) / 3,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  galleryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
