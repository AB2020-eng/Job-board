import { Telegraf, Markup } from 'telegraf'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSheets } from './sheets'

const botToken = process.env.TELEGRAM_BOT_TOKEN as string
export const bot = new Telegraf(botToken)

function deepLink(jobId: string | number) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}/app?startapp=jobId_${jobId}`
}

bot.on('callback_query', async (ctx) => {
  const fromId = ctx.from?.id
  if (String(fromId) !== String(process.env.TELEGRAM_ADMIN_ID)) {
    return ctx.answerCbQuery('Not allowed')
  }
  const data = (ctx.callbackQuery as any)?.data || ''
  const [action, idStr] = data.split(':')
  const jobId = String(idStr || '').replace(/[^0-9]/g, '')
  if (!jobId) return ctx.answerCbQuery('Invalid')
  if (action === 'approve') {
    const { jobs } = await getSheets()
    await jobs.loadHeaderRow()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === jobId) as any
    if (!row) return ctx.answerCbQuery('Not found')
    ;(row as any).Status = 'active'
    await row.save()
    const text = `💼 ${(row as any).Title}\n${(row as any).Description}\n\nApply via Mini App`
    const link = deepLink(jobId)
    const keyboard = { reply_markup: { inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]] } }
    await bot.telegram.sendMessage(String(process.env.TELEGRAM_CHANNEL_ID), text, keyboard)
    await ctx.answerCbQuery('Approved')
  } else if (action === 'reject') {
    const { jobs } = await getSheets()
    await jobs.loadHeaderRow()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === jobId) as any
    if (!row) return ctx.answerCbQuery('Not found')
    ;(row as any).Status = 'rejected'
    await row.save()
    await ctx.answerCbQuery('Rejected')
  } else {
    await ctx.answerCbQuery('Unknown')
  }
})

export function notifyAdmin(job: { id: number | string; title: string; description: string; employer_username?: string }) {
  const text = `New Job: ${job.title} by @${job.employer_username || 'unknown'}\n${String(job.description || '').slice(0, 200)}`
  const approveData = `approve:${job.id}`
  const rejectData = `reject:${job.id}`
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', approveData), Markup.button.callback('❌ Reject', rejectData)]
  ])
  return bot.telegram.sendMessage(Number(process.env.TELEGRAM_ADMIN_ID), text, keyboard)
}

export default function webhook(req: NextApiRequest, res: NextApiResponse) {
  return (bot.webhookCallback(`/api/telegram/webhook/${process.env.BOT_WEBHOOK_SECRET || ''}`) as any)(req, res)
}
