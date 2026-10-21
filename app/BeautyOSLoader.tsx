'use client'

// app/BeautyOSLoader.tsx
//
// The signed-in dashboard, loaded as its own chunk. app/page.tsx is the
// landing page for a logged-out visitor AND the dashboard for a logged-in one,
// and with beautyos.jsx imported there - statically or through a server-side
// import() - its whole client bundle (~190 KB gzipped, an ~880 KB source file)
// belongs to the route, so a stranger reading the landing page downloaded the
// entire app behind a login they had not made yet. Lighthouse listed it as the
// largest block of unused JavaScript on /.
//
// A client-side dynamic import is the one form that keeps the chunk out of the
// route until this component actually renders, which only the signed-in branch
// does. ssr stays on (the default), so the dashboard's server-rendered shell is
// unchanged.

import dynamic from 'next/dynamic'
import PhoneGate from './PhoneGate'

const BeautyOS = dynamic(() => import('./beautyos'))

export default function BeautyOSLoader({ ownerEntry = null }: { ownerEntry?: React.ReactNode }) {
  // PhoneGate renders nothing unless phone verification is switched on and this account has no verified mobile
  // (lib/phoneVerify/policy.ts). It never delays the app: it asks after the app is already on screen.
  return <><BeautyOS ownerEntry={ownerEntry} /><PhoneGate /></>
}
