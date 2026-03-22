import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import VideoPreviewCard from '../components/VideoPreviewCard';
import { formatTime, formatDate } from '../utils/helpers';

export default function ProfileScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { currentUser, users, posts, plans } = state;
  const [tab, setTab] = useState('posts'); // 'posts' | 'plans' | 'friends'
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name || '');
  const [bioInput, setBioInput] = useState(currentUser.bio || '');

  const myPosts = posts.filter(p => p.userId === currentUser.id);
  const myPlans = plans.filter(p => p.userId === currentUser.id);
  const myFriends = users.filter(u => (currentUser.friends || []).includes(u.id));
  const recommendFriends = users.filter(u => u.id !== currentUser.id && !(currentUser.friends || []).includes(u.id));

  const buildPostMediaItems = (post) => [
    ...((post.images || []).map(uri => ({ type: 'image', uri }))),
    ...((post.videos || []).map(uri => ({ type: 'video', uri }))),
  ];

  const openPostMediaViewer = (post) => {
    const items = buildPostMediaItems(post);
    if (items.length === 0) return;
    navigation.navigate('MediaViewer', {
      items,
      initialIndex: 0,
      sourceTab: 'ProfileTab',
    });
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
    const result = await dispatch({
      type: 'UPDATE_PROFILE',
      payload: { name: nameInput, bio: bioInput },
    });
    if (!result?.ok) {
      Alert.alert('保存失败', result?.error || '请稍后重试');
      return;
    }
    setEditing(false);
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
        activeOpacity={hasMedia ? 0.88 : 1}
        onPress={hasMedia ? () => openPostMediaViewer(item) : undefined}
      >
        {hasImages ? (
          <Image source={{ uri: item.images[0] }} style={styles.miniImg} />
        ) : hasVideos ? (
          <View style={styles.videoThumbWrap}>
            <VideoPreviewCard uri={item.videos[0]} label="视频" style={[styles.miniImg, styles.videoThumbPlaceholder]} />
            <View style={styles.videoThumbOverlay}>
              <Ionicons name="play-circle" size={28} color="#fff" />
            </View>
          </View>
        ) : (
          <View style={[styles.miniImg, styles.textThumb]}>
            <Text style={styles.thumbText} numberOfLines={3}>{item.text}</Text>
          </View>
        )}
        {mediaLabel ? <Text style={styles.mediaBadge}>{mediaLabel}</Text> : null}
        <Text style={styles.miniCaption} numberOfLines={2}>
          {item.text || (hasVideos ? '点击查看视频内容' : '图片动态')}
        </Text>
        <Text style={styles.miniTime}>{formatTime(item.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  const renderPlan = (item) => {
    const done = (item.tasks || []).filter(t => t.done).length;
    const total = (item.tasks || []).length;
    return (
      <View key={item.id} style={styles.planItem}>
        <View style={styles.planItemHeader}>
          <Text style={styles.planItemTitle}>{item.title || '规划'}</Text>
          <Text style={styles.planItemDate}>{formatDate(item.date)}</Text>
        </View>
        {total > 0 && (
          <View style={styles.planProgress}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{done}/{total} 完成</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 个人信息卡片 */}
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Avatar user={currentUser} size={72} />
          <View style={styles.profileInfo}>
            {editing ? (
              <>
                <TextInput style={styles.editInput} value={nameInput} onChangeText={setNameInput} placeholder="昵称" />
                <TextInput style={[styles.editInput, styles.editBioInput]} value={bioInput} onChangeText={setBioInput} placeholder="个性签名" multiline />
              </>
            ) : (
              <>
                <Text style={styles.profileName}>{currentUser.name}</Text>
                <Text style={styles.profileBio}>{currentUser.bio || '这个人很懒，什么都没留下~'}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.accountRow}>
          <Text style={styles.accountTag}>我的账号</Text>
          <View style={styles.accountActions}>
            {editing ? (
              <TouchableOpacity onPress={handleSaveProfile} style={styles.accountBtn}>
                <Text style={styles.accountBtnText}>保存资料</Text>
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
          {myPlans.length === 0 ? (
            <Text style={styles.emptyText}>还没有规划</Text>
          ) : (
            myPlans.map(renderPlan)
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  contentContainer: { paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 12,
  },
  profileTop: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 20 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  profileBio: { fontSize: 14, color: '#888', lineHeight: 20 },
  editInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    fontSize: 14,
  },
  editBioInput: { minHeight: 44 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  accountActions: { flexDirection: 'row', gap: 8 },
  accountTag: { fontSize: 12, color: '#4ECDC4', fontWeight: '700' },
  accountBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E8F9F8' },
  accountBtnText: { color: '#4ECDC4', fontWeight: '600', fontSize: 12 },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFEAEA' },
  logoutBtnText: { color: '#FF6B6B', fontWeight: '600', fontSize: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 13, color: '#999', marginTop: 2 },
  section: { backgroundColor: '#fff', padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 12 },
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
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4ECDC4' },
  tabText: { fontSize: 13, color: '#999' },
  tabTextActive: { color: '#4ECDC4', fontWeight: '600' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  miniCard: { width: '30%' },
  miniImg: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  textThumb: { backgroundColor: '#E8F9F8', justifyContent: 'center', padding: 6 },
  videoThumbWrap: { position: 'relative' },
  videoThumbPlaceholder: {
    overflow: 'hidden',
  },
  videoThumbOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
  },
  thumbText: { fontSize: 11, color: '#4ECDC4', lineHeight: 16 },
  mediaBadge: { fontSize: 10, color: '#4ECDC4', marginTop: 6, fontWeight: '700' },
  miniCaption: { fontSize: 11, color: '#666', lineHeight: 15, marginTop: 2, minHeight: 30 },
  miniTime: { fontSize: 10, color: '#bbb', marginTop: 4, textAlign: 'center' },
  planList: { paddingHorizontal: 12, gap: 10 },
  planItem: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  planItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  planItemTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  planItemDate: { fontSize: 12, color: '#999' },
  planProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 5, backgroundColor: '#F0F0F0', borderRadius: 3 },
  progressFill: { height: 5, backgroundColor: '#FF6B6B', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#FF6B6B' },
  friendList: { paddingHorizontal: 12, gap: 8 },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  friendInfo: { flex: 1 },
  friendActions: { alignItems: 'center', justifyContent: 'space-between', height: 36 },
  friendName: { fontSize: 15, fontWeight: '600', color: '#333' },
  friendBio: { fontSize: 13, color: '#999', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#bbb', fontSize: 14, marginTop: 30, width: '100%' },
});
