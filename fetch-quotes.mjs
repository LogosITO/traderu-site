import { writeFile } from 'node:fs/promises';

const tickers = ['SBER', 'LKOH', 'GAZP', 'YDEX', 'NVTK', 'ROSN'];
const base = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities';
const fields = 'iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,SHORTNAME,LOTSIZE&marketdata.columns=SECID,LAST,MARKETPRICE,LCLOSEPRICE';

function row(table) {
  if (!table?.data?.length) return null;
  return Object.fromEntries(table.columns.map((column, index) => [column, table.data[0][index]]));
}

async function quote(ticker) {
  const response = await fetch(`${base}/${ticker}.json?${fields}`, { signal:AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${ticker}: HTTP ${response.status}`);
  const data = await response.json(), security = row(data.securities), market = row(data.marketdata);
  const price = market?.LAST ?? market?.MARKETPRICE ?? market?.LCLOSEPRICE;
  if (!security || !Number.isFinite(price) || price <= 0) return null;
  return { ticker, name:security.SHORTNAME || ticker, lotSize:security.LOTSIZE, price:Math.round(price * 100) };
}

const results = await Promise.allSettled(tickers.map(quote));
const quotes = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
if (quotes.length < 2) throw new Error(`MOEX returned only ${quotes.length} usable quotes`);
await writeFile(new URL('quotes.json', import.meta.url), `${JSON.stringify({ updatedAt:new Date().toISOString(), quotes }, null, 2)}\n`);
