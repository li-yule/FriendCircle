import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, View, Text, StyleSheet, TouchableOpacity, Image,
  FlatList, Dimensions, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { PinchGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { PanGestureHandler } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item?.uri).map(item => ({
    type: item.type === 'video' ? 'video' : 'image',
    uri: item.uri,
  }));
}

function inferExt(uri, fallback = 'jpg') {
  const clean = String(uri || '').split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

function getDownloadName(item) {
  const ext = inferExt(item?.uri, item?.type === 'video' ? 'mp4' : 'jpg');
  return `friendcircle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

function ImageSlide({ uri }) {
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPanGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: panX, translationY: panY } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    if (event.nativeEvent.oldState === GestureState.ACTIVE) {
      const nextScale = Math.max(1, Math.min(lastScale.current * event.nativeEvent.scale, 4));
      lastScale.current = nextScale;
      baseScale.setValue(nextScale);
      pinchScale.setValue(1);
      if (nextScale === 1) {
        panX.setOffset(0);
        panX.setValue(0);
        panY.setOffset(0);
        panY.setValue(0);
      }
    }
  };

  const onPanStateChange = (event) => {
    if (event.nativeEvent.oldState === GestureState.ACTIVE) {
      if (lastScale.current > 1) {
        panX.extractOffset();
        panX.setValue(0);
        panY.extractOffset();
        panY.setValue(0);
      } else {
        panX.setOffset(0);
        panX.setValue(0);
        panY.setOffset(0);
        panY.setValue(0);
      }
    }
  };

  return (
    <View style={styles.slide}>
      <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchStateChange}>
        <Animated.View style={styles.zoomContent}>
          <PanGestureHandler onGestureEvent={onPanGestureEvent} onHandlerStateChange={onPanStateChange}>
            <Animated.View>
              <Animated.Image
                source={{ uri }}
                style={[styles.image, { transform: [{ translateX: panX }, { translateY: panY }, { scale }] }]}
                resizeMode="contain"
              />
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    </View>
  );
}

function VideoSlide({ uri }) {
  const source = useMemo(() => ({ uri, useCaching: true }), [uri]);
  const player = useVideoPlayer(source, playerInstance => {
    playerInstance.loop = false;
    playerInstance.staysActiveInBackground = false;
    playerInstance.showNowPlayingNotification = false;
  });

  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.replace(null);
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [player]);

  return (
    <View style={styles.slide}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        surfaceType="textureView"
      />
    </View>
  );
}

export default function MediaViewerScreen({ navigation, route }) {
  const items = useMemo(() => normalizeItems(route.params?.items), [route.params?.items]);
  const [index, setIndex] = useState(route.params?.initialIndex || 0);
  const [saving, setSaving] = useState(false);
  const flatListRef = useRef(null);

  const sourceTab = route.params?.sourceTab || 'FeedTab';
  const activeItem = items[index] || null;

  const navigateBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs', { screen: sourceTab });
  }, [navigation, sourceTab]);

  const handleBack = useCallback(() => {
    navigateBack();
    return true;
  }, [navigateBack]);

  useEffect(() => {
    if (!items.length) {
      navigateBack();
      return;
    }

    const initial = Math.min(Math.max(0, route.params?.initialIndex || 0), items.length - 1);
    setIndex(initial);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex?.({ index: initial, animated: false });
    }, 0);
  }, [items, navigateBack, route.params?.initialIndex]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0];
    if (typeof first?.index === 'number') {
      setIndex(first.index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const showPrev = () => {
    if (index <= 0) return;
    flatListRef.current?.scrollToIndex({ index: index - 1, animated: true });
  };

  const showNext = () => {
    if (index >= items.length - 1) return;
    flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const handleSaveAsset = async () => {
    if (!activeItem?.uri || saving) return;

    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('保存失败', '请先允许访问相册权限');
        return;
      }

      const fileName = getDownloadName(activeItem);
      const targetPath = `${FileSystem.cacheDirectory}${fileName}`;
      const downloaded = await FileSystem.downloadAsync(activeItem.uri, targetPath);
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);
      Alert.alert('已保存', activeItem.type === 'video' ? '视频已保存到相册' : '图片已保存到相册');
    } catch {
      Alert.alert('保存失败', '当前资源无法下载，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => {
    if (item.type === 'video') {
      return <VideoSlide uri={item.uri} />;
    }
    return <ImageSlide uri={item.uri} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.counter}>{items.length ? `${index + 1} / ${items.length}` : ''}</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSaveAsset} disabled={saving || !activeItem?.uri}>
          <Ionicons name="download-outline" size={22} color={saving ? 'rgba(255,255,255,0.4)' : '#fff'} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(item, itemIndex) => `${item.uri}_${itemIndex}`}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, itemIndex) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * itemIndex, index: itemIndex })}
      />

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
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  zoomContent: { 
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH - 24,
    height: SCREEN_HEIGHT * 0.72,
  },
  video: {
    width: '100%',
    height: '74%',
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
