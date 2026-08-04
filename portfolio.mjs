export function parseMoney(value) {
  const match = String(value).trim().replace(',', '.').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Введите сумму: например, 320,50');
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Сумма слишком большая');
  return result;
}

export function positionCost(item) {
  return item.buyPrice * item.lotSize * item.lots + item.commission;
}

export function positionMarket(item) {
  return item.currentPrice * item.lotSize * item.lots;
}

export function positionPnl(item) {
  return positionMarket(item) - positionCost(item);
}

export function totals(state) {
  const invested = state.positions.reduce((sum, item) => sum + positionCost(item), 0);
  const market = state.positions.reduce((sum, item) => sum + positionMarket(item), 0);
  return { invested, market, cash: state.initialCapital - invested, pnl: market - invested };
}
