import { DescriptorHash, LocatorHash, MessageName, Package, Project, structUtils } from '@yarnpkg/core'

import { InstallOptions } from '@yarnpkg/core/lib/Project'
import { convertLocatorToDescriptor } from '@yarnpkg/core/lib/structUtils'
import { mutatePackage } from './mutation'

function isNodeGypBuildDependency(pkg: Package) {
  // We don't have an engines check yet, so do it manually here
  if (pkg.name === `fsevents` && process.platform !== `darwin`) {
    return false
  }

  // Only packages named exactly `node-gyp-build`, not `scoped@node-gyp-build` for example
  if (pkg.name === `node-gyp-build` && pkg.scope === null) {
    return true
  }

  return false
}

async function findNodeGypBuildEntries(project: Project, opts: InstallOptions) {
  const nodeGypBuildEntries: Map<DescriptorHash, Package> = new Map()

  // First find the node-gyp-build packages
  for (const pkg of project.storedPackages.values()) {
    if (isNodeGypBuildDependency(pkg)) {
      nodeGypBuildEntries.set(convertLocatorToDescriptor(pkg).descriptorHash, pkg)
    }
  }

  // Then find the packages that depend on them
  for (const pkg of project.storedPackages.values()) {
    for (const [identHash, dep] of pkg.dependencies) {
      // The nodeGypBuildPkgToReplace descriptorHash is the pkg locatorHash
      const nodeGypBuildPkgToReplace = nodeGypBuildEntries.get(dep.descriptorHash)
      if (nodeGypBuildPkgToReplace) {
        // this package is dependent on a node-gyp-build package, mutate the node-gyp-build package
        try {
          await mutatePackage(pkg, nodeGypBuildPkgToReplace, project, opts)
        } catch (e) {
          opts.report.reportInfo(
            MessageName.UNNAMED,
            `Couldn't mutate node-gyp-build for ${structUtils.stringifyLocator(pkg)}`,
          )

          console.error(e)
        }
        break
      }
    }
  }
}

export async function afterAllInstalled(project: Project, opts: InstallOptions) {
  await opts.report.startTimerPromise(`Native dependency resolution`, async () => {
    // In the config file all native modules must already be unplugged

    // Find all node-gyp-build dependencies
    await findNodeGypBuildEntries(project, opts)
  })
}
