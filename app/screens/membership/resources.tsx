/**
 * Resource Hub Screen
 * Central document and resource sharing hub for organization members
 */
import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  TextInput,
  RefreshControl,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Resource Types
interface ResourceCategory {
  id: string;
  name: string;
  slug: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  count: number;
}

interface Resource {
  id: string;
  category_id: string;
  title: string;
  description: string;
  file_type: 'pdf' | 'video' | 'image' | 'document' | 'link' | 'audio';
  file_url: string;
  thumbnail_url?: string;
  file_size?: number;
  download_count: number;
  is_featured: boolean;
  is_pinned: boolean;
  access_level: 'all' | 'premium' | 'vip' | 'facilitators' | 'managers';
  created_at: string;
  updated_by_name?: string;
}

// Mock Categories
const CATEGORIES: ResourceCategory[] = [
  { id: '1', name: 'Training Materials', slug: 'training', icon: 'school-outline', color: '#3B82F6', count: 24 },
  { id: '2', name: 'Templates & Forms', slug: 'templates', icon: 'document-text-outline', color: '#10B981', count: 18 },
  { id: '3', name: 'Marketing Assets', slug: 'marketing', icon: 'megaphone-outline', color: '#F59E0B', count: 12 },
  { id: '4', name: 'Video Tutorials', slug: 'videos', icon: 'videocam-outline', color: '#EF4444', count: 8 },
  { id: '5', name: 'Policy Documents', slug: 'policies', icon: 'shield-checkmark-outline', color: '#8B5CF6', count: 15 },
  { id: '6', name: 'Reports & Analytics', slug: 'reports', icon: 'bar-chart-outline', color: '#06B6D4', count: 7 },
];

// Mock Resources
const RESOURCES: Resource[] = [
  {
    id: 'r1',
    category_id: '1',
    title: 'Facilitator Onboarding Guide 2024',
    description: 'Complete guide for new facilitators joining EduPro',
    file_type: 'pdf',
    file_url: '#',
    file_size: 2500000,
    download_count: 156,
    is_featured: true,
    is_pinned: true,
    access_level: 'all',
    created_at: '2024-12-01',
    updated_by_name: 'Admin',
  },
  {
    id: 'r2',
    category_id: '2',
    title: 'Member Registration Form',
    description: 'Standard form template for new member registration',
    file_type: 'document',
    file_url: '#',
    file_size: 150000,
    download_count: 89,
    is_featured: false,
    is_pinned: true,
    access_level: 'all',
    created_at: '2024-11-15',
  },
  {
    id: 'r3',
    category_id: '4',
    title: 'Introduction to EduPro',
    description: 'Welcome video for new members explaining our mission and vision',
    file_type: 'video',
    file_url: '#',
    thumbnail_url: 'https://via.placeholder.com/320x180',
    download_count: 342,
    is_featured: true,
    is_pinned: false,
    access_level: 'all',
    created_at: '2024-10-20',
  },
  {
    id: 'r4',
    category_id: '3',
    title: 'Brand Guidelines & Logos',
    description: 'Official brand assets including logos, colors, and typography',
    file_type: 'pdf',
    file_url: '#',
    file_size: 8000000,
    download_count: 67,
    is_featured: false,
    is_pinned: false,
    access_level: 'facilitators',
    created_at: '2024-09-01',
  },
  {
    id: 'r5',
    category_id: '5',
    title: 'Code of Conduct',
    description: 'Membership code of conduct and ethics policy',
    file_type: 'pdf',
    file_url: '#',
    file_size: 500000,
    download_count: 234,
    is_featured: false,
    is_pinned: false,
    access_level: 'all',
    created_at: '2024-08-15',
  },
  {
    id: 'r6',
    category_id: '6',
    title: 'Q4 2024 Regional Report',
    description: 'Quarterly performance report across all regions',
    file_type: 'pdf',
    file_url: '#',
    file_size: 3200000,
    download_count: 45,
    is_featured: false,
    is_pinned: false,
    access_level: 'managers',
    created_at: '2024-12-18',
    updated_by_name: 'National Admin',
  },
];

const FILE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  pdf: 'document-outline',
  video: 'play-circle-outline',
  image: 'image-outline',
  document: 'document-text-outline',
  link: 'link-outline',
  audio: 'musical-notes-outline',
};

const FILE_COLORS: Record<string, string> = {
  pdf: '#EF4444',
  video: '#3B82F6',
  image: '#10B981',
  document: '#F59E0B',
  link: '#8B5CF6',
  audio: '#EC4899',
};

export default function ResourceHubScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const filteredResources = useMemo(() => {
    let result = [...RESOURCES];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.title.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query)
      );
    }
    
    if (selectedCategory) {
      result = result.filter(r => r.category_id === selectedCategory);
    }
    
    // Sort: pinned first, then featured, then by date
    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    return result;
  }, [searchQuery, selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderCategoryItem = ({ item }: { item: ResourceCategory }) => {
    const isSelected = selectedCategory === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.categoryCard,
          { 
            backgroundColor: isSelected ? item.color + '20' : theme.card,
            borderColor: isSelected ? item.color : theme.border,
          }
        ]}
        onPress={() => setSelectedCategory(isSelected ? null : item.id)}
      >
        <View style={[styles.categoryIcon, { backgroundColor: item.color + '20' }]}>
          <Ionicons name={item.icon} size={24} color={item.color} />
        </View>
        <Text style={[styles.categoryName, { color: theme.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.categoryCount, { color: theme.textSecondary }]}>
          {item.count} items
        </Text>
      </TouchableOpacity>
    );
  };

  const renderResourceItem = ({ item }: { item: Resource }) => {
    const fileIcon = FILE_ICONS[item.file_type] || 'document-outline';
    const fileColor = FILE_COLORS[item.file_type] || theme.primary;
    
    return (
      <TouchableOpacity 
        style={[styles.resourceCard, { backgroundColor: theme.card }]}
        onPress={() => {/* Open resource */}}
      >
        {item.is_pinned && (
          <View style={[styles.pinnedBadge, { backgroundColor: theme.primary }]}>
            <Ionicons name="pin" size={12} color="#fff" />
          </View>
        )}
        
        <View style={styles.resourceMain}>
          <View style={[styles.fileTypeIcon, { backgroundColor: fileColor + '15' }]}>
            <Ionicons name={fileIcon} size={24} color={fileColor} />
          </View>
          
          <View style={styles.resourceInfo}>
            <View style={styles.resourceTitleRow}>
              <Text style={[styles.resourceTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              {item.is_featured && (
                <View style={[styles.featuredBadge, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="star" size={10} color="#F59E0B" />
                </View>
              )}
            </View>
            
            <Text style={[styles.resourceDesc, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
            
            <View style={styles.resourceMeta}>
              {item.file_size && (
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {formatFileSize(item.file_size)}
                </Text>
              )}
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                • {item.download_count} downloads
              </Text>
              {item.access_level !== 'all' && (
                <View style={[styles.accessBadge, { backgroundColor: '#8B5CF620' }]}>
                  <Ionicons name="lock-closed" size={10} color="#8B5CF6" />
                  <Text style={[styles.accessText, { color: '#8B5CF6' }]}>
                    {item.access_level}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        
        <TouchableOpacity style={styles.downloadButton}>
          <Ionicons name="download-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search resources..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Categories Horizontal List */}
      <View style={styles.categoriesSection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Categories</Text>
          {selectedCategory && (
            <TouchableOpacity onPress={() => setSelectedCategory(null)}>
              <Text style={[styles.clearFilter, { color: theme.primary }]}>Clear filter</Text>
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={CATEGORIES}
          renderItem={renderCategoryItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
        />
      </View>

      {/* Featured Section */}
      {!selectedCategory && !searchQuery && (
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Featured Resources</Text>
          </View>
          <FlatList
            data={RESOURCES.filter(r => r.is_featured)}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.featuredCard, { backgroundColor: theme.primary }]}
                onPress={() => {/* Open resource */}}
              >
                <View style={styles.featuredOverlay}>
                  <View style={styles.featuredIcon}>
                    <Ionicons name={FILE_ICONS[item.file_type]} size={32} color="#fff" />
                  </View>
                  <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.featuredDesc} numberOfLines={1}>{item.description}</Text>
                </View>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredList}
          />
        </View>
      )}

      {/* All Resources Header */}
      <View style={styles.allResourcesHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {selectedCategory 
            ? CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Resources'
            : 'All Resources'}
        </Text>
        <View style={styles.viewToggle}>
          <TouchableOpacity 
            style={[styles.viewButton, viewMode === 'list' && { backgroundColor: theme.primary + '20' }]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? theme.primary : theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.viewButton, viewMode === 'grid' && { backgroundColor: theme.primary + '20' }]}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="grid" size={18} color={viewMode === 'grid' ? theme.primary : theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Resource Hub',
          headerRight: () => (
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => {/* Upload resource */}}
            >
              <Ionicons name="cloud-upload-outline" size={24} color={theme.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <DashboardWallpaperBackground>
      <FlatList
        data={filteredResources}
        renderItem={renderResourceItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No resources found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Try adjusting your search or category filter
            </Text>
          </View>
        }
      />

      {/* FAB for Upload */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => {/* Upload resource modal */}}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      </DashboardWallpaperBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    marginRight: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  
  // Search
  searchContainer: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  
  // Categories
  categoriesSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  clearFilter: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoriesList: {
    gap: 10,
  },
  categoryCard: {
    width: 110,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 10,
  },
  
  // Featured
  featuredSection: {
    marginBottom: 20,
  },
  featuredList: {
    gap: 12,
  },
  featuredCard: {
    width: 200,
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  featuredIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    opacity: 0.3,
  },
  featuredTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  featuredDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  
  // All Resources
  allResourcesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  viewButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Resource Card
  resourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    position: 'relative',
  },
  pinnedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  fileTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceInfo: {
    flex: 1,
  },
  resourceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resourceTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  featuredBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  resourceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 11,
  },
  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  accessText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  downloadButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
