import { bot, Button, Heading } from '@repo/jsxcord'
import { logger } from '@repo/logger'
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Heading>{count}</Heading>
      {count <= 5 && <Button onClick={() => setCount(count + 1)}>Increment</Button>}
    </>
  )
}

bot({ test: <Counter /> })
  .on('ready', () => logger.info('Bot started'))
  .login(process.env.DISCORD_TOKEN!)
