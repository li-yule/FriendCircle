import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item?.uri).map(item => ({
    type: item.type === 'video' ? 'video' : 'image',
    uri: item.uri,
  }));
}

export default function MediaViewerScreen({ navigation, route }) {
  const items = useMemo(() => normalizeItems(route.params?.items), [route.params?.items]);
  const [index, setIndex] = useState(route.params?.initialIndex || 0);
  const activeItem = items[index] || null;
  const sourceTab = route.params?.sourceTab || 'FeedTab';
  const videoSource = useMemo(() => {
    if (activeItem?.type !== 'video' || !activeItem?.uri) {
      return null;
    }

    return {
      uri: activeItem.uri,
      useCaching: true,
    };
  }, [activeItem?.type, activeItem?.uri]);
  const player = useVideoPlayer(videoSource, playerInstance => {
    playerInstance.loop = false;
    playerInstance.staysActiveInBackground = false;
    playerInstance.showNowPlayingNotification = false;
  });

  const navigateBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs', { screen: sourceTab });
  }, [navigation, sourceTab]);

  const handleBack = useCallback(() => {
    if (activeItem?.type === 'video') {
      player.pause();
    }

    navigateBack();
    return true;
  }, [activeItem?.type, navigateBack, player]);

  useEffect(() => {
    if (!items.length) {
      navigateBack();
    }
  }, [items, navigateBack]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  const showPrev = () => {
    if (index <= 0) return;
    setIndex(prev => prev - 1);
  };

  const showNext = () => {
    if (index >= items.length - 1) return;
    setIndex(prev => prev + 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.counter}>{items.length ? `${index + 1} / ${items.length}` : ''}</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.content}>
        {activeItem?.type === 'video' ? (
          <VideoView
            key={activeItem.uri}
            player={player}
            style={styles.video}
            nativeControls
            contentFit="contain"
            surfaceType="textureView"
          />
        ) : activeItem?.uri ? (
          <Image key={activeItem.uri} source={{ uri: activeItem.uri }} style={styles.image} resizeMode="contain" />
        ) : null}
      </View>

      {items.length > 1 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={[styles.navBtn, index === 0 && styles.navBtnDisabled]} onPress={showPrev} disabled={index === 0}>
            <Ionicons name="chevron-back" size={22} color={index === 0 ? 'rgba(255,255,255,0.35)' : '#fff'} />
            <Text style={[styles.navText, index === 0 && styles.navTextDisabled]}>上一张</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, index === items.length - 1 && styles.navBtnDisabled]}
            onPress={showNext}
            disabled={index === items.length - 1}
          >
            <Text style={[styles.navText, index === items.length - 1 && styles.navTextDisabled]}>下一张</Text>
            <Ionicons name="chevron-forward" size={22} color={index === items.length - 1 ? 'rgba(255,255,255,0.35)' : '#fff'} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 32,
    alignItems: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '72%',
    backgroundColor: '#111',
    borderRadius: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  navBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  navText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  navTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
});