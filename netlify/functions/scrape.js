// Netlify Serverless Function: Scrapes Shopee / TikTok Shop / Lazada / Affiliate short links
// Uses WhatsApp Social Crawler User-Agent so s.shopee.com.my returns full OpenGraph product metadata & images.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const targetUrl = event.queryStringParameters?.url;
  if (!targetUrl) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing ?url= parameter" })
    };
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "WhatsApp/2.24.1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-MY,en;q=0.9,ms;q=0.8"
      }
    });

    const html = await response.text();
    const parsed = parseProductMetadataFromHtml(html, targetUrl);

    if (parsed.image) {
      try {
        const imgRes = await fetch(parsed.image, {
          headers: { "User-Agent": "WhatsApp/2.24.1.0" }
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          parsed.imageDataUrl = `data:${contentType};base64,${base64}`;
        }
      } catch (_) {}
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Failed to scrape link" })
    };
  }
};

function decodeHtmlEntities(str) {
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

function getMetaContent(html, propName) {
  const regex1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propName}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
    "i"
  );
  const regex2 = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+(?:property|name)=["']${propName}["'][^>]*>`,
    "i"
  );
  const m = html.match(regex1) || html.match(regex2);
  return m ? decodeHtmlEntities(m[1]) : "";
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
    /actual color of the item/i.test(line) ||
    /contact us, we will provide/i.test(line)
  );
}

function parseProductMetadataFromHtml(html, url) {
  const ogTitle = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
  const ogDesc = getMetaContent(html, "og:description") || getMetaContent(html, "description");
  const ogImage = getMetaContent(html, "og:image") || getMetaContent(html, "og:square_image");

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = ogTitle || (titleMatch ? decodeHtmlEntities(titleMatch[1]) : "");

  const buySuffixMatch = ogDesc.match(/\s-\sBuy\s+([^\n\r]+)$/i);
  if (buySuffixMatch && buySuffixMatch[1]) {
    title = buySuffixMatch[1].trim();
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
