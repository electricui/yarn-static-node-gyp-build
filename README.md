# `@yarnpkg/yarn-plugin-static-node-gyp-build`

For Yarn v2.

To install, import from the repository.

```
yarn plugin import https://raw.githubusercontent.com/electricui/yarn-static-node-gyp-build/master/bundles/%40yarnpkg/plugin-yarn-static-node-gyp-build.js
```

This package overwrites the `@serialport/bindings-cpp` load-bindings method to statically find the relevant .node file.
