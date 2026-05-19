import yahooFinance from 'yahoo-finance2';
const yf = new (yahooFinance as any)();
yf.chart('AAPL').then(x=>console.log(x.meta.symbol)).catch(console.error);
