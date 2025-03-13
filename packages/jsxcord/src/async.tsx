import type { ReactNode } from 'react'
import { use } from './react.js'

const loaderResults: Record<string, Promise<unknown>> = {}

export function withLoader<LoaderProps extends object, Props extends object>(
  Component: React.FC<LoaderProps & Props>,
  loader: (props: LoaderProps) => Promise<Props>,
): React.FC<LoaderProps> {
  const cacheId = Math.random().toString()

  return (props) => {
    if (cacheId in loaderResults) {
      const newProps = use(loaderResults[cacheId]) as Props
      delete loaderResults[cacheId]
      return <Component {...props} {...newProps} />
    }

    const promise = loader(props)
    loaderResults[cacheId] = promise
    const newProps = use(promise)

    return <Component {...props} {...newProps} />
  }
}

export function asyncComponent<Props extends object>(
  func: (props: Props) => Promise<ReactNode>,
): React.FC<Props> {
  const Component = ({ component }: { component: ReactNode }) => component

  return withLoader(
    Component,
    async (props: Props) => ({
      component: await func(props),
    }),
  )
}
