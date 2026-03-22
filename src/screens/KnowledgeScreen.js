import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, TextInput, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { DEFAULT_SUBJECTS } from '../data/initialData';
import { formatTime } from '../utils/helpers';

const SUBJECT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#87CEEB', '#D4A5A5'];

function getSubjectColor(subject) {
  if (!subject) return '#999';
  const code = subject.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return SUBJECT_COLORS[code % SUBJECT_COLORS.length];
}

export default function KnowledgeScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { knowledge, currentUser, users } = state;
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchText, setSearchText] = useState('');

  const getUserById = id => users.find(u => u.id === id) || { name: '未知', avatarColor: '#ccc' };
  const friendIds = new Set(currentUser.friends || []);
  const mySubjectList = (currentUser.subjects && currentUser.subjects.length > 0)
    ? currentUser.subjects
    : DEFAULT_SUBJECTS.slice(0, 2);
  const mySubjects = new Set(mySubjectList);

  const visibleKnowledge = knowledge.filter(item => {
    if (item.userId === currentUser.id) return true;
    if (!friendIds.has(item.userId)) return false;
    const author = getUserById(item.userId);
    const authorSubjects = new Set(author.subjects || []);
    return mySubjects.has(item.subject) && authorSubjects.has(item.subject);
  });

  const availableSubjects = ['all', ...new Set([
    ...(currentUser.subjects || []),
    ...visibleKnowledge.map(item => item.subject),
  ])];

  const filtered = visibleKnowledge.filter(k => {
    const matchSubject = selectedSubject === 'all' || k.subject === selectedSubject;
    const matchType = selectedType === 'all' || (k.type || 'knowledge_point') === selectedType;
    const author = getUserById(k.userId);
    const sourceText = `${k.subject || ''} ${author.name || ''} ${(k.tags || []).join(' ')} ${k.question || ''} ${k.summary || ''} ${k.correctAnswer || ''} ${k.wrongAnswer || ''}`.toLowerCase();
    const matchSearch = !searchText || sourceText.includes(searchText.toLowerCase());
    return matchSubject && matchType && matchSearch;
  });

  const handleAddSubject = () => {
    const subject = subjectInput.trim();
    if (!subject) return;
    if ((currentUser.subjects || []).includes(subject)) {
      Alert.alert('提示', '该学科已存在');
      return;
    }
    dispatch({ type: 'ADD_SUBJECT', payload: subject });
    setSelectedSubject(subject);
    setSubjectInput('');
  };

  const handleLike = (knowledgeId) => {
    dispatch({ type: 'LIKE_KNOWLEDGE', payload: { knowledgeId, userId: currentUser.id } });
  };

  const handleRemoveSubject = (subject) => {
    if (!(currentUser.subjects || []).includes(subject)) return;
    if ((currentUser.subjects || []).length <= 1) {
      Alert.alert('提示', '至少保留一个学科');
      return;
    }

    Alert.alert('删除学科', `确认删除学科“${subject}”？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const result = await dispatch({ type: 'REMOVE_SUBJECT', payload: subject });
          if (!result?.ok) {
            Alert.alert('删除失败', result?.error || '请稍后重试');
            return;
          }
          if (selectedSubject === subject) {
            setSelectedSubject('all');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const author = getUserById(item.userId);
    const subjectColor = getSubjectColor(item.subject);
    const liked = (item.likes || []).includes(currentUser.id);

    return (
      <View style={styles.card}>
        {/* 头部 */}
        <View style={styles.cardHeader}>
          <View style={[styles.subjectBadge, { backgroundColor: subjectColor + '22' }]}>
            <Text style={[styles.subjectName, { color: subjectColor }]}>{item.subject}</Text>
          </View>
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
        </View>

        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('KnowledgeDetail', { item })}>
          {/* 题目 */}
          <View style={styles.questionHeader}>
            <Text style={styles.question} numberOfLines={3}>
              {item.question || (item.questionImages?.length > 0 ? '[图片题目]' : '未填写题目内容')}
            </Text>
            <View style={[styles.typeBadge, (item.type || 'knowledge_point') === 'error_item' ? styles.typeBadgeError : styles.typeBadgeKnowledge]}>
              <Text style={[styles.typeBadgeText, (item.type || 'knowledge_point') === 'error_item' ? styles.typeTextError : styles.typeTextKnowledge]}>
                {(item.type || 'knowledge_point') === 'error_item' ? '错误项' : '学习要点'}
              </Text>
            </View>
          </View>

          {item.questionImages?.length > 0 && (
            <View style={styles.questionImagePreviewWrap}>
              <Image source={{ uri: item.questionImages[0] }} style={styles.questionImagePreview} />
              {item.questionImages.length > 1 && (
                <View style={styles.questionImageCountBadge}>
                  <Text style={styles.questionImageCountText}>+{item.questionImages.length - 1}</Text>
                </View>
              )}
            </View>
          )}

          {/* 总结预览 */}
          {item.summary ? (
            <Text style={styles.summary} numberOfLines={2}>
              💡 {item.summary}
            </Text>
          ) : null}

          {(item.tags || []).length > 0 && (
            <View style={styles.tagRow}>
              {(item.tags || []).slice(0, 3).map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>

        {/* 底部 */}
        <View style={styles.cardFooter}>
          <View style={styles.authorRow}>
            <Avatar user={author} size={22} />
            <Text style={styles.authorName}>{author.name}</Text>
          </View>
          {(item.images?.length > 0 || item.audioFiles?.length > 0 || item.questionImages?.length > 0 || item.wrongAnswerImages?.length > 0 || item.correctAnswerImages?.length > 0 || item.summaryImages?.length > 0) && (
            <TouchableOpacity style={styles.attachmentsHint} onPress={() => navigation.navigate('KnowledgeDetail', { item })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {(item.questionImages?.length > 0 || item.wrongAnswerImages?.length > 0 || item.correctAnswerImages?.length > 0 || item.summaryImages?.length > 0) && <Ionicons name="camera-outline" size={15} color="#999" />}
              {item.images?.length > 0 && <Ionicons name="image-outline" size={15} color="#999" />}
              {item.audioFiles?.length > 0 && <Ionicons name="mic-outline" size={15} color="#999" />}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#FF6B6B' : '#999'} />
            {(item.likes || []).length > 0 && (
              <Text style={[styles.likeCount, liked && { color: '#FF6B6B' }]}>{item.likes.length}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.commentCountRow} onPress={() => navigation.navigate('KnowledgeDetail', { item })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chatbubble-outline" size={16} color="#999" />
            {(item.comments || []).length > 0 && (
              <Text style={styles.likeCount}>{item.comments.length}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 顶部 */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.typeButton, selectedType === 'knowledge_point' && styles.typeButtonActive]}
          onPress={() => setSelectedType('knowledge_point')}
        >
          <Text style={[styles.typeButtonText, selectedType === 'knowledge_point' && styles.typeButtonTextActive]}>
            学习要点
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, selectedType === 'error_item' && styles.typeButtonActive]}
          onPress={() => setSelectedType('error_item')}
        >
          <Text style={[styles.typeButtonText, selectedType === 'error_item' && styles.typeButtonTextActive]}>
            错误项
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, selectedType === 'all' && styles.typeButtonActive]}
          onPress={() => setSelectedType('all')}
        >
          <Text style={[styles.typeButtonText, selectedType === 'all' && styles.typeButtonTextActive]}>
            全部
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('NewKnowledge')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 搜索框 */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索题目或知识点..."
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* 科目筛选 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subjectScroll}
        contentContainerStyle={styles.subjectList}
      >
        <TouchableOpacity
          style={[styles.subjectChip, selectedSubject === 'all' && styles.subjectChipActive]}
          onPress={() => setSelectedSubject('all')}
        >
          <Text style={[styles.subjectChipText, selectedSubject === 'all' && styles.subjectChipTextActive]}>全部</Text>
        </TouchableOpacity>
        {availableSubjects.filter(s => s !== 'all').map(s => (
          <View
            key={s}
            style={[styles.subjectChip, selectedSubject === s && { backgroundColor: getSubjectColor(s) }]}
          >
            <TouchableOpacity onPress={() => setSelectedSubject(s)} style={styles.subjectChipPress} activeOpacity={0.8}>
              <Text style={[
                styles.subjectChipText,
                selectedSubject === s && { color: '#fff' }
              ]}>
                {s}
              </Text>
            </TouchableOpacity>
            {(currentUser.subjects || []).includes(s) && (
              <TouchableOpacity onPress={() => handleRemoveSubject(s)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={16} color={selectedSubject === s ? '#fff' : '#999'} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>当前学科下暂无内容，试试切换学科或新增学科。</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  typeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
  },
  typeButtonActive: { backgroundColor: '#4ECDC4' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#999' },
  typeButtonTextActive: { color: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  addBtn: {
    backgroundColor: '#FFE66D',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  subjectScroll: { maxHeight: 56, marginBottom: 6 },
  subjectList: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  subjectChipPress: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectChipActive: { backgroundColor: '#333' },
  subjectChipText: { fontSize: 13, color: '#666' },
  subjectChipTextActive: { color: '#fff' },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subjectBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  subjectName: { fontSize: 12, fontWeight: '600' },
  timeText: { fontSize: 12, color: '#bbb' },
  questionHeader: { marginBottom: 8, gap: 6 },
  question: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 8, fontWeight: '500' },
  typeBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  typeBadgeKnowledge: { backgroundColor: '#4ECDC422' },
  typeBadgeError: { backgroundColor: '#FF6B6B22' },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  typeTextKnowledge: { color: '#4ECDC4' },
  typeTextError: { color: '#FF6B6B' },
  questionImagePreviewWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  questionImagePreview: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  questionImageCountBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  questionImageCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  summary: { fontSize: 13, color: '#666', lineHeight: 20, backgroundColor: '#FFFBF0', borderRadius: 8, padding: 8, marginBottom: 10 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  tagChip: { backgroundColor: '#F1F1F1', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: '#666', fontSize: 11 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 10 },
  authorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  attachmentsHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorName: { fontSize: 13, color: '#666' },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  commentCountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeCount: { fontSize: 13, color: '#999' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: '#bbb', fontSize: 14, marginTop: 12, textAlign: 'center' },
});
