/**
 * Fast core smoke test — no browser needed.
 *
 *   npm test
 *
 * Exercises the domain logic (Elo, simulator, highlighter, markdown renderer,
 * seeding, export) the same way the UI uses it. Pure Node + react-dom/server.
 */

import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

import { applyDeltas, computeDeltas, rankModels, emptyRating, confidenceInterval } from '../src/lib/elo'
import { classify, composeAnswer, streamSimulated } from '../src/lib/simulator'
import { highlight } from '../src/lib/highlight'
import { Markdown } from '../src/components/Markdown'
import { MODELS, getModel, pickLanes } from '../src/lib/models'
import { defaultRatings, defaultSettings, seedHistory } from '../src/lib/seed'
import { battleToMarkdown } from '../src/lib/export'
import type { Battle, Category } from '../src/lib/types'

let passed = 0
function ok(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++
      console.log(`  ✓ ${name}`)
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`)
      console.error(err)
      process.exitCode = 1
    })
}

async function main() {
  console.log('vlarena smoke test')

  await ok('elo: winner gains, loser drops, deltas sum to ~0', () => {
    const ratings = { a: emptyRating('a', 1200), b: emptyRating('b', 1200) }
    const deltas = computeDeltas(
      ratings,
      [
        { modelId: 'a', placement: 0 },
        { modelId: 'b', placement: 1 },
      ],
      'overall',
    )
    assert.ok(deltas.a! > 0 && deltas.b! < 0)
    assert.ok(Math.abs(deltas.a! + deltas.b!) < 1e-9)
    const { next } = applyDeltas(ratings, deltas, 'overall', { a: 'win', b: 'loss' })
    assert.equal(next.a!.votes, 1)
    assert.equal(next.a!.wins, 1)
    assert.equal(next.b!.losses, 1)
    assert.ok(next.a!.elo > 1200 && next.b!.elo < 1200)
    const rows = rankModels(next)
    assert.equal(rows[0]!.modelId, 'a')
  })

  await ok('elo: a tie is neutral between equals, regression between unequal', () => {
    const even = { a: emptyRating('a', 1200), b: emptyRating('b', 1200) }
    const tieEven = computeDeltas(
      even,
      [
        { modelId: 'a', placement: 0 },
        { modelId: 'b', placement: 0 },
      ],
      'overall',
    )
    assert.ok(Math.abs(tieEven.a!) < 1e-9)
    assert.ok(Math.abs(tieEven.b!) < 1e-9)

    // Stronger side drawing with a weaker one costs it points (and vice versa).
    const skewed = { a: emptyRating('a', 1300), b: emptyRating('b', 1100) }
    const tieSkewed = computeDeltas(
      skewed,
      [
        { modelId: 'a', placement: 0 },
        { modelId: 'b', placement: 0 },
      ],
      'overall',
    )
    assert.ok(tieSkewed.a! < 0 && tieSkewed.b! > 0)
    assert.ok(Math.abs(tieSkewed.a! + tieSkewed.b!) < 1e-9)
  })

  await ok('elo: 4-way win deltas are bounded', () => {
    const ratings = Object.fromEntries(['a', 'b', 'c', 'd'].map((m) => [m, emptyRating(m, 1200)]))
    const deltas = computeDeltas(
      ratings,
      [
        { modelId: 'a', placement: 0 },
        { modelId: 'b', placement: 1 },
        { modelId: 'c', placement: 1 },
        { modelId: 'd', placement: 1 },
      ],
      'coding',
    )
    for (const d of Object.values(deltas)) assert.ok(Math.abs(d) <= 24.0001)
  })

  await ok('elo: confidence interval shrinks with votes', () => {
    assert.ok(confidenceInterval(10) > confidenceInterval(1000))
    assert.ok(confidenceInterval(0) <= 60)
  })

  await ok('classify: routes prompts to sensible topics', () => {
    assert.equal(classify('write a react component for a landing page').category, 'coding' satisfies Category)
    assert.equal(classify('solve: x + (x+1) = 1.10, how much is the ball?').category, 'math')
    assert.equal(classify('write a short poem about coffee').category, 'creative')
    assert.equal(classify('compare trade-offs of two architectures and give a plan').category, 'reasoning')
  })

  await ok('simulator: same prompt, visibly different models', () => {
    const prompt = 'Create a sleek landing page for a desktop LLM arena. Show the hero component code.'
    const texts = ['claude-opus-4.6', 'gpt-5.2-mini', 'grok-4.1', 'phi-5-mini'].map((id) =>
      composeAnswer(prompt, getModel(id)),
    )
    for (const t of texts) assert.ok(t.length > 400, `expected a real answer, got ${t.length} chars`)
    const unique = new Set(texts)
    assert.equal(unique.size, texts.length, 'personas should not produce identical answers')
    assert.ok(texts[0]!.includes('```tsx'), 'coding-heavy model should emit code')
    assert.ok(getModel('grok-4.1').persona.warmth > 0.6 && texts[2]!.length > 0)
    // determinism for a fixed salt
    assert.equal(composeAnswer(prompt, getModel('gpt-5.2'), 3), composeAnswer(prompt, getModel('gpt-5.2'), 3))
  })

  await ok('simulator: stream reconstructs the full text and honours abort', async () => {
    const model = getModel('claude-sonnet-4.6')
    const text = composeAnswer('Design a dashboard for model ratings', model)
    let out = ''
    let ttft: number | null = null
    await streamSimulated({
      text,
      model,
      salt: 1,
      onFirstToken: (t) => (ttft = t),
      onChunk: (c) => (out += c),
    })
    assert.equal(out, text)
    assert.ok(ttft !== null && ttft > 0)

    const ctrl = new AbortController()
    let partial = ''
    const p = streamSimulated({
      text: text.repeat(20),
      model,
      signal: ctrl.signal,
      onChunk: (c) => {
        partial += c
        if (partial.length > 400) ctrl.abort()
      },
    })
    await p
    assert.ok(partial.length < text.repeat(20).length)
  })

  await ok('highlight: tags ts and python snippets', () => {
    const ts = highlight('const x: number = foo(42) // hi', 'ts')
    const classes = ts.map(([, c]) => c).join(' ')
    assert.ok(classes.includes('tok-kw'), classes)
    assert.ok(classes.includes('tok-num'))
    assert.ok(classes.includes('tok-com'))
    const py = highlight('def load(path: Path) -> list[Row]:', 'python')
    assert.ok(py.map(([, c]) => c).join(' ').includes('tok-kw'))
  })

  await ok('markdown: renders blocks and survives an unterminated fence', () => {
    const doc = [
      '# Title',
      '',
      'Some **bold**, _em_, `code` and [a link](https://example.com).',
      '',
      '## Section',
      '',
      '- one',
      '- two',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const unfinished = true',
    ].join('\n')
    const html = renderToStaticMarkup(createElement(Markdown, { text: doc }))
    for (const needle of ['<h1', '<h2', '<strong>', '<em>', '<code>', '<table>', '<ul>', '<li>', '<pre']) {
      assert.ok(html.includes(needle), `missing ${needle}`)
    }
    assert.ok(html.includes('md-pre'), 'open fence should render as a code block')
    assert.ok(html.includes('unfinished'), 'open fence must still render its body')
    assert.ok(html.includes('writing'), 'open fence should show the streaming indicator')
    assert.ok(!html.includes('<h1>#'), 'heading marker should be consumed')
  })

  await ok('seeds: ratings, history and a non-empty demo set', () => {
    const ratings = defaultRatings()
    assert.equal(Object.keys(ratings).length, MODELS.length)
    const { battles, ratings: seeded } = seedHistory(ratings)
    assert.ok(battles.length >= 4)
    for (const b of battles) {
      assert.ok(b.turns.length === 1)
      for (const l of b.turns[0]!.lanes) assert.ok(l.text.length > 200)
    }
    const voted = battles.filter((b) => b.turns[0]!.votes.length).length
    assert.ok(voted >= 3)
    // ratings actually moved for models in voted battles
    const moved = Object.values(seeded).filter((r) => r.elo !== ratings[r.modelId].elo)
    assert.ok(moved.length >= 2)
    assert.ok(defaultSettings().mode === 'simulated')
  })

  await ok('pickLanes: distinct models, respects lane count and category bias', () => {
    for (const n of [2, 3, 4]) {
      const picked = pickLanes({ n, category: 'math' })
      assert.equal(picked.length, n)
      assert.equal(new Set(picked.map((m) => m.id)).size, n)
    }
    const maths = pickLanes({ n: 4, category: 'math' })
    assert.ok(maths.slice(0, 2).every((m) => m.strengths.includes('math')))
  })

  await ok('export: battle → markdown transcript', () => {
    const { battles } = seedHistory(defaultRatings())
    const battle: Battle = battles[0]!
    const md = battleToMarkdown({ ...battle, revealed: true })
    assert.ok(md.startsWith(`# ${battle.title}`))
    assert.ok(md.includes('| Lane | Model | Org |'))
    assert.ok(md.includes('## Round 1'))
  })

  console.log(process.exitCode ? '\nFAILED' : `\nall ${passed} checks passed`)
  if (process.exitCode) process.exit(1)
}

void main()
