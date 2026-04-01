import React, { useMemo, useState } from 'react';
import { Image } from 'react-native';

function addRetryQuery(uri) {
  if (!uri) return uri;
  const hasQuery = String(uri).includes('?');
  const suffix = `retry_ts=${Date.now()}`;
  return `${uri}${hasQuery ? '&' : '?'}${suffix}`;
}

export function ReliableImage({ uri, ...props }) {
  const [retryKey, setRetryKey] = useState(0);

  const source = useMemo(() => {
    if (!uri) return undefined;
    return {
      uri: retryKey > 0 ? addRetryQuery(uri) : uri,
      cache: 'force-cache',
    };
  }, [uri, retryKey]);

  return (
    <Image
      {...props}
      source={source}
      onError={() => {
        setRetryKey(prev => (prev >= 1 ? prev : prev + 1));
      }}
    />
  );
}
