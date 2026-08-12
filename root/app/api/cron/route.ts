import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const parser = new Parser();

// 1. RSS Feeds for requested sources: Reuters, The Hindu, Mint, TOI, Economic Times, BBC, CNN, WSJ, The Wire
const FEEDS = [
  "https://www.reutersagency.com/feed/?best-topics=top-news",
  "https://www.thehindu.com/news/national/feeder/default.rss",
  "https://www.livemint.com/rss/news",
  "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
  "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
  "https://feeds.bbci.co.uk/news/rss.xml",
  "http://rss.cnn.com/rss/edition.rss",
  "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
  "https://thewire.in/rss",
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rawItems: Array<{ title: string; link: string; snippet?: string }> = [];

    for (const url of FEEDS) {
      try {
        const feed = await parser.parseURL(url);
        feed.items.slice(0, 3).forEach((item) => {
          rawItems.push({
            title: item.title || "",
            link: item.link || "",
            snippet: item.contentSnippet || item.content || "",
          });
        });
      } catch (err) {
        console.error(`Error fetching feed ${url}`);
      }
    }

    // Call cheapest Gemini model: gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    You are an executive news editor filtering news for Alvin's Debrief.
    
    Raw scraped articles:
    ${JSON.stringify(rawItems)}

    STRICT INSTRUCTIONS:
    1. Filter OUT clickbait, minor news, celebrity gossip, drama, or local fluff. Keep ONLY top stories and major relevant international/national news.
    2. Output between 9 to 12 top articles total.
    3. For EACH article, generate:
       - "headline": Max 10 words.
       - "brief": Short summary, strictly 50 words or less.
       - "imageUrl": Provide a relevant Unsplash news image link (e.g. "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop").
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
          "brief": "...",
          "imageUrl": "...",
          "sourceUrl": "...",
          "dateLocation": "..."
        }
      ]
    }`;

    const response = await model.generateContent(prompt);
    const cleanedText = response.response.text().replace(/```json|```/g, "").trim();
    const parsedData = JSON.parse(cleanedText);

    // Overwrite single JSON file
    const filePath = path.join(process.cwd(), "data", "news.json");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify(parsedData, null, 2), "utf-8");

    return new Response(JSON.stringify({ success: true, count: parsedData.articles.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
