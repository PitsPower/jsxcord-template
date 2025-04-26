import { bot, Button, Container, Divider, Heading, Img, Section, Subheading } from '@repo/jsxcord'
import { logger } from '@repo/logger'
import { useState } from 'react'

function Test() {
  const [count, setCount] = useState(0)

  return (
    <Container color="red">
      <Section accessory={<Img src="https://placehold.co/256x256.png" />}>
        <Heading>
          {`Added <Section>`}
        </Heading>
        Very cool!
      </Section>

      <Divider />

      <Section accessory={<Button onClick={() => setCount(count + 1)}>Increment</Button>}>
        <Subheading>{`Count: ${count}`}</Subheading>
        Supports buttons too!
      </Section>
    </Container>
  )
}

const client = bot({
  test: <Test />,
})
  .on('ready', async () => logger.info('Bot started'))

client.on('messageCreate', async (message) => {
  if (message.content === 'test') {
    await message.reply({
      flags: 1 << 15,
      components: [
        {
          type: 10,
          content: 'This is a message using the Text Display component',
        },
        {
          type: 10,
          content: 'This is a message using the Text Display component',
        },
      ],
    })
  }
})

client.login(process.env.DISCORD_TOKEN!)
