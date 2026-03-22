import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatDate, formatDateKey, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

function ProgressRing({ percent, size = 160, strokeWidth = 12 }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * safePercent) / 100;

  return (
    <View style={[styles.progressRingWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#D7DDE2"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#19C2AF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          originX={size / 2}
          originY={size / 2}
          rotation="-90"
        />
      </Svg>
      <Text style={styles.progressRingPercent}>{safePercent}%</Text>
      <Text style={styles.progressRingLabel}>完成度</Text>
    </View>
  );
}

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
    if (availableDateKeys.length === 0) {
      setSelectedDate(toDateKey(new Date()));
      return;
    }
    if (!availableDateKeys.includes(selectedDate)) {
      setSelectedDate(availableDateKeys[0]);
    }
  }, [availableDateKeys, selectedDate]);

  const data = (activeTab === 'mine' ? myPlans : friendPlans).filter(item => toDateKey(item.date) === selectedDate);
  const mineTasks = useMemo(
    () => data.flatMap(plan => (plan.tasks || []).map(task => ({
      ...task,
      planId: plan.id,
      planUserId: plan.userId,
      planTitle: plan.title,
      planDate: plan.date,
    }))).sort((a, b) => (a.reminderTime || '99:99').localeCompare(b.reminderTime || '99:99')),
    [data]
  );

  const selectedDone = data.reduce((sum, plan) => sum + (plan.tasks || []).filter(t => t.done).length, 0);
  const selectedTotal = data.reduce((sum, plan) => sum + (plan.tasks || []).length, 0);
  const selectedPercent = selectedTotal > 0 ? Math.round((selectedDone / selectedTotal) * 100) : 0;

  const moveSelectedDate = (offset) => {
    if (availableDateKeys.length === 0) return;
    const idx = availableDateKeys.indexOf(selectedDate);
    const safeIdx = idx < 0 ? 0 : idx;
    const nextIdx = Math.min(availableDateKeys.length - 1, Math.max(0, safeIdx + offset));
    setSelectedDate(availableDateKeys[nextIdx]);
  };

  const handleToggleTask = (planId, taskId, planUserId) => {
    if (planUserId !== currentUser.id) return;
    dispatch({ type: 'TOGGLE_PLAN_TASK', payload: { planId, taskId } });
  };

  const renderTaskCard = (task, item, isMine) => {
    const toggleTask = () => handleToggleTask(item.planId || item.id, task.id, item.planUserId || item.userId);

    return (
      <TouchableOpacity
        key={task.id}
        style={[styles.taskCard, task.done && styles.taskCardDone]}
        onPress={() => isMine && toggleTask()}
        activeOpacity={isMine ? 0.7 : 1}
      >
        <TouchableOpacity
          style={[styles.taskCircle, task.done && styles.taskCircleDone]}
          onPress={() => isMine && toggleTask()}
          activeOpacity={isMine ? 0.7 : 1}
          disabled={!isMine}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {task.done && <Ionicons name="checkmark" size={18} color="#fff" />}
        </TouchableOpacity>

        <View style={styles.taskContent}>
          <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.text}</Text>
          <View style={styles.taskMetaRow}>
            <Ionicons name="alarm-outline" size={14} color="#F39AB2" />
            <Text style={styles.taskTime}>{task.reminderTime || '--:--'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMineTask = (task) => renderTaskCard(task, task, true);

  const renderFriendPlan = (item) => {
    const author = getUserById(item.userId);
    const doneTasks = (item.tasks || []).filter(t => t.done).length;
    const totalTasks = (item.tasks || []).length;

    return (
      <View key={item.id} style={styles.friendPlanCard}>
        <View style={styles.friendPlanHeader}>
          <Avatar user={author} size={36} />
          <View style={styles.friendPlanInfo}>
            <Text style={styles.friendPlanAuthor}>{author.name}</Text>
            <Text style={styles.friendPlanDate}>{formatDate(item.date)}</Text>
          </View>
          <Text style={styles.friendPlanProgress}>{doneTasks}/{totalTasks}</Text>
        </View>

        {!!item.title && <Text style={styles.friendPlanTitle}>{item.title}</Text>}
        {(item.tasks || []).map(task => renderTaskCard(task, item, false))}
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
        {activeTab === 'mine' && (
          <View style={styles.summaryBlock}>
            <ProgressRing percent={selectedPercent} />
            <Text style={styles.summaryHint}>{selectedDone}/{selectedTotal} 项已完成</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionMarker} />
          <Text style={styles.sectionTitle}>{activeTab === 'mine' ? '我的规划' : '朋友规划'}</Text>
        </View>

        {(activeTab === 'mine' ? mineTasks.length === 0 : data.length === 0) ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>
              {activeTab === 'mine' ? '这个日期还没有可显示的小任务，点右上角 + 添加！' : '朋友这个日期还没有发布规划'}
            </Text>
          </View>
        ) : (
          activeTab === 'mine'
            ? mineTasks.map(task => renderMineTask(task))
            : data.map(item => renderFriendPlan(item))
        )}
      </ScrollView>

      <DatePickerSheet
        visible={pickerVisible}
        title="选择查看日期"
        value={selectedDate}
        minDate={availableDateKeys[0]}
        maxDate={availableDateKeys[availableDateKeys.length - 1]}
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
  summaryBlock: { alignItems: 'center', marginBottom: 22 },
  progressRingWrap: { alignItems: 'center', justifyContent: 'center' },
  progressRingPercent: {
    position: 'absolute',
    top: '34%',
    fontSize: 22,
    fontWeight: '800',
    color: '#19C2AF',
  },
  progressRingLabel: {
    position: 'absolute',
    top: '54%',
    fontSize: 15,
    fontWeight: '600',
    color: '#6E7A83',
  },
  summaryHint: { marginTop: 10, fontSize: 13, color: '#98A1A9' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionMarker: { width: 4, height: 20, borderRadius: 999, backgroundColor: '#FF7E79', marginRight: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#4B5A64' },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#09121A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  taskCardDone: { backgroundColor: '#FFFFFF' },
  taskCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#D3DBE2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  taskCircleDone: { backgroundColor: '#60D0C4', borderColor: '#60D0C4' },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 17, fontWeight: '700', color: '#394751' },
  taskTitleDone: { color: '#B4BDC4', textDecorationLine: 'line-through' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  taskTime: { fontSize: 14, color: '#F5B86E', fontWeight: '500' },
  friendPlanCard: {
    backgroundColor: '#EEF4F5',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  friendPlanHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  friendPlanInfo: { flex: 1, marginLeft: 10 },
  friendPlanAuthor: { fontSize: 15, fontWeight: '700', color: '#31404A' },
  friendPlanDate: { marginTop: 2, fontSize: 12, color: '#8A969E' },
  friendPlanProgress: { fontSize: 14, fontWeight: '700', color: '#19C2AF' },
  friendPlanTitle: { marginBottom: 10, fontSize: 16, fontWeight: '700', color: '#33414B' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
