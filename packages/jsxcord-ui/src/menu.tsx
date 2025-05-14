import type { PropsWithChildren, ReactNode } from 'react'
import type { UseState } from './util.js'
import { ActionRow, Button, Container, Heading, Only, OnlyContainer } from '@repo/jsxcord'
import { createContext, useContext, useState } from 'react'

const DepthContext = createContext<number>(0)
const HistoryContext = createContext<UseState<number[]>>(null!)

function Submenu({
  button,
  children,
}: PropsWithChildren<{ button: (onClick: () => void) => ReactNode }>) {
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
    : button(() => setHistory(history => [...history, menuId]))
}

function Menu({ children }: PropsWithChildren) {
  const [history, setHistory] = useState<number[]>([])

  return (
    <HistoryContext.Provider value={[history, setHistory]}>
      <OnlyContainer>
        {children}
      </OnlyContainer>
    </HistoryContext.Provider>
  )
}

function BackButton() {
  const [history, setHistory] = useContext(HistoryContext)
  return (
    <Button style="danger" onClick={() => setHistory(history.slice(0, -1))}>Back</Button>
  )
}

function HomeButton() {
  const [_, setHistory] = useContext(HistoryContext)
  return (
    <Button onClick={() => setHistory([])}>Custom Home Button</Button>
  )
}

function MySubmenu({ name, children }: PropsWithChildren<{ name: string }>) {
  return (
    <Submenu
      button={onClick => <Button style="primary" onClick={onClick}>{name}</Button>}
    >
      {children}
      <BackButton />
    </Submenu>
  )
}

function LeftOrRight() {
  return (
    <>
      Left or right...

      <ActionRow>
        <MySubmenu name="Left">
          WRONG!
        </MySubmenu>
        <MySubmenu name="Right">
          ALSO WRONG!
        </MySubmenu>
        <BackButton />
        <HomeButton />
      </ActionRow>
    </>
  )
}

export function MenuTest() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Heading>{`Count: ${count}`}</Heading>

      <Menu>
        Welcome to my little menu test!

        <ActionRow>
          <MySubmenu name="Add/Sub">
            Here you can increment and decrement.

            <ActionRow>
              <Button onClick={() => setCount(count + 1)}>Increment</Button>
              <Button onClick={() => setCount(count - 1)}>Decrement</Button>
            </ActionRow>
          </MySubmenu>

          <MySubmenu name="Mul/Div">
            Just one more layer to go...

            <MySubmenu name="Mul/Div for real">
              Here you can double and halve.

              <ActionRow>
                <Button onClick={() => setCount(count * 2)}>Double</Button>
                <Button onClick={() => setCount(count / 2)}>Halve</Button>
              </ActionRow>
            </MySubmenu>

            <Container color="red">
              <MySubmenu name="Dead end">
                <LeftOrRight />
              </MySubmenu>
            </Container>
          </MySubmenu>
        </ActionRow>
      </Menu>
    </>
  )
}
