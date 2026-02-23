import crypto from 'crypto'

export function verifyInitData(initData: string, botToken: string) {
  try {
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash') || ''
    urlParams.delete('hash')
    const pairs: string[] = []
    Array.from(urlParams.keys())
      .sort()
      .forEach((k) => {
        const v = urlParams.get(k)
        if (v !== null) pairs.push(`${k}=${v}`)
      })
    const dataCheckString = pairs.join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    return hmac === hash
  } catch {
    return false
  }
}
