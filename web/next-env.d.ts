/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare namespace Telegram {
  interface WebAppUser {
    id: number
    username?: string
    first_name?: string
    last_name?: string
  }
  interface InitDataUnsafe {
    user?: WebAppUser
    start_param?: string
    hash?: string
    auth_date?: string
    query_id?: string
  }
  interface ThemeParams {}
  interface WebApp {
    initData: string
    initDataUnsafe: InitDataUnsafe
    expand(): void
    close(): void
    ready(): void
    showPopup(params: { title: string; message: string }): void
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: Telegram.WebApp
    }
  }
}

export {}
