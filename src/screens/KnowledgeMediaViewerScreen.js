import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler, View, Text, StyleSheet, TouchableOpacity, Image,
  FlatList, Dimensions, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useApp } from '../context/AppContext';
import { PinchGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { PanGestureHandler } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item?.uri).map(item => ({
    type: item.type === 'video' ? 'video' : 'image',
    uri: item.uri,
    label: item.label || '媒体',
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
  const baseScale = React.useRef(new Animated.Value(1)).current;
  const pinchScale = React.useRef(new Animated.Value(1)).current;
  const lastScale = React.useRef(1);
  const scale = React.useRef(Animated.multiply(baseScale, pinchScale)).current;
  const panX = React.useRef(new Animated.Value(0)).current;
  const panY = React.useRef(new Animated.Value(0)).current;

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
              <Animated.Image source={{ uri }} style={[styles.image, { transform: [{ translateX: panX }, { translateY: panY }, { scale }] }]} resizeMode="contain" />
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    </View>
  );
}

function VideoSlide({ uri }) {
  const source = useMemo(() => ({ uri, useCaching: true }), [uri]);
  const player = useVideoPlayer(source);

  useEffect(() => {
    if (!player) return;
    return () => {
      try {
        player.pause();
        player.replace(null);
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [player, uri]);

  return (
    <View style={styles.slide}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls />
    </View>
  );
}

export default function KnowledgeMediaViewerScreen({ navigation, route }) {
  const { state } = useApp();
  const { knowledge, users } = state;
  const { initialKnowledgeId, initialItemIndex = 0 } = route.params || {};

  // 获取初始知识项目
  const initialKnowledge = knowledge.find(k => k.id === initialKnowledgeId);

  if (!initialKnowledge) return null;

  const subject = initialKnowledge.subject;
  const itemsInSubject = knowledge.filter(k => k.subject === subject);
  const sortedItems = itemsInSubject.sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  // 构建所有项目的媒体集合
  const allMediaByItem = sortedItems.map(item => {
    const mediaItems = [
      ...(item.questionImages || []).map(uri => ({ uri, type: 'image', label: '题目' })),
      ...(item.wrongAnswerImages || []).map(uri => ({ uri, type: 'image', label: '错误答案' })),
      ...(item.correctAnswerImages || []).map(uri => ({ uri, type: 'image', label: '正确答案' })),
      ...(item.summaryImages || []).map(uri => ({ uri, type: 'image', label: '知识总结' })),
      ...(item.images || []).map(uri => ({ uri, type: 'image', label: '附件' })),
    ];
    return {
      knowledge: item,
      media: normalizeItems(mediaItems),
    };
  });

  // 初始化当前项目和项目内索引
  const currentKnowledgeIndex = sortedItems.findIndex(k => k.id === initialKnowledgeId);
  const [knowledgeIndex, setKnowledgeIndex] = useState(currentKnowledgeIndex);
  const [mediaIndex, setMediaIndex] = useState(Math.max(0, initialItemIndex));

  const current = allMediaByItem[knowledgeIndex];
  const currentKnowledge = current?.knowledge;
  const currentMedia = current?.media || [];
  const safeMediaIndex = Math.max(0, Math.min(mediaIndex, Math.max(0, currentMedia.length - 1)));

  useEffect(() => {
    const subscribe = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => subscribe.remove();
  }, [navigation]);

  const handleSaveAsset = async (item) => {
    if (!item?.uri) return;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要权限', '请允许访问相册后再保存文件');
        return;
      }

      const filename = getDownloadName(item);
      const filepath = `${FileSystem.documentDirectory}${filename}`;

      const downloadResumable = FileSystem.createDownloadResumable(item.uri, filepath);
      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        await MediaLibrary.saveToLibraryAsync(result.uri);
        Alert.alert('保存成功', '文件已保存到相册');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('保存失败', '请检查网络后重试');
    }
  };

  const handlePrevKnowledge = () => {
    if (knowledgeIndex > 0) {
      setKnowledgeIndex(knowledgeIndex - 1);
      setMediaIndex(0);
    }
  };

  const handleNextKnowledge = () => {
    if (knowledgeIndex < allMediaByItem.length - 1) {
      setKnowledgeIndex(knowledgeIndex + 1);
      setMediaIndex(0);
    }
  };

  const renderMediaItem = ({ item }) => {
    if (item.type === 'video') {
      return <VideoSlide uri={item.uri} />;
    }
    return <ImageSlide uri={item.uri} />;
  };

  const key = item => item?.uri || '';

  if (!currentMedia || currentMedia.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#2F2A24" />
          </TouchableOpacity>
          <Text style={styles.title}>该知识项目无媒体</Text>
        </View>
      </View>
    );
  }

  const getUserName = id => users.find(u => u.id === id)?.name || '未知';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#2F2A24" />
        </TouchableOpacity>
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {knowledgeIndex + 1} / {allMediaByItem.length}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleSaveAsset(currentMedia[safeMediaIndex])}
          style={styles.headerBtn}
        >
          <Ionicons name="download-outline" size={24} color="#2F2A24" />
        </TouchableOpacity>
      </View>

      {/* 知识项目导航 */}
      <View style={styles.knowledgeNavBar}>
        <TouchableOpacity
          style={[styles.navBtn, knowledgeIndex === 0 && styles.navBtnDisabled]}
          onPress={handlePrevKnowledge}
          disabled={knowledgeIndex === 0}
        >
          <Ionicons name="chevron-up-outline" size={20} color={knowledgeIndex === 0 ? '#ccc' : '#2F2A24'} />
        </TouchableOpacity>

        <View style={styles.knowledgeInfo}>
          <Text style={styles.knowledgeSubject}>{currentKnowledge?.subject}</Text>
          {!!String(currentKnowledge?.question || '').trim() && (
            <Text style={styles.knowledgeQuestion} numberOfLines={2}>
              {currentKnowledge?.question}
            </Text>
          )}
          <Text style={styles.knowledgeAuthor}>
            {getUserName(currentKnowledge?.userId)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.navBtn, knowledgeIndex === allMediaByItem.length - 1 && styles.navBtnDisabled]}
          onPress={handleNextKnowledge}
          disabled={knowledgeIndex === allMediaByItem.length - 1}
        >
          <Ionicons name="chevron-down-outline" size={20} color={knowledgeIndex === allMediaByItem.length - 1 ? '#ccc' : '#2F2A24'} />
        </TouchableOpacity>
      </View>

      {/* 媒体查看 */}
      <FlatList
        data={currentMedia}
        renderItem={renderMediaItem}
        keyExtractor={key}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        initialScrollIndex={safeMediaIndex}
        onViewableItemsChanged={({ viewableItems }) => {
          if (viewableItems.length > 0) {
            setMediaIndex(currentMedia.indexOf(viewableItems[0].item));
          }
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        style={styles.mediaList}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* 底部媒体计数 */}
      <View style={styles.footer}>
        <Text style={styles.mediaCount}>
          {safeMediaIndex + 1} / {currentMedia.length}
        </Text>
        <Text style={styles.mediaLabel}>
          {currentMedia[safeMediaIndex]?.label || '媒体'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F4EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1D8',
    backgroundColor: '#FFFDF8',
  },
  headerBtn: {
    padding: 8,
  },
  progress: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#F5E7C8',
    borderRadius: 12,
  },
  progressText: {
    fontSize: 12,
    color: '#8F6A2E',
    fontWeight: '600',
  },
  knowledgeNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1D8',
    backgroundColor: '#FFFDF8',
  },
  navBtn: {
    padding: 8,
    marginHorizontal: 4,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  knowledgeInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  knowledgeSubject: {
    fontSize: 12,
    color: '#8A8279',
    marginBottom: 2,
  },
  knowledgeQuestion: {
    fontSize: 13,
    color: '#2F2A24',
    fontWeight: '500',
    marginBottom: 2,
  },
  knowledgeAuthor: {
    fontSize: 11,
    color: '#8A8279',
  },
  mediaList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E1D8',
    backgroundColor: '#FFFDF8',
  },
  mediaCount: {
    fontSize: 12,
    color: '#8A8279',
    marginBottom: 4,
  },
  mediaLabel: {
    fontSize: 13,
    color: '#2F2A24',
    fontWeight: '500',
  },
});
