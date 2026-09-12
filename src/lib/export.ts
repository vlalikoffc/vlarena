import type { Battle } from './types'
import { getModel } from './models'
import { formatClock } from './utils'

/** Serialises a battle to Markdown — handy for sharing a result. */
export function battleToMarkdown(battle: Battle): string {
  const lines: string[] = []
  lines.push(`# ${battle.title}`)
  lines.push('')
  lines.push(
    `- **When:** ${formatClock(battle.createdAt)}`,
    `- **Category:** ${battle.category}`,
    `- **Mode:** ${battle.simulated ? 'offline simulator' : 'live providers'}`,
    `- **Lanes:** ${battle.laneOrder.length}`,
    '',
  )

  if (battle.revealed) {
    lines.push('| Lane | Model | Org |')
    lines.push('| --- | --- | --- |')
    for (const lane of battle.laneOrder) {
      const m = getModel(battle.models[lane]!)
      lines.push(`| ${lane.toUpperCase()} | ${m.name} | ${m.org} |`)
    }
    lines.push('')
  }

  battle.turns.forEach((turn, index) => {
    lines.push(`## Round ${index + 1}`)
    lines.push('')
    lines.push(`> ${turn.prompt.replace(/\n/g, '\n> ')}`)
    lines.push('')

    for (const laneSnapshot of turn.lanes) {
      const m = getModel(laneSnapshot.modelId)
      const name = battle.revealed ? `${m.name}` : `Model ${laneSnapshot.lane.toUpperCase()}`
      lines.push(`### ${name}`)
      lines.push('')
      lines.push(
        `*ttft ${Math.round(laneSnapshot.ttftMs ?? 0)}ms · ${laneSnapshot.tokPerSec.toFixed(1)} tok/s · ${laneSnapshot.tokens} tokens*`,
      )
      lines.push('')
      lines.push(laneSnapshot.text || '_no output_')
      lines.push('')
    }

    const vote = turn.votes[0]
    if (vote) {
      const winner = vote.lane
        ? battle.revealed
          ? getModel(turn.lanes.find((l) => l.lane === vote.lane)!.modelId).name
          : `Model ${vote.lane.toUpperCase()}`
        : null
      lines.push(
        `**Verdict:** ${vote.kind === 'best' ? `👑 ${winner}` : vote.kind === 'tie' ? '🤝 tie' : '👎 both bad'}`,
      )
      const deltas = Object.entries(turn.eloDeltas)
      if (deltas.length) {
        lines.push('')
        lines.push(
          `Elo: ${deltas
            .map(([id, d]) => `${getModel(id).name} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`)
            .join(' · ')}`,
        )
      }
      lines.push('')
    }
  })

  return lines.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadFile(filename: string, content: string, type = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
