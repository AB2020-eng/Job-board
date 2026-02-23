import { Telegraf, Markup } from 'telegraf'
import type { NextApiRequest, NextApiResponse } from 'next'
import { updateJobStatus, getJobById } from './sheets'

const botToken = process.env.TELEGRAM_BOT_TOKEN as string
export const bot = new Telegraf(botToken)

function deepLink(jobId: string | number) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}/app?startapp=jobId_${jobId}`
}

// Guard: admin only
bot.action(/^(approve|reject)_(.+)$/, async (ctx, next) => {
  if (String(ctx.from?.id) !== String(process.env.TELEGRAM_ADMIN_ID)) {
    try { await ctx.answerCbQuery('🚫 You are not authorized.') } catch {}
    return
  }
  try { await ctx.answerCbQuery('Processing…') } catch {}
  return next()
})

// Approve handler
bot.action(/^approve_(.+)$/, async (ctx) => {
  const jobId = (ctx.match as RegExpMatchArray)[1]
  try {
    await updateJobStatus(jobId, 'active')
    const job = await getJobById(jobId)
    const text = `💼 ${job.Title}\n${job.Description}\n\nApply via Mini App`
    const link = deepLink(jobId)
    const keyboard = { reply_markup: { inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]] } } as any
    await ctx.telegram.sendMessage(String(process.env.TELEGRAM_CHANNEL_ID), text, keyboard)
    try {
      await ctx.editMessageText(`✅ Approved: ${job.Title}`)
    } catch {}
    try { await ctx.answerCbQuery('✅ Job Approved & Posted!') } catch {}
  } catch (e: any) {
    try { await ctx.answerCbQuery(e?.message || 'Error') } catch {}
  }
})

// Reject handler
bot.action(/^reject_(.+)$/, async (ctx) => {
  const jobId = (ctx.match as RegExpMatchArray)[1]
  try {
    await updateJobStatus(jobId, 'rejected')
    try {
      await ctx.editMessageText('❌ This job post was rejected.')
    } catch {}
    try { await ctx.answerCbQuery('❌ Job Rejected') } catch {}
  } catch (e: any) {
    try { await ctx.answerCbQuery(e?.message || 'Error') } catch {}
  }
})

export function notifyAdmin(job: { id: number | string; title: string; description: string; employer_username?: string }) {
  const text = `New Job: ${job.title} by @${job.employer_username || 'unknown'}\n${String(job.description || '').slice(0, 200)}`
  const approveData = `approve_${job.id}`
  const rejectData = `reject_${job.id}`
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', approveData), Markup.button.callback('❌ Reject', rejectData)]
  ])
  return bot.telegram.sendMessage(Number(process.env.TELEGRAM_ADMIN_ID), text, keyboard)
}

export default function webhook(req: NextApiRequest, res: NextApiResponse) {
  return (bot.webhookCallback(`/api/telegram/webhook/${process.env.BOT_WEBHOOK_SECRET || ''}`) as any)(req, res)
}
