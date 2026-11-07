const fields = {
  groups: ['name', 'peers', 'resources'],
  policies: ['name', 'description', 'enabled', 'rules', 'source_posture_checks'],
};
const ruleFields = ['id', 'name', 'description', 'enabled', 'action', 'bidirectional', 'protocol', 'ports',
  'port_ranges', 'sources', 'destinations', 'sourceResource', 'destinationResource', 'authorized_groups'];
const select = (source, keys) => Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
const ids = (entries) => (entries ?? []).map(entry => typeof entry === 'string' ? entry : entry.id);
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);

function policyBody(existing) {
  const body = select(existing, fields.policies);
  body.rules = (body.rules ?? []).map(rule => ({
    ...select(rule, ruleFields),
    sources: ids(rule.sources),
    destinations: ids(rule.destinations),
  }));
  return body;
}

export async function planChange(api, resource, { id, changes }) {
  if (id !== undefined && !validId(id)) throw new Error('Invalid NetBird resource ID.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
      !Object.keys(changes).length || Object.keys(changes).some(key => !fields[resource].includes(key))) {
    throw new Error('Provide changes using these fields: ' + fields[resource].join(', '));
  }
  const path = id ? resource + '/' + id : resource;
  const snapshot = await api(path);
  if (id && resource === 'groups' && snapshot.name === 'All') throw new Error('The built-in All group is managed by NetBird.');
  const before = id ? (resource === 'policies' ? policyBody(snapshot) : select(snapshot, fields.groups)) : null;
  if (before && resource === 'groups') before.peers = ids(before.peers);
  const after = { ...before, ...changes };
  if (typeof after.name !== 'string' || !after.name.trim()) throw new Error('A name is required.');
  if (!id && Array.isArray(snapshot) && snapshot.some(item => item.name === after.name)) {
    throw new Error('This name already exists. Select its ID to update it.');
  }
  const warnings = [];
  if (resource === 'groups') {
    after.peers ??= [];
    if (!Array.isArray(after.peers) || !after.peers.every(validId)) throw new Error('Peers must be an array of peer IDs.');
    if (after.resources !== undefined && (!Array.isArray(after.resources) ||
        !after.resources.every(item => item && validId(item.id) && typeof item.type === 'string'))) {
      throw new Error('Resources must contain resource IDs and types.');
    }
    if (id && Object.hasOwn(changes, 'peers')) warnings.push('The peer list replaces current membership. Group membership can change access.');
  } else {
    after.enabled ??= false;
    if (typeof after.enabled !== 'boolean' || !Array.isArray(after.rules) || !after.rules.length) {
      throw new Error('Provide an enabled boolean and at least one rule.');
    }
    after.rules = after.rules.map(rule => {
      if (!rule || typeof rule !== 'object' || Object.keys(rule).some(key => !ruleFields.includes(key)) ||
          typeof rule.name !== 'string' || !rule.name.trim() || rule.action !== 'accept' ||
          typeof rule.enabled !== 'boolean' || typeof rule.bidirectional !== 'boolean' ||
          !['all', 'tcp', 'udp', 'icmp', 'netbird-ssh'].includes(rule.protocol) ||
          ![rule.sources ?? [], rule.destinations ?? []].every(list => Array.isArray(list) && list.every(validId)) ||
          (!(rule.sources?.length) && !rule.sourceResource?.id) ||
          (!(rule.destinations?.length) && !rule.destinationResource?.id)) {
        throw new Error('Each rule needs a name, accept action, protocol, direction, enabled state, source and destination.');
      }
      return select(rule, ruleFields);
    });
    if (Object.hasOwn(changes, 'rules') && id) warnings.push('The supplied rules replace the entire current rule list.');
    if (!id && changes.enabled === undefined) warnings.push('The new policy starts disabled unless enabled is explicitly set.');
    warnings.push('NetBird allow policies are additive. An enabled Default policy can still allow broader access.');
  }
  return { before, after, warnings, path, guardPath: path, snapshot: JSON.stringify(snapshot), method: id ? 'PUT' : 'POST' };
}
