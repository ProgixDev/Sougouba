'use client';
import { createContext, useContext } from 'react';

/**
 * What a portal page can ask of the frame around it.
 *
 * `refreshSession` re-reads the shop behind the session. The frame reads it
 * once, when the portal opens; a page that has just changed where the shop
 * stands — paying the subscription brings an offline shop back — calls this so
 * the badge in the top bar stops saying otherwise.
 */
export const MerchantPortalContext = createContext<{ refreshSession: () => void }>({ refreshSession: () => undefined });

export const useMerchantPortal = () => useContext(MerchantPortalContext);
