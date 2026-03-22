import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import VideoPreviewCard from '../components/VideoPreviewCard';
import { formatDateKey, generateId, formatTime, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

export default function FeedScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { posts, currentUser, users } = state;
  const [commentInput, setCommentInput] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'today' | 'date'
  const [selectedDate, setSelectedDate] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const getUserById = id => users.find(u => u.id === id) || { name: '未知', avatarColor: '#ccc' };
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

  const handleAddComment = (postId) => {
    const text = commentInput[postId]?.trim();
    if (!text) return;
    dispatch({
      type: 'ADD_COMMENT',
      payload: {
        postId,
        comment: {
          id: generateId(),
          userId: currentUser.id,
          text,
          createdAt: new Date().toISOString(),
        },
      },
    });
    setCommentInput(prev => ({ ...prev, [postId]: '' }));
  };

  const handleDeletePost = (postId, authorId) => {
    if (authorId !== currentUser.id) return;
    Alert.alert('删除动态', '确认删除这条动态？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_POST', payload: postId }) },
    ]);
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
            <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
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
                <Image source={{ uri }} style={styles.postImage} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {item.videos && item.videos.length > 0 && (
          <View style={styles.videoList}>
            {item.videos.map((uri, idx) => (
              <View key={`${uri}_${idx}`} style={styles.videoCard}>
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
        </View>

        {/* 评论展示 */}
        {commentsVisible && (
          <View style={styles.commentsSection}>
            {(item.comments || []).map(c => {
              const cu = getUserById(c.userId);
              return (
                <View key={c.id} style={styles.commentItem}>
                  <Avatar user={cu} size={28} />
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentName}>{cu.name}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.commentInputRow}>
              <Avatar user={currentUser} size={28} />
              <TextInput
                style={styles.commentInput}
                placeholder="写评论..."
                value={commentInput[item.id] || ''}
                onChangeText={val => setCommentInput(prev => ({ ...prev, [item.id]: val }))}
                onSubmitEditing={() => handleAddComment(item.id)}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={() => handleAddComment(item.id)}>
                <Ionicons name="send" size={18} color="#4ECDC4" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
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
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>还没有动态，点右上角 + 发第一条吧！</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  addBtn: {
    backgroundColor: '#4ECDC4',
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
    backgroundColor: '#ECECEC',
  },
  filterBtnActive: { backgroundColor: '#4ECDC4' },
  filterText: { color: '#666', fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerInfo: { flex: 1, marginLeft: 10 },
  userName: { fontWeight: '600', fontSize: 15, color: '#333' },
  timeText: { fontSize: 12, color: '#999', marginTop: 2 },
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
  commentName: { fontSize: 12, fontWeight: '600', color: '#4ECDC4', marginBottom: 2 },
  commentText: { fontSize: 13, color: '#444' },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  commentInput: { flex: 1, fontSize: 14, color: '#333' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
