import type { Stage as InternalStage } from 'konva/lib/Stage.js'
import type { PropsWithChildren } from 'react'
import type { StageProps } from 'react-konva'
import { Img } from '@repo/jsxcord'
import { useEffect, useRef, useState } from 'react'
import { Stage } from 'react-konva'

export function KonvaImage(props: PropsWithChildren<StageProps>) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const stageRef = useRef<InternalStage | null>(null)

  function checkForUpdate() {
    if (stageRef.current && stageRef.current?.toDataURL() !== dataUrl) {
      setDataUrl(stageRef.current?.toDataURL() ?? null)
    }
  }

  useEffect(checkForUpdate)

  return (
    <>
      {
        dataUrl
        && <Img src={Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64').buffer} />
      }
      <Stage ref={stageRef} {...props} />
    </>
  )
}
