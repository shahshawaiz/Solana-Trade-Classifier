const fetch = require("node-fetch");

async function run() {
  const res = await fetch("https://solana-rpc.publicnode.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        "J3rx1yaEeQeD3XWkEDH9bXWbZ7XhTz2A8MvT8pC3J", // Random address ? I need a real one to test. Let's just test getBalance.
        { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
        { encoding: "jsonParsed" }
      ]
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
