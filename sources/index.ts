import { Plugin } from '@yarnpkg/core'

import { afterAllInstalled } from './afterAllInstalled'

const plugin: Plugin = {
  hooks: {
    afterAllInstalled,
  },
}

export default plugin
