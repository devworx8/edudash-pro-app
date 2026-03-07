---
applyTo: "tests/**/*"
---

# Testing Instructions

## Test Organization
- Place unit tests in `tests/unit/`
- Place SQL-related tests in `tests/sql/`
- Use existing test helpers and patterns in `test-*.js` files

## Testing Standards
- Write tests for new functionality
- Maintain existing test coverage when modifying code
- Use descriptive test names that explain the expected behavior
- Follow Android-first testing approach

## RBAC Validation
- Run `npx tsx lib/rbac/validate.ts` to validate role/permission logic
- Expected output: `🎉 All validations passed! RBAC system is ready.`

## Test Data
- Use scripts in `scripts/` for test data setup
- Never use mock data in production environments
- Use seed scripts for development data
