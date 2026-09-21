import { AdvertisementDetailsSkeleton } from '@/components/advertisements/details-skeleton';

/**
 * This segment serves both category pages and advertisement pages, and a
 * loading file receives no params, so one skeleton has to cover both. The
 * detail shape is used because advertisement pages are the far commoner
 * arrival — every listing card points at one — and the two layouts share the
 * same wide-left, narrow-right structure.
 */
export default function Loading() {
  return <AdvertisementDetailsSkeleton />;
}
