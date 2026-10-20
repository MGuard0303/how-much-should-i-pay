import { describe, expect, it } from 'vitest'
import {
  applyTransfers,
  calculateSettlement,
  CURRENCIES,
  formatAmount,
  parseAmount,
  type CurrencyCode,
  type Member,
} from '../src/lib/settlement'

function members(paid: number[]): Member[] {
  return paid.map((amount, index) => ({ id: String(index), name: `User ${index + 1}`, paid: amount }))
}

describe('calculateSettlement', () => {
  it('settles the five-person example in input order', () => {
    const result = calculateSettlement(members([120, 60, 0, 20, 50]))
    expect(result.total).toBe(250)
    expect(result.baseShare).toBe(50)
    expect(result.remainder).toBe(0)
    expect(result.amountToSettle).toBe(80)
    expect(result.members.map((member) => member.balance)).toEqual([70, 10, -50, -30, 0])
    expect(result.transfers).toEqual([
      { fromId: '2', toId: '0', amount: 50 },
      { fromId: '3', toId: '0', amount: 20 },
      { fromId: '3', toId: '1', amount: 10 },
    ])
  })

  it('handles one person paying the full cost', () => {
    const result = calculateSettlement(members([300, 0, 0]))
    expect(result.transfers).toEqual([
      { fromId: '1', toId: '0', amount: 100 },
      { fromId: '2', toId: '0', amount: 100 },
    ])
    expect(applyTransfers(result, 2)).toEqual([100, 100, 100])
  })

  it.each([[100, 100, 100], [0, 0, 0]])('needs no transfers for %j', (...paid) => {
    const result = calculateSettlement(members(paid))
    expect(result.transfers).toEqual([])
    expect(result.amountToSettle).toBe(0)
    expect(result.members.every((member) => member.balance === 0)).toBe(true)
  })

  it('assigns indivisible whole yen to the first members', () => {
    const result = calculateSettlement(members([1000, 0, 0]))
    expect(result.baseShare).toBe(333)
    expect(result.remainder).toBe(1)
    expect(result.members.map((member) => member.share)).toEqual([334, 333, 333])
    expect(result.transfers.map((transfer) => transfer.amount)).toEqual([333, 333])
  })

  it('preserves decimal currency precision by settling integer cents', () => {
    const result = calculateSettlement(
      members(['0.10', '0.20', '0.00'].map((amount) => parseAmount(amount, 'USD'))),
    )
    expect(result.total).toBe(30)
    expect(result.transfers).toEqual([{ fromId: '2', toId: '1', amount: 10 }])
    expect(applyTransfers(result, 1)).toEqual([10, 10, 10])
  })

  it('handles a zero base share without introducing a zero-value transfer', () => {
    const result = calculateSettlement(members([0, 0, 1]))
    expect(result.members.map((member) => member.share)).toEqual([1, 0, 0])
    expect(result.transfers).toEqual([{ fromId: '0', toId: '2', amount: 1 }])
  })

  it('calculates quotient and remainder exactly at the safe-number boundary', () => {
    const paid = [Number.MAX_SAFE_INTEGER, 0, 0, 0, 0, 0, 0]
    const result = calculateSettlement(members(paid))
    const total = BigInt(Number.MAX_SAFE_INTEGER)
    expect(result.baseShare).toBe(Number(total / 7n))
    expect(result.remainder).toBe(Number(total % 7n))
    expect(result.members.reduce((sum, member) => sum + BigInt(member.share), 0n)).toBe(total)
    expect(applyTransfers(result, result.transfers.length)).toEqual(
      result.members.map((member) => member.share),
    )
  })

  it('keeps input records unchanged and accepts empty or duplicate display names', () => {
    const input = members([10, 20, 30]).map((member) => ({ ...member, name: '' }))
    const snapshot = structuredClone(input)
    calculateSettlement(input)
    expect(input).toEqual(snapshot)
  })

  it('rejects fewer than three people and ambiguous IDs', () => {
    expect(() => calculateSettlement(members([0, 0]))).toThrow(/at least three/)
    expect(() => calculateSettlement(members([0, 0, 0]).map((member) => ({ ...member, id: '' })))).toThrow(/nonempty/)
    expect(() => calculateSettlement(members([0, 0, 0]).map((member) => ({ ...member, id: ' ' })))).toThrow(/nonempty/)
    expect(() => calculateSettlement(members([0, 0, 0]).map((member) => ({ ...member, id: 'same' })))).toThrow(/unique/)
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid paid amount %s', (amount) => {
    expect(() => calculateSettlement(members([amount, 0, 0]))).toThrow(/nonnegative safe integers/)
  })

  it('rejects a total that exceeds the supported limit', () => {
    expect(() => calculateSettlement(members([Number.MAX_SAFE_INTEGER, 1, 0]))).toThrow(/total exceeds/)
  })

  it('conserves money, settles every balance, and preserves direction and order across generated cases', () => {
    let seed = 0x12345678
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }

    for (let trial = 0; trial < 500; trial += 1) {
      const size = 3 + Math.floor(random() * 48)
      const input = members(Array.from({ length: size }, () => Math.floor(random() * 100_000)))
      const result = calculateSettlement(input)
      const balanceById = new Map(result.members.map((member) => [member.id, member.balance]))
      const total = input.reduce((sum, member) => sum + member.paid, 0)

      expect(result).toEqual(calculateSettlement(input))
      expect(result.total).toBe(total)
      expect(result.members.reduce((sum, member) => sum + member.share, 0)).toBe(total)
      expect(result.members.reduce((sum, member) => sum + member.balance, 0)).toBe(0)
      expect(result.transfers.length).toBeLessThanOrEqual(size - 1)
      expect(result.transfers.reduce((sum, transfer) => sum + transfer.amount, 0)).toBe(result.amountToSettle)

      let previousPayer = -1
      let previousRecipient = -1
      for (const transfer of result.transfers) {
        expect(transfer.amount).toBeGreaterThan(0)
        expect(Number.isSafeInteger(transfer.amount)).toBe(true)
        expect(balanceById.get(transfer.fromId)).toBeLessThan(0)
        expect(balanceById.get(transfer.toId)).toBeGreaterThan(0)
        expect(Number(transfer.fromId)).toBeGreaterThanOrEqual(previousPayer)
        expect(Number(transfer.toId)).toBeGreaterThanOrEqual(previousRecipient)
        previousPayer = Number(transfer.fromId)
        previousRecipient = Number(transfer.toId)
      }

      for (let count = 0; count <= result.transfers.length; count += 1) {
        const effective = applyTransfers(result, count)
        expect(effective.reduce((sum, paid) => sum + paid, 0)).toBe(total)
        expect(effective.every((paid) => paid >= 0 && Number.isSafeInteger(paid))).toBe(true)
      }
      expect(applyTransfers(result, result.transfers.length)).toEqual(result.members.map((member) => member.share))
    }
  })
})

describe('parseAmount', () => {
  it('parses whole yen, leading zeros, blank input, and surrounding whitespace', () => {
    expect(parseAmount('001200', 'JPY')).toBe(1200)
    expect(parseAmount(' 42 ', 'JPY')).toBe(42)
    expect(parseAmount('', 'JPY')).toBe(0)
    expect(parseAmount('   ', 'JPY')).toBe(0)
  })

  it.each(['USD', 'EUR', 'GBP', 'CNY'] as CurrencyCode[])('parses exact minor units for %s', (currency) => {
    expect(parseAmount('0001.05', currency)).toBe(105)
    expect(parseAmount('1.5', currency)).toBe(150)
    expect(parseAmount('1', currency)).toBe(100)
    expect(parseAmount('0.29', currency)).toBe(29)
  })

  it.each(['-1', '+1', '1e3', '1,000', '1 000', '1,50', '.5', '1.', 'NaN', 'Infinity', 'hello'])('rejects non-plain input %s', (input) => {
    expect(() => parseAmount(input, 'USD')).toThrow()
  })

  it('rejects excessive decimal precision and all fractional JPY input', () => {
    expect(() => parseAmount('1.001', 'USD')).toThrow(/at most 2/)
    expect(() => parseAmount('1.000', 'USD')).toThrow(/at most 2/)
    expect(() => parseAmount('1.0', 'JPY')).toThrow(/whole yen/)
    expect(() => parseAmount('1.1', 'JPY')).toThrow(/whole yen/)
  })

  it('accepts the exact safe limit and rejects one unit beyond it', () => {
    expect(parseAmount('9007199254740991', 'JPY')).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseAmount('90071992547409.91', 'USD')).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => parseAmount('9007199254740992', 'JPY')).toThrow(/limit/)
    expect(() => parseAmount('90071992547409.92', 'USD')).toThrow(/limit/)
  })
})

describe('formatAmount', () => {
  it('uses English currency formatting with the correct decimal precision', () => {
    expect(formatAmount(1200, 'JPY')).toBe('¥1,200')
    expect(formatAmount(123456, 'USD')).toBe('$1,234.56')
    expect(formatAmount(123456, 'EUR')).toBe('€1,234.56')
    expect(formatAmount(123456, 'GBP')).toBe('£1,234.56')
    expect(formatAmount(123456, 'CNY')).toBe('CN¥1,234.56')
    expect(CURRENCIES.JPY.fractionDigits).toBe(0)
  })

  it('keeps signs on sub-unit negative balances and preserves the final cent at large values', () => {
    expect(formatAmount(-5, 'USD')).toBe('-$0.05')
    expect(formatAmount(-105, 'USD')).toBe('-$1.05')
    expect(formatAmount(-1, 'JPY')).toBe('-¥1')
    expect(formatAmount(Number.MAX_SAFE_INTEGER, 'USD')).toBe('$90,071,992,547,409.91')
    expect(formatAmount(-Number.MAX_SAFE_INTEGER, 'USD')).toBe('-$90,071,992,547,409.91')
  })

  it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid minor units %s', (amount) => {
    expect(() => formatAmount(amount, 'USD')).toThrow(/safe integers/)
  })
})

describe('applyTransfers', () => {
  it('replays prefixes as effective contributions without mutating the settlement', () => {
    const result = calculateSettlement(members([120, 60, 0, 20, 50]))
    const snapshot = structuredClone(result)
    expect(applyTransfers(result, 0)).toEqual([120, 60, 0, 20, 50])
    expect(applyTransfers(result, 1)).toEqual([70, 60, 50, 20, 50])
    expect(applyTransfers(result, 2)).toEqual([50, 60, 50, 40, 50])
    expect(applyTransfers(result, 3)).toEqual([50, 50, 50, 50, 50])
    expect(applyTransfers(result, -1)).toEqual([120, 60, 0, 20, 50])
    expect(applyTransfers(result, 99)).toEqual([50, 50, 50, 50, 50])
    expect(result).toEqual(snapshot)
  })

  it.each([0.5, NaN, Infinity])('rejects an invalid prefix count %s', (count) => {
    expect(() => applyTransfers(calculateSettlement(members([10, 0, 0])), count)).toThrow(/safe integer/)
  })
})
