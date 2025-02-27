const globals = require("../constants/global");
const updateSolPrice = async () => {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    const resData = await res.json();
    currentSolPrice = resData.solana?.usd;
    console.log("Current SOL Price: ", currentSolPrice);
  } catch (error) {
    console.error("Failed to fetch SOL price, retaining previous price:", error);
    // If there's an error, the currentSolPrice will remain untouched
    currentSolPrice = currentSolPrice;
  }

  setTimeout(updateSolPrice, 100000000);
};