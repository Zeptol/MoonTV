/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDoubanCategories, getDoubanList } from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type DoubanSortMode = 'default' | 'rating' | 'yearDesc' | 'yearAsc';

const DOUBAN_SORT_OPTIONS: Array<{
  key: DoubanSortMode;
  label: string;
  title: string;
}> = [
  { key: 'default', label: '综合', title: '保持豆瓣默认排序' },
  { key: 'rating', label: '评分', title: '按豆瓣评分从高到低排序' },
  { key: 'yearDesc', label: '最新', title: '按上映年份从新到旧排序' },
  { key: 'yearAsc', label: '最早', title: '按上映年份从旧到新排序' },
];

function getYearValue(year?: string): number | null {
  if (!year) return null;
  const parsed = Number.parseInt(year, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRatingValue(rate?: string): number | null {
  if (!rate) return null;
  const parsed = Number.parseFloat(rate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sortDoubanItems(items: DoubanItem[], sortMode: DoubanSortMode) {
  if (sortMode === 'default') return items;

  return [...items].sort((a, b) => {
    const aRating = getRatingValue(a.rate);
    const bRating = getRatingValue(b.rate);
    const aYear = getYearValue(a.year);
    const bYear = getYearValue(b.year);

    if (sortMode === 'rating') {
      if (aRating === null && bRating !== null) return 1;
      if (aRating !== null && bRating === null) return -1;
      if (aRating !== null && bRating !== null && aRating !== bRating) {
        return bRating - aRating;
      }

      if (aYear === null && bYear !== null) return 1;
      if (aYear !== null && bYear === null) return -1;
      if (aYear !== null && bYear !== null && aYear !== bYear) {
        return bYear - aYear;
      }

      return a.title.localeCompare(b.title);
    }

    if (aYear === null && bYear !== null) return 1;
    if (aYear !== null && bYear === null) return -1;
    if (aYear !== null && bYear !== null && aYear !== bYear) {
      return sortMode === 'yearAsc' ? aYear - bYear : bYear - aYear;
    }

    const safeARating = aRating || 0;
    const safeBRating = bRating || 0;
    if (safeARating !== safeBRating) return safeBRating - safeARating;

    return a.title.localeCompare(b.title);
  });
}

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectorsReady, setSelectorsReady] = useState(false);
  const [sortMode, setSortMode] = useState<DoubanSortMode>('default');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const type = searchParams.get('type') || 'movie';

  // 获取 runtimeConfig 中的自定义分类数据
  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  // 选择器状态 - 完全独立，不依赖URL参数
  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    return type === 'movie' ? '热门' : '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
    return '全部';
  });

  // 获取自定义分类数据
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 初始化时标记选择器为准备好状态
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // type变化时立即重置selectorsReady（最高优先级）
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true);
    setSortMode('default');
  }, [type]);

  // 当type变化时重置选择器状态
  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      const types = Array.from(
        new Set(customCategories.map((cat) => cat.type))
      );
      if (types.length > 0) {
        let selectedType = types[0];
        if (types.includes('movie')) {
          selectedType = 'movie';
        } else if (types.includes('tv')) {
          selectedType = 'tv';
        }
        setPrimarySelection(selectedType);

        const firstCategory = customCategories.find(
          (cat) => cat.type === selectedType
        );
        if (firstCategory) {
          setSecondarySelection(firstCategory.query);
        }
      }
    } else {
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('');
        setSecondarySelection('tv');
      } else if (type === 'show') {
        setPrimarySelection('');
        setSecondarySelection('show');
      } else {
        setPrimarySelection('');
        setSecondarySelection('全部');
      }
    }

    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [type, customCategories]);

  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const sortedDoubanData = useMemo(
    () => sortDoubanItems(doubanData, sortMode),
    [doubanData, sortMode]
  );

  // 生成API请求参数的辅助函数
  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (type === 'tv' || type === 'show') {
        return {
          kind: 'tv' as const,
          category: type,
          type: secondarySelection,
          pageLimit: 25,
          pageStart,
        };
      }

      return {
        kind: type as 'tv' | 'movie',
        category: primarySelection,
        type: secondarySelection,
        pageLimit: 25,
        pageStart,
      };
    },
    [type, primarySelection, secondarySelection]
  );

  // 防抖的数据加载函数
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      let data: DoubanResult;

      if (type === 'custom') {
        const selectedCategory = customCategories.find(
          (cat) =>
            cat.type === primarySelection && cat.query === secondarySelection
        );

        if (selectedCategory) {
          data = await getDoubanList({
            tag: selectedCategory.query,
            type: selectedCategory.type,
            pageLimit: 25,
            pageStart: 0,
          });
        } else {
          throw new Error('没有找到对应的分类');
        }
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (data.code === 200) {
        setDoubanData(data.list);
        setHasMore(data.list.length === 25);
        setLoading(false);
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
    }
  }, [
    type,
    primarySelection,
    secondarySelection,
    getRequestParams,
    customCategories,
  ]);

  // 只在选择器准备好后才加载数据
  useEffect(() => {
    if (!selectorsReady) {
      return;
    }

    setDoubanData([]);
    setCurrentPage(0);
    setHasMore(true);
    setIsLoadingMore(false);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      loadInitialData();
    }, 100);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    selectorsReady,
    type,
    primarySelection,
    secondarySelection,
    loadInitialData,
  ]);

  // 单独处理 currentPage 变化（加载更多）
  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        try {
          setIsLoadingMore(true);

          let data: DoubanResult;
          if (type === 'custom') {
            const selectedCategory = customCategories.find(
              (cat) =>
                cat.type === primarySelection &&
                cat.query === secondarySelection
            );

            if (selectedCategory) {
              data = await getDoubanList({
                tag: selectedCategory.query,
                type: selectedCategory.type,
                pageLimit: 25,
                pageStart: currentPage * 25,
              });
            } else {
              throw new Error('没有找到对应的分类');
            }
          } else {
            data = await getDoubanCategories(
              getRequestParams(currentPage * 25)
            );
          }

          if (data.code === 200) {
            setDoubanData((prev) => [...prev, ...data.list]);
            setHasMore(data.list.length === 25);
          } else {
            throw new Error(data.message || '获取数据失败');
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingMore(false);
        }
      };

      fetchMoreData();
    }
  }, [
    currentPage,
    type,
    primarySelection,
    secondarySelection,
    customCategories,
  ]);

  // 设置滚动监听
  useEffect(() => {
    if (!hasMore || isLoadingMore || loading) {
      return;
    }

    if (!loadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loading]);

  // 处理选择器变化
  const handlePrimaryChange = useCallback(
    (value: string) => {
      if (value !== primarySelection) {
        setLoading(true);

        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find(
            (cat) => cat.type === value
          );
          if (firstCategory) {
            setPrimarySelection(value);
            setSecondarySelection(firstCategory.query);
          } else {
            setPrimarySelection(value);
          }
        } else {
          setPrimarySelection(value);
        }
      }
    },
    [primarySelection, type, customCategories]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      if (value !== secondarySelection) {
        setLoading(true);
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  const getPageTitle = () => {
    return type === 'movie'
      ? '电影'
      : type === 'tv'
      ? '电视剧'
      : type === 'show'
      ? '综艺'
      : '自定义';
  };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);

    const queryString = params.toString();
    return `/douban${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 页面标题和选择器 */}
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {getPageTitle()}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              来自豆瓣的精选内容
            </p>
          </div>

          {type !== 'custom' ? (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanSelector
                type={type as 'movie' | 'tv' | 'show'}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          ) : (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <DoubanCustomSelector
                customCategories={customCategories}
                primarySelection={primarySelection}
                secondarySelection={secondarySelection}
                onPrimaryChange={handlePrimaryChange}
                onSecondaryChange={handleSecondaryChange}
              />
            </div>
          )}
        </div>

        {/* 内容展示区域 */}
        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {!loading && selectorsReady && doubanData.length > 0 && (
            <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500'>
                <span className='inline-flex h-1.5 w-1.5 rounded-full bg-green-500/80'></span>
                已加载 {doubanData.length} 部
                {hasMore && <span>· 下滑继续加载</span>}
              </div>

              <div className='grid w-full grid-cols-4 rounded-xl border border-gray-200/70 bg-gray-100/80 p-1 shadow-inner backdrop-blur-sm sm:inline-flex sm:w-auto dark:border-gray-700/80 dark:bg-gray-800/80'>
                {DOUBAN_SORT_OPTIONS.map((option) => {
                  const active = sortMode === option.key;
                  return (
                    <button
                      key={option.key}
                      type='button'
                      title={option.title}
                      aria-pressed={active}
                      onClick={() => setSortMode(option.key)}
                      className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 sm:px-3 sm:text-sm ${
                        active
                          ? 'bg-white text-green-600 shadow-sm ring-1 ring-black/[0.03] dark:bg-gray-700 dark:text-green-400 dark:ring-white/[0.04]'
                          : 'text-gray-500 hover:bg-white/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 内容网格 */}
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
            {loading || !selectorsReady
              ? skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : sortedDoubanData.map((item, index) => (
                  <div key={`${item.id}-${index}`} className='w-full'>
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={item.rate}
                      year={item.year}
                      type={type === 'movie' ? 'movie' : ''}
                    />
                  </div>
                ))}
          </div>

          {/* 加载更多指示器 */}
          {hasMore && !loading && (
            <div
              ref={(el) => {
                if (el && el.offsetParent !== null) {
                  (
                    loadingRef as React.MutableRefObject<HTMLDivElement | null>
                  ).current = el;
                }
              }}
              className='flex justify-center mt-12 py-8'
            >
              {isLoadingMore && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
                  <span className='text-gray-600 dark:text-gray-400'>
                    加载中...
                  </span>
                </div>
              )}
            </div>
          )}

          {!hasMore && doubanData.length > 0 && (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              已加载全部内容
            </div>
          )}

          {!loading && doubanData.length === 0 && (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              暂无相关内容
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
