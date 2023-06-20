import { CwdFS, Filename, PortablePath } from '@yarnpkg/fslib'
import { Locator, MessageName, Package, Project, ReportError, StreamReport, structUtils } from '@yarnpkg/core'

import { InstallOptions } from '@yarnpkg/core/lib/Project'
import { PassThrough } from 'stream'
import { getLibzipPromise } from '@yarnpkg/libzip'
import { ppath } from '@yarnpkg/fslib'
import { ZipOpenFS } from '@yarnpkg/libzip'

import { gypFindBinding } from './nodeGypBuild'

export async function mutatePackage(
  pkg: Package,
  nodeGypBuildPkgToReplace: Package,
  project: Project,
  opts: InstallOptions,
) {
  const { packageLocation: nativePackageLocation, packageFs: nativePackageFs } = await initializePackageEnvironment(
    nodeGypBuildPkgToReplace,
    project,
  )
  const { packageLocation, packageFs } = await initializePackageEnvironment(pkg, project)

  // const prebuildHashEntropy = `${structUtils.stringifyIdent(pkg)}-${pkg.version}-${
  //   process.platform
  // }-${normalisedArch()}-${prebuildOptions.runtime}-${prebuildOptions.abi}`.replace(/\//g, '-')

  // // Check if the cache key exists / matches
  // const cacheKeyLocation = ppath.join(nativePackageLocation, `.cache_key` as Filename)
  // if (await nativePackageFs.existsPromise(cacheKeyLocation)) {
  //   const cacheKey = (await nativePackageFs.readFilePromise(cacheKeyLocation)).toString()

  //   if (cacheKey === prebuildHashEntropy) {
  //     // We've already done this, we can skip it.
  //     opts.report.reportInfo(
  //       MessageName.UNNAMED,
  //       `${structUtils.stringifyLocator(pkg)} cache keys match, skipping installation`,
  //     )
  //     return
  //   }
  // }

  // Find the correct binding using node-gyp-build
  const bindingLocation = await gypFindBinding(packageLocation, packageFs)

  if (bindingLocation === null) {
    opts.report.reportError(MessageName.UNNAMED, `Unable to locate prebuild for ${structUtils.stringifyLocator(pkg)}`)
  }

  const bindingLocationRelative = ppath.relative(packageLocation, bindingLocation)
  const bindingFileName = ppath.basename(bindingLocationRelative)

  // Copy the binding file
  let nodeContents: Buffer = await packageFs.readFilePromise(bindingLocationRelative)

  if (nodeContents === null)
    throw new ReportError(
      MessageName.UNNAMED,
      `Was unable to find node file in prebuild package for "${structUtils.stringifyIdent(pkg)}"`,
    )

  // Write our package.json
  await nativePackageFs.writeJsonPromise(ppath.join(nativePackageLocation, `package.json` as Filename), {
    name: structUtils.slugifyLocator(nodeGypBuildPkgToReplace),
    main: `./index.js`,
    preferUnplugged: true, // Tell yarn to unplug the node-gyp-build replacement package
  })

  // write our index.js
  const templateIndex = `// Automatically generated bindings file for ${structUtils.stringifyIdent(pkg)}
// Package version: ${pkg.version}
// Bindings taken from: ${bindingLocationRelative}

const staticRequire = require("./${bindingFileName}");
module.exports = (fileLookingFor) => {
  return staticRequire;
};
`
  await nativePackageFs.writeFilePromise(ppath.join(nativePackageLocation, `index.js` as Filename), templateIndex)

  // Write the file into the generated package
  await nativePackageFs.writeFilePromise(ppath.join(nativePackageLocation, bindingFileName), nodeContents)

  // // Write the cache key
  // await nativePackageFs.writeFilePromise(cacheKeyLocation, prebuildHashEntropy)

  opts.report.reportInfo(MessageName.UNNAMED, `Installed prebuild for ${structUtils.stringifyLocator(pkg)} from ${bindingLocationRelative}`)
}

async function initializePackageEnvironment(locator: Locator, project: Project) {
  const pkg = project.storedPackages.get(locator.locatorHash)
  if (!pkg)
    throw new Error(`Package for ${structUtils.prettyLocator(project.configuration, locator)} not found in the project`)

  return await ZipOpenFS.openPromise(
    async (zipOpenFs: ZipOpenFS) => {
      const configuration = project.configuration

      const linkers = project.configuration.getLinkers()
      const linkerOptions = { project, report: new StreamReport({ stdout: new PassThrough(), configuration }) }

      const linker = linkers.find(linker => linker.supportsPackage(pkg, linkerOptions))
      if (!linker)
        throw new Error(
          `The package ${structUtils.prettyLocator(
            project.configuration,
            pkg,
          )} isn't supported by any of the available linkers`,
        )

      const packageLocation = await linker.findPackageLocation(pkg, linkerOptions)
      const packageFs = new CwdFS(packageLocation, { baseFs: zipOpenFs })

      return { packageLocation, packageFs }
    },
    {
      libzip: await getLibzipPromise(),
    },
  )
}
