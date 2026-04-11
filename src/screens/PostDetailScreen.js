import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatTime, generateId } from '../utils/helpers';
import VideoPreviewCard from '../components/VideoPreviewCard';
import { ReliableImage } from '../components/ReliableImage';

const COMMON_EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥹', '😭', '😅', '😤', '😴', '🤔', '🫡', '🙌', '👏', '👍', '👎', '👌', '💪', '🙏', '🎉', '✨', '🔥', '🌟', '❤️', '💛', '💙', '🍀', '🌈', '📚', '🧠', '✍️', '✅', '💯'];

export default function PostDetailScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { posts, users, currentUser } = state;
  const postId = route.params?.postId;
  const passedPost = route.params?.post;
  const livePost = posts.find(item => item.id === postId) || passedPost;
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const getUserById = id => users.find(user => user.id === id) || { name: '未知用户', avatarColor: '#ccc' };
  const resolveReplyingName = (comment) => {
    const rawName = String(comment?.replyToUserName || '').trim();
    if (rawName && rawName !== '未知' && rawName !== '未知用户') return rawName;
    if (comment?.replyToUserId) {
      const target = users.find(user => user.id === comment.replyToUserId);
      return target?.name || '';
    }
    return '';
  };

  const mediaItems = useMemo(() => {
    if (!livePost) return [];
    return [
      ...((livePost.images || []).map(uri => ({ type: 'image', uri }))),
      ...((livePost.videos || []).map(uri => ({ type: 'video', uri }))),
    ];
  }, [livePost]);

  if (!livePost) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>动态不存在或已删除</Text>
      </View>
    );
  }

  if (!currentUser?.id) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>正在恢复登录状态...</Text>
      </View>
    );
  }

  const author = getUserById(livePost.userId);
  const liked = (livePost.likes || []).includes(currentUser.id);

  const openMediaViewer = (index) => {
    if (!mediaItems.length) return;
    navigation.navigate('MediaViewer', {
      items: mediaItems,
      initialIndex: index,
      sourceTab: 'FeedTab',
    });
  };

  const handleLike = () => {
    dispatch({ type: 'LIKE_POST', payload: { postId: livePost.id, userId: currentUser.id } });
  };

  const handleComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    const result = await dispatch({
      type: 'ADD_COMMENT',
      payload: {
        postId: livePost.id,
        comment: {
          id: generateId(),
          userId: currentUser.id,
          replyToUserId: replyTarget?.id || '',
          replyToUserName: replyTarget?.name || '',
          text,
          createdAt: new Date().toISOString(),
        },
      },
    });

    if (!result?.ok) {
      Alert.alert('评论失败', result?.error || '请稍后重试');
      return;
    }
    setCommentText('');
    setReplyTarget(null);
    setShowEmojiPicker(false);
  };

  const handleDelete = () => {
    if (livePost.userId !== currentUser.id) return;
    Alert.alert('删除动态', '确认删除这条动态吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const result = await dispatch({ type: 'DELETE_POST', payload: livePost.id });
          if (!result?.ok) {
            Alert.alert('删除失败', result?.error || '请稍后重试');
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const appendEmoji = (emoji) => {
    setCommentText(prev => `${prev}${emoji}`.slice(0, 300));
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 24}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>动态详情</Text>
        {livePost.userId === currentUser.id ? (
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.authorRow}>
          <Avatar user={author} size={40} />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{author.name}</Text>
            <Text style={styles.timeText}>{formatTime(livePost.createdAt)}</Text>
          </View>
        </View>

        {!!livePost.text && <Text style={styles.contentText}>{livePost.text}</Text>}

        {(livePost.images || []).length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
            {(livePost.images || []).map((uri, index) => (
              <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openMediaViewer(index)}>
                <ReliableImage uri={uri} style={styles.image} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {(livePost.videos || []).length > 0 && (
          <View style={styles.videoList}>
            {(livePost.videos || []).map((uri, index) => (
              <View
                key={`${uri}_${index}`}
                style={styles.videoWrap}
              >
                <VideoPreviewCard uri={uri} style={styles.videoPreview} />
                <TouchableOpacity
                  style={styles.expandBtn}
                  onPress={() => openMediaViewer((livePost.images || []).length + index)}
                >
                  <Ionicons name="expand-outline" size={16} color="#fff" />
                  <Text style={styles.expandBtnText}>放大查看</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#FF6B6B' : '#666'} />
            <Text style={[styles.actionText, liked && { color: '#FF6B6B' }]}>{(livePost.likes || []).length}</Text>
          </TouchableOpacity>
          <View style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={18} color="#666" />
            <Text style={styles.actionText}>{(livePost.comments || []).length}</Text>
          </View>
        </View>

        <Text style={styles.commentTitle}>评论</Text>
        {(livePost.comments || []).map(comment => {
          const commentUser = getUserById(comment.userId);
          const replyingName = resolveReplyingName(comment);
          return (
            <TouchableOpacity
              key={comment.id}
              style={styles.commentItem}
              activeOpacity={0.85}
              onPress={() => setReplyTarget({ id: commentUser.id, name: commentUser.name })}
            >
              <Avatar user={commentUser} size={30} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentName}>{commentUser.name}</Text>
                {replyingName && <Text style={styles.replyHint}>回复 {replyingName}</Text>}
                <Text style={styles.commentText}>{comment.text}</Text>
                <Text style={styles.commentTime}>{formatTime(comment.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.inputBar}>
        {replyTarget ? (
          <View style={styles.replyTarget}>
            <Text style={styles.replyTargetText}>回复 {replyTarget.name}</Text>
            <TouchableOpacity onPress={() => setReplyTarget(null)}>
              <Ionicons name="close-circle" size={16} color="#999" />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.emojiBtn} onPress={() => setShowEmojiPicker(prev => !prev)}>
            <Ionicons name={showEmojiPicker ? 'happy' : 'happy-outline'} size={18} color="#C49A4B" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder={replyTarget ? `回复 ${replyTarget.name}...` : '写评论...'}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleComment}
            returnKeyType="send"
            maxLength={300}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleComment}>
            <Ionicons name="send" size={18} color="#C49A4B" />
          </TouchableOpacity>
        </View>
        {showEmojiPicker ? (
          <View style={styles.emojiPanel}>
            {COMMON_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={styles.emojiItem} onPress={() => appendEmoji(emoji)}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F4EE' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFDF8',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1D8',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#2F2A24' },
  body: { padding: 14, gap: 12, paddingBottom: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#2F2A24' },
  timeText: { marginTop: 2, fontSize: 12, color: '#8A8279' },
  contentText: { fontSize: 16, color: '#2F2A24', lineHeight: 24, backgroundColor: '#FFFDF8', borderRadius: 14, padding: 14 },
  mediaRow: { marginTop: 4 },
  image: { width: 180, height: 180, borderRadius: 12, marginRight: 10 },
  videoList: { gap: 10 },
  videoWrap: { position: 'relative' },
  videoPreview: { width: '100%', height: 220, borderRadius: 14 },
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
  actionRow: { flexDirection: 'row', gap: 18, alignItems: 'center', paddingHorizontal: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: '#6F655D', fontSize: 13 },
  commentTitle: { fontSize: 15, fontWeight: '700', color: '#2F2A24', marginTop: 8 },
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  commentBubble: { flex: 1, backgroundColor: '#FFFDF8', borderRadius: 12, padding: 10 },
  commentName: { fontSize: 13, fontWeight: '700', color: '#8A7242' },
  replyHint: { fontSize: 11, color: '#8A8279', marginTop: 2 },
  commentText: { fontSize: 14, color: '#3D3731', marginTop: 2, lineHeight: 20 },
  commentTime: { fontSize: 11, color: '#A79C90', marginTop: 5 },
  inputBar: {
    backgroundColor: '#FFFDF8',
    borderTopWidth: 1,
    borderTopColor: '#E8E1D8',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  replyTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  replyTargetText: { color: '#8A8279', fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#F4EEE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 14, color: '#333' },
  emojiBtn: { paddingVertical: 2, paddingRight: 2 },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
  },
  emojiItem: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6EEDC',
  },
  emojiText: { fontSize: 18 },
  sendBtn: { padding: 4 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  emptyText: { color: '#888', fontSize: 15 },
});
