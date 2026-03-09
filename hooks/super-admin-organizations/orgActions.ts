import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { getEntityMeta } from '@/lib/screen-styles/super-admin-organizations.styles';
import type { Organization } from '@/lib/screen-styles/super-admin-organizations.styles';
import type { ShowAlertFn } from './types';

/** Deps injected by the orchestrator hook */
export interface OrgActionDeps {
  showAlert: ShowAlertFn;
  loadOrganizations: () => Promise<void>;
  setShowActionsModal: (v: boolean) => void;
  setShowDetailModal: (v: boolean) => void;
  setSelectedOrg: (org: Organization | null) => void;
}

/**
 * Executes a CRUD action on the selected organization.
 * Pure function — all side-effects go through the injected deps.
 */
export function executeOrgAction(
  action: string,
  org: Organization,
  deps: OrgActionDeps
): void {
  const { showAlert, loadOrganizations, setShowActionsModal, setShowDetailModal, setSelectedOrg } = deps;

  switch (action) {
    case 'view':
      setShowActionsModal(false);
      setShowDetailModal(true);
      break;

    case 'edit':
      showAlert({ title: 'Edit Organization', message: 'Organization editing coming soon' });
      break;

    case 'change_type':
      openTypePicker(org, deps);
      break;

    case 'suspend':
      showAlert({
        title: 'Suspend Organization',
        message: `Are you sure you want to suspend ${org.name}?`,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Suspend',
            style: 'destructive',
            onPress: async () => {
              try {
                const { actualId } = getEntityMeta(org);
                const sourceType = org.id.split('_')[0];
                const table =
                  sourceType === 'preschool' ? 'preschools' :
                  sourceType === 'school' ? 'schools' : 'organizations';
                const { error } = await assertSupabase()
                  .from(table).update({ is_active: false }).eq('id', actualId);
                if (error) throw error;
                track('superadmin_org_suspended', { org_id: actualId });
                showAlert({ title: 'Success', message: 'Organization suspended' });
                setShowActionsModal(false);
                await loadOrganizations();
              } catch (error: any) {
                showAlert({ title: 'Error', message: error?.message || 'Failed to suspend organization' });
              }
            },
          },
        ],
      });
      break;

    case 'verify':
      showAlert({
        title: 'Verify Organization',
        message: `Mark ${org.name} as verified?`,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify',
            onPress: async () => {
              try {
                const { actualId } = getEntityMeta(org);
                const sourceType = org.id.split('_')[0];
                const table =
                  sourceType === 'preschool' ? 'preschools' :
                  sourceType === 'school' ? 'schools' : 'organizations';
                const { error } = await assertSupabase()
                  .from(table).update({ is_verified: true }).eq('id', actualId);
                if (error) throw error;
                track('superadmin_org_verified', { org_id: actualId });
                showAlert({ title: 'Success', message: 'Organization verified' });
                setShowActionsModal(false);
                await loadOrganizations();
              } catch (error: any) {
                showAlert({ title: 'Error', message: error?.message || 'Failed to verify organization' });
              }
            },
          },
        ],
      });
      break;

    case 'delete':
      confirmDelete(org, deps);
      break;
  }
}

const PRESCHOOL_TYPE_OPTIONS = [
  { label: 'Preschool', value: 'preschool' },
  { label: 'Combined', value: 'combined' },
  { label: 'Community School', value: 'community_school' },
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
];

const ORGANIZATION_TYPE_OPTIONS = [
  { label: 'Organization', value: 'org' },
  { label: 'Preschool', value: 'preschool' },
  { label: 'Daycare', value: 'daycare' },
  { label: 'K-12', value: 'k12' },
  { label: 'Primary School', value: 'primary_school' },
  { label: 'Skills', value: 'skills' },
  { label: 'Tertiary', value: 'tertiary' },
  { label: 'Other', value: 'other' },
];

async function updateOrganizationType(
  org: Organization,
  nextType: string,
  deps: OrgActionDeps
): Promise<void> {
  const { showAlert, loadOrganizations, setShowActionsModal, setShowDetailModal } = deps;
  try {
    const { entityType, actualId } = getEntityMeta(org);
    const supabase = assertSupabase();

    if (entityType === 'school') {
      showAlert({
        title: 'Not Supported',
        message: 'K-12 school records currently use a fixed type. Update this from school setup tools.',
      });
      return;
    }

    const { data, error } = await supabase.rpc('superadmin_update_entity_type', {
      p_entity_type: entityType,
      p_entity_id: actualId,
      p_next_type: nextType,
      p_sync_duplicates: true,
    });
    if (error) throw error;
    if (data?.success === false) {
      throw new Error(data?.message || 'Type update was rejected.');
    }

    track('superadmin_org_type_updated', {
      org_id: actualId,
      source_type: entityType,
      previous_type: org.organization_type_raw || org.type,
      next_type: nextType,
    });
    showAlert({ title: 'Success', message: `Organization type updated to "${nextType}".` });
    setShowActionsModal(false);
    setShowDetailModal(false);
    await loadOrganizations();
  } catch (error: any) {
    logger.error('[Organizations] Type update error:', error);
    showAlert({ title: 'Error', message: error?.message || 'Failed to update organization type.' });
  }
}

function openTypePicker(org: Organization, deps: OrgActionDeps): void {
  const sourceType = org.id.split('_')[0];
  if (sourceType === 'school') {
    deps.showAlert({
      title: 'Type Locked',
      message: 'This record is from the K-12 schools table. Type changes are not available here.',
    });
    return;
  }

  const options = sourceType === 'preschool' ? PRESCHOOL_TYPE_OPTIONS : ORGANIZATION_TYPE_OPTIONS;
  deps.showAlert({
    title: 'Change Organization Type',
    message: `Set a new type for ${org.name}:`,
    buttons: [
      ...options.map((option) => ({
        text: option.label,
        onPress: () => updateOrganizationType(org, option.value, deps),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
  });
}

// ── Delete (extracted for readability) ──────────────────────
function confirmDelete(org: Organization, deps: OrgActionDeps): void {
  const { showAlert, loadOrganizations, setShowActionsModal, setSelectedOrg } = deps;

  showAlert({
    title: 'Delete Organization',
    message: `⚠️ This action cannot be undone!\n\nThis will permanently delete "${org.name}" and unlink all associated users.\n\nAre you absolutely sure?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Forever',
        style: 'destructive',
        onPress: async () => {
          try {
            const idParts = org.id.split('_');
            const sourceType = idParts[0];
            const actualId = idParts.slice(1).join('_');
            const table =
              sourceType === 'preschool' ? 'preschools' :
              sourceType === 'school' ? 'schools' : 'organizations';
            const profileColumn =
              sourceType === 'preschool' || sourceType === 'school'
                ? 'preschool_id' : 'organization_id';

            logger.debug('[Organizations] Deleting from table:', table, 'id:', actualId);
            const supabase = assertSupabase();

            // Unlink profiles
            const { error: unlinkError } = await supabase
              .from('profiles').update({ [profileColumn]: null }).eq(profileColumn, actualId);
            if (unlinkError) {
              logger.debug('[Organizations] Profile unlink error (non-fatal):', unlinkError.message);
            }

            // Delete the organization
            const { error } = await supabase.from(table).delete().eq('id', actualId);
            if (error) throw error;

            track('superadmin_org_deleted', { org_id: actualId, org_name: org.name, org_type: org.type });
            showAlert({ title: 'Deleted', message: `${org.name} has been permanently deleted.` });
            setShowActionsModal(false);
            setSelectedOrg(null);
            await loadOrganizations();
          } catch (error: any) {
            logger.error('[Organizations] Delete error:', error);
            let errorMessage = error?.message || 'Failed to delete organization.';
            if (error?.code === '23503') {
              errorMessage = 'Cannot delete: This organization still has linked data. Please remove or reassign that data first.';
            }
            showAlert({ title: 'Error', message: errorMessage });
          }
        },
      },
    ],
  });
}
