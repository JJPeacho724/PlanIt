'use client'

import React, { useMemo } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
import { FixedSizeList as List, VariableSizeList } from 'react-window'

type ItemRendererProps<T> = {
  index: number
  style: React.CSSProperties
  data: T
}

type VirtualizedListProps<T> = {
  itemCount: number
  estimatedItemSize?: number
  itemSize?: number | ((index: number) => number)
  overscan?: number
  itemData: T
  renderRow: (props: ItemRendererProps<T>) => React.ReactNode
  className?: string
}

export default function VirtualizedList<T>({
  itemCount,
  estimatedItemSize = 56,
  itemSize,
  overscan = 6,
  itemData,
  renderRow,
  className,
}: VirtualizedListProps<T>) {
  const Item = ({ index, style, data }: any) => {
    return <div style={style}>{renderRow({ index, style, data })}</div>
  }

  const isVariable = typeof itemSize === 'function'

  return (
    <div className={className}>
      <AutoSizer>
        {({ height, width }) =>
          isVariable ? (
            <VariableSizeList
              height={height}
              width={width}
              itemCount={itemCount}
              itemSize={itemSize as (index: number) => number}
              estimatedItemSize={estimatedItemSize}
              overscanCount={overscan}
              itemData={itemData as any}
            >
              {Item as any}
            </VariableSizeList>
          ) : (
            <List
              height={height}
              width={width}
              itemCount={itemCount}
              itemSize={(itemSize as number) ?? estimatedItemSize}
              overscanCount={overscan}
              itemData={itemData as any}
            >
              {Item as any}
            </List>
          )
        }
      </AutoSizer>
    </div>
  )
}


