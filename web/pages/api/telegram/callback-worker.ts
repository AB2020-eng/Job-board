import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../../server/bot'
import { updateJobStatus, getJobById } from '../../../server/sheets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const secret = String(req.query.secret || '')
  if (secret !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const { action, jobId, admin_chat_id, admin_message_id } = req.body || {}
  const chatId = Number(admin_chat_id)
  const msgId = Number(admin_message_id)
  if (!action || !jobId || !chatId || !msgId) {
    return res.status(400).json({ error: 'bad_request' })
  }
  try {
    if (action === 'approve') {
      const updated = await updateJobStatus(String(jobId), 'active')
      let title = (updated as any)?.Title || (updated as any)?.title || `Job ${jobId}`
      let category = (updated as any)?.Category || (updated as any)?.category || ''
      let salary = (updated as any)?.Salary || (updated as any)?.salary || ''
      let description = (updated as any)?.Description || (updated as any)?.description || ''
      try {
        const job = await getJobById(String(jobId))
        title = job.Title || title
        category = job.Category || category
        salary = job.Salary || salary
        description = job.Description || description
      } catch {}
      const details = [category ? `Category: ${category}` : '', salary ? `Salary: ${salary}` : ''].filter(Boolean).join('\n')
      const text = `💼 ${title}${details ? `\n${details}` : ''}\n\n${description}\n\nApply via Mini App`
      const link = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}/app?startapp=jobId_${jobId}`
      const keyboard = { reply_markup: { inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]] } } as any
      const channelRaw = String(process.env.TELEGRAM_CHANNEL_ID || '-1003779130300').trim()
      const channelId = channelRaw.startsWith('-') ? Number(channelRaw) : channelRaw
      await bot.telegram.sendMessage(channelId as any, text, keyboard)
      await bot.telegram.editMessageText(chatId, msgId, undefined as any, `✅ Approved: ${title}`)
      return res.json({ ok: true })
    } else if (action === 'reject') {
      await updateJobStatus(String(jobId), 'rejected')
      await bot.telegram.editMessageText(chatId, msgId, undefined as any, '❌ This job post was rejected.')
      return res.json({ ok: true })
    } else {
      return res.status(400).json({ error: 'unknown_action' })
    }
  } catch (e: any) {
    const detail = e?.response?.description || e?.message || 'Unknown error'
    try {
      const prefix = action === 'approve' ? '❗ Error approving: ' : '❗ Error rejecting: '
      await bot.telegram.editMessageText(chatId, msgId, undefined as any, `${prefix}${detail}`)
    } catch {}
    return res.status(500).json({ error: detail })
  }
}
