const Anthropic = require('@anthropic-ai/sdk')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' })
  }

  const { answers } = req.body
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers required' })
  }

  const byAxis = { K: [], A: [], Q: [], S: [] }
  answers.forEach(a => { if (byAxis[a.axis]) byAxis[a.axis].push(a) })

  const axisNames = {
    K: 'K — Знания и прозрачность',
    A: 'A — Автоматизация',
    Q: 'Q — Качество и контроль рисков',
    S: 'S — Масштабируемость',
  }

  const formatAxis = (axis) =>
    byAxis[axis].map(a => `  Вопрос: ${a.question}\n  Ответ: ${a.chosen} (балл ${a.score} из 4)`).join('\n\n')

  const prompt = `Ты эксперт по управляемости бизнеса. Проанализируй результаты диагностики по системе K-A-Q-S.

Каждый вопрос — 4 варианта ответа (балл от 1 до 4, где 4 = отлично, 1 = критично).

${Object.keys(axisNames).map(ax => `═══ ${axisNames[ax]} ═══\n${formatAxis(ax)}`).join('\n\n')}

Верни ТОЛЬКО валидный JSON без markdown, строго в таком формате:
{"index":<0-100>,"pct":{"K":<0-100>,"A":<0-100>,"Q":<0-100>,"S":<0-100>},"statusLabel":"<Хаотичная|Базовая|Управляемая|Зрелая>","statusDesc":"<1 предложение>","insights":{"K":"<2-3 предложения>","A":"<2-3 предложения>","Q":"<2-3 предложения>","S":"<2-3 предложения>"},"risks":[{"level":"<P0|P1|P2>","title":"<название>","desc":"<1-2 предложения>","axis":"<K|A|Q|S>"}],"summary":"<3-4 предложения>"}

Правила: index = взвешенное среднее всех вопросов в шкале 0-100. statusLabel: Хаотичная<40, Базовая 40-59, Управляемая 60-74, Зрелая 75+. P0: 1-3 шт, P1: 1-3, P2: 1-2.`

  try {
    const client = new Anthropic({ apiKey: key })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = message.content[0].text.trim()
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const result = JSON.parse(cleaned)

    if (typeof result.index !== 'number' || !result.pct || !result.statusLabel) {
      throw new Error('Invalid structure')
    }

    result.date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    return res.status(200).json(result)
  } catch (e) {
    console.error('Error:', e.message)
    return res.status(500).json({ error: 'failed', message: e.message })
  }
}
