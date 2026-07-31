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
  return { allowed: false, reason: 'object_owner_required' };
}

module.exports = { decideAccess };
