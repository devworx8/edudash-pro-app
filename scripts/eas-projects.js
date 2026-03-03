// Centralized EAS project map shared by app.config.js and CLI helpers.
// Keep this in sync with Expo accounts/projects.

const KING_PROD_PROJECT_ID =
  process.env.EAS_PROJECT_ID_KING_PROD ||
  process.env.EAS_PROJECT_ID_KINGPROD ||
  process.env.KING_PROD_EAS_PROJECT_ID ||
  '';

const EAS_PROJECTS = {
  // Default project - EduPro-Final (edudashproplay-store org) - CURRENT ACTIVE for Play Store
  // Mark_2 1.0.22(27) is published from this project
  default: { id: 'accd5738-9ee6-434c-a3be-668d9674f541', owner: 'edudashproplay-store', slug: 'edupro-final' },
  // k1ng-devops project (legacy)
  k1ng: { id: '81051af4-2468-4efa-a1f1-03d00f5c5688', owner: 'k1ng-devops', slug: 'edudashpro' },
  'k1ng-devops': { id: '81051af4-2468-4efa-a1f1-03d00f5c5688', owner: 'k1ng-devops', slug: 'edudashpro' },
  // dash-t account (legacy)
  'dash-t': { id: 'd3bb7cfc-56c8-4266-be3a-9892dab09c0c', owner: 'dash-t', slug: 'edudashpro' },
  // dash-ts-organization (main Play Store)
  main: { id: 'ae5db83e-e6fb-4a32-9973-e3ed5f8047ce', owner: 'dash-ts-organization', slug: 'comedudashproapp' },
  // dash-pro legacy project
  legacy: { id: 'ab7c9230-2f47-4bfa-b4f4-4ae516a334bc', owner: 'dash-pro', slug: 'edudashpro' },
  // mark-1 project (edudashpro account)
  mark1: { id: '253b1057-8489-44cf-b0e3-c3c10319a298', owner: 'edudashpro', slug: 'edudashpro' },
  // edudashproplay-store org - EduPro-Final project (has build quota)
  playstore: { id: 'accd5738-9ee6-434c-a3be-668d9674f541', owner: 'edudashproplay-store', slug: 'edupro-final' },
  'edupro-final': { id: 'accd5738-9ee6-434c-a3be-668d9674f541', owner: 'edudashproplay-store', slug: 'edupro-final' },
  // dash-v project (edudash-v account) - NEW
  'dash-v': { id: '4b4481c9-152c-4cb1-920a-feec24c063ad', owner: 'edudash-v', slug: 'dash-v' },
  'edudash-v': { id: '4b4481c9-152c-4cb1-920a-feec24c063ad', owner: 'edudash-v', slug: 'dash-v' },
  // king-prod project (dynamic via env var)
  'king-prod': {
    id: KING_PROD_PROJECT_ID || '__MISSING_KING_PROD_PROJECT_ID__',
    owner: 'king-prod',
    slug: 'dash',
  },
  'king-prod-dash': {
    id: KING_PROD_PROJECT_ID || '__MISSING_KING_PROD_PROJECT_ID__',
    owner: 'king-prod',
    slug: 'dash',
  },
};

function resolveEasProjectConfig(envProjectId) {
  if (envProjectId) {
    if (EAS_PROJECTS[envProjectId]) {
      const resolved = { ...EAS_PROJECTS[envProjectId], alias: envProjectId };
      if (!resolved.id || resolved.id.startsWith('__MISSING_')) {
        throw new Error(
          `EAS project alias '${envProjectId}' requires EAS_PROJECT_ID_KING_PROD (or EAS_PROJECT_ID_KINGPROD) to be set.`
        );
      }
      return resolved;
    }
    return {
      id: envProjectId,
      owner: process.env.EAS_PROJECT_OWNER || 'dash-t',
      slug: process.env.EAS_PROJECT_SLUG || 'edudashpro',
    };
  }
  return { ...EAS_PROJECTS.default, alias: 'default' };
}

module.exports = {
  EAS_PROJECTS,
  resolveEasProjectConfig,
};
