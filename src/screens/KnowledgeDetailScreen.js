import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { formatTime, generateId } from '../utils/helpers';
import { ReliableImage } from '../components/ReliableImage';

const COMMON_EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥹', '😭', '😅', '😤', '😴', '🤔', '🫡', '🙌', '👏', '👍', '👎', '👌', '💪', '🙏', '🎉', '✨', '🔥', '🌟', '❤️', '💛', '💙', '🍀', '🌈', '📚', '🧠', '✍️', '✅', '💯'];

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  if (!liveItem) {
    navigation.goBack();
    return null;
  }

  const author = users.find(u => u.id === liveItem.userId) || { name: '未知', avatarColor: '#ccc' };
  const liked = (liveItem.likes || []).includes(currentUser.id);
  const siblingKnowledge = (state.knowledge || [])
    .filter(k => k.subject === liveItem.subject)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const siblingIndex = siblingKnowledge.findIndex(k => k.id === liveItem.id);
  const prevKnowledge = siblingIndex >= 0 && siblingIndex < siblingKnowledge.length - 1 ? siblingKnowledge[siblingIndex + 1] : null;
  const nextKnowledge = siblingIndex > 0 ? siblingKnowledge[siblingIndex - 1] : null;
  const knowledgeMediaSections = useMemo(() => {
    const sections = [
      ...(liveItem.questionImages || []).map(uri => ({ uri, label: '题目', type: 'image' })),
      ...(liveItem.wrongAnswerImages || []).map(uri => ({ uri, label: '错误答案', type: 'image' })),
      ...(liveItem.correctAnswerImages || []).map(uri => ({ uri, label: '正确答案', type: 'image' })),
      ...(liveItem.summaryImages || []).map(uri => ({ uri, label: '知识总结', type: 'image' })),
      ...(liveItem.images || []).map(uri => ({ uri, label: '附件', type: 'image' })),
    ];
    return sections;
  }, [liveItem.correctAnswerImages, liveItem.images, liveItem.questionImages, liveItem.summaryImages, liveItem.wrongAnswerImages]);

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
    const index = knowledgeMediaSections.findIndex(item => item.uri === uri);
    if (index < 0) return;
    navigation.navigate('MediaViewer', {
      items: knowledgeMediaSections,
      initialIndex: index,
      sourceTab: 'KnowledgeTab',
    });
  };

  const openCommentImageViewer = (uri) => {
    const allCommentImages = (liveItem.comments || []).flatMap(comment =>
      (comment.images || []).map(imageUri => ({ uri: imageUri, label: '评论图片', type: 'image' }))
    );
    const index = allCommentImages.findIndex(item => item.uri === uri);
    if (index < 0) return;
    navigation.navigate('MediaViewer', {
      items: allCommentImages,
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
    setShowEmojiPicker(false);
  };

  const appendEmoji = (emoji) => {
    setCommentText(prev => `${prev}${emoji}`.slice(0, 500));
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

  const handleToggleType = async () => {
    if (liveItem.userId !== currentUser.id) return;
    const nextType = (liveItem.type || 'knowledge_point') === 'error_item' ? 'knowledge_point' : 'error_item';
    const result = await dispatch({
      type: 'UPDATE_KNOWLEDGE',
      payload: {
        id: liveItem.id,
        type: nextType,
      },
    });
    if (!result?.ok) {
      Alert.alert('切换失败', result?.error || '请稍后重试');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 68}>
      {/* 顶部导航 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#2F2A24" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>错题详情</Text>
          <View style={[
            styles.headerTypeBadge,
            (liveItem.type || 'knowledge_point') === 'error_item' ? styles.headerTypeBadgeError : styles.headerTypeBadgeKnowledge,
          ]}>
            <Text style={[
              styles.headerTypeBadgeText,
              (liveItem.type || 'knowledge_point') === 'error_item' ? styles.headerTypeTextError : styles.headerTypeTextKnowledge,
            ]}>
              {(liveItem.type || 'knowledge_point') === 'error_item' ? '错误项' : '学习要点'}
            </Text>
          </View>
        </View>
        {liveItem.userId === currentUser.id && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleToggleType} style={styles.typeSwitchBtn}>
              <Ionicons name="swap-horizontal-outline" size={18} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('NewKnowledge', { item: liveItem })}>
              <Ionicons name="create-outline" size={22} color="#C49A4B" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 12 }}>
              <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        )}
        {liveItem.userId !== currentUser.id && <View style={{ width: 60 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.switchRow}>
          <TouchableOpacity
            style={[styles.switchBtn, !prevKnowledge && styles.switchBtnDisabled]}
            disabled={!prevKnowledge}
            onPress={() => navigation.replace('KnowledgeDetail', { item: prevKnowledge })}
          >
            <Ionicons name="chevron-back" size={16} color={prevKnowledge ? '#C49A4B' : '#BBB'} />
            <Text style={[styles.switchBtnText, !prevKnowledge && styles.switchBtnTextDisabled]}>上一题</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchBtn, !nextKnowledge && styles.switchBtnDisabled]}
            disabled={!nextKnowledge}
            onPress={() => navigation.replace('KnowledgeDetail', { item: nextKnowledge })}
          >
            <Text style={[styles.switchBtnText, !nextKnowledge && styles.switchBtnTextDisabled]}>下一题</Text>
            <Ionicons name="chevron-forward" size={16} color={nextKnowledge ? '#C49A4B' : '#BBB'} />
          </TouchableOpacity>
        </View>

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
          {String(liveItem.question || '').trim() ? (
            <Text style={styles.questionText}>{liveItem.question}</Text>
          ) : null}
          {liveItem.questionImages?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={styles.imageRow}>
                {liveItem.questionImages.map((uri, index) => (
                  <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openImageViewer(uri)}>
                    <ReliableImage uri={uri} style={styles.imageItem} />
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
                      <ReliableImage uri={uri} style={styles.imageItem} />
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
                      <ReliableImage uri={uri} style={styles.imageItem} />
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
                      <ReliableImage uri={uri} style={styles.imageItem} />
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
                    <ReliableImage uri={uri} style={styles.imageItem} />
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
                  <Ionicons name="mic-outline" size={16} color="#2F9F97" />
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
          const hasText = Boolean(String(c.text || '').trim());
          const hasImages = (c.images || []).length > 0;
          const hasAudio = (c.audioFiles || []).some(file => Boolean(file?.uri));
          if (!hasText && !hasImages && !hasAudio) return null;
          const cu = users.find(u => u.id === c.userId) || { name: '未知', avatarColor: '#ccc' };
          const rawReplyName = String(c.replyToUserName || '').trim();
          const replyingName = (rawReplyName && rawReplyName !== '未知' && rawReplyName !== '未知用户')
            ? rawReplyName
            : (users.find(u => u.id === c.replyToUserId)?.name || '');
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
                        <TouchableOpacity key={`${uri}_${index}`} activeOpacity={0.9} onPress={() => openCommentImageViewer(uri)}>
                          <ReliableImage uri={uri} style={styles.commentImage} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
                {c.audioFiles?.length > 0 && (
                  <View style={styles.audioList}>
                    {c.audioFiles.filter(file => file?.uri).map((file, index) => (
                      <TouchableOpacity
                        key={`${file.uri}_${index}`}
                        style={styles.audioItem}
                        onPress={() => file.uri && Linking.openURL(file.uri)}
                      >
                        <Ionicons name="mic-outline" size={16} color="#2F9F97" />
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
            <TouchableOpacity onPress={() => setShowEmojiPicker(prev => !prev)}>
              <Ionicons name={showEmojiPicker ? 'happy' : 'happy-outline'} size={20} color="#C49A4B" />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickCommentImages}>
              <Ionicons name="image-outline" size={20} color="#C49A4B" />
            </TouchableOpacity>
            <TouchableOpacity onPress={isRecording ? stopRecording : startRecording}>
              <Ionicons name="mic-outline" size={20} color={isRecording ? '#FF6B6B' : '#C49A4B'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={importCommentAudio}>
              <Ionicons name="folder-open-outline" size={20} color="#C49A4B" />
            </TouchableOpacity>
          </View>
          {showEmojiPicker && (
            <View style={styles.emojiPanel}>
              {COMMON_EMOJIS.map(emoji => (
                <TouchableOpacity key={emoji} style={styles.emojiItem} onPress={() => appendEmoji(emoji)}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {commentImages.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commentMediaScroll}>
              <View style={styles.commentMediaRow}>
                {commentImages.map((uri, index) => (
                  <View key={`${uri}_${index}`} style={styles.commentMediaPreviewWrap}>
                    <ReliableImage uri={uri} style={styles.commentImage} />
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
                  <Ionicons name="mic-outline" size={16} color="#C49A4B" />
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
          <Ionicons name="send" size={20} color="#C49A4B" />
        </TouchableOpacity>
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
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#2F2A24' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerTypeBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  headerTypeBadgeKnowledge: { backgroundColor: '#F5E7C8' },
  headerTypeBadgeError: { backgroundColor: '#FF6B6B22' },
  headerTypeBadgeText: { fontSize: 11, fontWeight: '600' },
  headerTypeTextKnowledge: { color: '#8F6A2E' },
  headerTypeTextError: { color: '#FF6B6B' },
  typeSwitchBtn: { marginRight: 10, padding: 2 },
  body: { padding: 16, gap: 16, paddingBottom: 80 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E8D8BB',
    borderRadius: 14,
    backgroundColor: '#F7EBD3',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchBtnDisabled: {
    backgroundColor: '#F2EEE6',
    borderColor: '#E6E6E6',
  },
  switchBtnText: { color: '#8F6A2E', fontSize: 13, fontWeight: '600' },
  switchBtnTextDisabled: { color: '#BBB' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F5E7C8' },
  subjectText: { fontWeight: '600', fontSize: 13, color: '#8F6A2E' },
  authorInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  authorName: { fontSize: 13, color: '#6F655D' },
  timeText: { fontSize: 12, color: '#A79C90' },
  section: {
    backgroundColor: '#FFFDF8',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  wrongSection: { backgroundColor: '#FFF4F4' },
  correctSection: { backgroundColor: '#FDF6E8' },
  summarySection: { backgroundColor: '#F2EEE6' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#8A8279', marginBottom: 8 },
  questionText: { fontSize: 15, color: '#2F2A24', lineHeight: 24 },
  questionPlaceholder: { fontSize: 14, color: '#8A8279', lineHeight: 22, fontStyle: 'italic' },
  wrongText: { fontSize: 15, color: '#FF6B6B', lineHeight: 22 },
  correctText: { fontSize: 15, color: '#C49A4B', lineHeight: 22 },
  summaryText: { fontSize: 15, color: '#6F655D', lineHeight: 24 },
  imageRow: { flexDirection: 'row', gap: 10 },
  imageItem: { width: 120, height: 120, borderRadius: 10 },
  audioList: { gap: 8 },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9F5EE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  audioName: { flex: 1, color: '#6F655D', fontSize: 13 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  tagChip: { backgroundColor: '#EFE8DE', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  tagText: { color: '#6F655D', fontSize: 12 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 8 },
  likeText: { fontSize: 15, color: '#ccc' },
  commentTitle: { fontSize: 15, fontWeight: '600', color: '#2F2A24' },
  commentItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBubble: { flex: 1, backgroundColor: '#FFFDF8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8E1D8' },
  commentName: { fontSize: 13, fontWeight: '600', color: '#8F6A2E', marginBottom: 4 },
  replyHint: { fontSize: 11, color: '#999', marginBottom: 3 },
  commentTextContent: { fontSize: 14, color: '#444', lineHeight: 20 },
  commentTime: { fontSize: 11, color: '#bbb', marginTop: 4 },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8E1D8',
    paddingBottom: 24,
  },
  commentInput: {
    backgroundColor: '#F9F5EE',
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
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  emojiItem: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5E7C8',
  },
  emojiText: { fontSize: 18 },
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
    backgroundColor: '#6F655D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
