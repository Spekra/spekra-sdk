import { createBaseConfig } from '../../eslint.config.base';

export default createBaseConfig(
  import.meta.dirname,
  ['./tsconfig.json', './tsconfig.test.json']
);
