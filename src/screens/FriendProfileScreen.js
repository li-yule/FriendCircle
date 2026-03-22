import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatTime, formatDate } from '../utils/helpers';

export default function FriendProfileScreen({ navigation, route }) {
  const { state } = useApp();
  const { users, posts, plans } = state;
  const userId = route.params?.userId;
  const user = users.find(u => u.id === userId);
  const [tab, setTab] = useState('posts');

  if (!user) {
    navigation.goBack();
    return null;
  }

  const userPosts = posts.filter(p => p.userId === userId);
  const userPlans = plans.filter(p => p.userId === userId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 返回按钮 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{user.name} 的主页</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* 个人信息 */}
      <View style={styles.profileCard}>
        <Avatar user={user} size={72} />
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.bio}>{user.bio || '这个人很懒，什么都没留下~'}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{userPosts.length}</Text>
            <Text style={styles.statLabel}>动态</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{userPlans.length}</Text>
            <Text style={styles.statLabel}>规划</Text>
          </View>
        </View>
      </View>

      {/* Tab */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'posts' && styles.tabActive]}
          onPress={() => setTab('posts')}
        >
          <Ionicons name="images-outline" size={18} color={tab === 'posts' ? '#4ECDC4' : '#999'} />
          <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>动态</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'plans' && styles.tabActive]}
          onPress={() => setTab('plans')}
        >
          <Ionicons name="calendar-outline" size={18} color={tab === 'plans' ? '#4ECDC4' : '#999'} />
          <Text style={[styles.tabText, tab === 'plans' && styles.tabTextActive]}>规划</Text>
        </TouchableOpacity>
      </View>

      {/* 动态 */}
      {tab === 'posts' && (
        <View style={styles.postsGrid}>
          {userPosts.length === 0 ? (
            <Text style={styles.emptyText}>TA 还没有发布动态</Text>
          ) : (
            userPosts.map(item => (
              <View key={item.id} style={styles.postCard}>
                {item.images && item.images.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {item.images.map((uri, i) => (
                      <Image key={i} source={{ uri }} style={styles.postImage} />
                    ))}
                  </ScrollView>
                ) : null}
                {item.text ? <Text style={styles.postText} numberOfLines={3}>{item.text}</Text> : null}
                <Text style={styles.postTime}>{formatTime(item.createdAt)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* 规划 */}
      {tab === 'plans' && (
        <View style={styles.planList}>
          {userPlans.length === 0 ? (
            <Text style={styles.emptyText}>TA 还没有发布规划</Text>
          ) : (
            userPlans.map(item => {
              const done = (item.tasks || []).filter(t => t.done).length;
              const total = (item.tasks || []).length;
              return (
                <View key={item.id} style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <Text style={styles.planTitle}>{item.title || '规划'}</Text>
                    <Text style={styles.planDate}>{formatDate(item.date)}</Text>
                  </View>
                  {total > 0 && (
                    <View style={styles.progressRow}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
                      </View>
                      <Text style={styles.progressLabel}>{done}/{total}</Text>
                    </View>
                  )}
                  {(item.tasks || []).map(task => (
                    <View key={task.id} style={styles.taskRow}>
                      <Ionicons
                        name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={task.done ? '#4ECDC4' : '#ddd'}
                      />
                      <Text style={[styles.taskText, task.done && styles.taskDone]}>{task.text}</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  contentContainer: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  profileCard: { alignItems: 'center', backgroundColor: '#fff', paddingVertical: 24, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 12 },
  bio: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', gap: 40, marginTop: 20 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 13, color: '#999' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4ECDC4' },
  tabText: { fontSize: 14, color: '#999' },
  tabTextActive: { color: '#4ECDC4', fontWeight: '600' },
  postsGrid: { paddingHorizontal: 12, gap: 12 },
  postCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  postImage: { width: 120, height: 120, borderRadius: 8, marginRight: 8 },
  postText: { fontSize: 14, color: '#333', lineHeight: 20 },
  postTime: { fontSize: 11, color: '#bbb', marginTop: 6 },
  planList: { paddingHorizontal: 12, gap: 10 },
  planCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  planTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  planDate: { fontSize: 12, color: '#999' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressBar: { flex: 1, height: 5, backgroundColor: '#F0F0F0', borderRadius: 3 },
  progressFill: { height: 5, backgroundColor: '#FF6B6B', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#FF6B6B' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  taskText: { fontSize: 14, color: '#333' },
  taskDone: { textDecorationLine: 'line-through', color: '#bbb' },
  emptyText: { textAlign: 'center', color: '#bbb', fontSize: 14, marginTop: 30, width: '100%', paddingHorizontal: 20 },
});
