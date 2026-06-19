async function run() {
  const res = await fetch("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        "7x2ZpMAsE4fpxpT4C9sSjJjLDEh1T2bEZZ6b4WJp8W7S",
        { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
        { encoding: "jsonParsed" }
      ]
    })
  });
  const text = await res.text();
  console.log(text);
}

run();
