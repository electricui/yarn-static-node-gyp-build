import { MessageName, Project, structUtils } from '@yarnpkg/core'

import { InstallOptions } from '@yarnpkg/core/lib/Project'
import { mutatePackage } from './mutation'

async function findBindingsDependencies(project: Project, opts: InstallOptions) {
  // Then find the packages that depend on them
  for (const pkg of project.storedPackages.values()) {
    if (pkg.name === `bindings-cpp` && pkg.scope === `serialport`) {
      // Found it, mutate the package

      try {
        await opts.report.startTimerPromise(`Static native dependency resolution`, async () => {
          await mutatePackage(pkg, project, opts)
        })
      } catch (e) {
        opts.report.reportInfo(MessageName.UNNAMED, `Couldn't mutate bindings for ${structUtils.stringifyLocator(pkg)}`)

        console.error(e)
      }
    }
  }
}

export async function afterAllInstalled(project: Project, opts: InstallOptions) {
  // Find all bindings dependencies
  await findBindingsDependencies(project, opts)
}
