import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts'
import { getCardIdFromScatterPointData } from './dashboard-scatter'

/**
 * Ensures Recharts still passes payload-shaped points to Scatter onClick (regression guard for pin-to-card).
 */
describe('Recharts Scatter onClick payload', () => {
  it('invokes onClick with data whose payload.id resolves via getCardIdFromScatterPointData', () => {
    const onPick = vi.fn()
    const data = [{ x: 5, y: 5, z: 100, id: 'sv8-99', name: 'Integration test card' }]

    render(
      <div>
        <ResponsiveContainer width={500} height={400}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis type="number" dataKey="x" domain={[0, 10]} />
            <YAxis type="number" dataKey="y" domain={[0, 10]} />
            <ZAxis type="number" dataKey="z" range={[80, 80]} />
            <Scatter
              name="Test"
              data={data}
              fill="#888"
              isAnimationActive={false}
              onClick={(pointData: unknown) => {
                const id = getCardIdFromScatterPointData(pointData)
                if (id) onPick(id)
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>,
    )

    const dot = document.querySelector('.recharts-scatter-symbol')
    expect(dot).toBeTruthy()

    ;(dot as Element).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 250, clientY: 200 }),
    )

    expect(onPick).toHaveBeenCalledWith('sv8-99')
  })
})
