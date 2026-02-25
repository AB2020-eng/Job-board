import { Telegraf, Markup } from 'telegraf'
import type { NextApiRequest, NextApiResponse } from 'next'
import { updateJobStatus, getJobById } from './sheets'

const botToken = process.env.TELEGRAM_BOT_TOKEN as string
export const bot = new Telegraf(botToken)

function deepLink(jobId: string | number) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?startapp=jobId_${jobId}`
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

function getPublicBaseUrl() {
  const envBase = String(process.env.BOT_PUBLIC_URL || '').trim()
  if (envBase) return envBase.replace(/\/+$/, '')
  const vercel = String(process.env.VERCEL_URL || '').trim()
  if (vercel) return `https://${vercel}`.replace(/\/+$/, '')
  return ''
}

async function fireWorker(action: 'approve'|'reject', jobId: string, chatId: number, messageId: number) {
  const base = getPublicBaseUrl()
  const secret = String(process.env.BOT_WEBHOOK_SECRET || '')
  if (!base || !secret) return false
  const url = `${base}/api/telegram/callback-worker?secret=${encodeURIComponent(secret)}`
  const payload = { action, jobId, admin_chat_id: chatId, admin_message_id: messageId }
  try {
    const res = await withTimeout(fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }), 4000, 'worker_timeout')
    if (!res.ok) return false
    return true
  } catch {
    return false
  }
}

async function handleActionInline(action: 'approve'|'reject', jobId: string, chatId: number, messageId: number) {
  if (action === 'approve') {
    await updateJobStatus(String(jobId), 'active')
    const job = await getJobById(String(jobId))
    const { title, text } = formatJobText(job, String(jobId))
    const link = deepLink(jobId)
    const keyboard = { reply_markup: { inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]] } } as any
    const channelId = await resolveChannelId({ telegram: bot.telegram })
    await bot.telegram.sendMessage(channelId as any, text, keyboard)
    await bot.telegram.editMessageText(chatId, messageId, undefined as any, `✅ Job "${title}" has been posted to the channel.`)
  } else {
    await bot.telegram.editMessageText(chatId, messageId, undefined as any, '❌ This job post was rejected.')
  }
}

function formatJobText(job: any, jobId?: string) {
  const title = job?.Title || job?.title || (jobId ? `Job ${jobId}` : 'Job')
  const category = job?.Category || job?.category || ''
  const salary = job?.Salary || job?.salary || ''
  const description = job?.Description || job?.description || ''
  const details = [category ? `Category: ${category}` : '', salary ? `Salary: ${salary}` : ''].filter(Boolean).join('\n')
  const text = `💼 ${title}${details ? `\n${details}` : ''}\n\n${description}\n\nApply via Mini App`
  return { title, text }
}

async function runApprove(ctx: any, jobId: string) {
  try { await ctx.answerCbQuery('Processing...') } catch {}
  const fromId = ctx.from?.id
  if (String(fromId) !== String(process.env.TELEGRAM_ADMIN_ID)) {
    try { await ctx.answerCbQuery('🚫 You are not authorized.') } catch {}
    return
  }
  try {
    try { await ctx.editMessageText('⏳ Approving…') } catch {}
    const chatId = (ctx.callbackQuery as any)?.message?.chat?.id
    const messageId = (ctx.callbackQuery as any)?.message?.message_id
    if (chatId && messageId) {
      const started = await fireWorker('approve', jobId, Number(chatId), Number(messageId))
      if (!started) {
        await handleActionInline('approve', jobId, Number(chatId), Number(messageId))
      }
    }
  } catch (e: any) {
    const detail = e?.response?.description || e?.message || 'Unknown error'
    try { await ctx.editMessageText(`❗ Error approving: ${detail}`) } catch {}
    try { await ctx.answerCbQuery('❌ Error during approval.') } catch {}
  }
}

async function runReject(ctx: any, jobId: string) {
  try { await ctx.answerCbQuery('Processing...') } catch {}
  const fromId = ctx.from?.id
  if (String(fromId) !== String(process.env.TELEGRAM_ADMIN_ID)) {
    try { await ctx.answerCbQuery('🚫 You are not authorized.') } catch {}
    return
  }
  try {
    try { await ctx.editMessageText('⏳ Rejecting…') } catch {}
    const chatId = (ctx.callbackQuery as any)?.message?.chat?.id
    const messageId = (ctx.callbackQuery as any)?.message?.message_id
    if (chatId && messageId) {
      const started = await fireWorker('reject', jobId, Number(chatId), Number(messageId))
      if (!started) {
        await handleActionInline('reject', jobId, Number(chatId), Number(messageId))
      }
    }
  } catch (e: any) {
    const detail = e?.response?.description || e?.message || 'Unknown error'
    try { await ctx.editMessageText(`❗ Error rejecting: ${detail}`) } catch {}
    try { await ctx.answerCbQuery('❌ Error during rejection.') } catch {}
  }
}

bot.action(/^approve_(.+)$/, async (ctx) => {
  const jobId = String((ctx as any).match?.[1] || '').replace(/[^0-9]/g, '')
  if (!jobId) {
    try { await ctx.answerCbQuery('Invalid job id') } catch {}
    return
  }
  await runApprove(ctx, jobId)
})

bot.action(/^reject_(.+)$/, async (ctx) => {
  const jobId = String((ctx as any).match?.[1] || '').replace(/[^0-9]/g, '')
  if (!jobId) {
    try { await ctx.answerCbQuery('Invalid job id') } catch {}
    return
  }
  await runReject(ctx, jobId)
})


export function notifyAdmin(job: { id: number | string; title: string; description: string; category?: string; salary?: string; employer_username?: string }) {
  const details = [job.category ? `Category: ${job.category}` : '', job.salary ? `Salary: ${job.salary}` : ''].filter(Boolean).join('\n')
  const text = `New Job: ${job.title} by @${job.employer_username || 'unknown'}${details ? `\n${details}` : ''}\n\n${String(job.description || '')}`
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
