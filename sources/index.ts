import { Plugin } from '@yarnpkg/core'

import { StaticPrebuildFetcher } from './fetcher'
import { StaticPrebuildResolver } from './resolver'
import { afterAllInstalled } from './afterAllInstalled'
import { reduceDependency } from './reduceDependency'

const plugin: Plugin = {
  hooks: {
    reduceDependency,
    afterAllInstalled,
  },
  fetchers: [StaticPrebuildFetcher],
  resolvers: [StaticPrebuildResolver],
}

export default plugin
