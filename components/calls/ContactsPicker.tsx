/**
 * ContactsPicker - Select contacts to make a call
 * Modal bottom sheet for selecting users to call
 */
import React, { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import { useAuth } from '@/contexts/AuthContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url?: string;
}

interface ContactsPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact, callType: 'voice' | 'video') => void;
}

export function ContactsPicker({ visible, onClose, onSelectContact }: ContactsPickerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch contacts (users from same preschool/organization)
  // TEACHER FIX: Teachers should see parents from their assigned class, not all parents
  // PRIVACY FIX: Parents should ONLY see teachers and principals, NOT other parents
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['call-contacts', user?.id, profile?.preschool_id, profile?.role, profile?.id],
    queryFn: async (): Promise<Contact[]> => {
      if (!user?.id) return [];
      
      const client = assertSupabase();
      
      // CRITICAL: Filter roles based on current user's role
      let allowedRoles: string[];
      let parentFilter: any = null;
      
      if (profile?.role === 'parent') {
        // Parents can ONLY call teachers and principals (NOT other parents)
        allowedRoles = ['principal', 'teacher', 'principal_admin', 'admin'];
      } else if (profile?.role === 'teacher') {
        // Teachers can call principals, other teachers, and parents FROM THEIR CLASSES
        allowedRoles = ['principal', 'teacher', 'principal_admin', 'admin'];
        
        // Fetch all classes the teacher is assigned to (lead + assistant)
        const classIds = await fetchTeacherClassIds(profile.id);
        
        if (classIds.length > 0) {
          // Get parent IDs from students in ALL teacher's classes
          const { data: students } = await client
            .from('students')
            .select('parent_user_id')
            .in('class_id', classIds)
            .not('parent_user_id', 'is', null);
          
          const parentIds = [...new Set((students || []).map(s => s.parent_user_id).filter(Boolean))];
          
          if (parentIds.length > 0) {
            parentFilter = parentIds;
          }
        }
        
        // Also include parents role for general access
        allowedRoles.push('parent');
      } else {
        // Principals/admins can call everyone
        allowedRoles = ['principal', 'teacher', 'parent', 'principal_admin', 'admin'];
      }
      
      // Build query
      let query = client
        .from('profiles')
        .select('id, first_name, last_name, role, avatar_url')
        .neq('id', user.id)
        .in('role', allowedRoles);
      
      if (profile?.preschool_id) {
        query = query.eq('preschool_id', profile.preschool_id);
      }
      
      // For teachers, filter parents to only those in their class
      if (profile?.role === 'teacher' && parentFilter && parentFilter.length > 0) {
        // Get all contacts, then filter parents
        const { data, error } = await query.order('first_name');
        
        if (error) {
          console.error('[ContactsPicker] Error:', error);
          return [];
        }
        
        // Filter: include non-parents OR parents in teacher's class
        return (data || []).filter(c => {
          if (c.role !== 'parent') return true; // Include all non-parents
          return parentFilter.includes(c.id); // Only include parents from teacher's class
        }).filter(c => c.first_name || c.last_name);
      }
      
      // For other roles, use standard query
      const { data, error} = await query.order('first_name');
      
      if (error) {
        console.error('[ContactsPicker] Error:', error);
        return [];
      }
      
      return (data || []).filter(c => c.first_name || c.last_name);
    },
    enabled: visible && !!user?.id,
  });

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(c => 
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(query) ||
      c.role?.toLowerCase()?.includes(query)
    );
  }, [contacts, searchQuery]);

  // Group contacts by role
  const groupedContacts = useMemo(() => {
    const groups: { [key: string]: Contact[] } = {};
    filteredContacts.forEach(contact => {
      const role = contact.role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(contact);
    });
    return Object.entries(groups).sort(([a], [b]) => {
      const order = ['principal', 'teacher', 'parent', 'other'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [filteredContacts]);

  const getRoleLabel = (role: string) => {
    const labels: { [key: string]: string } = {
      principal: t('roles.principal', { defaultValue: 'Principal' }),
      teacher: t('roles.teacher', { defaultValue: 'Teachers' }),
      parent: t('roles.parent', { defaultValue: 'Parents' }),
      other: t('roles.other', { defaultValue: 'Other' }),
    };
    return labels[role] || role;
  };

  const getInitials = (contact: Contact) => {
    return `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <View style={[styles.contactItem, { backgroundColor: theme.surface }]}>
      <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
        <Text style={[styles.avatarText, { color: theme.primary }]}>{getInitials(item)}</Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: theme.text }]}>
          {`${item.first_name || ''} ${item.last_name || ''}`.trim()}
        </Text>
        <Text style={[styles.contactRole, { color: theme.textSecondary }]}>
          {getRoleLabel(item.role)}
        </Text>
      </View>
      <View style={styles.callButtons}>
        <TouchableOpacity
          style={[styles.callButton, { backgroundColor: '#10B981' + '20' }]}
          onPress={() => onSelectContact(item, 'voice')}
        >
          <Ionicons name="call" size={20} color="#10B981" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.callButton, { backgroundColor: theme.primary + '20' }]}
          onPress={() => onSelectContact(item, 'video')}
        >
          <Ionicons name="videocam" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t('calls.new_call', { defaultValue: 'New Call' })}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={t('common.search', { defaultValue: 'Search contacts...' })}
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Contacts List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color={theme.primary} />
            </View>
          ) : filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery 
                  ? t('calls.no_contacts_found', { defaultValue: 'No contacts found' })
                  : t('calls.no_contacts', { defaultValue: 'No contacts available' })}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredContacts.map(item => (
                <React.Fragment key={item.id}>
                  {renderContact({ item } as any)}
                </React.Fragment>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  closeButton: { padding: 4 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  contactItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600' },
  contactInfo: { flex: 1, marginLeft: 12 },
  contactName: { fontSize: 16, fontWeight: '500' },
  contactRole: { fontSize: 13, marginTop: 2 },
  callButtons: { flexDirection: 'row', gap: 8 },
  callButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 16 },
});
