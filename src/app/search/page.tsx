/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { yellowWords } from '@/lib/yellow';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type SearchCategory = 'all' | 'movie' | 'tv' | 'show' | 'anime';
type ClassifiedSearchCategory = Exclude<SearchCategory, 'all'>;
type SearchViewMode = 'agg' | 'all';

interface CachedSearchItem {
  id: string;
  title: string;
  poster: string;
  source: string;
  source_name: string;
  class?: string;
  year: string;
  type_name?: string;
  douban_id?: number;
  rate?: string;
  episodeCount: number;
}

interface CachedSearchState {
  query: string;
  results: CachedSearchItem[];
  selectedCategory: SearchCategory;
  viewMode: SearchViewMode;
  savedAt: number;
}

const SEARCH_STATE_KEY = 'moontv:last-search-state:v2';
const SEARCH_STATE_MAX_AGE = 12 * 60 * 60 * 1000;

const SEARCH_CATEGORY_OPTIONS: Array<{
  key: SearchCategory;
  label: string;
}> = [
  { key: 'all', label: '全部' },
  { key: 'movie', label: '电影' },
  { key: 'tv', label: '电视剧' },
  { key: 'show', label: '综艺' },
  { key: 'anime', label: '动漫' },
];

function getDefaultAggregate(): boolean {
  if (typeof window !== 'undefined') {
    const userSetting = localStorage.getItem('defaultAggregateSearch');
    if (userSetting !== null) {
      return JSON.parse(userSetting);
    }
  }
  return true;
}

function classifySearchResult(item: SearchResult): ClassifiedSearchCategory {
  const typeText = `${item.type_name || ''} ${item.class || ''}`;

  if (/综艺|真人秀|晚会|脱口秀|选秀|音乐节目|综艺节目/.test(typeText)) {
    return 'show';
  }

  if (/动漫|动画|番剧|卡通|国漫|日漫|漫改/.test(typeText)) {
    return 'anime';
  }

  if (
    /电影|影片|动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|悬疑片|犯罪片|纪录片/.test(
      typeText
    )
  ) {
    return 'movie';
  }

  if (
    /电视剧|连续剧|国产剧|大陆剧|港剧|港台剧|台剧|韩剧|日剧|美剧|欧美剧|泰剧|海外剧|短剧|剧集/.test(
      typeText
    )
  ) {
    return 'tv';
  }

  return item.episodes.length > 1 ? 'tv' : 'movie';
}

function sortSearchResults(results: SearchResult[], query: string) {
  return results.sort((a, b) => {
    const normalizedQuery = query.trim();
    const aExactMatch = a.title === normalizedQuery;
    const bExactMatch = b.title === normalizedQuery;

    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;

    if (a.year === b.year) {
      return a.title.localeCompare(b.title);
    }

    if (a.year === 'unknown' && b.year === 'unknown') return 0;
    if (a.year === 'unknown') return 1;
    if (b.year === 'unknown') return -1;

    return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
  });
}

function toCachedSearchItems(results: SearchResult[]): CachedSearchItem[] {
  return results.map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    source: item.source,
    source_name: item.source_name,
    class: item.class,
    year: item.year,
    type_name: item.type_name,
    douban_id: item.douban_id,
    rate: item.rate,
    episodeCount: item.episodes?.length || 0,
  }));
}

function fromCachedSearchItems(items: CachedSearchItem[]): SearchResult[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    source: item.source,
    source_name: item.source_name,
    class: item.class,
    year: item.year,
    type_name: item.type_name,
    douban_id: item.douban_id,
    rate: item.rate,
    episodes: new Array(Math.max(0, item.episodeCount || 0)).fill(''),
  }));
}

function readCachedSearchState(): (Omit<CachedSearchState, 'results'> & {
  results: SearchResult[];
}) | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedSearchState;
    if (!parsed.query || !Array.isArray(parsed.results)) return null;

    if (Date.now() - parsed.savedAt > SEARCH_STATE_MAX_AGE) {
      sessionStorage.removeItem(SEARCH_STATE_KEY);
      return null;
    }

    return {
      ...parsed,
      selectedCategory: SEARCH_CATEGORY_OPTIONS.some(
        (option) => option.key === parsed.selectedCategory
      )
        ? parsed.selectedCategory
        : 'all',
      viewMode: parsed.viewMode === 'all' ? 'all' : 'agg',
      results: fromCachedSearchItems(parsed.results),
    };
  } catch {
    return null;
  }
}

function saveCachedSearchState(
  query: string,
  results: SearchResult[],
  selectedCategory: SearchCategory,
  viewMode: SearchViewMode
) {
  if (typeof window === 'undefined' || !query.trim()) return;

  try {
    const state: CachedSearchState = {
      query: query.trim(),
      results: toCachedSearchItems(results),
      selectedCategory,
      viewMode,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage 空间不足时不影响正常搜索。
  }
}

async function enrichWithDoubanRatings(
  results: SearchResult[]
): Promise<SearchResult[]> {
  const ids = Array.from(
    new Set(
      results
        .map((item) => item.douban_id)
        .filter((id): id is number => Number(id) > 0)
        .map((id) => String(id))
    )
  ).slice(0, 90);

  if (ids.length === 0) return results;

  const ratings: Record<string, string> = {};

  for (let start = 0; start < ids.length; start += 30) {
    const batch = ids.slice(start, start + 30);
    try {
      const response = await fetch(
        `/api/douban/ratings?ids=${encodeURIComponent(batch.join(','))}`
      );
      if (!response.ok) continue;

      const data = await response.json();
      Object.assign(ratings, data.ratings || {});
    } catch {
      // 单个批次失败时保留其他批次结果。
    }
  }

  return results.map((item) => {
    const id = item.douban_id ? String(item.douban_id) : '';
    return {
      ...item,
      // 搜索卡片只显示豆瓣真实评分；获取不到时宁可不显示，也不使用资源站内部评分。
      rate: id && ratings[id] ? ratings[id] : '',
    };
  });
}

function SearchPageClient() {
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<SearchCategory>('all');
  const [viewMode, setViewMode] = useState<SearchViewMode>(() =>
    getDefaultAggregate() ? 'agg' : 'all'
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSearchRef = useRef('');

  const categoryCounts = useMemo(() => {
    const counts: Record<SearchCategory, number> = {
      all: searchResults.length,
      movie: 0,
      tv: 0,
      show: 0,
      anime: 0,
    };

    searchResults.forEach((item) => {
      counts[classifySearchResult(item)] += 1;
    });

    return counts;
  }, [searchResults]);

  const filteredSearchResults = useMemo(() => {
    if (selectedCategory === 'all') return searchResults;
    return searchResults.filter(
      (item) => classifySearchResult(item) === selectedCategory
    );
  }, [searchResults, selectedCategory]);

  const aggregatedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();

    filteredSearchResults.forEach((item) => {
      const key = `${item.title.replaceAll(' ', '')}-${
        item.year || 'unknown'
      }-${item.episodes.length === 1 ? 'movie' : 'tv'}`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });

    return Array.from(map.entries()).sort((a, b) => {
      const query = searchQuery.trim().replaceAll(' ', '');
      const aExactMatch = a[1][0].title.replaceAll(' ', '').includes(query);
      const bExactMatch = b[1][0].title.replaceAll(' ', '').includes(query);

      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      if (a[1][0].year === b[1][0].year) {
        return a[0].localeCompare(b[0]);
      }

      const aYear = a[1][0].year;
      const bYear = b[1][0].year;
      if (aYear === 'unknown' && bYear === 'unknown') return 0;
      if (aYear === 'unknown') return 1;
      if (bYear === 'unknown') return -1;
      return aYear > bYear ? -1 : 1;
    });
  }, [filteredSearchResults, searchQuery]);

  const restoreCachedState = (
    cached: Omit<CachedSearchState, 'results'> & { results: SearchResult[] }
  ) => {
    activeSearchRef.current = cached.query;
    setSearchQuery(cached.query);
    setSearchResults(cached.results);
    setSelectedCategory(cached.selectedCategory);
    setViewMode(cached.viewMode);
    setShowResults(true);
    setIsLoading(false);
  };

  const fetchSearchResults = async (
    query: string,
    options: { silent?: boolean } = {}
  ) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    activeSearchRef.current = normalizedQuery;
    if (!options.silent) setIsLoading(true);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(normalizedQuery)}`
      );
      const data = await response.json();
      let results: SearchResult[] = Array.isArray(data.results)
        ? data.results
        : [];

      if (
        typeof window !== 'undefined' &&
        !(window as any).RUNTIME_CONFIG?.DISABLE_YELLOW_FILTER
      ) {
        results = results.filter((result) => {
          const typeName = result.type_name || '';
          return !yellowWords.some((word: string) => typeName.includes(word));
        });
      }

      // 资源站的 vod_score 不是豆瓣评分，先清空，随后用 douban_id 获取真实豆瓣评分。
      const sortedResults = sortSearchResults(
        results.map((item) => ({ ...item, rate: '' })),
        normalizedQuery
      );

      if (activeSearchRef.current !== normalizedQuery) return;

      setSearchResults(sortedResults);
      setShowResults(true);
      setIsLoading(false);

      void enrichWithDoubanRatings(sortedResults).then((ratedResults) => {
        if (activeSearchRef.current !== normalizedQuery) return;
        setSearchResults(ratedResults);
      });
    } catch {
      if (activeSearchRef.current === normalizedQuery) {
        setSearchResults([]);
        setShowResults(true);
      }
    } finally {
      if (activeSearchRef.current === normalizedQuery) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    getSearchHistory().then(setSearchHistory);

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => setSearchHistory(newHistory)
    );

    const getScrollTop = () => document.body.scrollTop || 0;
    let isRunning = true;

    const checkScrollPosition = () => {
      if (!isRunning) return;
      setShowBackToTop(getScrollTop() > 300);
      requestAnimationFrame(checkScrollPosition);
    };

    checkScrollPosition();

    const handleScroll = () => setShowBackToTop(getScrollTop() > 300);
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false;
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const query = (searchParams.get('q') || '').trim();
    const cached = readCachedSearchState();

    if (query) {
      setSearchQuery(query);
      addSearchHistory(query);

      if (cached && cached.query === query) {
        restoreCachedState(cached);
        // 先显示上次结果，再静默刷新数据和豆瓣评分。
        void fetchSearchResults(query, { silent: true });
      } else {
        setSelectedCategory('all');
        void fetchSearchResults(query);
      }
      return;
    }

    // 从其他页面重新进入 /search 时恢复刚才的搜索结果，而不是回到空白搜索页。
    if (cached) {
      restoreCachedState(cached);
    } else {
      activeSearchRef.current = '';
      setShowResults(false);
      setSearchResults([]);
      document.getElementById('searchInput')?.focus();
    }
  }, [searchParams]);

  useEffect(() => {
    if (!showResults || !searchQuery.trim()) return;
    saveCachedSearchState(
      searchQuery,
      searchResults,
      selectedCategory,
      viewMode
    );
  }, [searchQuery, searchResults, selectedCategory, viewMode, showResults]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setSelectedCategory('all');
    setShowResults(true);
    addSearchHistory(trimmed);

    if ((searchParams.get('q') || '').trim() === trimmed) {
      void fetchSearchResults(trimmed);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const scrollToTop = () => {
    try {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        <div className='mb-8'>
          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='搜索电影、电视剧...'
                className='w-full h-12 rounded-lg bg-gray-50/80 py-3 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border border-gray-200/50 shadow-sm dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700 dark:border-gray-700'
              />
            </div>
          </form>
        </div>

        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {isLoading ? (
            <div className='flex justify-center items-center h-40'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
            </div>
          ) : showResults ? (
            <section className='mb-12'>
              <div className='mb-6 flex flex-wrap items-center gap-2'>
                {SEARCH_CATEGORY_OPTIONS.map((category) => {
                  const active = selectedCategory === category.key;
                  return (
                    <button
                      key={category.key}
                      type='button'
                      onClick={() => setSelectedCategory(category.key)}
                      className={`px-3.5 py-1.5 rounded-full text-sm border transition-all ${
                        active
                          ? 'bg-green-500 border-green-500 text-white shadow-sm'
                          : 'bg-white/70 border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600 dark:bg-gray-800/70 dark:border-gray-700 dark:text-gray-300 dark:hover:border-green-500 dark:hover:text-green-400'
                      }`}
                    >
                      {category.label}
                      <span
                        className={`ml-1.5 text-xs ${
                          active ? 'text-white/80' : 'text-gray-400'
                        }`}
                      >
                        {categoryCounts[category.key]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className='mb-8 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  搜索结果
                  <span className='ml-2 text-sm font-normal text-gray-400'>
                    {filteredSearchResults.length}
                  </span>
                </h2>
                <label className='flex items-center gap-2 cursor-pointer select-none'>
                  <span className='text-sm text-gray-700 dark:text-gray-300'>
                    聚合
                  </span>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={viewMode === 'agg'}
                      onChange={() =>
                        setViewMode(viewMode === 'agg' ? 'all' : 'agg')
                      }
                    />
                    <div className='w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                  </div>
                </label>
              </div>

              <div
                key={`search-results-${viewMode}-${selectedCategory}`}
                className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
              >
                {viewMode === 'agg'
                  ? aggregatedResults.map(([mapKey, group]) => (
                      <div key={`agg-${mapKey}`} className='w-full'>
                        <VideoCard
                          from='search'
                          items={group}
                          rate={group.find((item) => item.rate)?.rate || ''}
                          query={
                            searchQuery.trim() !== group[0].title
                              ? searchQuery.trim()
                              : ''
                          }
                        />
                      </div>
                    ))
                  : filteredSearchResults.map((item) => (
                      <div
                        key={`all-${item.source}-${item.id}`}
                        className='w-full'
                      >
                        <VideoCard
                          id={item.id}
                          title={`${item.title}${
                            item.type_name ? ` ${item.type_name}` : ''
                          }`}
                          poster={item.poster}
                          episodes={item.episodes.length}
                          source={item.source}
                          source_name={item.source_name}
                          douban_id={item.douban_id?.toString()}
                          rate={item.rate}
                          query={
                            searchQuery.trim() !== item.title
                              ? searchQuery.trim()
                              : ''
                          }
                          year={item.year}
                          from='search'
                          type={item.episodes.length > 1 ? 'tv' : 'movie'}
                        />
                      </div>
                    ))}

                {filteredSearchResults.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    当前分类未找到相关结果
                  </div>
                )}
              </div>
            </section>
          ) : searchHistory.length > 0 ? (
            <section className='mb-12'>
              <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                搜索历史
                <button
                  onClick={() => clearSearchHistory()}
                  className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                >
                  清空
                </button>
              </h2>
              <div className='flex flex-wrap gap-2'>
                {searchHistory.map((item) => (
                  <div key={item} className='relative group'>
                    <button
                      onClick={() => {
                        setSearchQuery(item);
                        router.push(
                          `/search?q=${encodeURIComponent(item.trim())}`
                        );
                      }}
                      className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                    >
                      {item}
                    </button>
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item);
                      }}
                      className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                    >
                      <X className='w-3 h-3' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
