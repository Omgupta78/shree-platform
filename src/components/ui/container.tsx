import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ContainerProps {
  as?: ElementType;
  size?: 'default' | 'narrow';
  className?: string;
  children: ReactNode;
}

/** Single source of truth for page gutters and maximum width. */
export function Container({
  as: Tag = 'div',
  size = 'default',
  className,
  children,
}: ContainerProps) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'narrow' ? 'max-w-3xl' : 'max-w-7xl',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
