export function GameOfLife({ grid }: { grid: boolean[][] }) {
  return (
    <div>
      {grid.map((row, y) => (
        <div key={`row-${y}`} style={{ display: 'flex' }}>
          {row.map((cell, x) => (
            <div
              key={`cell-${x}-${y}`}
              style={{
                width: '10px',
                height: '10px',
                backgroundColor: cell ? 'black' : 'white',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function calculateLifeMetadata({ props }: { props: { grid: boolean[][] } }) {
  return {
    width: props.grid[0].length * 10,
    height: props.grid.length * 10,
    durationInFrames: 1,
    fps: 30,
  }
}
