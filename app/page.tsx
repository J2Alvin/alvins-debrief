import fs from "fs";
import path from "path";
import Marquee from "react-fast-marquee";

interface Article {
  headline: string;
  whyItMatters: string;
  brief: string;
  imageUrl: string;
  sourceUrl: string;
  dateLocation: string;
}

interface NewsData {
  lastUpdated: string;
  ticker: string[];
  articles: Article[];
}

function getNews(): NewsData {
  const filePath = path.join(process.cwd(), "data", "news.json");
  if (!fs.existsSync(filePath)) {
    return {
      lastUpdated: new Date().toISOString(),
      ticker: ["ALVIN'S DEBRIEF IS INITIALIZING... RUN API TRIGGER TO POPULATE."],
      articles: [],
    };
  }
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(fileContent);
}

export const revalidate = 0; // Dynamic server rendering

export default function Home() {
  const news = getNews();
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-screen font-body bg-[#F9F9F7] text-[#111111] flex flex-col selection:bg-[#CC0000] selection:text-white">
      {/* 3. Scrolling Wire-Ticker Header */}
      <div className="bg-[#111111] text-[#F9F9F7] py-2 border-b border-[#111111] overflow-hidden">
        <Marquee speed={40} gradient={false} className="font-mono text-xs uppercase tracking-widest">
          {news.ticker && news.ticker.length > 0 ? (
            news.ticker.map((item, idx) => (
              <span key={idx} className="flex items-center">
                <span className="mx-4 text-[#CC0000]">✦</span>
                <span>{item}</span>
              </span>
            ))
          ) : (
            <span className="mx-4">DAILY DEBRIEF ✦ ALL THE NEWS THAT'S FIT TO PRINT</span>
          )}
        </Marquee>
      </div>

      {/* Header Container */}
      <header className="border-b-4 border-[#111111] px-4 py-8 max-w-screen-xl mx-auto w-full relative">
        {/* 5. Date Counter Top Right */}
        <div className="md:absolute md:top-8 md:right-4 mb-4 md:mb-0 font-mono text-xs uppercase tracking-widest text-[#111111] border border-[#111111] px-3 py-1 inline-block bg-[#F9F9F7]">
          {currentDate}
        </div>

        {/* 6. Website Name Top Center */}
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-neutral-600 mb-2">
            DAILY EXECUTIVE SUMMARY
          </p>
          <h1 className="text-5xl sm:text-7xl lg:text-9xl font-serif font-black uppercase tracking-tighter leading-[0.88] my-0">
            Alvin's Debrief
          </h1>
          <div className="flex items-center justify-between border-t border-b border-[#111111] py-1 mt-6 font-mono text-[10px] sm:text-xs uppercase tracking-widest">
            <span>REFRESH: 00:00 MIDNIGHT</span>
            <span>EDITION: VOL 1.0</span>
            <span>SELF-HOSTED</span>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-screen-xl mx-auto w-full px-4 py-8 flex-grow">
        {news.articles.length === 0 ? (
          <div className="text-center py-24 border border-[#111111]">
            <h2 className="font-serif text-2xl">No stories currently loaded.</h2>
            <p className="font-mono text-xs mt-2 text-neutral-600">
              Trigger /api/cron to fetch today's debrief.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {news.articles.map((item, index) => (
              <a
                key={index}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#111111] bg-[#F9F9F7] p-5 flex flex-col hard-shadow-hover group h-full no-underline text-[#111111]"
              >
                {/* 2. One Image */}
                <div className="w-full aspect-[16/9] bg-neutral-200 border border-[#111111] mb-4 overflow-hidden relative">
                  <img
                    src={item.imageUrl}
                    alt={item.headline}
                    className="w-full h-full object-cover grayscale group-hover:sepia-[40%] transition-all duration-300"
                  />
                </div>

                {/* Headline (<=10 words) */}
                <h2 className="font-serif font-bold text-2xl leading-tight mb-2 group-hover:text-[#CC0000] transition-colors">
                  {item.headline}
                </h2>

                {/* Short Brief (<=50 words) */}
                <p className="font-body text-sm leading-relaxed mb-2 text-neutral-800">
                  {item.brief}
                </p>

                {/* Why It Matters (<=20 words) */}
                <p className="font-body text-xs italic text-[#CC0000] mb-6 flex-grow">
                  {item.whyItMatters}
                </p>

                {/* End with Date/Location of Source */}
                <div className="mt-auto pt-3 border-t border-[#111111] font-mono text-[11px] uppercase tracking-wider text-neutral-600 flex justify-between items-center">
                  <span>{item.dateLocation}</span>
                  <span className="font-bold text-[#CC0000] opacity-0 group-hover:opacity-100 transition-opacity">
                    READ →
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-[#111111] py-6 px-4 mt-12 bg-[#F9F9F7]">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row justify-between items-center font-mono text-xs uppercase tracking-widest gap-4">
          <div>ALVIN'S DEBRIEF © {new Date().getFullYear()}</div>
          <div>POWERED BY GEMINI 1.5 FLASH</div>
        </div>
      </footer>
    </div>
  );
}
