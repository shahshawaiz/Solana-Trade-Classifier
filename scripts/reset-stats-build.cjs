const fs = require('fs');
const path = require('path');

// IMPORTANT: This build-time reset zeroes the daemons' live PnL counters and their
// capped (25-entry) tradesHistory ONLY. It deliberately DOES NOT touch
// trade_journal.json — the permanent, append-only trade journal is the immutable
// record of real trade history and must NEVER be reset/overwritten by any process
// (build, deploy, manual reset, or circuit breaker). Do not add it here.

const jupiterPath = path.join(__dirname, '../jupiter_config_state.json');
const telegramPath = path.join(__dirname, '../telegram_alert_v1_state.json');

function resetJupiter() {
  if (fs.existsSync(jupiterPath)) {
    try {
      const raw = fs.readFileSync(jupiterPath, 'utf8');
      const data = JSON.parse(raw);
      
      data.lastTradeAddedAt = "";
      data.lastTradePnL = 0;
      data.cumulativePnL = 0;
      data.activeTrade = null;
      data.tradesHistory = [];
      data.consecutiveLosses = 0;
      
      fs.writeFileSync(jupiterPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('jupiter_config_state.json stats successfully reset.');
    } catch (err) {
      console.error('Error resetting jupiter_config_state.json:', err);
    }
  } else {
    console.log('jupiter_config_state.json not found, skipping reset.');
  }
}

function resetTelegram() {
  if (fs.existsSync(telegramPath)) {
    try {
      const raw = fs.readFileSync(telegramPath, 'utf8');
      const data = JSON.parse(raw);
      
      data.lastTradeAddedAt = "";
      data.lastTradePnL = 0;
      data.cumulativePnL = 0;
      data.activeTrade = null;
      data.tradesHistory = [];
      data.auditLogs = [];
      
      fs.writeFileSync(telegramPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('telegram_alert_v1_state.json stats successfully reset.');
    } catch (err) {
      console.error('Error resetting telegram_alert_v1_state.json:', err);
    }
  } else {
    console.log('telegram_alert_v1_state.json not found, skipping reset.');
  }
}

console.log('Running build-time stats reset...');
resetJupiter();
resetTelegram();
console.log('Build-time stats reset complete.');
