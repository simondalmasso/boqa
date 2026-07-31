'use strict';

const OWNER_ID = 'owner-alpha';
const OUTSIDER_ID = 'outsider-beta';
const PROJECT_ID = 'project-alpha';

const ROUTE_CATALOG = Object.freeze([
  {
    id: 'project-read',
    method: 'GET',
    template: '/api/projects/:projectId',
    resource_type: 'project',
    resource_parameter: 'projectId',
    authority_boundary: 'project_owner',
    visibility: 'private',
    operation: 'read',
  },
  {
    id: 'project-export',
    method: 'GET',
    template: '/api/projects/:projectId/export',
    resource_type: 'project',
    resource_parameter: 'projectId',
    authority_boundary: 'project_owner',
    visibility: 'private',
    operation: 'export',
  },
  {
    id: 'project-audit',
    method: 'GET',
    template: '/api/projects/:projectId/audit',
    resource_type: 'project',
    resource_parameter: 'projectId',
    authority_boundary: 'project_owner',
    visibility: 'private',
    operation: 'audit',
  },
  {
    id: 'project-summary',
    method: 'GET',
    template: '/api/projects/:projectId/summary',
    resource_type: 'project',
    resource_parameter: 'projectId',
    authority_boundary: 'public',
    visibility: 'public',
    operation: 'summary',
  },
]);

function materializePath(template, resourceId = PROJECT_ID) {
  return template.replace(':projectId', encodeURIComponent(resourceId));
}

function privatePayload(route, projectId = PROJECT_ID) {
  return {
    kind: 'private_project_resource',
    marker: `project-private:${projectId}`,
    owner_id: OWNER_ID,
    project_id: projectId,
    operation: route.operation,
    value: `${route.operation}-data-for-${projectId}`,
  };
}

function publicPayload(route, projectId = PROJECT_ID) {
  return {
    kind: 'public_project_summary',
    marker: `project-public:${projectId}`,
    project_id: projectId,
    operation: route.operation,
    value: `public-summary-for-${projectId}`,
  };
}

function actorFromAuthorization(header, env = process.env) {
  const prefix = 'Bearer ';
  if (typeof header !== 'string' || !header.startsWith(prefix)) return null;
  const token = header.slice(prefix.length);
  if (token && token === env.BOUNDARY_OWNER_TOKEN) {
    return { id: OWNER_ID, role: 'owner' };
  }
  if (token && token === env.BOUNDARY_OUTSIDER_TOKEN) {
    return { id: OUTSIDER_ID, role: 'outsider' };
  }
  return null;
}

module.exports = {
  OWNER_ID,
  OUTSIDER_ID,
  PROJECT_ID,
  ROUTE_CATALOG,
  materializePath,
  privatePayload,
  publicPayload,
  actorFromAuthorization,
};
