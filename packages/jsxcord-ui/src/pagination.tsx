import type { PropsWithChildren } from 'react'
import type { UseState } from './util.js'
import { Children, createContext, useContext, useState } from 'react'

export const PageContext = createContext<UseState<number>>(null!)

export function Pages({ children }: PropsWithChildren) {
  const [page] = useContext(PageContext)
  return Children.toArray(children)[page]
}

export function Paginate({ children }: PropsWithChildren) {
  const [page, setPage] = useState(0)
  return (
    <PageContext.Provider value={[page, setPage]}>
      {children}
    </PageContext.Provider>
  )
}
