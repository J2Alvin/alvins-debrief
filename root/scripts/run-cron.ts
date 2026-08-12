import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { FEEDS } from "../config/feeds";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  timeout: 5000,
});

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

async function runCron() {
  try {
    console.log("Fetching RSS feeds...");
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
            imageUrl: extractImageFromRssItem(item) || "",
          });
        });
      }
    });

    if (rawItems.length === 0) throw new Error("No articles fetched.");

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const prompt = `
    You are an executive news editor filtering news for Alvin's Debrief.
    Raw scraped articles: ${JSON.stringify(rawItems.slice(0, 15))}
    STRICT INSTRUCTIONS:
    1. Filter OUT clickbait, minor news, celebrity gossip, drama, or local fluff. Keep ONLY top stories.
    2. Output between 9 to 12 top articles total.
    3. For EACH article, generate:
       - "headline": Max 10 words.
       - "whyItMatters": One line, strictly 20 words or less.
       - "brief": Short summary, strictly 50 words or less.
       - "category": Choose strictly ONE from: "technology", "finance", "politics", "business", "sports", "health", "world", or "general".
       - "imageUrl": Keep exact "imageUrl" from input, leave empty if missing.
       - "sourceUrl": Exact original article link.
       - "dateLocation": Format strictly as "Date | Location/Source".
    4. Provide a "ticker" array of 5 ultra-short global breaking headlines.
    Return ONLY raw JSON with no markdown formatting:
    {
      "lastUpdated": "${new Date().toISOString()}",
      "ticker": ["Headline 1", "Headline 2"],
      "articles": [{ "headline": "...", "whyItMatters": "...", "brief": "...", "category": "...", "imageUrl": "...", "sourceUrl": "...", "dateLocation": "..." }]
    }`;

    console.log("Generating with Gemini...");
    const response = await model.generateContent(prompt);
    const cleanedText = response.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanedText);

    parsedData.articles = parsedData.articles.map((article: any) => {
      if (article.imageUrl && article.imageUrl.trim() !== "") return article;
      return { ...article, imageUrl: UNSPLASH_FALLBACKS[article.category] || UNSPLASH_FALLBACKS.general };
    });

    const filePath = path.join(process.cwd(), "data", "news.json");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), "utf-8");
    console.log(`Cron successfully updated ${parsedData.articles.articles?.length || parsedData.articles.length} articles.`);
  } catch (error) {
    console.error("Cron script error:", error);
    process.exit(1);
  }
}

runCron();
