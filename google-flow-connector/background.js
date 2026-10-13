// SpideyContent AI — Google Flow & Affiliate Shortlink Scraper Background Service Worker

const FLOW_URL = "https://labs.google/fx/tools/flow";

function installShopeeCrawlerRule() {
  if (!chrome.declarativeNetRequest) return;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [9001],
    addRules: [
      {
        id: 9001,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "User-Agent",
              operation: "set",
              value: "WhatsApp/2.24.1.0"
            }
          ]
        },
        condition: {
          urlFilter: "shopee",
          resourceTypes: ["xmlhttprequest", "other"]
        }
      }
    ]
  }).catch(() => {});
}

installShopeeCrawlerRule();
chrome.runtime.onInstalled.addListener(installShopeeCrawlerRule);

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function getMetaTag(html, name) {
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, "i");
  const r2 = new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const m = html.match(r1) || html.match(r2);
  return m ? decodeEntities(m[1]) : "";
}

function isBoilerplateLine(line) {
  return (
    /^[-=_*]{3,}$/.test(line) ||
    /^(features|specifications|product parameters|product packaging|description|note)\s*:?$/i.test(line) ||
    /welcome to/i.test(line) ||
    /fast shipping/i.test(line) ||
    /dropshipper|reseller/i.test(line) ||
    /satisfaction guaranteed/i.test(line) ||
    /follow our store/i.test(line) ||
    /manual measurement/i.test(line) ||
    /actual color/i.test(line) ||
    /provide a solution/i.test(line)
  );
}

function parseShopeeHtml(html, url) {
  const ogTitle = getMetaTag(html, "og:title") || getMetaTag(html, "twitter:title");
  const ogDesc = getMetaTag(html, "og:description") || getMetaTag(html, "description");
  const ogImage = getMetaTag(html, "og:image") || getMetaTag(html, "og:square_image");

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = ogTitle || (titleMatch ? decodeEntities(titleMatch[1]) : "");

  const buyMatch = ogDesc.match(/\s-\sBuy\s+([^\n\r]+)$/i);
  if (buyMatch && buyMatch[1]) {
    title = buyMatch[1].trim();
  }
  title = title
    .replace(/CablesLED/g, "Cables & LED")
    .replace(/\s*\|\s*Shopee.*$/i, "")
    .trim();

  const cleanDesc = ogDesc.replace(/\s-\sBuy\s+[^\n\r]+$/i, "").trim();
  const lines = cleanDesc
    .split(/\r?\n/)
    .map((l) => l.replace(/^[⚡•\-*]+\s*/, "").trim())
    .filter((l) => l.length > 4 && !isBoilerplateLine(l));

  const benefitSummary = lines.slice(0, 4).join(" • ");

  return {
    ok: Boolean(title || benefitSummary),
    url,
    title,
    description: cleanDesc,
    benefitSummary,
    bullets: lines.slice(0, 6),
    image: ogImage
  };
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "SPIDEY_FLOW_PING") {
    sendResponse({ connected: true, version: "1.1.0" });
    return true;
  }

  if (message.type === "SPIDEY_SCRAPE_URL") {
    const targetUrl = message.url;
    (async () => {
      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          redirect: "follow"
        });
        const html = await res.text();
        const parsed = parseShopeeHtml(html, targetUrl);

        if (parsed.image) {
          try {
            const imgRes = await fetch(parsed.image);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              parsed.imageDataUrl = await blobToDataUrl(blob);
            }
          } catch (_) {}
        }
        sendResponse(parsed);
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "SPIDEY_FLOW_SEND") {
    const payload = message.payload || {};

    chrome.storage.local.set(
      {
        spideyFlowPayload: {
          ...payload,
          timestamp: Date.now()
        }
      },
      () => {
        chrome.tabs.query({ url: "https://labs.google/*" }, (tabs) => {
          const flowTab = tabs.find((t) => t.url && t.url.includes("/flow")) || tabs[0];

          if (flowTab && flowTab.id) {
            chrome.tabs.update(flowTab.id, { active: true }, () => {
              if (flowTab.windowId) {
                chrome.windows.update(flowTab.windowId, { focused: true });
              }
              setTimeout(() => {
                chrome.tabs
                  .sendMessage(flowTab.id, {
                    type: "SPIDEY_INJECT_PROMPT",
                    payload
                  })
                  .catch(() => {});
              }, 400);
            });
            sendResponse({ ok: true, status: "Focused existing Google Flow tab and injected prompt" });
          } else {
            chrome.tabs.create({ url: FLOW_URL, active: true }, (newTab) => {
              sendResponse({
                ok: true,
                status: "Opened Google Flow and queued prompt injection",
                tabId: newTab.id
              });
            });
          }
        });
      }
    );

    return true;
  }
});
