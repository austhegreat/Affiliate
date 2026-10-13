// SpideyContent AI — Studio Page Bridge Content Script
// Announces extension presence to the SpideyContent AI web app and relays commands to the background worker.

function announceConnector() {
  window.postMessage(
    {
      source: "SPIDEY_FLOW_EXTENSION",
      type: "CONNECTOR_READY",
      version: "1.1.0"
    },
    "*"
  );
}

announceConnector();
setTimeout(announceConnector, 500);
setTimeout(announceConnector, 1500);

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.source !== "SPIDEY_STUDIO_APP") {
    return;
  }

  const { action, payload, url, requestId } = event.data;

  if (action === "PING_CONNECTOR") {
    announceConnector();
  } else if (action === "SCRAPE_AFFILIATE_URL") {
    chrome.runtime.sendMessage(
      {
        type: "SPIDEY_SCRAPE_URL",
        url
      },
      (response) => {
        window.postMessage(
          {
            source: "SPIDEY_FLOW_EXTENSION",
            type: "SCRAPE_RESULT",
            requestId,
            data: response || { ok: false }
          },
          "*"
        );
      }
    );
  } else if (action === "SEND_TO_GOOGLE_FLOW") {
    chrome.runtime.sendMessage(
      {
        type: "SPIDEY_FLOW_SEND",
        payload
      },
      (response) => {
        window.postMessage(
          {
            source: "SPIDEY_FLOW_EXTENSION",
            type: "FLOW_DISPATCHED",
            response: response || { ok: true }
          },
          "*"
        );
      }
    );
  }
});
