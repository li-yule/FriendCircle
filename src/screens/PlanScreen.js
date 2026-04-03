import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatDate, formatDateKey, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

export default function PlanScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { plans, currentUser, users } = state;
  const [activeTab, setActiveTab] = useState('mine'); // 'mine' | 'friends'
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [pickerVisible, setPickerVisible] = useState(false);

  if (!currentUser?.id) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.emptyText}>正在恢复登录状态...</Text>
      </View>
    );
  }

  const getUserById = id => users.find(u => u.id === id) || { name: '未知', avatarColor: '#ccc' };
  const myFriendIds = new Set(currentUser.friends || []);

  const myPlans = useMemo(() => plans
    .filter(p => p.userId === currentUser.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date)), [plans, currentUser.id]);

  const friendPlans = useMemo(() => plans
    .filter(p => p.userId !== currentUser.id && myFriendIds.has(p.userId))
    .sort((a, b) => new Date(a.date) - new Date(b.date)), [plans, currentUser.id, currentUser.friends]);

  const availableDateKeys = useMemo(
    () => [...new Set((activeTab === 'mine' ? myPlans : friendPlans).map(p => toDateKey(p.date)))].sort(),
    [activeTab, friendPlans, myPlans]
  );

  useEffect(() => {
    const todayKey = toDateKey(new Date());
    if (availableDateKeys.length === 0) {
      setSelectedDate(todayKey);
      return;
    }
    if (!availableDateKeys.includes(selectedDate) && selectedDate !== todayKey) {
      setSelectedDate(todayKey);
    }
  }, [availableDateKeys, selectedDate]);

  const data = (activeTab === 'mine' ? myPlans : friendPlans).filter(item => toDateKey(item.date) === selectedDate);

  const selectedSummary = useMemo(() => {
    const mineToday = myPlans.filter(item => toDateKey(item.date) === selectedDate);
    const total = mineToday.length;
    const done = mineToday.reduce((sum, item) => {
      const taskList = item.tasks || [];
      const taskDone = taskList.length > 0 && taskList.every(task => task.done);
      return sum + (item.done || taskDone ? 1 : 0);
    }, 0);
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
  }, [myPlans, selectedDate]);

  const moveSelectedDate = (offset) => {
    if (availableDateKeys.length === 0) return;
    const currentTs = new Date(`${selectedDate}T00:00:00`).getTime();
    if (Number.isNaN(currentTs)) return;

    if (offset < 0) {
      const previous = availableDateKeys
        .filter(key => new Date(`${key}T00:00:00`).getTime() < currentTs)
        .sort((a, b) => new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`))[0];
      if (previous) setSelectedDate(previous);
      return;
    }

    const next = availableDateKeys
      .filter(key => new Date(`${key}T00:00:00`).getTime() > currentTs)
      .sort((a, b) => new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`))[0];
    if (next) setSelectedDate(next);
  };

  const handleDeletePlan = (plan) => {
    if (!plan || plan.userId !== currentUser.id) return;
    Alert.alert('删除规划', '确认删除这条规划？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const result = await dispatch({ type: 'DELETE_PLAN', payload: plan.id });
          if (!result?.ok) {
            Alert.alert('删除失败', result?.error || '请稍后重试');
          }
        },
      },
    ]);
  };

  const renderMinePlan = (plan) => {
    const taskList = plan.tasks || [];
    const taskDone = taskList.length > 0 && taskList.every(task => task.done);
    const done = Boolean(plan.done || taskDone);
    const percentText = done ? '100%' : '0%';

    return (
      <View key={plan.id} style={styles.friendPlanCard}>
        <View style={styles.minePlanRow}>
          <TouchableOpacity
            style={[styles.taskCircle, done && styles.taskCircleDone]}
            onPress={() => dispatch({ type: 'TOGGLE_PLAN_DONE', payload: { planId: plan.id } })}
          >
            {done && <Ionicons name="checkmark" size={12} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.minePlanMain}>
            <Text style={styles.minePlanDate}>{formatDate(plan.date)}</Text>
            {!!plan.title && <Text style={[styles.friendPlanTitle, done && styles.donePlanTitle]}>{plan.title}</Text>}
          </View>

          <TouchableOpacity onPress={() => handleDeletePlan(plan)}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFriendPlan = (item) => {
    const author = getUserById(item.userId);

    return (
      <View key={item.id} style={styles.friendPlanCard}>
        <View style={styles.friendPlanHeader}>
          <Avatar user={author} size={36} />
          <View style={styles.friendPlanInfo}>
            <Text style={styles.friendPlanAuthor}>{author.name}</Text>
            <Text style={styles.friendPlanDate}>{formatDate(item.date)}</Text>
          </View>
        </View>

        {!!item.title && <Text style={styles.friendPlanTitle}>{item.title}</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <Text style={styles.title}>打卡</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('NewPlan')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab切换 */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mine' && styles.tabActive]}
          onPress={() => setActiveTab('mine')}
        >
          <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextActive]}>我的规划</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>朋友动态</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dateSwitchRow}>
        <TouchableOpacity onPress={() => moveSelectedDate(-1)}>
          <Ionicons name="chevron-back" size={22} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateCenterBtn} onPress={() => setPickerVisible(true)}>
          <Text style={styles.dateSwitchText}>{formatDateKey(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={16} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => moveSelectedDate(1)}>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>
      </View>

      {activeTab === 'mine' && (
        <View style={styles.ringWrap}>
          <View style={styles.ringOuter}>
            <View style={styles.ringDot} />
            <View style={styles.ringInner}>
              <Text style={styles.ringCount}>{selectedSummary.done}</Text>
              <Text style={styles.ringPercent}>{selectedSummary.percent}%</Text>
              <Text style={styles.ringLabel}>完成度</Text>
            </View>
          </View>
          <Text style={styles.ringSubText}>{selectedSummary.done}/{selectedSummary.total} 项已完成</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionMarker} />
          <Text style={styles.sectionTitle}>{activeTab === 'mine' ? '规划列表' : '朋友规划'}</Text>
        </View>

        {data.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>
              {activeTab === 'mine' ? '这个日期还没有规划，点右上角 + 发布。' : '朋友这个日期还没有发布规划'}
            </Text>
          </View>
        ) : (
          activeTab === 'mine'
            ? data.map(item => renderMinePlan(item))
            : data.map(item => renderFriendPlan(item))
        )}
      </ScrollView>

      <DatePickerSheet
        visible={pickerVisible}
        title="选择查看日期"
        value={selectedDate}
        onClose={() => setPickerVisible(false)}
        onChange={setSelectedDate}
      />
    </View>
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
    borderBottomColor: '#F0F0F0',
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
  tabs: { flexDirection: 'row', backgroundColor: '#FFFDF8', borderBottomWidth: 1, borderBottomColor: '#E8E1D8' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#C49A4B' },
  tabText: { fontSize: 15, color: '#999' },
  tabTextActive: { color: '#C49A4B', fontWeight: '600' },
  dateSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFDF8',
  },
  dateCenterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateSwitchText: { fontSize: 18, fontWeight: '700', color: '#2F2A24' },
  ringWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F7F4EE',
  },
  ringOuter: {
    width: 172,
    height: 172,
    borderRadius: 86,
    borderWidth: 10,
    borderColor: '#EFE7D6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#C49A4B',
    top: -8,
    left: '50%',
    marginLeft: -8,
  },
  ringInner: { alignItems: 'center' },
  ringCount: { fontSize: 46, lineHeight: 50, color: '#C49A4B', fontWeight: '300' },
  ringPercent: { fontSize: 18, color: '#C49A4B', fontWeight: '600', marginTop: 4 },
  ringLabel: { marginTop: 2, fontSize: 14, color: '#8A8279', fontWeight: '600' },
  ringSubText: { marginTop: 12, fontSize: 14, color: '#867D73' },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionMarker: { width: 4, height: 20, borderRadius: 999, backgroundColor: '#FF7E79', marginRight: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#534A41' },
  friendPlanCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  friendPlanHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  minePlanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  minePlanMain: { flex: 1, gap: 4 },
  taskCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C49A4B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFDF8',
  },
  taskCircleDone: {
    backgroundColor: '#C49A4B',
  },
  minePlanDate: { fontSize: 12, color: '#8A969E' },
  planProgressText: { marginTop: 8, fontSize: 12, color: '#C49A4B', fontWeight: '600' },
  friendPlanInfo: { flex: 1, marginLeft: 10 },
  friendPlanAuthor: { fontSize: 15, fontWeight: '700', color: '#3F3932' },
  friendPlanDate: { marginTop: 2, fontSize: 12, color: '#8A969E' },
  friendPlanTitle: { fontSize: 16, fontWeight: '700', color: '#3F3932' },
  donePlanTitle: { textDecorationLine: 'line-through', color: '#9C948A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
