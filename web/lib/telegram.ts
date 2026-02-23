export function getInitDataUnsafe() {
  if (typeof window === 'undefined') return undefined
  return window.Telegram?.WebApp?.initDataUnsafe
}

export function getStartParam() {
  const init = getInitDataUnsafe()
  return init?.start_param
}

export function getUser() {
  const init = getInitDataUnsafe()
  return init?.user
}

export function tgReady() {
  if (typeof window === 'undefined') return
  window.Telegram?.WebApp?.ready()
  window.Telegram?.WebApp?.expand()
}
