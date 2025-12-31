import { defineConfig } from 'tsdown';
import { baseConfig, getVersionDefine } from '../../tsdown.config.base';

export default defineConfig({
  ...baseConfig,
  define: getVersionDefine(),
});
