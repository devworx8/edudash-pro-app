import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  blocks: RoutineBlock[];
  caps_coverage: CAPSCoverage[];
  created_by: string;
  is_public: boolean;
  tags: string[];
  created_at: string;
  usage_count: number;
}

interface RoutineBlock {
  id: string;
  name: string;
  subject: string;
  startTime: string;
  endTime: string;
  capsObjectives?: string[];
}

interface CAPSCoverage {
  subject: string;
  target: number;
  achieved: number;
}

interface TemplateLibraryProps {
  organizationId: string;
  userId: string;
  onTemplateSelect: (template: RoutineTemplate) => void;
  onTemplateCreate: (template: Omit<RoutineTemplate, 'id' | 'created_at' | 'usage_count'>) => void;
  visible: boolean;
  onClose: () => void;
}

type TemplateSource = 'my' | 'organization' | 'public';

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  organizationId,
  userId,
  onTemplateSelect,
  onTemplateCreate,
  visible,
  onClose,
}) => {
  const [templates, setTemplates] = useState<RoutineTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<TemplateSource>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = ['Half-Day', 'Full-Day', 'Aftercare', 'CAPS-Aligned', 'Literacy Focus', 'Math Focus'];

  useEffect(() => {
    if (visible) {
      fetchTemplates();
    }
  }, [visible, source]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('routine_templates')
        .select('*')
        .order('usage_count', { ascending: false });

      if (source === 'my') {
        query = query.eq('created_by', userId);
      } else if (source === 'organization') {
        query = query.eq('organization_id', organizationId);
      } else {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      Alert.alert('Error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !template.name.toLowerCase().includes(query) &&
        !template.description.toLowerCase().includes(query) &&
        !template.tags.some(tag => tag.toLowerCase().includes(query))
      ) {
        return false;
      }
    }
    if (selectedTags.length > 0) {
      if (!selectedTags.some(tag => template.tags.includes(tag))) {
        return false;
      }
    }
    return true;
  });

  const handleTemplatePress = async (template: RoutineTemplate) => {
    // Increment usage count
    await supabase
      .from('routine_templates')
      .update({ usage_count: template.usage_count + 1 })
      .eq('id', template.id);

    onTemplateSelect(template);
    onClose();
  };

  const handleDuplicateTemplate = (template: RoutineTemplate) => {
    onTemplateCreate({
      ...template,
      name: `${template.name} (Copy)`,
      created_by: userId,
      is_public: false,
    });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    Alert.alert(
      'Delete Template',
      'Are you sure you want to delete this template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('routine_templates')
                .delete()
                .eq('id', templateId);

              if (error) throw error;
              fetchTemplates();
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Error', 'Failed to delete template');
            }
          },
        },
      ]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const renderTemplateItem = ({ item }: { item: RoutineTemplate }) => (
    <TouchableOpacity
      style={styles.templateItem}
      onPress={() => handleTemplatePress(item)}
    >
      <View style={styles.templateHeader}>
        <Text style={styles.templateName}>{item.name}</Text>
        <View style={styles.templateActions}>
          <TouchableOpacity
            onPress={() => handleDuplicateTemplate(item)}
            style={styles.actionButton}
          >
            <Ionicons name="copy-outline" size={20} color="#666" />
          </TouchableOpacity>
          {source === 'my' && (
            <TouchableOpacity
              onPress={() => handleDeleteTemplate(item.id)}
              style={styles.actionButton}
            >
              <Ionicons name="trash-outline" size={20} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.templateDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.templateMeta}>
        <View style={styles.tagContainer}>
          {item.tags.slice(0, 3).map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.usageCount}>Used {item.usage_count} times</Text>
      </View>
      <View style={styles.capsContainer}>
        {item.caps_coverage.slice(0, 3).map((caps, index) => (
          <View key={index} style={styles.capsItem}>
            <Text style={styles.capsSubject}>{caps.subject}</Text>
            <View style={styles.capsBar}>
              <View
                style={[
                  styles.capsFill,
                  { width: `${(caps.achieved / caps.target) * 100}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  const renderSourceTabs = () => (
    <View style={styles.sourceTabs}>
      {(['my', 'organization', 'public'] as TemplateSource[]).map(s => (
        <TouchableOpacity
          key={s}
          style={[styles.sourceTab, source === s && styles.sourceTabActive]}
          onPress={() => setSource(s)}
        >
          <Text style={[styles.sourceTabText, source === s && styles.sourceTabTextActive]}>
            {s === 'my' ? 'My Templates' : s === 'organization' ? 'School' : 'Public'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderFilterTags = () => (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {allTags.map(tag => (
          <TouchableOpacity
            key={tag}
            style={[styles.filterTag, selectedTags.includes(tag) && styles.filterTagActive]}
            onPress={() => toggleTag(tag)}
          >
            <Text style={[styles.filterTagText, selectedTags.includes(tag) && styles.filterTagTextActive]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color="#CCC" />
      <Text style={styles.emptyTitle}>No Templates Found</Text>
      <Text style={styles.emptyDescription}>
        {source === 'my'
          ? 'Create your first template from an existing routine'
          : source === 'organization'
          ? 'No school templates available yet'
          : 'No public templates match your criteria'}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Template Library</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {renderSourceTabs()}

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search templates..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {renderFilterTags()}

        {loading ? (
          <ActivityIndicator size="large" color="#1976D2" style={styles.loader} />
        ) : (
          <FlatList
            data={filteredTemplates}
            keyExtractor={item => item.id}
            renderItem={renderTemplateItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
          />
        )}

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#FFF" />
          <Text style={styles.createButtonText}>Create Template</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  sourceTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sourceTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sourceTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1976D2',
  },
  sourceTabText: {
    fontSize: 14,
    color: '#666',
  },
  sourceTabTextActive: {
    color: '#1976D2',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  filterTagActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  filterTagText: {
    fontSize: 12,
    color: '#666',
  },
  filterTagTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  templateItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  templateActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 4,
    marginLeft: 8,
  },
  templateDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  templateMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#1976D2',
  },
  usageCount: {
    fontSize: 12,
    color: '#999',
  },
  capsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  capsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  capsSubject: {
    width: 80,
    fontSize: 11,
    color: '#666',
  },
  capsBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
  },
  capsFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#1976D2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default TemplateLibrary;