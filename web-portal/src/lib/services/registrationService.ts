import { createClient } from "@/lib/supabase/client";

export interface RegistrationParams {
  role: "parent" | "teacher" | "principal";
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  invitationToken?: string;
  preschoolId?: string;
  organizationData?: {
    name: string;
    type: string;
    address?: string;
    phone?: string;
  };
}

export interface RegistrationResult {
  success: boolean;
  user?: any;
  error?: string;
  requiresVerification?: boolean;
  nextStep?: "email_verification" | "profile_completion" | "dashboard";
}

class RegistrationService {
  private supabase = createClient();

  /**
   * Universal registration handler
   * Supports: parent, teacher, principal roles
   * Handles: invitation tokens, preschool selection, profile creation
   */
  async registerUser(params: RegistrationParams): Promise<RegistrationResult> {
    try {
      // 1. Validate inputs
      this.validateParams(params);

      // 2. Check for invitation token if provided
      if (params.invitationToken) {
        const isValid = await this.validateInvitation(
          params.invitationToken,
          params.role
        );
        if (!isValid) {
          return {
            success: false,
            error: "Invalid or expired invitation token",
          };
        }
      }

      // 3. Create auth user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: params.email.toLowerCase(),
        password: params.password,
        options: {
          data: {
            first_name: params.firstName,
            last_name: params.lastName,
            role: params.role,
            phone: params.phone,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        return {
          success: false,
          error: authError.message,
        };
      }

      if (!authData.user) {
        return {
          success: false,
          error: "User creation failed",
        };
      }

      // 4. Profile is auto-created by database trigger
      // 5. Role-specific setup
      if (params.role === "parent") {
        await this.handleParentSetup(authData.user.id, params);
      } else if (params.role === "teacher") {
        await this.handleTeacherSetup(authData.user.id, params);
      } else if (params.role === "principal") {
        await this.handlePrincipalSetup(authData.user.id, params);
      }

      return {
        success: true,
        user: authData.user,
        requiresVerification: !authData.session,
        nextStep: !authData.session ? "email_verification" : "dashboard",
      };
    } catch (error: any) {
      console.error("Registration error:", error);
      return {
        success: false,
        error: error.message || "Registration failed",
      };
    }
  }

  /**
   * Validate registration parameters
   */
  private validateParams(params: RegistrationParams): void {
    if (!params.email || !params.password) {
      throw new Error("Email and password are required");
    }

    if (params.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    if (!params.firstName || !params.lastName) {
      throw new Error("First name and last name are required");
    }

    // Role-specific validation
    if (params.role === "parent" && !params.preschoolId && !params.invitationToken) {
      throw new Error("Parents must select a preschool or have an invitation");
    }

    if (params.role === "principal" && !params.organizationData) {
      throw new Error("Principals must provide organization data");
    }
  }

  /**
   * Validate invitation token
   */
  private async validateInvitation(
    token: string,
    role: string
  ): Promise<boolean> {
    try {
      // Query invitations table (assuming it exists)
      const { data, error } = await this.supabase
        .from("invitations")
        .select("*")
        .eq("token", token)
        .eq("role", role)
        .eq("status", "pending")
        .single();

      if (error || !data) return false;

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Invitation validation error:", error);
      return false;
    }
  }

  /**
   * Handle parent-specific setup
   */
  private async handleParentSetup(
    userId: string,
    params: RegistrationParams
  ): Promise<void> {
    if (params.invitationToken) {
      // Auto-link via invitation
      await this.linkParentViaInvitation(userId, params.invitationToken);
    } else if (params.preschoolId) {
      // Create join request
      const { error } = await this.supabase
        .from("parent_join_requests")
        .insert({
          parent_id: userId,
          preschool_id: params.preschoolId,
          organization_id: params.preschoolId, // Use preschool_id as organization_id for now
          status: "pending",
          message: `Parent signup request from ${params.firstName} ${params.lastName}`,
        });

      if (error) {
        // Handle duplicate request gracefully (409 conflict / unique constraint violation)
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          console.log('Join request already exists - this is fine');
        } else {
          console.error("Failed to create join request:", error);
        }
        // Don't throw - parent account is still created successfully
      }
    }
  }

  /**
   * Link parent to preschool via invitation
   */
  private async linkParentViaInvitation(
    userId: string,
    token: string
  ): Promise<void> {
    try {
      // Get invitation details
      const { data: invitation, error: inviteError } = await this.supabase
        .from("invitations")
        .select("preschool_id, organization_id")
        .eq("token", token)
        .single();

      if (inviteError || !invitation) {
        throw new Error("Invitation not found");
      }

      // Update profile with preschool/organization
      const { error: updateError } = await this.supabase
        .from("profiles")
        .update({
          preschool_id: invitation.preschool_id,
          organization_id: invitation.organization_id,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to link parent to preschool:", updateError);
      }

      // Mark invitation as accepted
      await this.supabase
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("token", token);
    } catch (error) {
      console.error("Parent invitation linking error:", error);
      // Don't throw - just log
    }
  }

  /**
   * Handle teacher-specific setup
   */
  private async handleTeacherSetup(
    userId: string,
    params: RegistrationParams
  ): Promise<void> {
    if (params.invitationToken) {
      // Link via invitation (similar to parent)
      await this.linkParentViaInvitation(userId, params.invitationToken);
    }
  }

  /**
   * Handle principal-specific setup
   */
  private async handlePrincipalSetup(
    userId: string,
    params: RegistrationParams
  ): Promise<void> {
    if (!params.organizationData) {
      throw new Error("Organization data required for principal registration");
    }

    try {
      // Create organization
      const { data: org, error: orgError } = await this.supabase
        .from("organizations")
        .insert({
          name: params.organizationData.name,
          type: params.organizationData.type,
          address: params.organizationData.address,
          phone: params.organizationData.phone,
          created_by: userId,
          status: "active",
        })
        .select()
        .single();

      if (orgError) {
        console.error("Organization creation failed:", orgError);
        throw new Error("Failed to create organization");
      }

      // Update profile with organization_id
      const { error: profileError } = await this.supabase
        .from("profiles")
        .update({
          organization_id: org.id,
          preschool_id: org.id,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("Failed to link principal to organization:", profileError);
      }
    } catch (error) {
      console.error("Principal setup error:", error);
      throw error;
    }
  }

  /**
   * Get public preschools for parent signup
   */
  async getPublicPreschools(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from("preschools")
        .select("id, name, description, address, logo_url, website_url, phone, email")
        .eq("is_public", true)
        .eq("accepting_registrations", true)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching public preschools:", error);
      return [];
    }
  }
}

// Export singleton instance
export const registrationService = new RegistrationService();
