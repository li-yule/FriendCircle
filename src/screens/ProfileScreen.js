import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import VideoPreviewCard from '../components/VideoPreviewCard';
import { ReliableImage } from '../components/ReliableImage';
import { formatTime, formatDate } from '../utils/helpers';

export default function ProfileScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { currentUser, users, posts, plans, knowledge } = state;
  const currentUserId = currentUser?.id || '';
  const safeCurrentUser = currentUser || { id: '', name: '', bio: '', avatar: null, friends: [] };
  const [tab, setTab] = useState('posts'); // 'posts' | 'plans' | 'friends'
  const [editing, setEditing] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [nameInput, setNameInput] = useState(safeCurrentUser.name || '');
  const [bioInput, setBioInput] = useState(safeCurrentUser.bio || '');
  const [avatarInput, setAvatarInput] = useState(safeCurrentUser.avatar || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const inbox = state.notifications?.[currentUserId] || { unreadCount: 0, interactions: [] };

  const myPosts = currentUserId ? posts.filter(p => p.userId === currentUserId) : [];
  const myPlans = currentUserId ? plans.filter(p => p.userId === currentUserId) : [];
  const incomingInteractions = useMemo(() => {
    return (inbox.interactions || []).map(item => {
      const fromUser = users.find(u => u.id === item.actorId) || { name: '未知', avatarColor: '#ccc' };
      return {
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        fromUserId: item.actorId,
        sourcePreview: item.sourcePreview || (item.sourceType === 'post' ? '动态内容' : '知识内容'),
        fromUser,
        isReplyToMe: true,
        text: item.content || '',
        createdAt: item.createdAt,
        isRead: Number(item.isRead || 0) === 1,
      };
    });
  }, [inbox.interactions, users]);
  const unreadInteractions = useMemo(() => incomingInteractions.filter(item => !item.isRead), [incomingInteractions]);
  const incomingCommentCount = Number(inbox.unreadCount || 0);
    const myPlanDailyProgress = useMemo(() => {
      const map = new Map();
      myPlans.forEach(plan => {
        const key = formatDate(plan.date);
        const done = (plan.tasks || []).filter(t => t.done).length;
        const total = (plan.tasks || []).length;
        if (!map.has(key)) {
          map.set(key, { dateText: key, done: 0, total: 0, latest: plan.date });
        }
        const item = map.get(key);
        item.done += done;
        item.total += total;
        if (new Date(plan.date) > new Date(item.latest)) {
          item.latest = plan.date;
        }
      });
      return Array.from(map.values()).sort((a, b) => new Date(b.latest) - new Date(a.latest));
    }, [myPlans]);

  useEffect(() => {
    if (editing) return;
    setNameInput(safeCurrentUser.name || '');
    setBioInput(safeCurrentUser.bio || '');
    setAvatarInput(safeCurrentUser.avatar || null);
  }, [editing, safeCurrentUser.name, safeCurrentUser.bio, safeCurrentUser.avatar]);

  if (!currentUserId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F4EE' }}>
        <Text style={{ color: '#6E655C' }}>正在恢复个人中心...</Text>
      </View>
    );
  }

  const myFriends = users.filter(u => (safeCurrentUser.friends || []).includes(u.id));
  const recommendFriends = users.filter(u => {
    if (u.id === currentUserId) return false;
    if ((safeCurrentUser.friends || []).includes(u.id)) return false;
    // 只显示有发布过内容的真实用户
    const userPosts = posts.filter(p => p.userId === u.id);
    const userPlans = plans.filter(p => p.userId === u.id);
    return userPosts.length > 0 || userPlans.length > 0;
  });

  const buildPostMediaItems = (post) => [
    ...((post.images || []).map(uri => ({ type: 'image', uri }))),
    ...((post.videos || []).map(uri => ({ type: 'video', uri }))),
  ];

  const openPostMediaViewer = (post) => {
    navigation.navigate('PostDetail', { postId: post.id, post });
  };

  const handleAddFriend = (user) => {
    Alert.alert('添加好友', `确认添加 ${user.name} 为好友？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '添加',
        onPress: async () => {
          const result = await dispatch({ type: 'ADD_FRIEND', payload: user.id });
          if (!result?.ok) {
            Alert.alert('添加失败', result?.error || '请稍后重试');
          }
        },
      },
    ]);
  };

  const handleRemoveFriend = (user) => {
    Alert.alert('移除好友', `确认移除 ${user.name}？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          const result = await dispatch({ type: 'REMOVE_FRIEND', payload: user.id });
          if (!result?.ok) {
            Alert.alert('移除失败', result?.error || '请稍后重试');
          }
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    if (savingProfile) return;

    const nextName = String(nameInput || '').trim();
    const nextBio = String(bioInput || '').trim();
    const nextAvatar = avatarInput || null;

    if (
      nextName === String(safeCurrentUser.name || '').trim() &&
      nextBio === String(safeCurrentUser.bio || '').trim() &&
      nextAvatar === (safeCurrentUser.avatar || null)
    ) {
      setEditing(false);
      return;
    }

    setSavingProfile(true);
    const result = await dispatch({
      type: 'UPDATE_PROFILE',
      payload: { name: nextName, bio: nextBio, avatar: nextAvatar },
    });
    setSavingProfile(false);
    if (!result?.ok) {
      Alert.alert('保存失败', result?.error || '请稍后重试');
      return;
    }
    setEditing(false);
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相册后再更换头像');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.45,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setAvatarInput(uri);
  };

  const handleLogout = async () => {
    const result = await dispatch({ type: 'LOGOUT' });
    if (!result?.ok) {
      Alert.alert('退出失败', result?.error || '请稍后重试');
    }
  };

  const renderPost = (item) => {
    const hasImages = item.images && item.images.length > 0;
    const hasVideos = item.videos && item.videos.length > 0;
    const hasMedia = hasImages || hasVideos;
    const mediaLabel = [
      hasImages ? `${item.images.length}图` : '',
      hasVideos ? `${item.videos.length}视频` : '',
    ].filter(Boolean).join(' · ');

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.miniCard}
        activeOpacity={0.88}
        onPress={() => openPostMediaViewer(item)}
      >
        {hasImages ? (
          <ReliableImage uri={item.images[0]} style={styles.miniImg} />
        ) : hasVideos ? (
          <View style={styles.videoThumbWrap}>
            <VideoPreviewCard uri={item.videos[0]} label="视频" showFloatingButton={false} style={[styles.miniImg, styles.videoThumbPlaceholder]} />
          </View>
        ) : (
          <View style={[styles.miniImg, styles.textThumb]}>
            <Text style={styles.thumbText} numberOfLines={3}>{item.text}</Text>
          </View>
        )}
        <Text style={styles.mediaBadge}>{mediaLabel || ' '}</Text>
        <Text style={styles.miniCaption} numberOfLines={2}>
          {item.text || (hasVideos ? '点击查看视频内容' : '图片动态')}
        </Text>
        <Text style={styles.miniTime}>{formatTime(item.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  const renderPlan = (item) => {
    const done = item.done;
    const total = item.total;
    const percent = total > 0 ? (done / total) * 100 : 0;
    const percentText = `${Math.round(percent)}%`;

    return (
      <View key={item.dateText} style={styles.planItem}>
        <View style={styles.planItemHeader}>
          <Text style={styles.planItemTitle}>{item.dateText}</Text>
          <View style={styles.planHeaderRight}>
            <Text style={styles.planItemDate}>每日进度</Text>
            <View style={styles.progressCircle}>
              <Text style={styles.progressCircleText}>{percentText}</Text>
            </View>
          </View>
        </View>
        <View style={styles.planProgress}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{done}/{total} 完成</Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    if (!currentUserId) return;
    dispatch({ type: 'REFRESH_MESSAGE_INBOX', payload: { userId: currentUserId } });
  }, [currentUserId]);

  useEffect(() => {
    if (!showInteractions || !currentUserId) return;

    let active = true;
    (async () => {
      const markRes = await dispatch({
        type: 'MARK_NOTIFICATIONS_READ',
        payload: { userId: currentUserId, readAt: new Date().toISOString() },
      });

      if (!active) return;

      if (!markRes?.ok) {
        Alert.alert('同步失败', markRes?.error || '消息已读状态同步失败，请稍后重试');
        return;
      }

      await dispatch({ type: 'REFRESH_MESSAGE_INBOX', payload: { userId: currentUserId } });
    })();

    return () => {
      active = false;
    };
  }, [showInteractions, currentUserId]);

  const markInteractionAsRead = async (interaction) => {
    if (!interaction?.id) return;
    await dispatch({
      type: 'MARK_INTERACTION_READ',
      payload: { userId: currentUserId, messageId: interaction.id, readAt: interaction?.createdAt || new Date().toISOString() },
    });
  };

  const openInteraction = async (interaction) => {
    await markInteractionAsRead(interaction);

    if (interaction.sourceType === 'post') {
      navigation.navigate('PostDetail', { postId: interaction.sourceId });
      return;
    }
    const targetKnowledge = (knowledge || []).find(item => item.id === interaction.sourceId);
    if (targetKnowledge) {
      navigation.navigate('KnowledgeDetail', { item: targetKnowledge });
    }
  };

  const handleToggleInteractions = () => {
    setShowInteractions(prev => !prev);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 个人信息卡片 */}
      <View style={styles.profileCard}>
        <View style={styles.profileCardTopRight}>
          <TouchableOpacity style={styles.msgIconBtn} onPress={handleToggleInteractions}>
            <Ionicons name="notifications-outline" size={18} color="#5B6763" />
            {incomingCommentCount > 0 && (
              <View style={styles.msgBadge}>
                <Text style={styles.msgBadgeText}>{incomingCommentCount > 99 ? '99+' : incomingCommentCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.profileTop}>
          <View>
            <Avatar user={{ ...safeCurrentUser, avatar: avatarInput || safeCurrentUser.avatar }} size={72} onPress={editing ? handlePickAvatar : undefined} />
            {editing && (
              <TouchableOpacity style={styles.avatarEditBtn} onPress={handlePickAvatar}>
                <Ionicons name="camera" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.profileInfo}>
            {editing ? (
              <>
                <TextInput style={styles.editInput} value={nameInput} onChangeText={setNameInput} placeholder="昵称" />
                <TextInput style={[styles.editInput, styles.editBioInput]} value={bioInput} onChangeText={setBioInput} placeholder="个性签名" multiline />
                <Text style={styles.avatarHint}>点击头像可更换头像</Text>
              </>
            ) : (
              <>
                <Text style={styles.profileName}>{safeCurrentUser.name}</Text>
                <Text style={styles.profileBio}>{safeCurrentUser.bio || '这个人很懒，什么都没留下~'}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.accountRow}>
          <Text style={styles.accountTag}>我的账号</Text>
          <View style={styles.accountActions}>
            {editing ? (
              <TouchableOpacity onPress={handleSaveProfile} style={[styles.accountBtn, savingProfile && styles.accountBtnDisabled]} disabled={savingProfile}>
                <Text style={styles.accountBtnText}>{savingProfile ? '保存中...' : '保存资料'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.accountBtn}>
                <Text style={styles.accountBtnText}>编辑资料</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutBtnText}>退出登录</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{myPosts.length}</Text>
            <Text style={styles.statLabel}>动态</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{myPlans.length}</Text>
            <Text style={styles.statLabel}>规划</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{myFriends.length}</Text>
            <Text style={styles.statLabel}>朋友</Text>
          </View>
        </View>
      </View>

      {/* 好友管理 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>添加好友</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.userList}>
            {recommendFriends.length === 0 ? <Text style={styles.tipText}>暂无可添加用户</Text> : recommendFriends.map(u => (
              <TouchableOpacity key={u.id} style={styles.userChip} onPress={() => handleAddFriend(u)}>
                <Avatar user={u} size={36} />
                <Text style={styles.userChipName}>{u.name}</Text>
                <Ionicons name="person-add" size={14} color="#4ECDC4" />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {incomingCommentCount > 0 && (
        <View style={styles.noticeBar}>
          <Ionicons name="notifications-outline" size={16} color="#FF8C42" />
          <Text style={styles.noticeText}>你收到了 {incomingCommentCount} 条新评论互动</Text>
        </View>
      )}

      {showInteractions && (
        <View style={styles.interactionPanel}>
          <View style={styles.interactionHeader}>
            <Text style={styles.sectionTitle}>互动消息</Text>
            <TouchableOpacity onPress={() => setShowInteractions(false)}>
              <Ionicons name="close" size={18} color="#999" />
            </TouchableOpacity>
          </View>
          {incomingInteractions.length === 0 ? (
            <Text style={styles.tipText}>暂无互动</Text>
          ) : incomingInteractions.map(item => (
            <TouchableOpacity key={`${item.sourceType}_${item.id}`} style={styles.interactionItem} onPress={() => openInteraction(item)}>
              <Avatar user={item.fromUser} size={28} />
              {!item.isRead && <View style={styles.unreadDot} />}
              <View style={styles.interactionTextWrap}>
                <Text style={styles.interactionTitle}>{item.fromUser.name}{item.isReplyToMe ? ' 回复了你' : ' 评论了你'}</Text>
                <Text style={styles.interactionMeta} numberOfLines={1}>
                  {item.sourceType === 'post' ? '动态' : '知识'}：{item.sourcePreview}
                </Text>
                <Text style={styles.interactionContent} numberOfLines={1}>{item.text || '（无文字内容）'}</Text>
              </View>
              <Text style={styles.interactionTime}>{formatTime(item.createdAt)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Tab */}
      <View style={styles.tabs}>
        {[
          { key: 'posts', label: '我的动态', icon: 'images-outline' },
          { key: 'plans', label: '我的规划', icon: 'calendar-outline' },
          { key: 'friends', label: '我的朋友', icon: 'people-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon} size={18} color={tab === t.key ? '#4ECDC4' : '#999'} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 内容 */}
      {tab === 'posts' && (
        <View style={styles.postsGrid}>
          {myPosts.length === 0 ? (
            <Text style={styles.emptyText}>还没有发布动态</Text>
          ) : (
            myPosts.map(renderPost)
          )}
        </View>
      )}

      {tab === 'plans' && (
        <View style={styles.planList}>
          {myPlanDailyProgress.length === 0 ? (
            <Text style={styles.emptyText}>还没有规划</Text>
          ) : (
            myPlanDailyProgress.map(renderPlan)
          )}
        </View>
      )}

      {tab === 'friends' && (
        <View style={styles.friendList}>
          {myFriends.length === 0 ? (
            <Text style={styles.emptyText}>还没有添加朋友</Text>
          ) : (
            myFriends.map(friend => (
              <TouchableOpacity
                key={friend.id}
                style={styles.friendItem}
                onPress={() => navigation.navigate('FriendProfile', { userId: friend.id })}
              >
                <Avatar user={friend} size={50} />
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendBio} numberOfLines={1}>{friend.bio || '暂无签名'}</Text>
                </View>
                <View style={styles.friendActions}>
                  <TouchableOpacity onPress={() => handleRemoveFriend(friend)}>
                    <Ionicons name="person-remove-outline" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color="#ddd" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F4EE' },
  contentContainer: { paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#FFFDF8',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 12,
  },
  profileCardTopRight: {
    position: 'absolute',
    right: 16,
    top: 58,
    zIndex: 2,
  },
  msgIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3EDE4',
  },
  msgBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
  },
  msgBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  profileTop: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 20 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 22, fontWeight: 'bold', color: '#2F2A24', marginBottom: 6 },
  profileBio: { fontSize: 14, color: '#7D746B', lineHeight: 20 },
  editInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    fontSize: 14,
  },
  editBioInput: { minHeight: 44 },
  avatarEditBtn: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C49A4B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFDF8',
  },
  avatarHint: { fontSize: 11, color: '#8A8279', marginTop: 2 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  accountActions: { flexDirection: 'row', gap: 8 },
  accountTag: { fontSize: 12, color: '#C49A4B', fontWeight: '700' },
  accountBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F6EEDC' },
  accountBtnDisabled: { opacity: 0.65 },
  accountBtnText: { color: '#8A7242', fontWeight: '600', fontSize: 12 },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFEAEA' },
  logoutBtnText: { color: '#FF6B6B', fontWeight: '600', fontSize: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 13, color: '#999', marginTop: 2 },
  section: { backgroundColor: '#FFFDF8', padding: 16, marginBottom: 12 },
  noticeBar: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFF4E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: { color: '#E67A2E', fontSize: 13, fontWeight: '600' },
  interactionPanel: {
    backgroundColor: '#FFFDF8',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  interactionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  interactionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
  interactionTextWrap: { flex: 1 },
  interactionTitle: { fontSize: 12, color: '#333', fontWeight: '600' },
  interactionMeta: { fontSize: 11, color: '#9AA5AE', marginTop: 2 },
  interactionContent: { fontSize: 12, color: '#777', marginTop: 2 },
  interactionTime: { fontSize: 11, color: '#BBB' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#2F2A24', marginBottom: 12 },
  userList: { flexDirection: 'row', gap: 12 },
  userChip: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    minWidth: 70,
    position: 'relative',
  },
  userChipName: { fontSize: 12, color: '#666', marginTop: 4 },
  tipText: { color: '#999', fontSize: 13 },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFDF8', borderBottomWidth: 1, borderBottomColor: '#E8E1D8', marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#C49A4B' },
  tabText: { fontSize: 13, color: '#999' },
  tabTextActive: { color: '#C49A4B', fontWeight: '600' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  miniCard: { width: '30%', minHeight: 190 },
  miniImg: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  textThumb: { backgroundColor: '#E9F7F5', justifyContent: 'center', padding: 6 },
  videoThumbWrap: { position: 'relative' },
  videoThumbPlaceholder: {
    overflow: 'hidden',
  },
  thumbText: { fontSize: 11, color: '#8A7242', lineHeight: 16 },
  mediaBadge: { fontSize: 10, color: '#8A7242', marginTop: 6, fontWeight: '700', minHeight: 14 },
  miniCaption: { fontSize: 11, color: '#6F655D', lineHeight: 15, marginTop: 2, minHeight: 32 },
  miniTime: { fontSize: 10, color: '#A79C90', marginTop: 'auto', textAlign: 'left', paddingTop: 4 },
  planList: { paddingHorizontal: 12, gap: 10 },
  planItem: { backgroundColor: '#FFFDF8', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EFE7D6' },
  planItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  planHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planItemTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  planItemDate: { fontSize: 12, color: '#8A8279' },
  planProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#C49A4B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6EEDC',
  },
  progressCircleText: {
    fontSize: 11,
    color: '#8A7242',
    fontWeight: '700',
  },
  progressBar: { flex: 1, height: 5, backgroundColor: '#EFE7D6', borderRadius: 3 },
  progressFill: { height: 5, backgroundColor: '#C49A4B', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#8A7242' },
  friendList: { paddingHorizontal: 12, gap: 8 },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    padding: 14,
  },
  friendInfo: { flex: 1 },
  friendActions: { alignItems: 'center', justifyContent: 'space-between', height: 36 },
  friendName: { fontSize: 15, fontWeight: '600', color: '#333' },
  friendBio: { fontSize: 13, color: '#999', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#bbb', fontSize: 14, marginTop: 30, width: '100%' },
});
