import type { webpack } from '@remotion/bundler'
import type { FormatOptions, RegisteredRootBuilder } from './root.js'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { asyncComponent, File, Img } from '@repo/jsxcord'
import { logger } from '@repo/logger'

interface CreateComponentsOptions<Components extends Record<string, React.FC<any>>> {
  rootBuilder: RegisteredRootBuilder<Components>
  rootPath: string
  webpackOverride?: (config: webpack.Configuration) => webpack.Configuration
}

export function createComponents<Components extends Record<string, React.FC<any>>>(
  { rootBuilder, rootPath, webpackOverride }: CreateComponentsOptions<Components>,
): Components {
  let bundleLocation: string | null = null

  const result: Record<string, React.FC<any>> = {}

  for (const id of rootBuilder._componentIds) {
    result[id] = asyncComponent(async (props: Record<string, unknown> & FormatOptions) => {
      if (bundleLocation === null) {
        bundleLocation = await bundle({
          entryPoint: rootPath,
          ignoreRegisterRootWarning: true,
          webpackOverride,
        })
      }

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id,
        inputProps: props,
      })

      logger.info(`Rendering \`${id}\`...`)

      const output
        = props.still
          ? await renderStill({
            composition,
            serveUrl: bundleLocation,
            inputProps: props,
            chromiumOptions: {
              gl: 'angle-egl',
            },
          })
          : await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: props.gif ? 'gif' : 'h264',
            inputProps: props,
            chromiumOptions: {
              gl: 'angle-egl',
            },
          })

      if (output.buffer === null) {
        throw new Error('No output buffer!')
      }

      logger.info(`Done rendering \`${id}\`!`)

      return props.gif || props.still
        ? <Img name={props.gif ? 'video.gif' : undefined} src={output.buffer.buffer as ArrayBuffer} />
        : <File name="video.mp4" content={output.buffer.buffer as ArrayBuffer} />
    })
  }

  return result as Components
}
