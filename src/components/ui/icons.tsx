import type { SVGProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * A small hand-rolled icon set rather than a dependency: only a dozen glyphs
 * are needed and this keeps the client bundle free of an icon library.
 * All icons inherit `currentColor` and are hidden from assistive technology —
 * the surrounding control always carries the accessible name.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, className, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.6 3h-2A1.6 1.6 0 0 0 3 4.7C3 13.1 10.9 21 19.3 21a1.6 1.6 0 0 0 1.7-1.6v-2a1.6 1.6 0 0 0-1.3-1.6l-2.6-.5a1.6 1.6 0 0 0-1.6.7l-.7 1a12.4 12.4 0 0 1-5.3-5.3l1-.7a1.6 1.6 0 0 0 .7-1.6l-.5-2.6A1.6 1.6 0 0 0 6.6 3Z" />
  </Icon>
);

export const WhatsAppIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={0} fill="currentColor">
    <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.94 9.94 0 0 0 4.88 1.27h.01c5.5 0 9.96-4.46 9.96-9.96A9.9 9.9 0 0 0 19.1 4.9 9.9 9.9 0 0 0 12.04 2Zm0 18.13h-.01a8.27 8.27 0 0 1-4.21-1.15l-.3-.18-3.13.82.83-3.06-.2-.31a8.26 8.26 0 1 1 7.02 3.88Zm4.54-6.19c-.25-.13-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.38-2-1.23a7.5 7.5 0 0 1-1.38-1.72c-.15-.25-.02-.38.11-.5.11-.12.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.55-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.11-.22-.17-.47-.3Z" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m13 5 7 7-7 7" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Icon>
);

export const MapPinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);

export const NewspaperIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h12v14a2 2 0 0 1-2 2H5a2 2 0 0 1-1-1.7V5Z" />
    <path d="M16 8h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2" />
    <path d="M7 9h6" />
    <path d="M7 13h6" />
    <path d="M7 17h4" />
  </Icon>
);

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18Z" />
  </Icon>
);

export const ScreenIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M9 21h6" />
    <path d="M12 17v4" />
  </Icon>
);

export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="m8.2 10.8 7.6-4.1" />
    <path d="m8.2 13.2 7.6 4.1" />
  </Icon>
);

export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18" />
    <path d="M6.5 12h11" />
    <path d="M10 19h4" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V4" />
    <path d="M5 5h11l-1.6 3.5L16 12H5" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

/* Category glyphs, keyed by the `icon` column on public.categories. */
const CATEGORY_ICONS = {
  briefcase: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </Icon>
  ),
  building: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-5h6v5" />
      <path d="M9 11h.01M15 11h.01" />
    </Icon>
  ),
  car: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 17h14" />
      <path d="M4 17v-4l2-5h12l2 5v4" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </Icon>
  ),
  graduation: (p: IconProps) => (
    <Icon {...p}>
      <path d="m12 4 10 5-10 5L2 9l10-5Z" />
      <path d="M6 11v5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5" />
    </Icon>
  ),
  wrench: (p: IconProps) => (
    <Icon {...p}>
      <path d="M15 3a5 5 0 0 0-4.6 7L3 17.4V21h3.6l7.4-7.4A5 5 0 1 0 15 3Z" />
    </Icon>
  ),
  store: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M9 21v-6h6v6" />
    </Icon>
  ),
  tag: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 11V4h7l10 10-7 7L3 11Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </Icon>
  ),
  heart: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.4 12 20 12 20Z" />
    </Icon>
  ),
  megaphone: (p: IconProps) => (
    <Icon {...p}>
      <path d="M4 10v4a1 1 0 0 0 1 1h3l9 4V5L8 9H5a1 1 0 0 0-1 1Z" />
      <path d="M8 15v5" />
    </Icon>
  ),
} as const satisfies Record<string, (p: IconProps) => React.JSX.Element>;

/** The icon names a category may reference. */
export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/**
 * `name` is omitted from the SVG props before being redeclared: `SVGProps`
 * already defines a `name?: string`, and intersecting would silently drop the
 * `null` case.
 */
export function CategoryIcon({
  name,
  ...rest
}: Omit<IconProps, 'name'> & { name: CategoryIconName | string | null }) {
  const Glyph =
    (name && CATEGORY_ICONS[name as CategoryIconName]) || CATEGORY_ICONS.tag;
  return <Glyph {...rest} />;
}

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);

export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12H4" />
    <path d="m10 6-6 6 6 6" />
  </Icon>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V4" />
    <path d="m6 10 6-6 6 6" />
  </Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16" />
    <path d="m6 14 6 6 6-6" />
  </Icon>
);

export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 4 2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.5-4.6 2.5.9-5.3L4.5 9.6l5.2-.7z" />
  </Icon>
);

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
);

export const SaveIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M8 4v5h7V4" />
    <path d="M8 21v-6h8v6" />
  </Icon>
);
