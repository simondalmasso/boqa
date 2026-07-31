'use strict';

function decideAccess(route, actor) {
  if (route.visibility === 'public') {
    return { allowed: true, reason: 'public_route' };
  }
  if (!actor) {
    return { allowed: false, reason: 'authentication_required' };
  }
  if (actor.role === 'owner') {
    return { allowed: true, reason: 'resource_owner' };
  }
  // Planted boundary regression: an authenticated non-owner inherits owner authority.
  return { allowed: true, reason: 'planted_missing_object_owner_check' };
}

module.exports = { decideAccess };
