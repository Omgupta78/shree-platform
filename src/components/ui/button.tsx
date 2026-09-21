import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'whatsapp' | 'onDark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-solid text-primary-fg hover:bg-primary-solid-hover',
  secondary:
    'bg-surface text-fg border border-line-strong hover:bg-surface-sunken',
  ghost: 'text-fg hover:bg-surface-sunken',
  whatsapp: 'bg-whatsapp text-white hover:brightness-95',
  onDark:
    'bg-white/10 text-chrome-fg border border-chrome-border hover:bg-white/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-[0.9375rem] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-sm font-medium transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type LinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

function classes({ variant = 'primary', size = 'md', fullWidth, className }: CommonProps) {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);
}

/**
 * Renders a `<button>`, or a Next `<Link>` when `href` is present, so a
 * navigation control is a real link for keyboard and screen-reader users.
 */
export function Button(props: ButtonProps | LinkProps) {
  if ('href' in props && props.href !== undefined) {
    const { href, variant, size, fullWidth, className, children, ...rest } = props;
    const external = /^(https?:|tel:|mailto:)/.test(href);
    const styles = classes({ variant, size, fullWidth, className, children });

    if (external) {
      return (
        <a href={href} className={styles} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={styles} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant, size, fullWidth, className, children, type, ...rest } = props as ButtonProps;
  return (
    <button
      type={type ?? 'button'}
      className={classes({ variant, size, fullWidth, className, children })}
      {...rest}
    >
      {children}
    </button>
  );
}
