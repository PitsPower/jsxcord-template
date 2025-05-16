import type { PropsWithChildren, ReactNode } from 'react'
import type { UseState } from './util.js'
import { Only, OnlyContainer } from '@repo/jsxcord'
import { createContext, useContext, useState } from 'react'

export const DepthContext = createContext<number>(0)
export const HistoryContext = createContext<UseState<number[]>>(null!)

export function Submenu({
  element,
  children,
}: PropsWithChildren<{ element: (onClick: () => void) => ReactNode }>) {
  const depth = useContext(DepthContext)
  const [history, setHistory] = useContext(HistoryContext)

  const [menuId] = useState(Math.random)

  return history[depth] === menuId
    ? (
        <DepthContext.Provider value={depth + 1}>
          <Only>
            {children}
          </Only>
        </DepthContext.Provider>
      )
    : element(() => setHistory(history => [...history, menuId]))
}

export function Menu({ children }: PropsWithChildren) {
  const [history, setHistory] = useState<number[]>([])

  return (
    <HistoryContext.Provider value={[history, setHistory]}>
      <OnlyContainer>
        {children}
      </OnlyContainer>
    </HistoryContext.Provider>
  )
}
