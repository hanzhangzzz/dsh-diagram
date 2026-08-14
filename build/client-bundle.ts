import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { transform } from 'lightningcss'
import { Rolldown, type UserConfig } from 'tsdown'

const CSS_VIRTUAL_PREFIX = '\0dsh-diagram-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-web-react',
] as const

/** Compile a CSS Module into a class map and defer style injection to factory materialization. */
function moduleCssPlugin(pluginId: string): Rolldown.Plugin {
  return {
    name: 'dsh-diagram-css-modules-inline',
    async resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (resolved === null) return null
      return CSS_VIRTUAL_PREFIX + resolved.id + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, value] of Object.entries(cssExports ?? {})) classMap[local] = value.name
      const styleId = `${pluginId}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const styleId = ${JSON.stringify(styleId)};`,
        'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(styleId) + "]") === null) {',
        '  const tag = document.createElement("style");',
        `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
        '  tag.dataset.pluginCss = styleId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

/** Build the DSH browser half as one lazy-CJS factory artifact. */
export function createClientBundle(pluginId: string, entry: string): UserConfig {
  return {
    name: `${pluginId}/client`,
    entry: { client: entry },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: false,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => CLIENT_EXTERNALS.includes(id as typeof CLIENT_EXTERNALS[number])
      ? undefined
      : true,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      name: 'dsh-diagram-client-bundle-purity',
      resolveId(source) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source as typeof CLIENT_EXTERNALS[number])) return null
        throw new Error(
          `client bundle purity: ${JSON.stringify(source)} is not a DSH platform module; `
          + 'use a type-only import or a Cordis service instead',
        )
      },
    }, moduleCssPlugin(pluginId)],
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}
