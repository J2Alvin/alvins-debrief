import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { FEEDS } from "../config/feeds";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const parser = new Parser({
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

async function runCron() {
  try {
    console.log("Fetching RSS feeds...");
    const feedPromises = FEEDS.map((url) => parser.parseURL(url));
    const results = await Promise.allSettled(feedPromises);

    const rawItems: Array<{ title: string; link: string; snippet?: string }> = [];

    results.forEach((res) => {
      if (res.status === "fulfilled") {
        res.value.items.slice(0, 10).forEach((item) => {
          rawItems.push({
            title: item.title || "",
            link: item.link || "",
            snippet: item.contentSnippet || item.content || "",
          });
        });
      }
    });

    if (rawItems.length === 0) throw new Error("No articles fetched.");

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const prompt = `
    You are an executive news editor filtering news for Alvin's Debrief.
    Raw scraped articles: ${JSON.stringify(rawItems.slice(0, 50))}

    STRICT INSTRUCTIONS:
    1. Filter OUT clickbait, minor news, celebrity gossip, drama, or local fluff. Keep ONLY top stories.
    2. Output strictly between 15 to 20 articles total.
    3. **Category Constraint:** Keep **MAXIMUM 2** stories from each category ("technology", "finance", "politics", "business", "sports", "health", "world", "general"). Ensure a balanced spread across categories.
    4. For EACH article, generate:
       - "headline": Max 10 words.
       - "whyItMatters": One line, strictly 20 words or less.
       - "brief": Short summary, strictly 50 words or less.
       - "category": Choose strictly ONE from the allowed categories list.
       - "sourceUrl": Exact original article link.
       - "dateLocation": Format strictly as "Date | Location/Source".
    5. Provide a "ticker" array of 5 ultra-short global breaking headlines.

    Return ONLY raw JSON with no markdown formatting:
    {
      "lastUpdated": "${new Date().toISOString()}",
      "ticker": ["Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5"],
      "articles": [{ "headline": "...", "whyItMatters": "...", "brief": "...", "category": "...", "sourceUrl": "...", "dateLocation": "..." }]
    }`;

    console.log("Generating with Gemini...");
    const response = await model.generateContent(prompt);
    const cleanedText = response.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanedText);

    // Assign ONLY Unsplash images based on category
    parsedData.articles = parsedData.articles.map((article: any) => {
      const categoryKey = article.category?.toLowerCase() || "general";
      const assignedImage = UNSPLASH_FALLBACKS[categoryKey] || UNSPLASH_FALLBACKS.general;
      return { ...article, imageUrl: assignedImage };
    });

    const filePath = path.join(process.cwd(), "data", "news.json");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), "utf-8");
    console.log(`Cron successfully updated ${parsedData.articles.length} articles with Unsplash images.`);
  } catch (error) {
    console.error("Cron script error:", error);
    process.exit(1);
  }
}

runCron();
