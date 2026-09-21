'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { CheckIcon, ShareIcon } from '@/components/ui/icons';

/**
 * Whether this browser offers the native share sheet.
 *
 * Read through `useSyncExternalStore` rather than an effect: the capability
 * never changes, so `subscribe` is a no-op, and the separate server snapshot
 * makes the server and the first client render agree (`false`) before React
 * swaps in the real value — no hydration mismatch, no setState in an effect.
 */
const subscribeToNothing = () => () => {};
const clientCanShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const serverCanShare = () => false;

/**
 * Share this advertisement.
 *
 * Uses the Web Share sheet where the browser offers one — on a phone that is
 * the native sheet including WhatsApp, which is how most of this audience will
 * actually share a listing. Everywhere else it copies the link and confirms.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(subscribeToNothing, clientCanShare, serverCanShare);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = window.location.href;

    if (canShare) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // The sheet was dismissed, or sharing failed — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; leave the page unchanged rather than
      // claiming a copy that did not happen.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        data-share=""
        className="inline-flex items-center gap-1.5 text-sm text-fg-subtle underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        <ShareIcon size={14} />
        {canShare ? 'Share advertisement' : 'Copy link'}
      </button>

      <span role="status" aria-live="polite" className="text-xs text-positive-fg">
        {copied ? (
          <span className="inline-flex items-center gap-1">
            <CheckIcon size={13} />
            Advertisement link copied.
          </span>
        ) : null}
      </span>
    </div>
  );
}
