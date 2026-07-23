const REFRESH_MS = 60_000;

const fmtMoney = (n) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US");

const fmtTime = (epochSeconds) =>
  new Date(epochSeconds * 1000).toLocaleTimeString();

async function loadLots(force) {
  const url = "/api/lots" + (force ? "?refresh=1" : "");
  const res = await fetch(url);
  const data = await res.json();

  const staleBanner = document.getElementById("staleBanner");
  if (data.staleError) {
    staleBanner.hidden = false;
    staleBanner.textContent =
      "Couldn't reach the auction site just now (" + data.staleError +
      "). Showing the last successful data from " + fmtTime(data.fetchedAt) + ".";
  } else {
    staleBanner.hidden = true;
  }

  document.getElementById("lastUpdated").textContent =
    "Updated " + fmtTime(data.fetchedAt);

  document.getElementById("statTotal").textContent =
    fmtMoney(data.summary.totalCurrentBid);
  document.getElementById("statLotsWithBids").textContent =
    data.summary.lotsWithBids + " / " + data.summary.lotCount;
  document.getElementById("statBidCount").textContent =
    data.summary.totalBidCount;

  const tbody = document.getElementById("lotsBody");
  tbody.innerHTML = "";
  for (const lot of data.lots) {
    const tr = document.createElement("tr");

    const thumbTd = document.createElement("td");
    if (lot.thumbnail) {
      const img = document.createElement("img");
      img.src = lot.thumbnail;
      img.alt = "Lot " + lot.lot;
      img.className = "thumb";
      img.loading = "lazy";
      thumbTd.appendChild(img);
    }
    tr.appendChild(thumbTd);

    const numTd = document.createElement("td");
    numTd.className = "lot-num";
    numTd.textContent = lot.lot;
    tr.appendChild(numTd);

    const descTd = document.createElement("td");
    descTd.className = "desc";
    descTd.textContent = lot.title || "";
    tr.appendChild(descTd);

    const bidsTd = document.createElement("td");
    bidsTd.className = "num-bids";
    bidsTd.textContent = lot.numBids ?? "—";
    tr.appendChild(bidsTd);

    const priceTd = document.createElement("td");
    priceTd.className = "bid-amount";
    priceTd.textContent = fmtMoney(lot.currentBid);
    if (lot.reserveNotMet) {
      const badge = document.createElement("span");
      badge.className = "badge badge-nobid";
      badge.textContent = "no bid yet";
      priceTd.appendChild(badge);
    }
    tr.appendChild(priceTd);

    tbody.appendChild(tr);
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => loadLots(true));

loadLots(false);
setInterval(() => loadLots(false), REFRESH_MS);
