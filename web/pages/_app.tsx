import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { tgReady } from '../lib/telegram'

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    tgReady()
  }, [])
  return <Component {...pageProps} />
}
