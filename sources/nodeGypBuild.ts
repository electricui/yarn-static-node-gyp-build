import { CwdFS, Filename, PortablePath, ppath } from '@yarnpkg/fslib'

import * as os from 'os'
import * as fs from 'fs'

const vars: {
  [key: string]: string | number | boolean
} = (process.config && process.config.variables) || {}

const abi = process.versions.modules
const runtime = isElectron() ? 'electron' : 'node'

const arch = process.env.npm_config_arch || os.arch()
const platform = process.env.npm_config_platform || os.platform()
const libc = process.env.LIBC || (isAlpine(platform) ? 'musl' : 'glibc')
const armv = process.env.ARM_VERSION || (arch === 'arm64' ? '8' : vars.arm_version) || ''
const uv = (process.versions.uv || '').split('.')[0]

interface Candidate {
  specificity: number
  [key: string]: string | number | boolean
  file: PortablePath
}

function parseTags(file: PortablePath) {
  const arr = file.split('.')
  const extension = arr.pop()
  const tags: Candidate = { file: file, specificity: 0 }

  if (extension !== 'node') return

  for (let i = 0; i < arr.length; i++) {
    const tag = arr[i]

    if (tag === 'node' || tag === 'electron' || tag === 'node-webkit') {
      tags.runtime = tag
    } else if (tag === 'napi') {
      tags.napi = true
    } else if (tag.slice(0, 3) === 'abi') {
      tags.abi = tag.slice(3)
    } else if (tag.slice(0, 2) === 'uv') {
      tags.uv = tag.slice(2)
    } else if (tag.slice(0, 4) === 'armv') {
      tags.armv = tag.slice(4)
    } else if (tag === 'glibc' || tag === 'musl') {
      tags.libc = tag
    } else {
      continue
    }

    tags.specificity++
  }

  return tags
}

function matchTags(runtime: string, abi: string) {
  return function (tags: { specificity: number; [key: string]: string | number | boolean }) {
    if (tags == null) return false
    if (tags.runtime !== runtime && !runtimeAgnostic(tags)) return false
    if (tags.abi !== abi && !tags.napi) return false
    if (tags.uv && tags.uv !== uv) return false
    if (tags.armv && tags.armv !== armv) return false
    if (tags.libc && tags.libc !== libc) return false

    return true
  }
}

function runtimeAgnostic(tags) {
  return tags.runtime === 'node' && tags.napi
}

function compareTags(runtime) {
  // Precedence: non-agnostic runtime, abi over napi, then by specificity.
  return function (a, b) {
    if (a.runtime !== b.runtime) {
      return a.runtime === runtime ? -1 : 1
    } else if (a.abi !== b.abi) {
      return a.abi ? -1 : 1
    } else if (a.specificity !== b.specificity) {
      return a.specificity > b.specificity ? -1 : 1
    } else {
      return 0
    }
  }
}

function isElectron() {
  if (process.versions && process.versions.electron) return true
  if (process.env.ELECTRON_RUN_AS_NODE) return true
  // @ts-ignore
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer'
}

function isAlpine(platform) {
  return platform === 'linux' && fs.existsSync('/etc/alpine-release')
}

export async function gypFindBinding(packageLocation: PortablePath, packageFs: CwdFS): Promise<PortablePath | null> {
  // Look in the prebuilds folder
  const filenames = await packageFs.readdirPromise(ppath.join(packageLocation, `prebuilds` as Filename))

  // Collect the tuples, filter out the nulls
  let tuples = filenames.map(parseTuple).filter(tuple => tuple)

  const tuple = tuples.filter(matchTuple(platform, arch)).sort(compareTuples)[0]
  if (!tuple) return null

  // Find most specific flavor first
  const prebuilds = ppath.join(packageLocation, 'prebuilds' as PortablePath, tuple.name as Filename)
  const parsed = (await packageFs.readdirPromise(prebuilds)).map(parseTags)
  const candidates = parsed.filter(matchTags(runtime, abi))
  const winner = candidates.sort(compareTags(runtime))[0]
  if (winner) return ppath.join(prebuilds, winner.file)

  return null
}

interface Tuple {
  name: string
  platform: string
  architectures: string[]
}

function matchTuple(platform: string, arch: string) {
  return function (tuple: Tuple) {
    if (tuple == null) return false
    if (tuple.platform !== platform) return false

    return tuple.architectures.includes(arch)
  }
}

function parseTuple(name: string): Tuple {
  // Example: darwin-x64+arm64
  const arr = name.split('-')

  if (arr.length !== 2) return null

  const platform = arr[0]
  const architectures = arr[1].split('+')

  if (!platform) return null
  if (!architectures.length) return null
  if (!architectures.every(Boolean)) return null

  return { name, platform, architectures }
}

function compareTuples(a: Tuple, b: Tuple) {
  // Prefer single-arch prebuilds over multi-arch
  return a.architectures.length - b.architectures.length
}
