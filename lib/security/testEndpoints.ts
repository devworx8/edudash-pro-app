/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Test API Endpoints for Security Middleware Demo
 * 
 * These endpoints demonstrate the full security middleware system including:
 * - CORS and security headers
 * - Request validation with Zod schemas
 * - Rate limiting
 * - Authentication verification
 * - RBAC authorization 
 * - i18n error messages
 */

import { RouteGuards, createRouteGuard, UserRole, Permission } from './routeGuards';
import { ValidationSchemas } from './validation';
import { z } from 'zod';

/**
 * 1. Public endpoint - No authentication required
 */
export const publicEndpoint = RouteGuards.public()(
  async (request, { data }) => {
    return new Response(JSON.stringify({
      success: true,
      message: 'This is a public endpoint',
      timestamp: new Date().toISOString(),
      rateLimit: 'Applied basic rate limiting',
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
);

/**
 * 2. Authentication required endpoint
 */
export const authenticatedEndpoint = RouteGuards.authenticated()(
  async (request, { data, user, profile }) => {
    return new Response(JSON.stringify({
      success: true,
      message: 'Authenticated user access',
      user: {
        id: user?.id,
        email: user?.email,
        role: profile?.role,
      },
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
);

/**
 * 3. Admin-only endpoint
 */
export const adminOnlyEndpoint = RouteGuards.adminOnly()(
  async (request, { data, user, profile }) => {
    return new Response(JSON.stringify({
      success: true,
      message: 'Admin access granted',
      user: {
        id: user?.id,
        role: profile?.role,
        permissions: profile?.capabilities || [],
      },
      systemInfo: {
        endpoint: 'admin-only',
        accessLevel: 'administrator',
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
);

/**
 * 4. Instructor or admin endpoint
 */
export const instructorEndpoint = RouteGuards.instructorOnly()(
  async (request, { data, user, profile }) => {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instructor/Admin access granted',
        user: {
          id: user?.id,
          role: profile?.role,
        },
        teachingCapabilities: {
          canCreateCourses: true,
          canManageAssignments: true,
          canGradeSubmissions: true,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 5. Course management with request validation
 */
export const courseManagementEndpoint = RouteGuards.courseManagement({
  validation: {
    body: ValidationSchemas.courseCreate,
  },
})(
  async (request, { data, user, profile }) => {
    const courseData = data.body;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Course created successfully',
        course: {
          ...courseData,
          id: `course-${Date.now()}`,
          instructorId: user?.id,
          createdAt: new Date().toISOString(),
        },
        instructor: {
          id: user?.id,
          role: profile?.role,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 6. AI features endpoint with specific rate limiting
 */
export const aiEndpoint = RouteGuards.aiFeatures()(
  async (request, { data, user, profile }) => {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'AI features access granted',
        user: {
          id: user?.id,
          tier: (profile as any)?.aiTier || 'free',
        },
        aiCapabilities: {
          maxRequestsPerMinute: 20,
          availableModels: ['gpt-4o-mini', 'claude-haiku-4-5-20251001'],
          remainingQuota: (profile as any)?.aiQuota || 100,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 7. File upload endpoint with size validation
 */
export const fileUploadEndpoint = RouteGuards.fileUpload()(
  async (request, { data, user, profile }) => {
    // In a real implementation, you'd process the uploaded file
    return new Response(
      JSON.stringify({
        success: true,
        message: 'File upload successful',
        upload: {
          maxSize: '10MB',
          allowedTypes: ['image/*', 'application/pdf', 'text/*'],
          uploadedBy: user?.id,
        },
        rateLimits: {
          uploadsPerHour: 10,
          totalSizePerDay: '100MB',
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 8. Registration endpoint with validation
 */
export const registerEndpoint = RouteGuards.auth({
  validation: {
    body: ValidationSchemas.register,
  },
})(
  async (request, { data }) => {
    const registrationData = data.body;

    // In a real implementation, you'd create the user
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Registration successful',
        user: {
          email: registrationData.email,
          firstName: registrationData.firstName,
          lastName: registrationData.lastName,
          role: 'student',
          requiresEmailVerification: true,
        },
        security: {
          rateLimited: true,
          passwordStrength: 'strong',
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 9. Login endpoint with brute force protection
 */
export const loginEndpoint = RouteGuards.auth({
  validation: {
    body: ValidationSchemas.login,
  },
})(
  async (request, { data }) => {
    const credentials = data.body;

    // In a real implementation, you'd verify credentials
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Login successful',
        session: {
          token: 'mock-jwt-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          user: {
            email: credentials.email,
            role: 'student',
          },
        },
        security: {
          bruteForceProtection: true,
          rateLimited: true,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
);

/**
 * 10. Custom endpoint with complex requirements
 */
const complexEndpointSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  resourceId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const complexEndpoint = createRouteGuard()
  .authentication(true)
  .requireRoles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  .requirePermissions([Permission.MANAGE_COURSES, Permission.MANAGE_ASSIGNMENTS], false) // Any of these
  .validation({ body: complexEndpointSchema })
  .rateLimit('api')
  .maxRequestSize(512 * 1024) // 512KB
  .build()(
    async (request, { data, user, profile }) => {
      const requestData = data.body;

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Complex endpoint access granted',
          request: requestData,
          user: {
            id: user?.id,
            role: profile?.role,
            permissions: (profile as any)?.capabilities || [],
          },
          security: {
            authRequired: true,
            rolesAllowed: ['instructor', 'admin'],
            permissionsRequired: ['manage_courses', 'manage_assignments'],
            requestValidated: true,
            rateLimited: true,
            maxRequestSize: '512KB',
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  );

/**
 * Export all test endpoints
 */
export const testEndpoints = {
  public: publicEndpoint,
  authenticated: authenticatedEndpoint,
  adminOnly: adminOnlyEndpoint,
  instructorOnly: instructorEndpoint,
  courseManagement: courseManagementEndpoint,
  aiFeatures: aiEndpoint,
  fileUpload: fileUploadEndpoint,
  register: registerEndpoint,
  login: loginEndpoint,
  complex: complexEndpoint,
};

/**
 * Demo function to test all endpoints
 */
export async function demoSecurityMiddleware() {
  console.log('🛡️ Security Middleware Demo');
  console.log('============================');

  // Test data
  const mockRequest = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify({
      title: 'Test Course',
      description: 'This is a test course for demo',
      subject: 'Computer Science',
      grade_level: '10',
    }),
  });

  try {
    // Test public endpoint
    console.log('\n1. Testing public endpoint...');
    const publicResponse = await testEndpoints.public(mockRequest);
    console.log('Status:', publicResponse.status);
    console.log('Response:', await publicResponse.json());

    // Test authenticated endpoint (should fail without auth)
    console.log('\n2. Testing authenticated endpoint (should fail)...');
    const authResponse = await testEndpoints.authenticated(mockRequest);
    console.log('Status:', authResponse.status);
    console.log('Response:', await authResponse.json());

    console.log('\n✅ Demo completed! Check the responses above.');
    console.log('📝 Note: Some endpoints may fail due to missing authentication.');
  } catch (error) {
    console.error('Demo error:', error);
  }
}

/**
 * Usage examples in comments for reference:
 *
 * // In a Next.js API route:
 * export { publicEndpoint as GET };
 *
 * // In an Express.js route:
 * app.get('/api/public', publicEndpoint);
 *
 * // In a Cloudflare Worker:
 * addEventListener('fetch', event => {
 *   if (event.request.url.endsWith('/admin')) {
 *     event.respondWith(adminOnlyEndpoint(event.request));
 *   }
 * });
 */
