export function parseMoney(value) {
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Введите сумму: например, 100 000');
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Бюджет должен быть больше нуля');
  return result;
}

export function parsePercent(value) {
  const result = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error('Комиссия должна быть от 0 до 1%');
  return Math.round(result * 100);
}

export function positionCost(item) {
  return item.entryPrice * item.lotSize * item.lots + item.commission;
}

export function positionMarket(item) {
  return item.currentPrice * item.lotSize * item.lots;
}

export function positionPnl(item) {
  return positionMarket(item) - positionCost(item);
}

export function totals(state) {
  const market = state.positions.reduce((sum, item) => sum + positionMarket(item), 0);
  const equity = state.cash + market;
  return { market, equity, pnl: equity - state.budget };
}

export const STRATEGIES = {
  balanced: 'Баланс — разные отрасли',
  liquid: 'Ликвидность — самые торгуемые',
  momentum: 'Импульс — лидеры дня'
};

export function selectStrategy(quotes, strategy, count = 8) {
  if (!STRATEGIES[strategy]) throw new Error('Неизвестная стратегия');
  const liquid = quotes.filter(quote => Number.isFinite(quote.liquidity) && quote.liquidity > 0);
  const byLiquidity = [...liquid].sort((a, b) => b.liquidity - a.liquidity);
  if (strategy === 'liquid') return byLiquidity.slice(0, count);
  if (strategy === 'momentum') return byLiquidity.slice(0, count * 2).sort((a, b) => (b.changeBps || 0) - (a.changeBps || 0)).slice(0, count);

  const sectors = new Map();
  for (const quote of byLiquidity) if (!sectors.has(quote.sector)) sectors.set(quote.sector, quote);
  const selected = [...sectors.values()].slice(0, count);
  return selected.concat(byLiquidity.filter(quote => !selected.includes(quote)).slice(0, count - selected.length));
}

export function buildPaperPortfolio(quotes, budget, commissionBps, now = new Date().toISOString()) {
  const usable = quotes.filter(quote => Number.isSafeInteger(quote.price) && quote.price > 0 && Number.isSafeInteger(quote.lotSize) && quote.lotSize > 0);
  if (usable.length < 2) throw new Error('Недостаточно котировок MOEX для портфеля');
  const target = Math.floor(budget / usable.length);
  const positions = usable.flatMap(quote => {
    const lotValue = quote.price * quote.lotSize;
    let lots = Math.floor(target / (lotValue * (1 + commissionBps / 10_000)));
    if (lots < 1) return [];
    let gross = lotValue * lots;
    let commission = Math.ceil(gross * commissionBps / 10_000);
    if (gross + commission > target) {
      lots -= 1; gross = lotValue * lots; commission = Math.ceil(gross * commissionBps / 10_000);
    }
    return lots > 0 ? [{ ...quote, lots, entryPrice: quote.price, currentPrice: quote.price, commission }] : [];
  });
  if (positions.length < 2) throw new Error('Бюджета мало для двух лотов выбранной корзины');
  const spent = positions.reduce((sum, item) => sum + positionCost(item), 0);
  if (!Number.isSafeInteger(spent) || spent > budget) throw new Error('Не удалось безопасно распределить бюджет');
  return { budget, commissionBps, createdAt: now, updatedAt: now, cash: budget - spent, positions };
}
