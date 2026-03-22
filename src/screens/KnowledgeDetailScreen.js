import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatTime, generateId } from '../utils/helpers';

export default function KnowledgeDetailScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { currentUser, users } = state;
  const item = route.params?.item;
  // 用实时数据
  const liveItem = state.knowledge.find(k => k.id === item?.id) || item;

  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [commentImages, setCommentImages] = useState([]);
  const [commentAudioFiles, setCommentAudioFiles] = useState([]);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  if (!liveItem) {
    navigation.goBack();
    return null;
  }

  const author = users.find(u => u.id === liveItem.userId) || { name: '未知', avatarColor: '#ccc' };
  const liked = (liveItem.likes || []).includes(currentUser.id);
  const previewSections = useMemo(() => {
    const sections = [
      ...(liveItem.questionImages || []).map(uri => ({ uri, label: '题目', type: 'image' })),
      ...(liveItem.wrongAnswerImages || []).map(uri => ({ uri, label: '错误答案', type: 'image' })),
      ...(liveItem.correctAnswerImages || []).map(uri => ({ uri, label: '正确答案', type: 'image' })),
      ...(liveItem.summaryImages || []).map(uri => ({ uri, label: '知识总结', type: 'image' })),
      ...(liveItem.images || []).map(uri => ({ uri, label: '附件', type: 'image' })),
      ...((liveItem.comments || []).flatMap(comment => (comment.images || []).map(uri => ({ uri, label: '评论图片', type: 'image' })))),
    ];
    return sections;
  }, [liveItem.comments, liveItem.correctAnswerImages, liveItem.images, liveItem.questionImages, liveItem.summaryImages, liveItem.wrongAnswerImages]);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  const handleLike = () => {
    dispatch({ type: 'LIKE_KNOWLEDGE', payload: { knowledgeId: liveItem.id, userId: currentUser.id } });
  };

  const openImageViewer = (uri) => {
    const index = previewSections.findIndex(item => item.uri === uri);
    if (index < 0) return;
    navigation.navigate('MediaViewer', {
      items: previewSections,
      initialIndex: index,
      sourceTab: 'KnowledgeTab',
    });
  };

  const pickCommentImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相册后再上传图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = (result.assets || []).map(asset => asset.uri).filter(Boolean);
    setCommentImages(prev => [...prev, ...picked].slice(0, 4));
  };

  const importCommentAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;
    setCommentAudioFiles(prev => [...prev, { name: file.name || '语音文件', uri: file.uri }].slice(0, 3));
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要权限', '请允许使用麦克风后再录音');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });
      await nextRecording.startAsync();
      setRecording(nextRecording);
      setIsRecording(true);
    } catch {
      Alert.alert('录音不可用', '当前环境暂时不能直接录音，请先使用“导入语音”。');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        const name = `评论录音_${Date.now()}.m4a`;
        setCommentAudioFiles(prev => [...prev, { name, uri }].slice(0, 3));
      }
    } catch {
      Alert.alert('录音失败', '录音保存失败，请重试。');
    } finally {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
      setRecording(null);
      setIsRecording(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() && commentImages.length === 0 && commentAudioFiles.length === 0) return;
    const result = await dispatch({
      type: 'ADD_KNOWLEDGE_COMMENT',
      payload: {
        knowledgeId: liveItem.id,
        comment: {
          id: generateId(),
          userId: currentUser.id,
          replyToUserId: replyTarget?.id || '',
          replyToUserName: replyTarget?.name || '',
          text: commentText.trim(),
          images: commentImages,
          audioFiles: commentAudioFiles,
          createdAt: new Date().toISOString(),
        },
      },
    });
    if (!result?.ok) {
      Alert.alert('评论失败', result?.error || '请稍后重试');
      return;
    }
    setCommentText('');
    setCommentImages([]);
    setCommentAudioFiles([]);
    setReplyTarget(null);
  };

  const handleDelete = () => {
    if (liveItem.userId !== currentUser.id) return;
    Alert.alert('删除', '确认删除这道题？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          dispatch({ type: 'DELETE_KNOWLEDGE', payload: liveItem.id });
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}>
      {/* 顶部导航 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>错题详情</Text>
        {liveItem.userId === currentUser.id && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => navigation.navigate('NewKnowledge', { item: liveItem })}>
              <Ionicons name="create-outline" size={22} color="#4ECDC4" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 12 }}>
              <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        )}
        {liveItem.userId !== currentUser.id && <View style={{ width: 60 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* 科目 & 作者 */}
        <View style={styles.metaRow}>
          <View style={styles.subjectBadge}>
            <Text style={styles.subjectText}>{liveItem.subject}</Text>
          </View>
          <View style={styles.authorInfo}>
            <Avatar user={author} size={24} />
            <Text style={styles.authorName}>{author.name}</Text>
            <Text style={styles.timeText}>{formatTime(liveItem.createdAt)}</Text>
          </View>
        </View>

        {/* 题目 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📝 题目</Text>
          {liveItem.question ? (
            <Text style={styles.questionText}>{liveItem.question}</Text>
          ) : (
            <Text style={styles.questionPlaceholder}>这是一道图片题，文字题干未填写。</Text>
          )}
          {liveItem.questionImages?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={styles.imageRow}>
                {liveItem.questionImages.map((uri, index) => (
                  <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                    <Image source={{ uri }} style={styles.imageItem} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* 错误答案 */}
        {liveItem.wrongAnswer ? (
          <View style={[styles.section, styles.wrongSection]}>
            <Text style={styles.sectionLabel}>❌ 错误答案</Text>
            <Text style={styles.wrongText}>{liveItem.wrongAnswer}</Text>
            {liveItem.wrongAnswerImages?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={styles.imageRow}>
                  {liveItem.wrongAnswerImages.map((uri, index) => (
                    <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                      <Image source={{ uri }} style={styles.imageItem} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* 正确答案 */}
        {liveItem.correctAnswer ? (
          <View style={[styles.section, styles.correctSection]}>
            <Text style={styles.sectionLabel}>✅ 正确答案</Text>
            <Text style={styles.correctText}>{liveItem.correctAnswer}</Text>
            {liveItem.correctAnswerImages?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={styles.imageRow}>
                  {liveItem.correctAnswerImages.map((uri, index) => (
                    <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                      <Image source={{ uri }} style={styles.imageItem} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* 总结（选填） */}
        {(liveItem.summary || (liveItem.summaryImages?.length || 0) > 0) ? (
          <View style={[styles.section, styles.summarySection]}>
            <Text style={styles.sectionLabel}>💡 知识总结</Text>
            {liveItem.summary ? <Text style={styles.summaryText}>{liveItem.summary}</Text> : null}
            {liveItem.summaryImages?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={styles.imageRow}>
                  {liveItem.summaryImages.map((uri, index) => (
                    <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                      <Image source={{ uri }} style={styles.imageItem} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}

        {(liveItem.tags || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🏷 标签</Text>
            <View style={styles.tagList}>
              {(liveItem.tags || []).map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {liveItem.images?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🖼 图片附件</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imageRow}>
                {liveItem.images.map((uri, index) => (
                  <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                    <Image source={{ uri }} style={styles.imageItem} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {liveItem.audioFiles?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🎤 语音附件</Text>
            <View style={styles.audioList}>
              {liveItem.audioFiles.map((file, index) => (
                <TouchableOpacity
                  key={`${file.uri}_${index}`}
                  style={styles.audioItem}
                  onPress={() => file.uri && Linking.openURL(file.uri)}
                >
                  <Ionicons name="mic-outline" size={16} color="#4ECDC4" />
                  <Text style={styles.audioName} numberOfLines={1}>{file.name || '语音文件'}</Text>
                  <Ionicons name="open-outline" size={16} color="#999" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 点赞 */}
        <TouchableOpacity style={styles.likeRow} onPress={handleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? '#FF6B6B' : '#ccc'} />
          <Text style={[styles.likeText, liked && { color: '#FF6B6B' }]}>
            {(liveItem.likes || []).length > 0 ? `${liveItem.likes.length} 人觉得有用` : '觉得有用？点个赞'}
          </Text>
        </TouchableOpacity>

        {/* 评论 */}
        <Text style={styles.commentTitle}>讨论 ({(liveItem.comments || []).length})</Text>
        {(liveItem.comments || []).map(c => {
          const cu = users.find(u => u.id === c.userId) || { name: '未知', avatarColor: '#ccc' };
          const replyingName = c.replyToUserName || (users.find(u => u.id === c.replyToUserId)?.name || '');
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.commentItem}
              activeOpacity={0.85}
              onPress={() => setReplyTarget({ id: cu.id, name: cu.name })}
            >
              <Avatar user={cu} size={32} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentName}>{cu.name}</Text>
                {!!replyingName && <Text style={styles.replyHint}>回复 {replyingName}</Text>}
                {!!c.text && <Text style={styles.commentTextContent}>{c.text}</Text>}
                {c.images?.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commentMediaScroll}>
                    <View style={styles.commentMediaRow}>
                      {c.images.map((uri, index) => (
                        <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                          <Image source={{ uri }} style={styles.commentImage} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
                {c.audioFiles?.length > 0 && (
                  <View style={styles.audioList}>
                    {c.audioFiles.map((file, index) => (
                      <TouchableOpacity
                        key={`${file.uri}_${index}`}
                        style={styles.audioItem}
                        onPress={() => file.uri && Linking.openURL(file.uri)}
                      >
                        <Ionicons name="mic-outline" size={16} color="#4ECDC4" />
                        <Text style={styles.audioName} numberOfLines={1}>{file.name || '语音文件'}</Text>
                        <Ionicons name="open-outline" size={16} color="#999" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={styles.commentTime}>{formatTime(c.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 评论输入 */}
      <View style={styles.commentInputBar}>
        <Avatar user={currentUser} size={32} />
        <View style={styles.commentComposer}>
          {replyTarget ? (
            <View style={styles.replyTargetRow}>
              <Text style={styles.replyTargetText}>回复 {replyTarget.name}</Text>
              <TouchableOpacity onPress={() => setReplyTarget(null)}>
                <Ionicons name="close-circle" size={16} color="#999" />
              </TouchableOpacity>
            </View>
          ) : null}
          <TextInput
            style={styles.commentInput}
            placeholder={replyTarget ? `回复 ${replyTarget.name}...` : '写讨论，也可以发图片或语音...'}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleComment}
            returnKeyType="send"
            multiline
          />
          <View style={styles.commentToolbar}>
            <TouchableOpacity onPress={pickCommentImages}>
              <Ionicons name="image-outline" size={20} color="#4ECDC4" />
            </TouchableOpacity>
            <TouchableOpacity onPress={isRecording ? stopRecording : startRecording}>
              <Ionicons name="mic-outline" size={20} color={isRecording ? '#FF6B6B' : '#4ECDC4'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={importCommentAudio}>
              <Ionicons name="folder-open-outline" size={20} color="#4ECDC4" />
            </TouchableOpacity>
          </View>
          {commentImages.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commentMediaScroll}>
              <View style={styles.commentMediaRow}>
                {commentImages.map((uri, index) => (
                  <View key={`${uri}_${index}`} style={styles.commentMediaPreviewWrap}>
                    <Image source={{ uri }} style={styles.commentImage} />
                    <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setCommentImages(prev => prev.filter((_, i) => i !== index))}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          {commentAudioFiles.length > 0 && (
            <View style={styles.audioList}>
              {commentAudioFiles.map((file, index) => (
                <View key={`${file.uri}_${index}`} style={styles.audioItem}>
                  <Ionicons name="mic-outline" size={16} color="#4ECDC4" />
                  <Text style={styles.audioName} numberOfLines={1}>{file.name || '语音文件'}</Text>
                  <TouchableOpacity onPress={() => setCommentAudioFiles(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close-circle" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleComment}>
          <Ionicons name="send" size={20} color="#4ECDC4" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
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
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  body: { padding: 16, gap: 16, paddingBottom: 80 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#EAF7F6' },
  subjectText: { fontWeight: '600', fontSize: 13, color: '#4ECDC4' },
  authorInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  authorName: { fontSize: 13, color: '#666' },
  timeText: { fontSize: 12, color: '#bbb' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  wrongSection: { backgroundColor: '#FFF5F5' },
  correctSection: { backgroundColor: '#F5FFF8' },
  summarySection: { backgroundColor: '#FFFDF0' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#999', marginBottom: 8 },
  questionText: { fontSize: 15, color: '#333', lineHeight: 24 },
  questionPlaceholder: { fontSize: 14, color: '#999', lineHeight: 22, fontStyle: 'italic' },
  wrongText: { fontSize: 15, color: '#FF6B6B', lineHeight: 22 },
  correctText: { fontSize: 15, color: '#4CAF50', lineHeight: 22 },
  summaryText: { fontSize: 15, color: '#555', lineHeight: 24 },
  imageRow: { flexDirection: 'row', gap: 10 },
  imageItem: { width: 120, height: 120, borderRadius: 10 },
  audioList: { gap: 8 },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  audioName: { flex: 1, color: '#666', fontSize: 13 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { backgroundColor: '#F4F4F4', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: '#666', fontSize: 12 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 8 },
  likeText: { fontSize: 15, color: '#ccc' },
  commentTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  commentItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBubble: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  commentName: { fontSize: 13, fontWeight: '600', color: '#4ECDC4', marginBottom: 4 },
  replyHint: { fontSize: 11, color: '#999', marginBottom: 3 },
  commentTextContent: { fontSize: 14, color: '#444', lineHeight: 20 },
  commentTime: { fontSize: 11, color: '#bbb', marginTop: 4 },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingBottom: 24,
  },
  commentInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 42,
    maxHeight: 96,
  },
  commentComposer: {
    flex: 1,
    gap: 8,
  },
  replyTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  replyTargetText: { color: '#999', fontSize: 12 },
  commentToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 4,
  },
  commentMediaScroll: {
    marginTop: 8,
  },
  commentMediaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  commentMediaPreviewWrap: {
    position: 'relative',
  },
  commentImage: {
    width: 88,
    height: 88,
    borderRadius: 10,
  },
  removeMediaBtn: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
