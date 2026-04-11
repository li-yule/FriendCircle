import React, { useMemo, useState, useEffect } from 'react';
import { Image } from 'react-native';

function addRetryQuery(uri) {
  if (!uri) return uri;
  const hasQuery = String(uri).includes('?');
  const suffix = `retry_ts=${Date.now()}`;
  return `${uri}${hasQuery ? '&' : '?'}${suffix}`;
}

export function ReliableImage({ uri, ...props }) {
  const [retryKey, setRetryKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const source = useMemo(() => {
    if (!uri) return undefined;
    return {
      uri: retryKey > 0 ? addRetryQuery(uri) : uri,
      cache: 'force-cache',
    };
  }, [uri, retryKey]);

  useEffect(() => {
    if (!uri || retryKey > 0) return;
    // 预加载图片以获取缓存
    Image.getSize(
      uri,
      () => {
        setIsLoading(false);
      },
      () => {
        // 获取尺寸失败时仍然尝试显示，让Image组件加载
        setIsLoading(false);
      }
    );
  }, [uri, retryKey]);

  return (
    <Image
      {...props}
      source={source}
      onLoadStart={() => setIsLoading(true)}
      onLoad={() => setIsLoading(false)}
      onError={() => {
        // 加载失败时，只在前2次重试
        setRetryKey(prev => (prev >= 2 ? prev : prev + 1));
      }}
    />
  );
}
