import { springTiming, TransitionSeries } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { Img } from 'remotion'

const TIME_PER_IMAGE = 100

export function GuySlideshow({ images }: { images: string[] }) {
  return (
    <TransitionSeries>
      {images.map((image, index) => (
        <>
          <TransitionSeries.Sequence
            key={`sequence-${index}`}
            durationInFrames={TIME_PER_IMAGE * (index === images.length - 1 ? 2 : 1)}
          >
            <Img style={{ width: '100%', height: '100%' }} src={image} />
          </TransitionSeries.Sequence>

          {
            index < images.length - 1 && (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={springTiming({ durationInFrames: TIME_PER_IMAGE / 2 })}
              />
            )
          }
        </>
      ))}
    </TransitionSeries>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))

    img.src = src

    if (img.complete) {
      resolve(img)
    }
  })
}

export async function calculateSlideshowMetadata({ props }: { props: { images: string[] } }) {
  const firstImage = await loadImage(props.images[0])

  return {
    width: firstImage.width,
    height: firstImage.height,
    durationInFrames: TIME_PER_IMAGE / 2 * (props.images.length + 1),
    fps: 30,
  }
}
