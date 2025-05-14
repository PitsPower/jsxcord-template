import type { Post } from './bluesky.js'
import {
  ActionRow,
  bot,
  Button,
  Container,
  createEmojisFromFolder,
  Gallery,
  Heading,
  Img,
  Subheading,
  Tiny,
  Whitelist,
} from '@repo/jsxcord'
import { PageContext, Pages, Paginate } from '@repo/jsxcord-ui'
import { command } from '@repo/jsxcord/zod'
import { logger } from '@repo/logger'
import { useContext, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { getPostWithProgress, onPost } from './bluesky.js'
import { MarkovChain } from './markov/markov.js'

const markovChain = new MarkovChain()

onPost((post) => {
  if (post.langs.includes('en')) {
    markovChain.addSentence(post.text)
  }
})

function getEnglishPost(keyword?: string, hasImage?: boolean) {
  return getPostWithProgress(
    post => post.langs.includes('en')
      && (!hasImage || post.imageUrls.length > 0)
      && post.text.trim().length > 0
      && (!keyword || post.text.toLowerCase().includes(keyword.toLowerCase())),
  )
}

const { bluesky: BlueskyEmoji } = await createEmojisFromFolder('./src/img')

function Bluesky({ filter, image: hasImage }: { filter?: string, image?: boolean }) {
  const rawCount = useRef(0)
  const [count, setCount] = useState(0)
  const [post, setPost] = useState<Post>()

  async function fetchPost() {
    rawCount.current = 0
    setCount(0)
    setPost(undefined)

    for await (const progress of getEnglishPost(filter, hasImage)) {
      switch (progress.type) {
        case 'progress': {
          rawCount.current = progress.count
          break
        }

        case 'done': {
          setPost(progress.post)
          break
        }
      }
    }
  }

  useEffect(() => {
    void fetchPost()

    const interval = setInterval(() => {
      setCount(rawCount.current)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    post
      ? (
          <Container>
            <Subheading>{post.text}</Subheading>
            {
              post.imageUrls.length > 0
              && (
                <Gallery>
                  {post.imageUrls.map((imageUrl, i) => <Img key={i} src={imageUrl} />)}
                </Gallery>
              )
            }

            <Whitelist>
              <Button
                emoji={<BlueskyEmoji />}
                onClick={async (interaction) => {
                  await interaction.deferUpdate()
                  await fetchPost()
                }}
              >
                ANOTHER POST!
              </Button>
            </Whitelist>

            <Tiny>{`Looked at ${rawCount.current} messages total`}</Tiny>
          </Container>
        )
      : `Looked at ${count} messages...`
  )
}

// const Counter = createGuildState(0)

// function Test() {
//   const [count, setCount] = useSharedState(watch(Counter))

//   return (
//     <>
//       <Heading>{`Count: ${count}`}</Heading>
//       <Button onClick={() => setCount(count => count + 1)}>Increment</Button>
//     </>
//   )
// }

function PreviousButton() {
  const [page, setPage] = useContext(PageContext)
  return page > 0 && <Button onClick={() => setPage(page - 1)}>Previous</Button>
}

function NextButton() {
  const [page, setPage] = useContext(PageContext)
  return page < 4 && <Button onClick={() => setPage(page + 1)}>Next</Button>
}

function PaginateTest() {
  return (
    <Paginate>
      <Pages>
        <Heading>ONE</Heading>
        <Heading>TWO</Heading>
        <Heading>THREE</Heading>
        <Heading>FOUR</Heading>
        <Heading>FIVE</Heading>
      </Pages>

      <ActionRow>
        <PreviousButton />
        <NextButton />
      </ActionRow>
    </Paginate>
  )
}

const client = bot({
  bluesky: command(z.object({
    filter: z.string().optional(),
    image: z.boolean().optional(),
  }).describe('Fetches a post from the Bluesky Firehose'))
    .component(Bluesky),

  wordle: <Bluesky filter="wordle" />,

  test: <PaginateTest />,
})
  .registerEmojis(BlueskyEmoji)
  .on('ready', async () => logger.info('Bot started'))

// client.on('messageCreate', async (message) => {
//   if (message.author.bot) {
//     return
//   }

//   markovChain.addSentence(message.content)

//   const repliedMessage = message.reference?.messageId
//     ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
//     : null

//   const shouldReply
//     = Math.random() < 0.1
//       || message.mentions.has(client.user!.id)
//       || repliedMessage?.author.id === client.user!.id

//   if (shouldReply) {
//     await message.reply(markovChain.generateSentence())
//   }
// })

client.login(process.env.DISCORD_TOKEN!)
