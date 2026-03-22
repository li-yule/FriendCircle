import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useApp } from '../context/AppContext';
import { generateId } from '../utils/helpers';

export default function NewKnowledgeScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { currentUser } = state;
  const existing = route.params?.item;

  const userSubjects = currentUser.subjects || [];
  const defaultSubject = existing?.subject || userSubjects[0] || '数学';

  const [subject, setSubject] = useState(defaultSubject);
  const [question, setQuestion] = useState(existing?.question || '');
  const [wrongAnswer, setWrongAnswer] = useState(existing?.wrongAnswer || '');
  const [correctAnswer, setCorrectAnswer] = useState(existing?.correctAnswer || '');
  const [summary, setSummary] = useState(existing?.summary || '');
  const [subjectInput, setSubjectInput] = useState('');
  const [images, setImages] = useState(existing?.images || []);
  const [audioFiles, setAudioFiles] = useState(existing?.audioFiles || []);
  const [questionImages, setQuestionImages] = useState(existing?.questionImages || []);
  const [wrongAnswerImages, setWrongAnswerImages] = useState(existing?.wrongAnswerImages || []);
  const [correctAnswerImages, setCorrectAnswerImages] = useState(existing?.correctAnswerImages || []);
  const [summaryImages, setSummaryImages] = useState(existing?.summaryImages || []);
  const [tags, setTags] = useState(existing?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [knowledgeType, setKnowledgeType] = useState(existing?.type || 'knowledge_point');

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  const addSubject = () => {
    const newSubject = subjectInput.trim();
    if (!newSubject) return;
    if (userSubjects.includes(newSubject)) {
      Alert.alert('提示', '该学科已存在');
      return;
    }
    dispatch({ type: 'ADD_SUBJECT', payload: newSubject });
    setSubject(newSubject);
    setSubjectInput('');
  };

  const pickImages = async () => {
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
    setImages(prev => [...prev, ...picked].slice(0, 6));
  };

  const pickSectionImages = async (setter) => {
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
    setter(prev => [...prev, ...picked].slice(0, 4));
  };

  const takeSectionPhoto = async (setter) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相机后再拍照');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setter(prev => [...prev, uri].slice(0, 4));
  };

  const takeAttachmentPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相机后再拍照');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setImages(prev => [...prev, uri].slice(0, 6));
  };

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;
    setAudioFiles(prev => [...prev, { name: file.name || '语音文件', uri: file.uri }].slice(0, 3));
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
        const name = `录音_${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:\s]/g, '-')}.m4a`;
        setAudioFiles(prev => [...prev, { name, uri }].slice(0, 3));
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

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (tags.includes(value)) {
      Alert.alert('提示', '标签已存在');
      return;
    }
    setTags(prev => [...prev, value].slice(0, 10));
    setTagInput('');
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedWrongAnswer = wrongAnswer.trim();
    const trimmedCorrectAnswer = correctAnswer.trim();
    const trimmedSummary = summary.trim();

    if (!question.trim() && questionImages.length === 0) {
      Alert.alert('提示', '请填写题目内容，或至少为题目上传一张图片');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('提示', '请先选择或新增学科');
      return;
    }

    let result;
    setIsSubmitting(true);
    if (existing) {
      result = await dispatch({
        type: 'UPDATE_KNOWLEDGE',
        payload: {
          id: existing.id,
          subject,
          question: question.trim(),
          wrongAnswer: trimmedWrongAnswer,
          correctAnswer: trimmedCorrectAnswer,
          summary: trimmedSummary,
          images,
          audioFiles,
          questionImages,
          wrongAnswerImages,
          correctAnswerImages,
          summaryImages,
          tags,
          type: knowledgeType,
        },
      });
    } else {
      result = await dispatch({
        type: 'ADD_KNOWLEDGE',
        payload: {
          id: generateId(),
          userId: currentUser.id,
          subject,
          question: question.trim(),
          wrongAnswer: trimmedWrongAnswer,
          correctAnswer: trimmedCorrectAnswer,
          summary: trimmedSummary,
          images,
          audioFiles,
          questionImages,
          wrongAnswerImages,
          correctAnswerImages,
          summaryImages,
          tags,
          type: knowledgeType,
          likes: [],
          comments: [],
          createdAt: new Date().toISOString(),
        },
      });
    }
    if (!result?.ok) {
      setIsSubmitting(false);
      Alert.alert(existing ? '更新失败' : '保存失败', result?.error || '请稍后重试');
      return;
    }
    setIsSubmitting(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{existing ? '编辑错题' : '添加错题'}</Text>
        <TouchableOpacity style={[styles.sendBtn, isSubmitting && styles.sendBtnDisabled]} onPress={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator size="small" color="#666" /> : <Text style={styles.sendText}>保存</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>知识类型</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, knowledgeType === 'knowledge_point' && styles.typeChipActive]}
              onPress={() => setKnowledgeType('knowledge_point')}
            >
              <Text style={[styles.typeChipText, knowledgeType === 'knowledge_point' && styles.typeChipTextActive]}>学习要点</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeChip, knowledgeType === 'error_item' && styles.typeChipActive]}
              onPress={() => setKnowledgeType('error_item')}
            >
              <Text style={[styles.typeChipText, knowledgeType === 'error_item' && styles.typeChipTextActive]}>错误项</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 科目选择 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>科目</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.subjectList}>
              {userSubjects.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.subjectChip, subject === s && styles.subjectChipActive]}
                  onPress={() => setSubject(s)}
                >
                  <Text style={[styles.subjectChipText, subject === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.subjectCreateRow}>
            <TextInput
              style={styles.subjectCreateInput}
              placeholder="新增学科"
              value={subjectInput}
              onChangeText={setSubjectInput}
            />
            <TouchableOpacity style={styles.subjectCreateBtn} onPress={addSubject}>
              <Text style={styles.subjectCreateBtnText}>添加</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.smallTip}>支持直接录音输入，也可从设备导入语音文件。</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>附件（可选）</Text>
          <View style={styles.mediaActions}>
            <TouchableOpacity style={styles.mediaBtn} onPress={pickImages}>
              <Ionicons name="image-outline" size={16} color="#4ECDC4" />
              <Text style={styles.mediaBtnText}>上传图片</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={takeAttachmentPhoto}>
              <Ionicons name="camera-outline" size={16} color="#4ECDC4" />
              <Text style={styles.mediaBtnText}>直接拍照</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mediaBtn}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Ionicons name="mic-outline" size={16} color="#4ECDC4" />
              <Text style={styles.mediaBtnText}>{isRecording ? '停止录音' : '直接录音'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={pickAudio}>
              <Ionicons name="folder-open-outline" size={16} color="#4ECDC4" />
              <Text style={styles.mediaBtnText}>导入语音</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.recordingHint}>{isRecording ? '正在录音，再点一次“停止录音”即可保存。' : '可以直接录音，也可以从设备导入语音文件。'}</Text>

          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imageList}>
                {images.map((uri, index) => (
                  <View key={`${uri}_${index}`} style={styles.imageItemWrap}>
                    <Image source={{ uri }} style={styles.imageItem} />
                    <TouchableOpacity
                      style={styles.removeMediaBtn}
                      onPress={() => setImages(prev => prev.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {audioFiles.length > 0 && (
            <View style={styles.audioList}>
              {audioFiles.map((file, index) => (
                <View key={`${file.uri}_${index}`} style={styles.audioItem}>
                  <Text style={styles.audioName} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => setAudioFiles(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close-circle" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>标签</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="输入标签，如：函数、几何、易错"
              value={tagInput}
              onChangeText={setTagInput}
            />
            <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
              <Text style={styles.tagAddText}>添加</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagList}>
            {tags.map(tag => (
              <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => setTags(prev => prev.filter(t => t !== tag))}>
                <Text style={styles.tagChipText}>#{tag} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 题目 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>题目内容 *</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="粘贴或输入题目；如果是纯图片题，也可以只上传题目图片..."
            multiline
            value={question}
            onChangeText={setQuestion}
            textAlignVertical="top"
          />
          <View style={styles.sectionActionsRow}>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => pickSectionImages(setQuestionImages)}>
              <Ionicons name="images-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>从相册选题目图</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => takeSectionPhoto(setQuestionImages)}>
              <Ionicons name="camera-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>直接拍题目图</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageList}>
              {questionImages.map((uri, index) => (
                <View key={`${uri}_${index}`} style={styles.imageItemWrap}>
                  <Image source={{ uri }} style={styles.imageItem} />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setQuestionImages(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 我的错误答案 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>我的错误答案</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="我当时是怎么答的（可选）..."
            multiline
            value={wrongAnswer}
            onChangeText={setWrongAnswer}
            textAlignVertical="top"
          />
          <View style={styles.sectionActionsRow}>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => pickSectionImages(setWrongAnswerImages)}>
              <Ionicons name="images-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>上传错误答案图片</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => takeSectionPhoto(setWrongAnswerImages)}>
              <Ionicons name="camera-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>拍错误答案图片</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageList}>
              {wrongAnswerImages.map((uri, index) => (
                <View key={`${uri}_${index}`} style={styles.imageItemWrap}>
                  <Image source={{ uri }} style={styles.imageItem} />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setWrongAnswerImages(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 正确答案 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>正确答案</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="正确答案是什么（可选）..."
            multiline
            value={correctAnswer}
            onChangeText={setCorrectAnswer}
            textAlignVertical="top"
          />
          <View style={styles.sectionActionsRow}>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => pickSectionImages(setCorrectAnswerImages)}>
              <Ionicons name="images-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>上传正确答案图片</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => takeSectionPhoto(setCorrectAnswerImages)}>
              <Ionicons name="camera-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>拍正确答案图片</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageList}>
              {correctAnswerImages.map((uri, index) => (
                <View key={`${uri}_${index}`} style={styles.imageItemWrap}>
                  <Image source={{ uri }} style={styles.imageItem} />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setCorrectAnswerImages(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 知识总结 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>知识总结（选填）</Text>
          <TextInput
            style={[styles.input, styles.multiline, styles.summaryInput]}
            placeholder="总结这道题的知识点、解题方法、易错原因..."
            multiline
            value={summary}
            onChangeText={setSummary}
            textAlignVertical="top"
          />
          <View style={styles.sectionActionsRow}>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => pickSectionImages(setSummaryImages)}>
              <Ionicons name="images-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>为总结上传图片</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sectionImageBtn} onPress={() => takeSectionPhoto(setSummaryImages)}>
              <Ionicons name="camera-outline" size={16} color="#4ECDC4" />
              <Text style={styles.sectionImageBtnText}>拍总结图片</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageList}>
              {summaryImages.map((uri, index) => (
                <View key={`${uri}_${index}`} style={styles.imageItemWrap}>
                  <Image source={{ uri }} style={styles.imageItem} />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setSummaryImages(prev => prev.filter((_, i) => i !== index))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cancel: { fontSize: 16, color: '#666' },
  title: { fontSize: 17, fontWeight: '600', color: '#333' },
  sendBtn: { backgroundColor: '#FFE66D', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.72 },
  sendText: { color: '#666', fontWeight: '600', fontSize: 14 },
  body: { padding: 16, gap: 20 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  typeChipActive: { backgroundColor: '#333' },
  typeChipText: { fontSize: 13, color: '#666' },
  typeChipTextActive: { color: '#fff' },
  subjectList: { flexDirection: 'row', gap: 8 },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  subjectChipActive: { backgroundColor: '#4ECDC4' },
  subjectChipText: { fontSize: 13, color: '#666' },
  subjectCreateRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  subjectCreateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  subjectCreateBtn: {
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
  },
  subjectCreateBtnText: { color: '#fff', fontWeight: '600' },
  smallTip: { fontSize: 12, color: '#999', marginTop: 8 },
  mediaActions: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF7F6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mediaBtnText: { color: '#4ECDC4', fontWeight: '600', fontSize: 12 },
  recordingHint: { marginTop: 6, color: '#999', fontSize: 12 },
  imageList: { flexDirection: 'row', gap: 8, marginTop: 10 },
  imageItemWrap: { position: 'relative' },
  imageItem: { width: 80, height: 80, borderRadius: 8 },
  removeMediaBtn: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioList: { marginTop: 10, gap: 6 },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  audioName: { flex: 1, marginRight: 8, color: '#666', fontSize: 12 },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  tagAddBtn: {
    backgroundColor: '#333',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tagAddText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { backgroundColor: '#F0F0F0', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { color: '#666', fontSize: 12 },
  sectionActionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sectionImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#ECFBF9',
    alignSelf: 'flex-start',
  },
  sectionImageBtnText: { color: '#4ECDC4', fontWeight: '600', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  multiline: { minHeight: 80 },
  summaryInput: {
    minHeight: 120,
    backgroundColor: '#FFFDF0',
    borderColor: '#FFE082',
  },
});
