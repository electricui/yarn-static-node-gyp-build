import { Descriptor, Locator, MessageName, Project, ResolveOptions, structUtils, Resolver } from '@yarnpkg/core'


export const reduceDependency = async (
  dependency: Descriptor,
  project: Project,
  locator: Locator,
  initialDependency: Descriptor,
  extra: { resolver: Resolver; resolveOptions: ResolveOptions },
) => {
  if (dependency.name === `node-gyp-build` && dependency.scope === null) {
    const descriptor = structUtils.makeDescriptor(
      dependency,
      structUtils.makeRange({
        protocol: `static-prebuild:`,
        source: structUtils.stringifyDescriptor(dependency),
        selector: `node-gyp-build<${structUtils.stringifyLocator(locator)}>`,
        params: null,
      }),
    )

    extra.resolveOptions.report.reportInfo(
      MessageName.UNNAMED,
      `Found a node-gyp-build dependency in ${structUtils.stringifyLocator(
        locator,
      )}, re-routing to prebuild under name ${descriptor.name}`,
    )

    return descriptor
  }

  return dependency
}
