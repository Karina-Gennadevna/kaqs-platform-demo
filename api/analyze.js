import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { answers } = req.body

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers required' })
  }

  // Group answers by axis for the prompt
  const byAxis = { K: [], A: [], Q: [], S: [] }
  answers.forEach(a => {
    if (byAxis[a.axis]) byAxis[a.axis].push(a)
  })

  const axisNames = {
    K: 'K — Знания и прозрачность (насколько собственник понимает цифры, процессы и команду)',
    A: 'A — Автоматизация (насколько бизнес работает без ручного вмешательства)',
    Q: 'Q — Качество и контроль рисков (насколько бизнес предсказуем и устойчив)',
    S: 'S — Масштабируемость (может ли бизнес расти без собственника в операционке)',
  }

  const formatAxis = (axis) => {
    return byAxis[axis].map((a, i) =>
      `  Вопрос: ${a.question}\n  Ответ: ${a.chosen} (балл ${a.score} из 4)`
    ).join('\n\n')
  }

  const prompt = `Ты эксперт по управляемости бизнеса. Проанализируй результаты диагностики предпринимателя по системе K-A-Q-S и дай честную, конкретную оценку.

Диагностика состоит из 4 блоков. Каждый вопрос — 4 варианта ответа (балл от 1 до 4, где 4 = отлично, 1 = критично).

═══ ${axisNames.K} ═══
${formatAxis('K')}

═══ ${axisNames.A} ═══
${formatAxis('A')}

═══ ${axisNames.Q} ═══
${formatAxis('Q')}

═══ ${axisNames.S} ═══
${formatAxis('S')}

На основе ответов сформируй ЧЕСТНУЮ оценку. Не льсти, не смягчай — называй реальную ситуацию. Если ответы слабые — скажи об этом прямо.

Верни ТОЛЬКО валидный JSON без markdown-обёрток, строго в таком формате:

{
  "index": <число 0-100, общий индекс управляемости>,
  "pct": {
    "K": <число 0-100>,
    "A": <число 0-100>,
    "Q": <число 0-100>,
    "S": <число 0-100>
  },
  "statusLabel": "<одно из: Хаотичная | Базовая | Управляемая | Зрелая>",
  "statusDesc": "<1 предложение — честная характеристика текущего состояния бизнеса>",
  "insights": {
    "K": "<2-3 предложения — что конкретно показали ответы по блоку К, без воды>",
    "A": "<2-3 предложения — что конкретно показали ответы по блоку А>",
    "Q": "<2-3 предложения — что конкретно показали ответы по блоку Q>",
    "S": "<2-3 предложения — что конкретно показали ответы по блоку S>"
  },
  "risks": [
    {
      "level": "<P0 | P1 | P2>",
      "title": "<короткое название риска>",
      "desc": "<1-2 предложения — в чём конкретно проблема и чем грозит>",
      "axis": "<K | A | Q | S>"
    }
  ],
  "summary": "<3-4 предложения — честное резюме: где стоит сейчас бизнес, главная проблема, что нужно сделать в первую очередь>"
}

Правила:
- index рассчитай как взвешенное среднее баллов по всем 24 вопросам, переведи в шкалу 0-100
- Блок с наименьшим pct — слабейшее место, там должны быть P0-риски
- Рисков P0 должно быть 1-3 (только критичные), P1 — 1-3, P2 — 1-2
- statusLabel: Хаотичная если index < 40, Базовая если 40-59, Управляемая если 60-74, Зрелая если 75+
- Insights должны быть конкретными — ссылайся на конкретные ответы пользователя`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].text.trim()

    // Strip markdown code blocks if present
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

    const data = JSON.parse(cleaned)

    // Validate required fields
    if (typeof data.index !== 'number' || !data.pct || !data.statusLabel) {
      throw new Error('Invalid response structure')
    }

    data.date = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric'
    })

    return res.status(200).json(data)

  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'analysis_failed', message: err.message })
  }
}
