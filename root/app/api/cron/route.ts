import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { FEEDS } from "../../../config/feeds";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  timeout: 5000,
});

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&auto=format&fit=crop";

// Scrapes the real og:image (falls back to twitter:image) from a source article page
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const html = await res.text();

    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let img = match[1].trim();
        if (img.startsWith("//")) img = "https:" + img;
        return img;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Fetch all RSS feeds in parallel
    const feedPromises = FEEDS.map((url) => parser.parseURL(url));
    const results = await Promise.allSettled(feedPromises);

    const rawItems: Array<{ title: string; link: string; snippet?: string }> = [];

    results.forEach((res) => {
      if (res.status === "fulfilled") {
        res.value.items.slice(0, 3).forEach((item) => {
          rawItems.push({
            title: item.title || "",
            link: item.link || "",
            snippet: item.contentSnippet || item.content || "",
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
    2. Output between 10 to 15 top articles total.
    3. For EACH article, generate:
       - "headline": Max 10 words.
       - "whyItMatters": One line, strictly 20 words or less, explaining the significance/impact of this story to an informed reader.
       - "brief": Short summary, strictly 50 words or less.
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

    // Enrich each article with a real scraped image from its source page
    const enrichedArticles = await Promise.all(
      parsedData.articles.map(async (article: any) => {
        const scrapedImage = await fetchOgImage(article.sourceUrl);
        return { ...article, imageUrl: scrapedImage || FALLBACK_IMAGE };
      })
    );
    parsedData.articles = enrichedArticles;

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
