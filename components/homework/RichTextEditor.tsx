import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RichTextEditorProps {
  initialContent?: RichContent;
  onContentChange: (content: RichContent) => void;
  placeholder?: string;
  editable?: boolean;
  maxHeight?: number;
  showToolbar?: boolean;
}

interface RichContent {
  blocks: ContentBlock[];
}

interface ContentBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'quote' | 'image' | 'video';
  content: string;
  formatting?: TextFormatting;
  metadata?: Record<string, any>;
}

interface TextFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSize?: 'small' | 'normal' | 'large';
}

type FormattingAction = 'bold' | 'italic' | 'underline' | 'heading' | 'bullet' | 'numbered' | 'quote';

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  initialContent,
  onContentChange,
  placeholder = 'Start writing...',
  editable = true,
  maxHeight,
  showToolbar = true,
}) => {
  const [content, setContent] = useState<RichContent>(
    initialContent || { blocks: [{ id: '1', type: 'paragraph', content: '' }] }
  );
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const updateContent = useCallback(
    (newContent: RichContent) => {
      setContent(newContent);
      onContentChange(newContent);
    },
    [onContentChange]
  );

  const updateBlock = (blockId: string, updates: Partial<ContentBlock>) => {
    const newBlocks = content.blocks.map(block =>
      block.id === blockId ? { ...block, ...updates } : block
    );
    updateContent({ ...content, blocks: newBlocks });
  };

  const addBlock = (afterBlockId: string, type: ContentBlock['type'] = 'paragraph') => {
    const index = content.blocks.findIndex(b => b.id === afterBlockId);
    const newBlock: ContentBlock = {
      id: generateId(),
      type,
      content: '',
    };
    const newBlocks = [
      ...content.blocks.slice(0, index + 1),
      newBlock,
      ...content.blocks.slice(index + 1),
    ];
    updateContent({ ...content, blocks: newBlocks });
    setActiveBlock(newBlock.id);
  };

  const deleteBlock = (blockId: string) => {
    if (content.blocks.length <= 1) return;
    const newBlocks = content.blocks.filter(b => b.id !== blockId);
    updateContent({ ...content, blocks: newBlocks });
  };

  const toggleFormatting = (blockId: string, format: keyof TextFormatting) => {
    const block = content.blocks.find(b => b.id === blockId);
    if (!block) return;

    const newFormatting = {
      ...block.formatting,
      [format]: !block.formatting?.[format],
    };
    updateBlock(blockId, { formatting: newFormatting });
  };

  const changeBlockType = (blockId: string, type: ContentBlock['type']) => {
    updateBlock(blockId, { type });
  };

  const handleBlockSubmit = (blockId: string) => {
    addBlock(blockId, 'paragraph');
  };

  const getBlockStyle = (block: ContentBlock): any => {
    const baseStyle: any = {};
    if (block.formatting?.bold) baseStyle.fontWeight = 'bold';
    if (block.formatting?.italic) baseStyle.fontStyle = 'italic';
    if (block.formatting?.underline) baseStyle.textDecorationLine = 'underline';
    if (block.formatting?.color) baseStyle.color = block.formatting.color;

    switch (block.type) {
      case 'heading':
        baseStyle.fontSize = 20;
        baseStyle.fontWeight = 'bold';
        break;
      case 'quote':
        baseStyle.borderLeftWidth = 4;
        baseStyle.borderLeftColor = '#1976D2';
        baseStyle.paddingLeft = 12;
        baseStyle.fontStyle = 'italic';
        baseStyle.color = '#666';
        break;
      case 'bullet':
      case 'numbered':
        baseStyle.marginLeft = 20;
        break;
      default:
        break;
    }

    return baseStyle;
  };

  const renderBlockPrefix = (block: ContentBlock, index: number): React.ReactNode => {
    if (block.type === 'bullet') {
      return <Text style={styles.bulletPrefix}>• </Text>;
    }
    if (block.type === 'numbered') {
      return <Text style={styles.numberedPrefix}>{index + 1}. </Text>;
    }
    return null;
  };

  const renderBlock = (block: ContentBlock, index: number) => (
    <View key={block.id} style={styles.blockContainer}>
      <View style={styles.blockContent}>
        {renderBlockPrefix(block, index)}
        <TextInput
          style={[styles.textInput, getBlockStyle(block)]}
          value={block.content}
          onChangeText={text => updateBlock(block.id, { content: text })}
          onFocus={() => setActiveBlock(block.id)}
          onSubmitEditing={() => handleBlockSubmit(block.id)}
          placeholder={index === 0 ? placeholder : ''}
          placeholderTextColor="#999"
          multiline
          editable={editable}
        />
      </View>
      {activeBlock === block.id && editable && (
        <View style={styles.blockActions}>
          <TouchableOpacity
            onPress={() => deleteBlock(block.id)}
            style={styles.blockActionButton}
          >
            <Ionicons name="trash-outline" size={18} color="#F44336" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderToolbar = () => {
    if (!showToolbar || !editable) return null;

    const toolbarActions: { action: FormattingAction; icon: string; label: string }[] = [
      { action: 'bold', icon: 'text-bold', label: 'Bold' },
      { action: 'italic', icon: 'text-italic', label: 'Italic' },
      { action: 'underline', icon: 'text-underline', label: 'Underline' },
      { action: 'heading', icon: 'text', label: 'Heading' },
      { action: 'bullet', icon: 'list', label: 'Bullet List' },
      { action: 'numbered', icon: 'list-numbered', label: 'Numbered List' },
      { action: 'quote', icon: 'chatbox-ellipses-outline', label: 'Quote' },
    ];

    return (
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {toolbarActions.map(({ action, icon, label }) => (
            <TouchableOpacity
              key={action}
              style={styles.toolbarButton}
              onPress={() => {
                if (activeBlock) {
                  if (action === 'heading' || action === 'bullet' || action === 'numbered' || action === 'quote') {
                    changeBlockType(activeBlock, action as ContentBlock['type']);
                  } else {
                    toggleFormatting(activeBlock, action as keyof TextFormatting);
                  }
                }
              }}
            >
              <Ionicons name={icon as any} size={20} color="#666" />
            </TouchableOpacity>
          ))}
          <View style={styles.toolbarDivider} />
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => setShowImageModal(true)}
          >
            <Ionicons name="image-outline" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => setShowLinkModal(true)}
          >
            <Ionicons name="link-outline" size={20} color="#666" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, maxHeight && { maxHeight }]}>
      {renderToolbar()}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {content.blocks.map((block, index) => renderBlock(block, index))}
      </ScrollView>

      {/* Link Modal */}
      <Modal visible={showLinkModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Link</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter URL"
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowLinkModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  // Insert link logic
                  setShowLinkModal(false);
                  setLinkUrl('');
                }}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>
                  Add Link
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Modal */}
      <Modal visible={showImageModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Image</Text>
            <View style={styles.imageOptions}>
              <TouchableOpacity style={styles.imageOption}>
                <Ionicons name="camera-outline" size={32} color="#1976D2" />
                <Text style={styles.imageOptionText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageOption}>
                <Ionicons name="images-outline" size={32} color="#1976D2" />
                <Text style={styles.imageOptionText}>Choose from Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageOption}>
                <Ionicons name="link-outline" size={32} color="#1976D2" />
                <Text style={styles.imageOptionText}>Enter URL</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowImageModal(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  toolbar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  toolbarDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
  },
  blockContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  blockContent: {
    flex: 1,
    flexDirection: 'row',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    padding: 0,
    textAlignVertical: 'top',
  },
  bulletPrefix: {
    fontSize: 16,
    color: '#666',
    marginRight: 4,
  },
  numberedPrefix: {
    fontSize: 16,
    color: '#666',
    marginRight: 4,
  },
  blockActions: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  blockActionButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalButtonPrimary: {
    backgroundColor: '#1976D2',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#666',
  },
  modalButtonTextPrimary: {
    color: '#FFF',
    fontWeight: '600',
  },
  imageOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  imageOption: {
    alignItems: 'center',
    padding: 16,
  },
  imageOptionText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#1976D2',
  },
});

export default RichTextEditor;