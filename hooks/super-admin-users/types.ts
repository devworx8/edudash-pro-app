import type { Dispatch, SetStateAction } from 'react';
import type { UserRecord, UserFilters } from '@/lib/screen-styles/super-admin-users.styles';

// ─── Alert callback types ───────────────────────────────────────────────────

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

export interface ShowAlertParams {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttons?: AlertButton[];
}

export type ShowAlertFn = (params: ShowAlertParams) => void;

// ─── Dependency bag for action helpers ──────────────────────────────────────

export interface ActionDeps {
  showAlert: ShowAlertFn;
  profileId: string | undefined;
  fetchUsers: () => Promise<void>;
  closeUserModal: () => void;
  setImpersonating: (v: boolean) => void;
  setCreatingTempPassword: (v: boolean) => void;
  setUpdatingTier: (v: boolean) => void;
  setBulkDeleting: (v: boolean) => void;
}

// ─── Hook return type ───────────────────────────────────────────────────────

export interface UseSuperAdminUsersReturn {
  /** Whether the current user has super-admin access */
  hasAccess: boolean;

  // Data
  users: UserRecord[];
  filteredUsers: UserRecord[];
  totalUsers: number;
  loading: boolean;
  refreshing: boolean;
  impersonating: boolean;
  creatingTempPassword: boolean;
  updatingTier: boolean;

  // UI state
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  showUserModal: boolean;
  setShowUserModal: (v: boolean) => void;
  selectedUser: UserRecord | null;
  setSelectedUser: (u: UserRecord | null) => void;
  filters: UserFilters;
  setFilters: Dispatch<SetStateAction<UserFilters>>;

  // Bulk selection
  selectionMode: boolean;
  selectedIds: Set<string>;
  toggleSelectionMode: () => void;
  toggleUserSelection: (userId: string) => void;
  selectAllFiltered: () => void;
  clearSelection: () => void;
  bulkDeleting: boolean;

  // Actions
  onRefresh: () => Promise<void>;
  impersonateUser: (user: UserRecord) => Promise<void>;
  suspendUser: (user: UserRecord) => Promise<void>;
  updateUserRole: (user: UserRecord, newRole: string) => Promise<void>;
  requestUserDeletion: (user: UserRecord) => Promise<void>;
  deleteUserNow: (user: UserRecord) => Promise<void>;
  resetUserPassword: (user: UserRecord) => Promise<void>;
  createTempPassword: (user: UserRecord) => Promise<void>;
  openTierPicker: (user: UserRecord) => void;
  openRolePicker: (user: UserRecord) => void;
  bulkDeleteSelected: () => void;
}
