export type CurrencyCode = 'JPY' | 'USD' | 'EUR' | 'GBP' | 'CNY'

interface Currency {
  code: CurrencyCode
  label: string
  symbol: string
  fractionDigits: number
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  JPY: { code: 'JPY', label: 'Japanese yen', symbol: '¥', fractionDigits: 0 },
  USD: { code: 'USD', label: 'US dollar', symbol: '$', fractionDigits: 2 },
  EUR: { code: 'EUR', label: 'Euro', symbol: '€', fractionDigits: 2 },
  GBP: { code: 'GBP', label: 'British pound', symbol: '£', fractionDigits: 2 },
  CNY: { code: 'CNY', label: 'Chinese yuan', symbol: '¥', fractionDigits: 2 },
}

/** All monetary values are integers in the currency's smallest supported unit. */
export interface Member {
  id: string
  name: string
  paid: number
}

export interface Transfer {
  fromId: string
  toId: string
  amount: number
}

export interface MemberBalance extends Member {
  share: number
  balance: number
}

export interface Settlement {
  members: MemberBalance[]
  transfers: Transfer[]
  total: number
  remainder: number
  baseShare: number
  amountToSettle: number
}

const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER)

function getCurrency(currency: CurrencyCode): Currency {
  const definition = CURRENCIES[currency]
  if (!definition) {
    throw new Error('Choose a supported currency.')
  }
  return definition
}

/**
 * Split the total exactly and settle debtors against creditors in input order.
 * The first remainder members cover one additional minor unit. Each transfer
 * finishes at least one balance, keeping time and space O(n) and transfers <= n - 1.
 */
export function calculateSettlement(members: readonly Member[]): Settlement {
  if (members.length < 3) {
    throw new Error('Add at least three members.')
  }

  const ids = new Set<string>()
  let exactTotal = 0n

  for (const member of members) {
    if (typeof member.id !== 'string' || member.id.trim().length === 0) {
      throw new Error('Every member needs a nonempty ID.')
    }
    if (ids.has(member.id)) {
      throw new Error('Member IDs must be unique.')
    }
    if (typeof member.name !== 'string') {
      throw new Error('Member names must be text.')
    }
    if (!Number.isSafeInteger(member.paid) || member.paid < 0) {
      throw new Error('Paid amounts must be nonnegative safe integers.')
    }
    ids.add(member.id)
    exactTotal += BigInt(member.paid)
    if (exactTotal > MAX_SAFE_AMOUNT) {
      throw new Error('The total exceeds the supported amount limit.')
    }
  }

  // BigInt division avoids a rounded quotient at the safe-number boundary.
  const count = BigInt(members.length)
  const baseShare = Number(exactTotal / count)
  const remainder = Number(exactTotal % count)
  const balances = members.map((member, index) => {
    const share = baseShare + (index < remainder ? 1 : 0)
    return { ...member, share, balance: member.paid - share }
  })

  const debtors: { id: string; remaining: number }[] = []
  const creditors: { id: string; remaining: number }[] = []
  let amountToSettle = 0

  for (const member of balances) {
    if (member.balance < 0) {
      debtors.push({ id: member.id, remaining: -member.balance })
      amountToSettle -= member.balance
    } else if (member.balance > 0) {
      creditors.push({ id: member.id, remaining: member.balance })
    }
  }

  const transfers: Transfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!
    const creditor = creditors[creditorIndex]!
    const amount = Math.min(debtor.remaining, creditor.remaining)
    transfers.push({ fromId: debtor.id, toId: creditor.id, amount })
    debtor.remaining -= amount
    creditor.remaining -= amount

    if (debtor.remaining === 0) debtorIndex += 1
    if (creditor.remaining === 0) creditorIndex += 1
  }

  return {
    members: balances,
    transfers,
    total: Number(exactTotal),
    remainder,
    baseShare,
    amountToSettle,
  }
}

/**
 * Parse plain decimal input directly into integer minor units without floats.
 * JPY accepts whole yen only; other currencies accept at most two decimals.
 */
export function parseAmount(value: string, currency: CurrencyCode): number {
  const { fractionDigits } = getCurrency(currency)
  const input = value.trim()
  if (input === '') return 0
  if (!/^\d+(?:\.\d+)?$/.test(input)) {
    throw new Error('Enter a nonnegative amount using digits and a decimal point only.')
  }

  const [whole = '0', fractional = ''] = input.split('.')
  if (fractional.length > fractionDigits) {
    throw new Error(
      fractionDigits === 0
        ? 'JPY amounts must use whole yen.'
        : `Use at most ${fractionDigits} decimal places.`,
    )
  }

  const units = BigInt(whole + fractional.padEnd(fractionDigits, '0'))
  if (units > MAX_SAFE_AMOUNT) {
    throw new Error('This amount exceeds the supported amount limit.')
  }
  return Number(units)
}

/**
 * Format exact minor units with English currency conventions, including debts.
 * Format the integer part with Intl and insert the exact fraction separately so
 * large valid amounts retain their final cent instead of rounding through a float.
 */
export function formatAmount(amount: number, currency: CurrencyCode): string {
  const { fractionDigits } = getCurrency(currency)
  if (!Number.isSafeInteger(amount)) {
    throw new Error('Amounts must be safe integers in minor units.')
  }

  const exactAmount = BigInt(amount)
  const divisor = 10n ** BigInt(fractionDigits)
  const absolute = exactAmount < 0n ? -exactAmount : exactAmount
  const whole = absolute / divisor
  const fraction = (absolute % divisor).toString().padStart(fractionDigits, '0')
  const signedWhole = amount < 0 ? (whole === 0n ? -0 : -whole) : whole

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .formatToParts(signedWhole)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('')
}

/**
 * Return effective contributions after a prefix of the proposed transfers.
 * A payer contributes more and a recipient recovers their advance. This leaves
 * original inputs untouched and makes the final contributions equal each share.
 */
export function applyTransfers(settlement: Settlement, completedCount: number): number[] {
  if (!Number.isSafeInteger(completedCount)) {
    throw new Error('The completed transfer count must be a safe integer.')
  }

  const count = Math.max(0, Math.min(completedCount, settlement.transfers.length))
  const paid = settlement.members.map((member) => member.paid)
  const indexById = new Map(settlement.members.map((member, index) => [member.id, index]))

  for (let index = 0; index < count; index += 1) {
    const transfer = settlement.transfers[index]!
    const payer = indexById.get(transfer.fromId)
    const recipient = indexById.get(transfer.toId)
    if (payer === undefined || recipient === undefined) {
      throw new Error('A transfer references an unknown member.')
    }
    paid[payer] = paid[payer]! + transfer.amount
    paid[recipient] = paid[recipient]! - transfer.amount
  }

  return paid
}
