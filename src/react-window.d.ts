declare module 'react-window' {
  import * as React from 'react';

  export interface ListChildComponentProps {
    index: number;
    style: React.CSSProperties;
    data?: any;
    isScrolling?: boolean;
  }

  export interface FixedSizeListProps {
    children: (props: ListChildComponentProps) => React.ReactElement;
    height: number | string;
    itemCount: number;
    itemSize: number;
    width: number | string;
    overscanCount?: number;
    className?: string;
    style?: React.CSSProperties;
    initialScrollOffset?: number;
    onItemsRendered?: (props: {
      overscanStartIndex: number;
      overscanStopIndex: number;
      visibleStartIndex: number;
      visibleStopIndex: number;
    }) => void;
    onScroll?: (props: {
      scrollDirection: 'forward' | 'backward';
      scrollOffset: number;
      scrollUpdateWasRequested: boolean;
    }) => void;
    itemData?: any;
  }

  export class FixedSizeList extends React.Component<FixedSizeListProps> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void;
  }

  export interface VariableSizeListProps extends Omit<FixedSizeListProps, 'itemSize'> {
    estimatedItemSize?: number;
    itemSize: (index: number) => number;
  }

  export class VariableSizeList extends React.Component<VariableSizeListProps> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void;
    resetAfterIndex(index: number, shouldForceUpdate?: boolean): void;
  }
}
