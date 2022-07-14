import { CwdFS, Filename, PortablePath, ZipOpenFS } from '@yarnpkg/fslib'
import {
  FetchResult,
  Locator,
  Manifest,
  MessageName,
  Package,
  Project,
  ReportError,
  StreamReport,
  miscUtils,
  structUtils,
} from '@yarnpkg/core'

import { InstallOptions } from '@yarnpkg/core/lib/Project'
import { PassThrough } from 'stream'
import { getLibzipPromise } from '@yarnpkg/libzip'
import { ppath } from '@yarnpkg/fslib'

import { path as gypFindBinding } from 'node-gyp-build'

export async function mutatePackage(pkg: Package, project: Project, opts: InstallOptions) {
  const { packageLocation, packageFs } = await initializePackageEnvironment(pkg, project)

  const bindingLocation = gypFindBinding(packageLocation) as string | undefined
  const relativeToPackage = ppath.relative(packageLocation, bindingLocation as PortablePath)
  const relativeToLoadBindingsFile = ppath.relative(
    ppath.join(packageLocation, `dist` as Filename),
    bindingLocation as PortablePath,
  )
  const loadBindingsFilePath = ppath.join(packageLocation, `dist` as PortablePath, `load-bindings.js` as Filename)

  if (bindingLocation) {
    opts.report.reportInfo(
      MessageName.UNNAMED,
      `Found prebuild for ${structUtils.stringifyLocator(pkg)}: ${relativeToPackage}`,
    )
  } else {
    opts.report.reportWarning(MessageName.UNNAMED, `Couldn't find prebuild for ${structUtils.stringifyLocator(pkg)}`)
    return
  }

  opts.report.reportInfo(MessageName.UNNAMED, `relativeLocation: ${relativeToLoadBindingsFile}`)
  opts.report.reportInfo(MessageName.UNNAMED, `loadBindingsFilePath: ${loadBindingsFilePath}`)

  const loadBindingsTemplate = `"use strict";
// Automatically generated bindings file for ${structUtils.stringifyIdent(pkg)}
// Package version: ${pkg.version}
// Bindings taken from: ${relativeToPackage}

const binding = require("${relativeToLoadBindingsFile}");

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncWrite = exports.asyncRead = exports.asyncUpdate = exports.asyncSet = exports.asyncOpen = exports.asyncList = exports.asyncGetBaudRate = exports.asyncGet = exports.asyncFlush = exports.asyncDrain = exports.asyncClose = void 0;
const util_1 = require("util");
const path_1 = require("path");
exports.asyncClose = binding.close ? (0, util_1.promisify)(binding.close) : async () => { throw new Error('"binding.close" Method not implemented'); };
exports.asyncDrain = binding.drain ? (0, util_1.promisify)(binding.drain) : async () => { throw new Error('"binding.drain" Method not implemented'); };
exports.asyncFlush = binding.flush ? (0, util_1.promisify)(binding.flush) : async () => { throw new Error('"binding.flush" Method not implemented'); };
exports.asyncGet = binding.get ? (0, util_1.promisify)(binding.get) : async () => { throw new Error('"binding.get" Method not implemented'); };
exports.asyncGetBaudRate = binding.getBaudRate ? (0, util_1.promisify)(binding.getBaudRate) : async () => { throw new Error('"binding.getBaudRate" Method not implemented'); };
exports.asyncList = binding.list ? (0, util_1.promisify)(binding.list) : async () => { throw new Error('"binding.list" Method not implemented'); };
exports.asyncOpen = binding.open ? (0, util_1.promisify)(binding.open) : async () => { throw new Error('"binding.open" Method not implemented'); };
exports.asyncSet = binding.set ? (0, util_1.promisify)(binding.set) : async () => { throw new Error('"binding.set" Method not implemented'); };
exports.asyncUpdate = binding.update ? (0, util_1.promisify)(binding.update) : async () => { throw new Error('"binding.update" Method not implemented'); };
exports.asyncRead = binding.read ? (0, util_1.promisify)(binding.read) : async () => { throw new Error('"binding.read" Method not implemented'); };
exports.asyncWrite = binding.read ? (0, util_1.promisify)(binding.write) : async () => { throw new Error('"binding.write" Method not implemented'); };`

  // Overwrite the file
  await packageFs.writeFilePromise(loadBindingsFilePath, loadBindingsTemplate)
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
