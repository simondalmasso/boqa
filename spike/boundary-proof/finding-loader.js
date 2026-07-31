'use strict';

const { PROJECT_ID, OWNER_ID, materializePath } = require('./lab/fixtures');

function loadKnownFinding() {
  return Object.freeze({
    schema: 'boqa.boundary.finding.v1',
    id: 'finding-project-object-owner-bypass',
    category: 'object_level_authorization',
    method: 'GET',
    route_template: '/api/projects/:projectId',
    concrete_path: materializePath('/api/projects/:projectId', PROJECT_ID),
    authority_boundary: 'project_owner',
    resource_type: 'project',
    resource_parameter: 'projectId',
    resource_id: PROJECT_ID,
    expected_owner_id: OWNER_ID,
    expected_private_kind: 'private_project_resource',
    expected_private_marker: `project-private:${PROJECT_ID}`,
  });
}

function validateFinding(finding) {
  const required = [
    'id', 'category', 'method', 'route_template', 'concrete_path',
    'authority_boundary', 'resource_type', 'resource_parameter', 'resource_id',
    'expected_owner_id', 'expected_private_kind', 'expected_private_marker',
  ];
  for (const key of required) {
    if (typeof finding[key] !== 'string' || finding[key].length === 0) {
      throw new Error(`Invalid finding field: ${key}`);
    }
  }
  if (!finding.route_template.includes(`:${finding.resource_parameter}`)) {
    throw new Error('Finding route template does not contain its resource parameter');
  }
  return finding;
}

module.exports = { loadKnownFinding, validateFinding };
