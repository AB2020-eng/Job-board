import { Telegraf, Markup } from 'telegraf'
import type { NextApiRequest, NextApiResponse } from 'next'
import { updateJobStatus, getJobById } from './sheets'

const botToken = process.env.TELEGRAM_BOT_TOKEN as string
export const bot = new Telegraf(botToken)

function deepLink(jobId: string | number) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}/app?startapp=jobId_${jobId}`
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }).catch((e) => { clearTimeout(t); reject(e) })
  })
}

async function resolveChannelId(ctx: any): Promise<number | string> {
  const raw = String(process.env.TELEGRAM_CHANNEL_ID || '-1003779130300').trim()
  if (!raw) throw new Error('TELEGRAM_CHANNEL_ID missing')
  if (raw.startsWith('@')) {
    try {
      const chat = await ctx.telegram.getChat(raw)
      return chat.id
    } catch {
      // Fallback to raw; Telegram also accepts @username if bot has rights
      return raw
    }
  }
  const n = Number(raw)
  return Number.isFinite(n) && raw.startsWith('-') ? n : raw
}

bot.on('callback_query', async (ctx) => {
  const fromId = ctx.from?.id
  if (String(fromId) !== String(process.env.TELEGRAM_ADMIN_ID)) {
    try { await ctx.answerCbQuery('🚫 You are not authorized.') } catch {}
    return
  }
  try { await ctx.answerCbQuery('Processing…') } catch {}
  const data = (ctx.callbackQuery as any)?.data || ''
  const m = String(data).match(/^(approve|reject)[:_](.+)$/)
  if (!m) {
    try { await ctx.answerCbQuery('Invalid action') } catch {}
    return
  }
  const action = m[1]
  const jobId = String(m[2] || '').replace(/[^0-9]/g, '')
  if (!jobId) {
    try { await ctx.answerCbQuery('Invalid job id') } catch {}
    return
  }
  if (action === 'approve') {
    try {
      try { await ctx.editMessageText('⏳ Approving…') } catch {}
      const updated = await withTimeout(updateJobStatus(jobId, 'active'), 4000, 'Timeout updating sheet')
      const title = (updated as any)?.Title || (updated as any)?.title || `Job ${jobId}`
      const description = (updated as any)?.Description || (updated as any)?.description || ''
      const text = `💼 ${title}\n${description}\n\nApply via Mini App`
      const link = deepLink(jobId)
      const keyboard = { reply_markup: { inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]] } } as any
      const channelId = await resolveChannelId(ctx)
      await withTimeout(ctx.telegram.sendMessage(channelId as any, text, keyboard), 4000, 'Timeout posting to channel')
      try { await ctx.editMessageText(`✅ Approved: ${title}`) } catch {}
      try { await ctx.answerCbQuery('✅ Job Approved & Posted!') } catch {}
    } catch (e: any) {
      const detail = e?.response?.description || e?.message || 'Unknown error'
      try { await ctx.editMessageText(`❗ Error approving: ${detail}`) } catch {}
      try { await ctx.answerCbQuery(detail) } catch {}
    }
  } else if (action === 'reject') {
    try {
      try { await ctx.editMessageText('⏳ Rejecting…') } catch {}
      await withTimeout(updateJobStatus(jobId, 'rejected'), 4000, 'Timeout updating sheet')
      try { await ctx.editMessageText('❌ This job post was rejected.') } catch {}
      try { await ctx.answerCbQuery('❌ Job Rejected') } catch {}
    } catch (e: any) {
      const detail = e?.response?.description || e?.message || 'Unknown error'
      try { await ctx.editMessageText(`❗ Error rejecting: ${detail}`) } catch {}
      try { await ctx.answerCbQuery(detail) } catch {}
    }
  } else {
    try { await ctx.answerCbQuery('Unknown action') } catch {}
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
