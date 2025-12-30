/**
 * Custom ESLint rules for the Spekra SDK
 */

import mirrorTestStructure from './mirror-test-structure';

const plugin = {
  meta: {
    name: 'spekra',
    version: '1.0.0',
  },
  rules: {
    'mirror-test-structure': mirrorTestStructure,
  },
};

export default plugin;

