import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { FEEDS } from "../../../config/feeds";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// 1. Configure parser to grab images embedded directly in the RSS XML (Instant & Free)
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  timeout: 5000,
});

// Curated Unsplash images mapped by article category
const UNSPLASH_FALLBACKS: Record<string, string> = {
  technology: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80&auto=format&fit=crop",
  finance: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80&auto=format&fit=crop",
  politics: "https://images.unsplash.com/photo-1524222835728-09191e3e7fde?w=800&q=80&auto=format&fit=crop",
  business: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80&auto=format&fit=crop",
  sports: "https://images.unsplash.com/photo-1461896836934-ffe145ab64f1?w=800&q=80&auto=format&fit=crop",
  health: "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=800&q=80&auto=format&fit=crop",
  world: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80&auto=format&fit=crop",
  general: "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&q=80&auto=format&fit=crop",
};

// Extracts images instantly from RSS structure without external fetching
function extractImageFromRssItem(item: any): string | null {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item.mediaContent) {
    const media = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
    if (media?.$?.url) return media.$.url;
  }
  if (item.mediaThumbnail) {
    const thumb = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
    if (thumb?.$?.url) return thumb.$.url;
  }
  const htmlContent = item["content:encoded"] || item.content || item.contentSnippet || "";
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) return imgMatch[1];
  return null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const feedPromises = FEEDS.map((url) => parser.parseURL(url));
    const results = await Promise.allSettled(feedPromises);

    const rawItems: Array<{ title: string; link: string; snippet?: string; imageUrl?: string }> = [];

    results.forEach((res) => {
      if (res.status === "fulfilled") {
        res.value.items.slice(0, 3).forEach((item) => {
          rawItems.push({
            title: item.title || "",
            link: item.link || "",
            snippet: item.contentSnippet || item.content || "",
            imageUrl: extractImageFromRssItem(item) || "", // Grab XML image instantly
          });
        });
      }
    });

    if (rawItems.length === 0) {
      throw new Error("Failed to fetch articles from all RSS sources.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = `
    You are an executive news editor filtering news for Alvin's Debrief.
    
    Raw scraped articles:
    ${JSON.stringify(rawItems)}

    STRICT INSTRUCTIONS:
    1. Filter OUT clickbait, minor news, celebrity gossip, drama, or local fluff. Keep ONLY top stories and major relevant international/national news.
    2. Output between 9 to 12 top articles total.
    3. For EACH article, generate:
       - "headline": Max 10 words.
       - "whyItMatters": One line, strictly 20 words or less, explaining the significance/impact of this story to an informed reader.
       - "brief": Short summary, strictly 50 words or less.
       - "category": Choose strictly ONE from: "technology", "finance", "politics", "business", "sports", "health", "world", or "general".
       - "imageUrl": Keep the exact "imageUrl" provided in the input raw item. Leave empty if missing.
       - "sourceUrl": Exact original article link provided in input.
       - "dateLocation": Format strictly as "Date | Location/Source" (e.g., "12 Aug 2026 | New Delhi (The Hindu)").

    4. Also provide a "ticker" array of 5 ultra-short global breaking headlines for the marquee header.

    Return ONLY raw JSON with no markdown formatting or triple backticks:
    {
      "lastUpdated": "${new Date().toISOString()}",
      "ticker": ["Headline 1", "Headline 2", "Headline 3"],
      "articles": [
        {
          "headline": "...",
          "whyItMatters": "...",
          "brief": "...",
          "category": "...",
          "imageUrl": "...",
          "sourceUrl": "...",
          "dateLocation": "..."
        }
      ]
    }`;

    const response = await model.generateContent(prompt);
    const rawText = response.response.text();
    const cleanedText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsedData = JSON.parse(cleanedText);

    // Map missing images instantly using the Gemini-assigned category
    parsedData.articles = parsedData.articles.map((article: any) => {
      if (article.imageUrl && article.imageUrl.trim() !== "") {
        return article; // Keep original RSS image
      }
      
      const fallbackUrl = UNSPLASH_FALLBACKS[article.category] || UNSPLASH_FALLBACKS.general;
      return { ...article, imageUrl: fallbackUrl };
    });
    
    const filePath = path.join(process.cwd(), "data", "news.json");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), "utf-8");

    return new Response(
      JSON.stringify({ success: true, count: parsedData.articles.length }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Cron Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
