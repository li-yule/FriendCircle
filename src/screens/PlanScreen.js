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

  const moveSelectedDate = (offset) => {
    if (availableDateKeys.length === 0) return;
    const idx = availableDateKeys.indexOf(selectedDate);
    const safeIdx = idx < 0 ? 0 : idx;
    const nextIdx = Math.min(availableDateKeys.length - 1, Math.max(0, safeIdx + offset));
    setSelectedDate(availableDateKeys[nextIdx]);
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
    return (
      <View key={plan.id} style={styles.friendPlanCard}>
        <View style={styles.minePlanHeader}>
          <Text style={styles.minePlanDate}>{formatDate(plan.date)}</Text>
          <TouchableOpacity onPress={() => handleDeletePlan(plan)}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>

        {!!plan.title && <Text style={styles.friendPlanTitle}>{plan.title}</Text>}
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
  container: { flex: 1, backgroundColor: '#F3F5F7' },
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
  title: { fontSize: 20, fontWeight: 'bold', color: '#2D3741' },
  addBtn: {
    backgroundColor: '#19C2AF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#19C2AF' },
  tabText: { fontSize: 15, color: '#999' },
  tabTextActive: { color: '#19C2AF', fontWeight: '600' },
  dateSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  dateCenterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateSwitchText: { fontSize: 18, fontWeight: '700', color: '#2D3741' },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionMarker: { width: 4, height: 20, borderRadius: 999, backgroundColor: '#FF7E79', marginRight: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#4B5A64' },
  friendPlanCard: {
    backgroundColor: '#EEF4F5',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  friendPlanHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  minePlanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  minePlanDate: { fontSize: 12, color: '#8A969E' },
  friendPlanInfo: { flex: 1, marginLeft: 10 },
  friendPlanAuthor: { fontSize: 15, fontWeight: '700', color: '#31404A' },
  friendPlanDate: { marginTop: 2, fontSize: 12, color: '#8A969E' },
  friendPlanTitle: { fontSize: 16, fontWeight: '700', color: '#33414B' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
