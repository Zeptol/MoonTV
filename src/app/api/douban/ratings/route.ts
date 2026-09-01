/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

export const runtime = 'edge';

const REQUEST_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

function normalizeRating(value: unknown): string | null {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0 || score > 10) return null;
  return score.toFixed(1);
}

function ratingFromJson(data: any): string | null {
  return (
    normalizeRating(data?.rating?.value) ||
    normalizeRating(data?.rating?.average) ||
    normalizeRating(data?.rating_info?.value) ||
    normalizeRating(data?.rating_info?.average) ||
    null
  );
}

async function fetchWithTimeout(
  url: string,
  referer: string,
  responseType: 'json' | 'text'
): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        ...REQUEST_HEADERS,
        Referer: referer,
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return responseType === 'json' ? await response.json() : await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDoubanRating(id: string): Promise<string | null> {
  const mobileReferer = `https://m.douban.com/movie/subject/${id}/`;

  // 豆瓣移动端内部接口。电影、电视剧分别尝试，最后再走通用 subject 接口。
  const jsonUrls = [
    `https://m.douban.com/rexxar/api/v2/movie/${id}?for_mobile=1`,
    `https://m.douban.com/rexxar/api/v2/tv/${id}?for_mobile=1`,
    `https://m.douban.com/rexxar/api/v2/subject/${id}?for_mobile=1`,
  ];

  for (const url of jsonUrls) {
    const data = await fetchWithTimeout(url, mobileReferer, 'json');
    const rating = ratingFromJson(data);
    if (rating) return rating;
  }

  // Rexxar 不可用时，从用户点击的同一个豆瓣条目页中读取评分。
  const html = (await fetchWithTimeout(
    `https://movie.douban.com/subject/${id}/`,
    'https://movie.douban.com/',
    'text'
  )) as string | null;

  if (!html) return null;

  const match =
    html.match(/property=["']v:average["'][^>]*>\s*([0-9.]+)\s*</i) ||
    html.match(/class=["'][^"']*rating_num[^"']*["'][^>]*>\s*([0-9.]+)\s*</i);

  return normalizeRating(match?.[1]);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get('ids') || '';

  const ids = Array.from(
    new Set(
      rawIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
    )
  ).slice(0, 30);

  if (ids.length === 0) {
    return NextResponse.json({ ratings: {} });
  }

  const ratings: Record<string, string> = {};
  const concurrency = 5;

  for (let start = 0; start < ids.length; start += concurrency) {
    const batch = ids.slice(start, start + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => ({ id, rating: await fetchDoubanRating(id) }))
    );

    batchResults.forEach(({ id, rating }) => {
      if (rating) ratings[id] = rating;
    });
  }

  return NextResponse.json(
    { ratings },
    {
      headers: {
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
        'CDN-Cache-Control': 'public, s-maxage=21600',
      },
    }
  );
}
