/**
 * School Staff Seat Management Service
 * 
 * Provides a clean interface to the seat management RPC functions
 * Created to fix inconsistent seat assignment issues on plans like starter
 */

import { assertSupabase } from '@/lib/supabase';
import { 
  SeatAssignResponse, 
  SeatRevokeResponse, 
  SeatLimits, 
  TeacherSeat, 
  SeatUsageDisplay,
  SeatManagementError,
  AssignSeatParams,
  RevokeSeatParams
} from '@/lib/types/seats';

export class SeatService {
  private static isSeatManagementError(error: unknown): error is SeatManagementError {
    if (!error || typeof error !== 'object') return false;
    const maybeCode = (error as any).code;
    const maybeName = (error as any).name;
    return (
      maybeName === 'SeatManagementError' ||
      [
        'LIMIT_EXCEEDED',
        'PERMISSION_DENIED',
        'USER_NOT_FOUND',
        'ALREADY_ASSIGNED',
        'NO_ACTIVE_SEAT',
        'NETWORK_ERROR',
        'UNKNOWN',
      ].includes(String(maybeCode))
    );
  }

  private static parseSeatAssignError(error: any): {
    code: SeatManagementError['code'];
    message: string;
    details: string;
    retryable: boolean;
  } {
    const rawCode = String(error?.code || '');
    const message = String(error?.message || '');
    const details = String(error?.details || '');
    const hint = String(error?.hint || '');
    const status = String(error?.status || error?.statusCode || '');
    const combined = `${message} ${details} ${hint}`.toLowerCase();
    const composedDetails = JSON.stringify({
      code: rawCode || null,
      status: status || null,
      message: message || null,
      details: details || null,
      hint: hint || null,
    });

    if (rawCode === '42501' || combined.includes('only principals can assign')) {
      return {
        code: 'PERMISSION_DENIED',
        message: 'Only principals can assign staff seats.',
        details: composedDetails,
        retryable: false,
      };
    }

    if (
      combined.includes('no staff seats available') ||
      combined.includes('no teacher seats available') ||
      combined.includes('no active subscription found')
    ) {
      return {
        code: 'LIMIT_EXCEEDED',
        message: 'No staff seats are available for this school plan.',
        details: composedDetails,
        retryable: false,
      };
    }

    if (
      rawCode === '23514' ||
      combined.includes('subscriptions_seats_check') ||
      (combined.includes('seats_used') && combined.includes('seats_total'))
    ) {
      return {
        code: 'LIMIT_EXCEEDED',
        message: 'No staff seats are available for this school plan.',
        details: composedDetails,
        retryable: false,
      };
    }

    if (
      combined.includes('target must be a teacher') ||
      combined.includes('target must be school staff') ||
      combined.includes('cannot infer preschool') ||
      combined.includes('target staff account is not linked to auth user') ||
      combined.includes('cannot find user record for target user id')
    ) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'Target user is not a valid staff account in this school.',
        details: composedDetails,
        retryable: false,
      };
    }

    if (
      combined.includes('already_assigned') ||
      combined.includes('already assigned') ||
      combined.includes('uniq_active_subscription_user') ||
      (combined.includes('subscription_seats') && combined.includes('duplicate key')) ||
      (rawCode === '23505' && combined.includes('subscription_seats'))
    ) {
      return {
        code: 'ALREADY_ASSIGNED',
        message: 'This staff member already has an active seat.',
        details: composedDetails,
        retryable: false,
      };
    }

    if (combined.includes('seat assignment in progress')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Another seat assignment is in progress. Please retry in a moment.',
        details: composedDetails,
        retryable: true,
      };
    }

    if (
      rawCode === '23505' &&
      (combined.includes('users_pkey') ||
        combined.includes('users_auth_user_id') ||
        combined.includes('users_email') ||
        combined.includes('duplicate key'))
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Seat assignment hit an account-link conflict. Please retry.',
        details: composedDetails,
        retryable: true,
      };
    }

    if (
      combined.includes('audit_logs_user_id_fkey') ||
      (rawCode === '23503' && combined.includes('audit_logs'))
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Seat assignment is blocked by an audit-link mismatch. Apply the latest DB migration and retry.',
        details: composedDetails,
        retryable: false,
      };
    }

    return {
      code: 'NETWORK_ERROR',
      message: message || 'Failed to assign staff seat.',
      details: composedDetails,
      retryable: false,
    };
  }

  private static async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /**
   * Get current seat limits and usage for the caller's school
   * Works for both principals and staff
   */
  static async getSeatLimits(): Promise<SeatLimits> {
    try {
      const { data, error } = await assertSupabase()
        .rpc('rpc_teacher_seat_limits');

      if (error) {
        console.error('Error fetching seat limits:', error);
        throw SeatService.createError('NETWORK_ERROR', 'Failed to fetch seat limits', error.message);
      }

      // The RPC returns a single row with limit, used, available
      if (!data || data.length === 0) {
        throw SeatService.createError('UNKNOWN', 'No seat limit data returned');
      }

      const result = data[0];
      return {
        limit: result.limit,
        used: result.used,
        available: result.available
      };
    } catch (error) {
      if (SeatService.isSeatManagementError(error)) {
        throw error; // Re-throw SeatManagementError
      }
      console.error('Unexpected error fetching seat limits:', error);
      throw SeatService.createError('UNKNOWN', 'Unexpected error fetching seat limits', String(error));
    }
  }

  /**
   * Assign a staff seat to a user
   * Only principals can assign seats for their school
   */
  static async assignTeacherSeat({ teacherUserId }: AssignSeatParams): Promise<SeatAssignResponse> {
    try {
      const invoke = async () =>
        assertSupabase().rpc('rpc_assign_teacher_seat', { target_user_id: teacherUserId });

      let { data, error } = await invoke();
      if (error) {
        const parsed = SeatService.parseSeatAssignError(error);
        console.error('Error assigning staff seat:', parsed.details);

        if (parsed.retryable) {
          await SeatService.wait(300);
          const retry = await invoke();
          data = retry.data;
          error = retry.error;
          if (error) {
            const retryParsed = SeatService.parseSeatAssignError(error);
            throw SeatService.createError(retryParsed.code, retryParsed.message, retryParsed.details);
          }
        } else {
          throw SeatService.createError(parsed.code, parsed.message, parsed.details);
        }
      }

      const normalized = Array.isArray(data) ? data[0] : data;
      if (!normalized || typeof normalized !== 'object' || typeof (normalized as any).status !== 'string') {
        throw SeatService.createError(
          'UNKNOWN',
          'Seat assignment returned an unexpected response.',
          JSON.stringify(data ?? null)
        );
      }

      return normalized as SeatAssignResponse;
    } catch (error) {
      if (SeatService.isSeatManagementError(error)) {
        throw error; // Re-throw SeatManagementError
      }
      console.error('Unexpected error assigning staff seat:', error);
      throw SeatService.createError('UNKNOWN', 'Unexpected error assigning staff seat', String(error));
    }
  }

  /**
   * Revoke a staff seat from a user
   * Only principals can revoke seats for their school
   */
  static async revokeTeacherSeat({ teacherUserId }: RevokeSeatParams): Promise<SeatRevokeResponse> {
    try {
      const { data, error } = await assertSupabase()
        .rpc('rpc_revoke_teacher_seat', { target_user_id: teacherUserId });

      if (error) {
        console.error('Error revoking staff seat:', error);
        
        // Map specific error messages to error codes
        if (error.message.includes('Only principals can revoke')) {
          throw SeatService.createError('PERMISSION_DENIED', 'Only principals can revoke teacher seats');
        }
        
        throw SeatService.createError('NETWORK_ERROR', 'Failed to revoke teacher seat', error.message);
      }

      return data as SeatRevokeResponse;
    } catch (error) {
      if (SeatService.isSeatManagementError(error)) {
        throw error; // Re-throw SeatManagementError
      }
      console.error('Unexpected error revoking staff seat:', error);
      throw SeatService.createError('UNKNOWN', 'Unexpected error revoking teacher seat', String(error));
    }
  }

  /**
   * List all staff seats for the caller's school (if principal) or own seats (if staff)
   */
  static async listTeacherSeats(): Promise<TeacherSeat[]> {
    try {
      const { data, error } = await assertSupabase()
        .rpc('rpc_list_teacher_seats');

      if (error) {
        console.error('Error listing staff seats:', error);
        throw SeatService.createError('NETWORK_ERROR', 'Failed to list staff seats', error.message);
      }

      return data as TeacherSeat[];
    } catch (error) {
      if (SeatService.isSeatManagementError(error)) {
        throw error; // Re-throw SeatManagementError
      }
      console.error('Unexpected error listing staff seats:', error);
      throw SeatService.createError('UNKNOWN', 'Unexpected error listing staff seats', String(error));
    }
  }

  /**
   * Generate UI-friendly display information for seat usage
   */
  static formatSeatUsage(limits: SeatLimits): SeatUsageDisplay {
    const { limit, used, available } = limits;
    
    // Check if over limit (legacy data scenario)
    const isOverLimit = limit !== null && used > limit;
    
    let displayText: string;
    
    if (limit === null) {
      // Unlimited plan
      displayText = `${used} seats used (Unlimited)`;
    } else {
      // Limited plan
      displayText = `${used}/${limit} seats used`;
      if (isOverLimit) {
        displayText += ' (Over limit)';
      }
    }

    return {
      used,
      total: limit,
      available,
      isOverLimit,
      displayText
    };
  }

  /**
   * Check if seat assignment should be disabled in UI
   */
  static shouldDisableAssignment(limits: SeatLimits): boolean {
    const { limit, available } = limits;
    
    // If unlimited plan, never disable
    if (limit === null) {
      return false;
    }
    
    // If no seats available, disable
    return available === null || available <= 0;
  }

  /**
   * Create a properly typed SeatManagementError
   */
  private static createError(
    code: SeatManagementError['code'], 
    message: string, 
    details?: string
  ): SeatManagementError {
    const error = new Error(message) as SeatManagementError;
    error.code = code;
    error.details = details;
    error.name = 'SeatManagementError';
    return error;
  }
}

export default SeatService;
