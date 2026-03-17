import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput, Switch, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isSuperAdmin } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useSuperAdminAdminManagement } from '@/hooks/useSuperAdminAdminManagement';
import {
  ADMIN_ROLES,
  DEPARTMENTS,
  getRoleInfo,
  getDepartmentInfo,
  formatLastLogin,
  createStyles,
} from '@/lib/screen-styles/super-admin-admin-management.styles';

export default function SuperAdminAdminManagementScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile,
    loading,
    refreshing,
    adminUsers,
    showCreateModal,
    setShowCreateModal,
    setSelectedUser,
    setShowEditModal,
    formData,
    setFormData,
    onRefresh,
    handleCreateAdmin,
    isCreating,
    handleToggleUserStatus,
    handleDeleteUser,
  } = useSuperAdminAdminManagement(showAlert);

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Admin Management', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Admin Management', headerShown: false }} />
      <ThemedStatusBar />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="people" size={28} color="#3b82f6" />
            <Text style={styles.title}>Admin Management</Text>
          </View>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading admin users...</Text>
          </View>
        ) : (
          <>
            {/* Admin Users List */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Admin Users ({adminUsers.length})</Text>
                <Text style={styles.sectionSubtitle}>
                  Manage administrative users and their permissions
                </Text>
              </View>
              
              {adminUsers.map((user) => {
                const roleInfo = getRoleInfo(user.role);
                const deptInfo = getDepartmentInfo(user.department);
                
                return (
                  <View key={user.id} style={styles.userCard}>
                    <View style={styles.userHeader}>
                      <View style={styles.userInfo}>
                        <View style={styles.userAvatarContainer}>
                          <View style={[styles.userAvatar, { backgroundColor: roleInfo.color }]}>
                            <Text style={styles.userAvatarText}>
                              {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </Text>
                          </View>
                          <View style={[
                            styles.userStatusIndicator,
                            { backgroundColor: user.is_active ? '#10b981' : '#6b7280' }
                          ]} />
                        </View>
                        
                        <View style={styles.userDetails}>
                          <Text style={styles.userName}>{user.full_name}</Text>
                          <Text style={styles.userEmail}>{user.email}</Text>
                          <View style={styles.userMeta}>
                            <View style={[styles.roleBadge, { backgroundColor: roleInfo.color + '20', borderColor: roleInfo.color }]}>
                              <Text style={[styles.roleText, { color: roleInfo.color }]}>
                                {roleInfo.label}
                              </Text>
                            </View>
                            <View style={[styles.deptBadge, { backgroundColor: deptInfo.color + '20', borderColor: deptInfo.color }]}>
                              <Text style={[styles.deptText, { color: deptInfo.color }]}>
                                {deptInfo.name}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.userStats}>
                      <Text style={styles.statItem}>
                        <Ionicons name="time" size={12} color="#6b7280" /> Last login: {formatLastLogin(user.last_login)}
                      </Text>
                      <Text style={styles.statItem}>
                        <Ionicons name="calendar" size={12} color="#6b7280" /> Created: {new Date(user.created_at).toLocaleDateString()}
                      </Text>
                      {user.schools_assigned && user.schools_assigned.length > 0 && (
                        <Text style={styles.statItem}>
                          <Ionicons name="school" size={12} color="#6b7280" /> {user.schools_assigned.length} schools assigned
                        </Text>
                      )}
                    </View>

                    <View style={styles.userActions}>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => {
                          setSelectedUser(user);
                          setShowEditModal(true);
                        }}
                      >
                        <Ionicons name="create" size={16} color="#3b82f6" />
                        <Text style={styles.actionButtonText}>Edit</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: user.is_active ? '#f59e0b20' : '#10b98120' }]}
                        onPress={() => handleToggleUserStatus(user)}
                      >
                        <Ionicons 
                          name={user.is_active ? "pause" : "play"} 
                          size={16} 
                          color={user.is_active ? '#f59e0b' : '#10b981'} 
                        />
                        <Text style={[styles.actionButtonText, { 
                          color: user.is_active ? '#f59e0b' : '#10b981' 
                        }]}>
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: '#ef444420' }]}
                        onPress={() => handleDeleteUser(user)}
                      >
                        <Ionicons name="trash" size={16} color="#ef4444" />
                        <Text style={[styles.actionButtonText, { color: '#ef4444' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              
              {adminUsers.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="people" size={48} color="#6b7280" />
                  <Text style={styles.emptyText}>No admin users</Text>
                  <Text style={styles.emptySubText}>Create your first admin user to get started</Text>
                  <TouchableOpacity 
                    style={styles.createButton}
                    onPress={() => setShowCreateModal(true)}
                  >
                    <Text style={styles.createButtonText}>Create Admin User</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Departments Overview */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Departments & Roles</Text>
              <Text style={styles.sectionSubtitle}>Available departments and their permissions</Text>
              
              {DEPARTMENTS.map((dept) => (
                <View key={dept.id} style={styles.deptCard}>
                  <View style={styles.deptHeader}>
                    <View style={[styles.deptIcon, { backgroundColor: dept.color + '20' }]}>
                      <Ionicons name="business" size={20} color={dept.color} />
                    </View>
                    <View style={styles.deptInfo}>
                      <Text style={styles.deptName}>{dept.name}</Text>
                      <Text style={styles.deptDescription}>{dept.description}</Text>
                    </View>
                  </View>
                  <View style={styles.permissionsList}>
                    {dept.permissions.map((permission) => (
                      <View key={permission} style={styles.permissionChip}>
                        <Text style={styles.permissionText}>{permission.replace(/_/g, ' ')}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Create Admin Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Admin User</Text>
            <TouchableOpacity onPress={handleCreateAdmin} disabled={isCreating} style={{ opacity: isCreating ? 0.5 : 1 }}>
              {isCreating ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <Text style={styles.saveButton}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Full Name *</Text>
              <TextInput
                style={styles.formInput}
                value={formData.full_name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, full_name: text }))}
                placeholder="Enter full name"
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Email Address *</Text>
              <TextInput
                style={styles.formInput}
                value={formData.email}
                onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                placeholder="admin@edudashpro.com"
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Admin Role</Text>
              {ADMIN_ROLES.map((role) => (
                <TouchableOpacity
                  key={role.value}
                  style={[
                    styles.roleOption,
                    { 
                      backgroundColor: formData.role === role.value ? role.color + '20' : 'transparent',
                      borderColor: formData.role === role.value ? role.color : '#374151'
                    }
                  ]}
onPress={() => setFormData(prev => ({ ...prev, role: role.value as any }))}
                >
                  <View style={styles.roleOptionContent}>
                    <Text style={[styles.roleOptionTitle, { 
                      color: formData.role === role.value ? role.color : '#ffffff' 
                    }]}>
                      {role.label}
                    </Text>
                    <Text style={styles.roleOptionDescription}>{role.description}</Text>
                  </View>
                  <View style={[
                    styles.radioButton,
                    { 
                      borderColor: formData.role === role.value ? role.color : '#6b7280',
                      backgroundColor: formData.role === role.value ? role.color : 'transparent'
                    }
                  ]}>
                    {formData.role === role.value && (
                      <Ionicons name="checkmark" size={12} color="#ffffff" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Department</Text>
              {DEPARTMENTS.map((dept) => (
                <TouchableOpacity
                  key={dept.id}
                  style={[
                    styles.deptOption,
                    { 
                      backgroundColor: formData.department === dept.id ? dept.color + '20' : 'transparent',
                      borderColor: formData.department === dept.id ? dept.color : '#374151'
                    }
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, department: dept.id }))}
                >
                  <View style={styles.deptOptionContent}>
                    <Text style={[styles.deptOptionTitle, { 
                      color: formData.department === dept.id ? dept.color : '#ffffff' 
                    }]}>
                      {dept.name}
                    </Text>
                    <Text style={styles.deptOptionDescription}>{dept.description}</Text>
                  </View>
                  <View style={[
                    styles.radioButton,
                    { 
                      borderColor: formData.department === dept.id ? dept.color : '#6b7280',
                      backgroundColor: formData.department === dept.id ? dept.color : 'transparent'
                    }
                  ]}>
                    {formData.department === dept.id && (
                      <Ionicons name="checkmark" size={12} color="#ffffff" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formSection}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.formLabel}>Active Status</Text>
                  <Text style={styles.switchDescription}>User can log in and access assigned features</Text>
                </View>
                <Switch
                  value={formData.is_active}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, is_active: value }))}
                  trackColor={{ false: '#374151', true: '#3b82f620' }}
                  thumbColor={formData.is_active ? '#3b82f6' : '#9ca3af'}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AlertModal {...alertProps} />
    </View>
  );
}
