import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, ScrollView, Alert, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import VideoPreviewCard from '../components/VideoPreviewCard';
import { ReliableImage } from '../components/ReliableImage';
import { formatDateKey, generateId, formatTime, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

const COMMON_EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥹', '😭', '😅', '😤', '😴', '🤔', '🫡', '🙌', '👏', '👍', '👎', '👌', '💪', '🙏', '🎉', '✨', '🔥', '🌟', '❤️', '💛', '💙', '🍀', '🌈', '📚', '🧠', '✍️', '✅', '💯'];

export default function FeedScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { posts, currentUser, users } = state;
  const [refreshing, setRefreshing] = useState(false);
  const [commentInput, setCommentInput] = useState({});
  const [replyTarget, setReplyTarget] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState({});
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'today' | 'date'
  const [selectedDate, setSelectedDate] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const prefetchCacheRef = useRef(new Set()); // 缓存已预加载的图片URI

  if (!currentUser?.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F4EE' }}>
        <Text style={{ color: '#6E655C' }}>正在恢复登录状态...</Text>
      </View>
    );
  }

  const getUserById = id => users.find(u => u.id === id) || { name: '未知', avatarColor: '#ccc' };
  const resolveReplyingName = (comment) => {
    const rawName = String(comment?.replyToUserName || '').trim();
    if (rawName && rawName !== '未知' && rawName !== '未知用户') return rawName;
    if (comment?.replyToUserId) {
      const target = users.find(user => user.id === comment.replyToUserId);
      return target?.name || '';
    }
    return '';
  };
  const visibleUserIds = new Set([currentUser.id, ...(currentUser.friends || [])]);

  const buildPostMediaItems = (post) => [
    ...((post.images || []).map(uri => ({ type: 'image', uri }))),
    ...((post.videos || []).map(uri => ({ type: 'video', uri }))),
  ];

  const openPostMediaViewer = (post, index) => {
    const items = buildPostMediaItems(post);
    if (items.length === 0) return;
    navigation.navigate('MediaViewer', {
      items,
      initialIndex: index,
      sourceTab: 'FeedTab',
    });
  };

  // 预加载可见及相邻的图片
  const prefetchPostImages = (posts) => {
    if (!posts || posts.length === 0) return;
    
    posts.forEach(post => {
      // 仅预加载图片，视频留给onLoad时处理
      (post.images || []).forEach(uri => {
        if (!uri) return;
        if (prefetchCacheRef.current.has(uri)) return; // 已缓存，跳过
        prefetchCacheRef.current.add(uri);
        
        Image.prefetch(uri).catch(() => {
          // 预加载失败，但ReliableImage会处理重试
        });
      });
    });
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!viewableItems || viewableItems.length === 0) return;
    
    // 当前可见的posts
    const visibleIndices = viewableItems.map(item => item.index).filter(i => i !== null);
    if (visibleIndices.length === 0) return;
    
    const minIndex = Math.min(...visibleIndices);
    const maxIndex = Math.max(...visibleIndices);
    
    // 预加载当前+前后各2个item的图片
    const prefetchRange = Math.min(2, maxIndex - minIndex + 1);
    const rangeStart = Math.max(0, minIndex - prefetchRange);
    const rangeEnd = Math.min(visiblePosts.length - 1, maxIndex + prefetchRange);
    
    const postsToPreload = visiblePosts.slice(rangeStart, rangeEnd + 1);
    prefetchPostImages(postsToPreload);
  }).current;

  const visiblePosts = posts
    .filter(post => visibleUserIds.has(post.userId))
    .filter(post => {
      if (timeFilter === 'all') return true;
      const postDate = new Date(post.createdAt);
      const now = new Date();
      if (timeFilter === 'today') {
        return postDate.toDateString() === now.toDateString();
      }
      if (timeFilter === 'date') {
        return toDateKey(postDate) === selectedDate;
      }
      return postDate.toDateString() === now.toDateString();
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const handleLike = (postId) => {
    dispatch({ type: 'LIKE_POST', payload: { postId, userId: currentUser.id } });
  };

  const handleAddComment = async (postId) => {
    const text = commentInput[postId]?.trim();
    if (!text) return;
    const replyTo = replyTarget[postId] || null;
    // 先清空输入区，避免网络抖动时出现“退回输入框”的卡顿体验
    setCommentInput(prev => ({ ...prev, [postId]: '' }));
    setReplyTarget(prev => ({ ...prev, [postId]: null }));
    setShowEmojiPicker(prev => ({ ...prev, [postId]: false }));
    setExpandedComments(prev => ({ ...prev, [postId]: false }));

    const result = await dispatch({
      type: 'ADD_COMMENT',
      payload: {
        postId,
        comment: {
          id: generateId(),
          userId: currentUser.id,
          replyToUserId: replyTo?.id || '',
          replyToUserName: replyTo?.name || '',
          text,
          createdAt: new Date().toISOString(),
        },
      },
    });
    if (!result?.ok) return;
  };

  const openPostDetail = (postId) => {
    navigation.navigate('PostDetail', { postId });
  };

  const appendEmoji = (postId, emoji) => {
    setCommentInput(prev => ({ ...prev, [postId]: `${prev[postId] || ''}${emoji}`.slice(0, 300) }));
  };

  const handleDeletePost = (postId, authorId) => {
    if (authorId !== currentUser.id) return;
    Alert.alert('删除动态', '确认删除这条动态？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_POST', payload: postId }) },
    ]);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const result = await dispatch({ type: 'REFRESH_CLOUD_STATE', payload: { userId: currentUser.id } });
    setRefreshing(false);
    if (!result?.ok) {
      Alert.alert('刷新失败', result?.error || '请稍后重试');
    }
  };

  const renderPost = ({ item }) => {
    const author = getUserById(item.userId);
    const liked = (item.likes || []).includes(currentUser.id);
    const commentsVisible = expandedComments[item.id];

    return (
      <View style={styles.card}>
        {/* 头部 */}
        <View style={styles.cardHeader}>
          <Avatar user={author} size={44} />
          <View style={styles.headerInfo}>
            <Text style={styles.userName}>{author.name}</Text>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
              {item.uploadStatus === 'uploading' && <Text style={styles.uploadHint}>上传中...</Text>}
              {item.uploadStatus === 'failed' && <Text style={styles.uploadHintError}>上传失败</Text>}
            </View>
          </View>
          {item.userId === currentUser.id && (
            <TouchableOpacity onPress={() => handleDeletePost(item.id, item.userId)}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {/* 文字内容 */}
        {item.text ? <Text style={styles.postText}>{item.text}</Text> : null}

        {/* 图片/视频 */}
        {item.images && item.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
            {item.images.map((uri, idx) => (
              <TouchableOpacity key={idx} activeOpacity={0.9} onPress={() => openPostMediaViewer(item, idx)}>
                <ReliableImage uri={uri} style={styles.postImage} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {item.videos && item.videos.length > 0 && (
          <View style={styles.videoList}>
            {item.videos.map((uri, idx) => (
              <View
                key={`${uri}_${idx}`}
                style={styles.videoCard}
              >
                <VideoPreviewCard uri={uri} style={styles.postVideoPlaceholder} />
                <TouchableOpacity
                  style={styles.expandBtn}
                  onPress={() => openPostMediaViewer(item, (item.images || []).length + idx)}
                >
                  <Ionicons name="expand-outline" size={16} color="#fff" />
                  <Text style={styles.expandBtnText}>放大查看</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 点赞评论栏 */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(item.id)}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? '#FF6B6B' : '#666'} />
            <Text style={[styles.actionText, liked && { color: '#FF6B6B' }]}>
              {(item.likes || []).length > 0 ? (item.likes || []).length : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setExpandedComments(prev => ({ ...prev, [item.id]: !commentsVisible }))}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#666" />
            <Text style={styles.actionText}>
              {(item.comments || []).length > 0 ? (item.comments || []).length : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openPostDetail(item.id)}>
            <Ionicons name="document-text-outline" size={20} color="#666" />
            <Text style={styles.actionText}>详情</Text>
          </TouchableOpacity>
        </View>

        {/* 评论展示 */}
        {commentsVisible && (
          <View style={styles.commentsSection}>
            {(item.comments || []).map(c => {
              const cu = getUserById(c.userId);
              const replyingName = resolveReplyingName(c);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.commentItem}
                  activeOpacity={0.82}
                  onPress={() => setReplyTarget(prev => ({ ...prev, [item.id]: { id: cu.id, name: cu.name } }))}
                >
                  <Avatar user={cu} size={28} />
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentName}>{cu.name}</Text>
                    {!!replyingName && <Text style={styles.replyingHint}>回复 {replyingName}</Text>}
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {!!replyTarget[item.id] && (
              <View style={styles.replyTipRow}>
                <Text style={styles.replyTipText}>正在回复 {replyTarget[item.id].name}</Text>
                <TouchableOpacity onPress={() => setReplyTarget(prev => ({ ...prev, [item.id]: null }))}>
                  <Ionicons name="close-circle" size={16} color="#999" />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.commentInputRow}>
              <Avatar user={currentUser} size={28} />
              <TouchableOpacity onPress={() => setShowEmojiPicker(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>
                <Ionicons name={showEmojiPicker[item.id] ? 'happy' : 'happy-outline'} size={18} color="#C49A4B" />
              </TouchableOpacity>
              <TextInput
                style={styles.commentInput}
                placeholder={replyTarget[item.id] ? `回复 ${replyTarget[item.id].name}...` : '写评论...'}
                value={commentInput[item.id] || ''}
                onChangeText={val => setCommentInput(prev => ({ ...prev, [item.id]: val }))}
                onSubmitEditing={() => handleAddComment(item.id)}
                returnKeyType="send"
                maxLength={300}
              />
              <TouchableOpacity onPress={() => handleAddComment(item.id)}>
                <Ionicons name="send" size={18} color="#C49A4B" />
              </TouchableOpacity>
            </View>
            {showEmojiPicker[item.id] && (
              <View style={styles.emojiPanel}>
                {COMMON_EMOJIS.map(emoji => (
                  <TouchableOpacity key={`${item.id}_${emoji}`} style={styles.emojiItem} onPress={() => appendEmoji(item.id, emoji)}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <Text style={styles.title}>动态</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('NewPost')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, timeFilter === 'all' && styles.filterBtnActive]}
          onPress={() => setTimeFilter('all')}
        >
          <Text style={[styles.filterText, timeFilter === 'all' && styles.filterTextActive]}>全部历史</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, timeFilter === 'today' && styles.filterBtnActive]}
          onPress={() => setTimeFilter('today')}
        >
          <Text style={[styles.filterText, timeFilter === 'today' && styles.filterTextActive]}>仅看今天</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, timeFilter === 'date' && styles.filterBtnActive]}
          onPress={() => {
            setDatePickerVisible(true);
          }}
        >
          <Text style={[styles.filterText, timeFilter === 'date' && styles.filterTextActive]}>
            {timeFilter === 'date' && selectedDate ? formatDateKey(selectedDate) : '选择日期'}
          </Text>
        </TouchableOpacity>
      </View>

      <DatePickerSheet
        visible={datePickerVisible}
        title="选择查看日期"
        value={selectedDate || toDateKey(new Date())}
        onClose={() => setDatePickerVisible(false)}
        onChange={(dateKey) => {
          setSelectedDate(dateKey);
          setTimeFilter('date');
        }}
      />

      <FlatList
        data={visiblePosts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        updateCellBatchingPeriod={80}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 10,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C49A4B" />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>还没有动态，点右上角 + 发第一条吧！</Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F4EE' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1D8',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2F2A24' },
  addBtn: {
    backgroundColor: '#C49A4B',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#EFE8DE',
  },
  filterBtnActive: { backgroundColor: '#C49A4B' },
  filterText: { color: '#666', fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerInfo: { flex: 1, marginLeft: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  userName: { fontWeight: '600', fontSize: 15, color: '#333' },
  timeText: { fontSize: 12, color: '#999' },
  uploadHint: { fontSize: 11, color: '#C49A4B', fontWeight: '600' },
  uploadHintError: { fontSize: 11, color: '#FF6B6B', fontWeight: '600' },
  postText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 10 },
  mediaRow: { marginBottom: 10 },
  postImage: { width: 150, height: 150, borderRadius: 10, marginRight: 8 },
  videoList: { gap: 10, marginBottom: 10 },
  videoCard: { position: 'relative' },
  postVideoPlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: 14,
  },
  expandBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  expandBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actionBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 10, gap: 20 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 14, color: '#666' },
  commentsSection: { marginTop: 10, gap: 8 },
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  commentBubble: { flex: 1, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 8 },
  commentName: { fontSize: 12, fontWeight: '600', color: '#C49A4B', marginBottom: 2 },
  replyingHint: { fontSize: 11, color: '#999', marginBottom: 2 },
  commentText: { fontSize: 13, color: '#444' },
  replyTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  replyTipText: { color: '#999', fontSize: 12 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4EEE5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  commentInput: { flex: 1, fontSize: 14, color: '#333' },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  emojiItem: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6EEDC',
  },
  emojiText: { fontSize: 17 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
