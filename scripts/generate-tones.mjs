import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const sampleRate = 22050
const outDir = join('src', 'renderer', 'src', 'assets', 'sounds')
mkdirSync(outDir, { recursive: true })

function envelope(index, total) {
  const attack = Math.min(1, index / Math.max(1, sampleRate * 0.01))
  const release = Math.min(1, (total - index) / Math.max(1, sampleRate * 0.03))
  return Math.max(0, Math.min(attack, release))
}

function render(notes) {
  const total = notes.reduce((sum, note) => sum + Math.floor(sampleRate * note.seconds), 0)
  const pcm = Buffer.alloc(total * 2)
  let offset = 0
  for (const note of notes) {
    const count = Math.floor(sampleRate * note.seconds)
    for (let index = 0; index < count; index += 1) {
      const time = index / sampleRate
      const sample = Math.sin(2 * Math.PI * note.frequency * time) * note.volume * envelope(index, count)
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), (offset + index) * 2)
    }
    offset += count
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

const tones = {
  'game-start': [
    { frequency: 392, seconds: 0.12, volume: 0.3 },
    { frequency: 523.25, seconds: 0.12, volume: 0.32 },
    { frequency: 659.25, seconds: 0.2, volume: 0.34 }
  ],
  'game-end': [
    { frequency: 659.25, seconds: 0.14, volume: 0.28 },
    { frequency: 523.25, seconds: 0.14, volume: 0.28 },
    { frequency: 392, seconds: 0.22, volume: 0.26 }
  ],
  start: [{ frequency: 523.25, seconds: 0.16, volume: 0.35 }],
  correct: [
    { frequency: 659.25, seconds: 0.09, volume: 0.32 },
    { frequency: 880, seconds: 0.12, volume: 0.32 }
  ],
  skip: [{ frequency: 349.23, seconds: 0.1, volume: 0.22 }],
  tick: [{ frequency: 988, seconds: 0.045, volume: 0.2 }],
  'time-up': [
    { frequency: 440, seconds: 0.1, volume: 0.3 },
    { frequency: 311.13, seconds: 0.16, volume: 0.3 }
  ],
  champion: [
    { frequency: 523.25, seconds: 0.1, volume: 0.28 },
    { frequency: 659.25, seconds: 0.1, volume: 0.28 },
    { frequency: 783.99, seconds: 0.18, volume: 0.28 }
  ]
}

for (const [name, notes] of Object.entries(tones)) {
  const file = join(outDir, `${name}.wav`)
  writeFileSync(file, render(notes))
  console.log(file)
}
